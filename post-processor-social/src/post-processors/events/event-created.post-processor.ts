import { BatchPostProcessor } from '@volontariapp/post-processors';
import {
  IEventCreatedPayload,
  IEventSocialCreatedPayload,
  SocialEventMessagingType,
} from '@volontariapp/messaging';
import { Injectable } from '@nestjs/common';
import { ParticipationService } from '@volontariapp/domain-social';
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
        EventQueueEntity.createEvent<SocialEventMessagingType.EVENT_SOCIAL_CREATED>(
          {
            type: SocialEventMessagingType.EVENT_SOCIAL_CREATED,
            emitter: event.emitter,
            emitterId: event.emitterId,
            traceId: event.traceId,
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
        this.logger.error(
          'Error processing EVENT_CREATED batch in Neo4j',
          error,
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
