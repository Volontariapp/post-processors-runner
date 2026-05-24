import { SinglePostProcessor } from '@volontariapp/post-processors';
import type {
  IEventCreatedWebsocketPayload,
  IEventPayload,
  StreamEvent,
} from '@volontariapp/messaging';
import { Injectable } from '@nestjs/common';
import {
  ParticipationService,
  EventId,
  UserId,
} from '@volontariapp/domain-social';
import type { PostProcessorOptions } from '@volontariapp/post-processors';
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
export class EventCreatedPostProcessor extends SinglePostProcessor<EventEventMessagingType.EVENT_CREATED> {
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

  protected async processEvent(
    event: StreamEvent<IEventPayload>,
    messageId: string,
  ): Promise<void> {
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
    this.logger.info('Processing EVENT_CREATED: ' + JSON.stringify(payload));
    try {
      await this.participationService.createEvent(new EventId(payload.id));
      await this.participationService.setEventCreator(
        new UserId(payload.organizerId),
        new EventId(payload.id),
      );

      this.logger.info(
        'Inserting EVENT_CREATED into event_queue for ws:user stream',
        {
          messageId,
          eventId: event.id,
          emitterId: event.emitterId,
        },
      );
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
      };
      const eventQueueWriter =
        new EventQueueWriter<WebsocketEventMessagingType.WS_EVENT_CREATED>(
          this.logger,
          new EventQueueRepository<WebsocketEventMessagingType.WS_EVENT_CREATED>(
            this.typeormRepository,
          ),
        );

      const queueEntity =
        EventQueueEntity.createEvent<WebsocketEventMessagingType.WS_EVENT_CREATED>(
          {
            type: WebsocketEventMessagingType.WS_EVENT_CREATED,
            emitter: event.emitter,
            emitterId: event.emitterId,
            traceId: event.traceId,
            payload: payloadWsEvent,
            targetServices: [Streams.WS_USER],
          },
        );

      await eventQueueWriter.create(queueEntity);
    } catch (error) {
      this.logger.error('Error processing EVENT_CREATED', error, {
        messageId,
        payload: event.payload,
      });
    }
  }
}
