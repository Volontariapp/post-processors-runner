import { BatchPostProcessor } from '@volontariapp/post-processors';
import type {
  IEventCreatedWebsocketPayload,
  IEventPayload,
} from '@volontariapp/messaging';
import { Injectable } from '@nestjs/common';
import { ParticipationService } from '@volontariapp/domain-social';
import type {
  BatchEventItem,
  PostProcessorOptions,
} from '@volontariapp/post-processors';
import type { Redis } from 'ioredis';
import {
  EventEventMessagingType,
  WebsocketEventMessagingType,
} from '@volontariapp/messaging';
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
    const queueEntities: EventQueueEntity<WebsocketEventMessagingType.WS_EVENT_CREATED>[] =
      [];
    const neo4jBatch: { eventId: string; organizerId: string }[] = [];

    events.forEach(({ event, messageId }) => {
      const payload: IEventPayload = event.payload.after;

      if (!payload.id || !payload.organizerId) {
        this.logger.error(
          'Invalid payload for EVENT_CREATED: missing id or organizerId',
          {
            messageId,
            payload: event.payload,
          },
        );
        return;
      }

      neo4jBatch.push({
        eventId: payload.id,
        organizerId: payload.organizerId,
      });

      const payloadWsEvent: IEventCreatedWebsocketPayload = {
        id: payload.id,
        name: payload.name,
        description: payload.description,
        startAt: payload.startAt,
        endAt: payload.endAt,
        type: payload.type,
        state: payload.state,
        awardedImpactScore: payload.awardedImpactScore,
        maxParticipants: payload.maxParticipants,
        organizerId: payload.organizerId,
        localisationName: payload.localisationName,
        createdAt: payload.createdAt,
        updatedAt: payload.updatedAt,
        eventLocation: payload.eventLocation,
      };

      const queueEntity =
        EventQueueEntity.createEvent<WebsocketEventMessagingType.WS_EVENT_CREATED>(
          {
            type: WebsocketEventMessagingType.WS_EVENT_CREATED,
            emitter: event.emitter,
            emitterId: event.emitterId,
            traceId: event.traceId,
            payload: payloadWsEvent,
            targetServices: [Streams.WS_EVENT],
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
          new EventQueueWriter<WebsocketEventMessagingType.WS_EVENT_CREATED>(
            this.logger,
            new EventQueueRepository<WebsocketEventMessagingType.WS_EVENT_CREATED>(
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
