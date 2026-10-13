import { BatchPostProcessor } from '@volontariapp/post-processors';
import { Injectable } from '@nestjs/common';
import type {
  BatchEventItem,
  PostProcessorOptions,
  ParseResult,
} from '@volontariapp/post-processors';
import type { Redis } from 'ioredis';
import {
  UserEventMessagingType,
  StorageEventMessagingType,
  type IUserDeleledPayload,
  type IUserStorageDeletedPayload,
  type IUserStorageDeletionFailedPayload,
  type StreamEvent,
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
import { PostgresFileRepository } from '@volontariapp/domain-storage/repositories';

databaseMapper.registerBidirectional(EventQueueModel, EventQueueEntity);

@Injectable()
export class UserDeletedPostProcessor extends BatchPostProcessor<UserEventMessagingType.USER_DELETED> {
  protected async processEvents(
    events: BatchEventItem<UserEventMessagingType.USER_DELETED>[],
  ): Promise<void> {
    const queueEntities: EventQueueEntity<StorageEventMessagingType.USER_STORAGE_DELETED>[] =
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
        const releasedIds =
          await this.fileRepository.markFilesForDeletionByOwner(payload.id);

        this.logger.info(
          `Successfully marked ${String(releasedIds.length)} files for deletion for user ${payload.id}`,
          {
            messageId,
            userId: payload.id,
            count: releasedIds.length,
          },
        );

        const payloadStorageEvent: IUserStorageDeletedPayload = {
          userId: payload.id,
        };

        const queueEntity =
          EventQueueEntity.createFollowUp<StorageEventMessagingType.USER_STORAGE_DELETED>(
            event,
            {
              type: StorageEventMessagingType.USER_STORAGE_DELETED,
              emitter: event.emitter,
              emitterId: event.emitterId,
              payload: payloadStorageEvent,
              targetServices: [Streams.WS_USER_DELETED_FEEDBACK],
            },
          );

        queueEntities.push(queueEntity);
      } catch (error) {
        this.logger.error(
          'Error processing USER_DELETED in storage post processor',
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
        const eventQueueWriter =
          new EventQueueWriter<StorageEventMessagingType.USER_STORAGE_DELETED>(
            this.logger,
            new EventQueueRepository<StorageEventMessagingType.USER_STORAGE_DELETED>(
              this.typeormRepository,
            ),
          );

        this.logger.info(
          `Inserting ${String(queueEntities.length)} USER_STORAGE_DELETED into event_queue for ws feedback stream`,
        );

        await eventQueueWriter.createMany(queueEntities);
      } catch (error) {
        this.logger.error(
          'Error batch inserting USER_STORAGE_DELETED into event_queue',
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

      const failPayload: IUserStorageDeletionFailedPayload = {
        userId: payload.id,
        errorReason: error,
      };

      const queueEntity =
        EventQueueEntity.createFollowUp<StorageEventMessagingType.USER_STORAGE_DELETION_FAILED>(
          event,
          {
            type: StorageEventMessagingType.USER_STORAGE_DELETION_FAILED,
            emitter: event.emitter,
            emitterId: event.emitterId,
            payload: failPayload,
            targetServices: [Streams.WS_USER_DELETED_FEEDBACK],
          },
        );

      const repo =
        new EventQueueRepository<StorageEventMessagingType.USER_STORAGE_DELETION_FAILED>(
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
    private readonly fileRepository: PostgresFileRepository,
    @InjectRepository(EventQueueModel)
    private readonly typeormRepository: Repository<EventQueueModel>,
  ) {
    super(redisClient, options);
  }

  protected override shouldProcess(
    eventType: UserEventMessagingType | string,
  ): boolean {
    return eventType === UserEventMessagingType.USER_DELETED.toString();
  }
}
