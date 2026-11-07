import { BatchPostProcessor } from '@volontariapp/post-processors';
import {
  IEventCreatedPayload,
  IEventSocialCreatedPayload,
  SocialEventMessagingType,
} from '@volontariapp/messaging';
import { Injectable } from '@nestjs/common';
import { EventId, ParticipationService } from '@volontariapp/domain-social';
import type {
  BatchEventItem,
  PostProcessorOptions,
} from '@volontariapp/post-processors';
import type { Redis } from 'ioredis';
import { EventEventMessagingType } from '@volontariapp/messaging';
import {
  databaseMapper,
  EventQueueEntity,
  EventQueueModel,
  type Repository,
} from '@volontariapp/database';
import { InjectRepository } from '@nestjs/typeorm';
import { Streams } from '@volontariapp/shared';
import { EventQueueWriter, EventQueueRepository } from '@volontariapp/outbox';
import { findDeleted } from '../tombstone.js';

databaseMapper.registerBidirectional(EventQueueModel, EventQueueEntity);

@Injectable()
export class EventCreatedPostProcessor extends BatchPostProcessor<EventEventMessagingType.EVENT_CREATED> {
  protected async processEvents(
    events: BatchEventItem<EventEventMessagingType.EVENT_CREATED>[],
  ): Promise<void> {
    const queueEntities: EventQueueEntity<SocialEventMessagingType.EVENT_SOCIAL_CREATED>[] =
      [];
    const neo4jBatch: { eventId: string; organizerId: string }[] = [];

    events.forEach(({ event, messageId }) => {
      const payload: IEventCreatedPayload = event.payload.after;

      if (!event.emitterId || !payload.eventId) {
        this.logger.error(
          'Invalid payload for EVENT_CREATED: missing id or organizerId',
          {
            messageId,
            payload: event.payload,
          },
        );
        return;
      }
      if (payload.userId) {
        neo4jBatch.push({
          eventId: payload.eventId,
          organizerId: payload.userId,
        });
      } else {
        neo4jBatch.push({
          eventId: payload.eventId,
          organizerId: event.emitterId,
        });
      }

      const payloadSocialEvent: IEventSocialCreatedPayload = {
        eventId: payload.eventId,
        userId: payload.userId,
      };

      const queueEntity =
        EventQueueEntity.createFollowUp<SocialEventMessagingType.EVENT_SOCIAL_CREATED>(
          event,
          {
            type: SocialEventMessagingType.EVENT_SOCIAL_CREATED,
            emitter: event.emitter,
            emitterId: event.emitterId,
            payload: payloadSocialEvent,
            targetServices: [Streams.WS_EVENT_CREATED_FEEDBACK],
          },
        );

      queueEntities.push(queueEntity);
    });

    if (neo4jBatch.length > 0) {
      try {
        await this.participationService.createEventsBatch(neo4jBatch);
      } catch (error) {
        // Rethrown on purpose: swallowing it acknowledged the message and lost the SocialEvent node
        // for good. BatchPostProcessor retries the batch with backoff, then sends it to the DLQ.
        // Safe to replay: the cypher is MERGE based and nothing was emitted before this point.
        this.logger.error(
          'Error processing EVENT_CREATED batch in Neo4j, the batch will be retried',
          error,
        );
        throw error;
      }

      // Checked after the creation, see tombstone.ts (G4): an event.deleted processed in between
      // has either set its marker already or removes the node after it was created here. The
      // feedback is still sent so the EVENT_CREATION gather completes.
      const deleted = await findDeleted(
        this.redis,
        'event',
        neo4jBatch.map(({ eventId }) => eventId),
      );
      if (deleted.size > 0) {
        await this.participationService.deleteEventsBatch(
          [...deleted].map((id) => new EventId(id)),
        );
        this.logger.warn(
          `EVENT_CREATED processed after EVENT_DELETED: ${String(deleted.size)} social event nodes removed again`,
          { eventIds: [...deleted] },
        );
      }
    }

    if (queueEntities.length > 0) {
      try {
        const eventQueueWriter =
          new EventQueueWriter<SocialEventMessagingType.EVENT_SOCIAL_CREATED>(
            this.logger,
            new EventQueueRepository<SocialEventMessagingType.EVENT_SOCIAL_CREATED>(
              this.typeormRepository,
            ),
          );

        this.logger.info(
          `Inserting ${String(queueEntities.length)} EVENT_CREATED into event_queue for ws:event stream`,
        );

        await eventQueueWriter.createMany(queueEntities);
      } catch (error) {
        this.logger.error(
          'Error batch inserting EVENT_CREATED into event_queue',
          error,
        );
      }
    }
  }

  constructor(
    redisClient: Redis,
    options: PostProcessorOptions,
    private readonly participationService: ParticipationService,
    @InjectRepository(EventQueueModel)
    private readonly typeormRepository: Repository<EventQueueModel>,
  ) {
    super(redisClient, options);
  }

  protected override shouldProcess(
    eventType: EventEventMessagingType | string,
  ): boolean {
    return eventType === EventEventMessagingType.EVENT_CREATED.toString();
  }
}
