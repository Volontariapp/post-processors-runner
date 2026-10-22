import {
  type PostProcessorOptions,
  BatchPostProcessor,
  type BatchEventItem,
} from '@volontariapp/post-processors';
import type { StorageEventMessagingType } from '@volontariapp/messaging';
import {
  StorageEntityType,
  type IStorageFileEntityPayload,
} from '@volontariapp/messaging';
import type { CoverStatus } from '@volontariapp/contracts';
import {
  EventModel,
  PostgresEventRepository,
} from '@volontariapp/domain-event';
import type { DataSource } from 'typeorm';
import type { Redis } from 'ioredis';

export abstract class BaseStorageCoverPostProcessor<
  T extends
    | StorageEventMessagingType.FILE_SCANNED
    | StorageEventMessagingType.FILE_REJECTED
    | StorageEventMessagingType.ATTACHMENT_REJECTED,
> extends BatchPostProcessor<T> {
  protected readonly eventRepository: PostgresEventRepository;

  constructor(
    protected readonly db: DataSource,
    redisDriver: Redis,
    options: PostProcessorOptions,
    protected readonly expectedEventType: T,
    protected readonly targetStatus: CoverStatus,
    eventRepository?: PostgresEventRepository,
  ) {
    super(redisDriver, options);

    this.eventRepository =
      eventRepository ??
      new PostgresEventRepository(this.db.getRepository(EventModel));
  }

  protected override shouldProcess(eventType: T | string): boolean {
    return eventType === this.expectedEventType.toString();
  }

  protected async processEvents(events: BatchEventItem<T>[]): Promise<void> {
    for (const { event, messageId } of events) {
      const payload: IStorageFileEntityPayload | undefined =
        event.payload?.after;

      if (!payload || !payload.fileId || !payload.entityId) {
        this.logger.error(
          `Invalid payload for ${String(this.expectedEventType)}: missing required fields`,
          {
            messageId,
            payload: event.payload,
          },
        );
        continue;
      }

      if (payload.entityType !== StorageEntityType.EVENT_COVER) {
        this.logger.debug(
          `Ignoring storage event for non-event-cover entity: ${payload.entityType}`,
          {
            messageId,
            fileId: payload.fileId,
            entityId: payload.entityId,
            entityType: payload.entityType,
          },
        );
        continue;
      }

      try {
        const updated = await this.eventRepository.applyCoverResult(
          payload.entityId,
          payload.fileId,
          this.targetStatus,
        );

        if (!updated) {
          this.logger.warn(
            `Event not found when applying cover result for event ${payload.entityId}`,
            {
              messageId,
              eventId: payload.entityId,
              fileId: payload.fileId,
            },
          );
          continue;
        }

        if (updated.coverFileId !== payload.fileId) {
          this.logger.info(
            `Cover file replaced during processing for event ${payload.entityId}. Current: ${String(updated.coverFileId)}, Scanned: ${payload.fileId}`,
            {
              messageId,
              eventId: payload.entityId,
              fileId: payload.fileId,
            },
          );
          continue;
        }

        this.logger.info(
          `Successfully applied cover status ${String(this.targetStatus)} to event ${payload.entityId} for file ${payload.fileId}`,
          {
            messageId,
            eventId: payload.entityId,
            fileId: payload.fileId,
            status: this.targetStatus,
          },
        );
      } catch (error) {
        this.logger.error(
          `Failed to apply cover status ${String(this.targetStatus)} for event ${payload.entityId}`,
          error,
          {
            messageId,
            eventId: payload.entityId,
            fileId: payload.fileId,
          },
        );
        throw error;
      }
    }
  }
}
