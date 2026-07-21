import { BatchPostProcessor } from '@volontariapp/post-processors';
import {
  EventEventMessagingType,
  SocialEventMessagingType,
  type IEventDeletedPayload,
  type IEventSocialDeletedPayload,
  type IEventSocialDeletionFailedPayload,
  type StreamEvent,
} from '@volontariapp/messaging';
import { Injectable } from '@nestjs/common';
import { ParticipationService, EventId } from '@volontariapp/domain-social';
import type {
  BatchEventItem,
  ParseResult,
  PostProcessorOptions,
} from '@volontariapp/post-processors';
import type { Redis } from 'ioredis';
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
export class EventDeletedPostProcessor extends BatchPostProcessor<EventEventMessagingType.EVENT_DELETED> {
  protected async processEvents(
    events: BatchEventItem<EventEventMessagingType.EVENT_DELETED>[],
  ): Promise<void> {
    const eventIds: EventId[] = [];
    const validEvents: BatchEventItem<EventEventMessagingType.EVENT_DELETED>[] =
      [];

    for (const item of events) {
      const { event, messageId } = item;
      const payload: IEventDeletedPayload = event.payload.after;

      if (!payload.eventId) {
        this.logger.error(
          'Invalid payload for EVENT_DELETED: missing eventId',
          {
            messageId,
            payload: event.payload,
          },
        );
        continue;
      }

      eventIds.push(new EventId(payload.eventId));
      validEvents.push(item);
    }

    if (eventIds.length === 0) return;

    try {
      this.logger.info(
        `Batch processing ${String(eventIds.length)} EVENT_DELETED in Neo4j...`,
      );
      await this.participationService.deleteEventsBatch(eventIds);
      this.logger.info('Successfully batch processed EVENT_DELETED in Neo4j');
    } catch (error) {
      this.logger.error(
        'Error processing batch of EVENT_DELETED in Neo4j',
        error,
      );
      throw error;
    }

    const queueEntities: EventQueueEntity<SocialEventMessagingType.EVENT_SOCIAL_DELETED>[] =
      [];

    for (const { event } of validEvents) {
      const payload: IEventDeletedPayload = event.payload.after;

      const wsPayload: IEventSocialDeletedPayload = {
        eventId: payload.eventId,
      };

      queueEntities.push(
        EventQueueEntity.createEvent<SocialEventMessagingType.EVENT_SOCIAL_DELETED>(
          {
            type: SocialEventMessagingType.EVENT_SOCIAL_DELETED,
            emitter: event.emitter,
            emitterId: event.emitterId,
            traceId: event.traceId,
            correlationId: event.correlationId,
            payload: wsPayload,
            targetServices: [Streams.WS_EVENT_DELETED_FEEDBACK],
          },
        ),
      );
    }

    if (queueEntities.length > 0) {
      try {
        const repo =
          new EventQueueRepository<SocialEventMessagingType.EVENT_SOCIAL_DELETED>(
            this.typeormRepository,
          );
        const writer = new EventQueueWriter(this.logger, repo);

        this.logger.info(
          `Inserting ${String(queueEntities.length)} WS feedback events into event_queue for ${Streams.WS_EVENT_DELETED_FEEDBACK}`,
        );

        await writer.createMany(queueEntities);
      } catch (error) {
        this.logger.error(
          'Error batch inserting EVENT_SOCIAL_DELETED into event_queue',
          error,
        );
      }
    }
  }

  protected override async sendMessageToDlq(
    messageId: string,
    originalPayload: ParseResult,
    error: string,
  ): Promise<void> {
    await super.sendMessageToDlq(messageId, originalPayload, error);

    if (!originalPayload.success) {
      this.logger.warn(
        'Original payload failed to parse, cannot send WS feedback',
        { messageId },
      );
      return;
    }

    try {
      const event = JSON.parse(
        originalPayload.payload,
      ) as StreamEvent<IEventDeletedPayload>;
      const payload: IEventDeletedPayload = event.payload.after;

      const failPayload: IEventSocialDeletionFailedPayload = {
        eventId: payload.eventId,
      };

      const queueEntity =
        EventQueueEntity.createEvent<SocialEventMessagingType.EVENT_SOCIAL_DELETION_FAILED>(
          {
            type: SocialEventMessagingType.EVENT_SOCIAL_DELETION_FAILED,
            emitter: event.emitter,
            emitterId: event.emitterId,
            traceId: event.traceId,
            correlationId: event.correlationId,
            payload: failPayload,
            targetServices: [Streams.WS_EVENT_DELETED_FEEDBACK],
          },
        );

      const repo =
        new EventQueueRepository<SocialEventMessagingType.EVENT_SOCIAL_DELETION_FAILED>(
          this.typeormRepository,
        );
      await new EventQueueWriter(this.logger, repo).createMany([queueEntity]);

      this.logger.info('Inserted WS failure feedback event into event_queue', {
        messageId,
      });
    } catch (parseError) {
      this.logger.error(
        'Failed to parse original payload for WS failure feedback',
        parseError,
        { messageId },
      );
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
    return eventType === EventEventMessagingType.EVENT_DELETED.toString();
  }
}
