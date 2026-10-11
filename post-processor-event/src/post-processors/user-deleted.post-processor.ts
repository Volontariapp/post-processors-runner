import {
  EventEventMessagingType,
  UserEventMessagingType,
  type IUserDeleledPayload,
  type IUserEventDeletedPayload,
  type IUserEventDeletionFailedPayload,
  type StreamEvent,
} from '@volontariapp/messaging';
import {
  type PostProcessorOptions,
  BatchPostProcessor,
  type BatchEventItem,
  type ParseResult,
} from '@volontariapp/post-processors';
import {
  EventModel,
  PostgresEventRepository,
} from '@volontariapp/domain-event';
import type { DataSource } from 'typeorm';
import type { Redis } from 'ioredis';
import {
  databaseMapper,
  EventQueueEntity,
  EventQueueModel,
} from '@volontariapp/database';
import { Streams } from '@volontariapp/shared';
import { EventQueueWriter, EventQueueRepository } from '@volontariapp/outbox';

databaseMapper.registerBidirectional(EventQueueModel, EventQueueEntity);

export class UserDeletedPostProcessor extends BatchPostProcessor<UserEventMessagingType.USER_DELETED> {
  private readonly eventRepository: PostgresEventRepository;

  constructor(
    private readonly db: DataSource,
    redisDriver: Redis,
    options: PostProcessorOptions,
    eventRepository?: PostgresEventRepository,
  ) {
    super(redisDriver, options);

    this.eventRepository =
      eventRepository ??
      new PostgresEventRepository(this.db.getRepository(EventModel));
  }

  protected override shouldProcess(
    eventType: UserEventMessagingType | string,
  ): boolean {
    return eventType === UserEventMessagingType.USER_DELETED.toString();
  }

  protected async processEvents(
    events: BatchEventItem<UserEventMessagingType.USER_DELETED>[],
  ): Promise<void> {
    const queueEntities: EventQueueEntity<EventEventMessagingType.USER_EVENT_DELETED>[] =
      [];

    for (const { event, messageId } of events) {
      const payload: IUserDeleledPayload = event.payload.after;

      if (!payload.id) {
        this.logger.error('Invalid payload for USER_DELETED: missing id', {
          messageId,
          payload: event.payload,
        });
        continue;
      }

      try {
        const deletedCount =
          await this.eventRepository.deleteAllByOrganizerWithEventDeleted(
            payload.id,
          );

        this.logger.info(
          `Successfully deleted ${String(deletedCount)} events for organizer ${payload.id} with event.deleted re-emitted`,
          { messageId, userId: payload.id },
        );

        const payloadEventDeleted: IUserEventDeletedPayload = {
          userId: payload.id,
        };

        const queueEntity =
          EventQueueEntity.createEvent<EventEventMessagingType.USER_EVENT_DELETED>(
            {
              type: EventEventMessagingType.USER_EVENT_DELETED,
              emitter: event.emitter,
              emitterId: event.emitterId,
              traceId: event.traceId,
              correlationId: event.correlationId,
              payload: payloadEventDeleted,
              targetServices: [Streams.WS_USER_DELETED_FEEDBACK],
            },
          );

        queueEntities.push(queueEntity);
      } catch (error) {
        this.logger.error(
          'Error processing USER_DELETED in event post processor',
          error,
          {
            messageId,
            userId: payload.id,
          },
        );
        throw error;
      }
    }

    if (queueEntities.length > 0) {
      try {
        const eventQueueRepo = this.db.getRepository(EventQueueModel);
        const eventQueueWriter =
          new EventQueueWriter<EventEventMessagingType.USER_EVENT_DELETED>(
            this.logger,
            new EventQueueRepository<EventEventMessagingType.USER_EVENT_DELETED>(
              eventQueueRepo,
            ),
          );

        this.logger.info(
          `Inserting ${String(queueEntities.length)} USER_EVENT_DELETED into event_queue for ws feedback stream`,
        );

        await eventQueueWriter.createMany(queueEntities);
      } catch (error) {
        this.logger.error(
          'Error batch inserting USER_EVENT_DELETED into event_queue',
          error,
        );
        throw error;
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
      ) as StreamEvent<IUserDeleledPayload>;
      const payload: IUserDeleledPayload = event.payload.after;

      const failPayload: IUserEventDeletionFailedPayload = {
        userId: payload.id,
        errorReason: error,
      };

      const queueEntity =
        EventQueueEntity.createEvent<EventEventMessagingType.USER_EVENT_DELETION_FAILED>(
          {
            type: EventEventMessagingType.USER_EVENT_DELETION_FAILED,
            emitter: event.emitter,
            emitterId: event.emitterId,
            traceId: event.traceId,
            correlationId: event.correlationId,
            payload: failPayload,
            targetServices: [Streams.WS_USER_DELETED_FEEDBACK],
          },
        );

      const eventQueueRepo = this.db.getRepository(EventQueueModel);
      const repo =
        new EventQueueRepository<EventEventMessagingType.USER_EVENT_DELETION_FAILED>(
          eventQueueRepo,
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
}
