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
import {
  PostModel,
  PostgresPostRepository,
  type PostMediaScanStatus,
} from '@volontariapp/domain-post';
import type { DataSource } from 'typeorm';
import type { Redis } from 'ioredis';

export abstract class BaseStorageMediaPostProcessor<
  T extends
    | StorageEventMessagingType.FILE_SCANNED
    | StorageEventMessagingType.FILE_REJECTED
    | StorageEventMessagingType.ATTACHMENT_REJECTED,
> extends BatchPostProcessor<T> {
  protected readonly postRepository: PostgresPostRepository;

  constructor(
    protected readonly db: DataSource,
    redisDriver: Redis,
    options: PostProcessorOptions,
    protected readonly expectedEventType: T,
    protected readonly targetStatus: PostMediaScanStatus,
    postRepository?: PostgresPostRepository,
  ) {
    super(redisDriver, options);

    this.postRepository =
      postRepository ??
      new PostgresPostRepository(this.db.getRepository(PostModel));
  }

  protected override shouldProcess(eventType: T | string): boolean {
    return eventType === this.expectedEventType.toString();
  }

  protected async processEvents(events: BatchEventItem<T>[]): Promise<void> {
    for (const { event, messageId } of events) {
      const rawPayload = event.payload as
        | { after?: IStorageFileEntityPayload }
        | null
        | undefined;
      const payload = rawPayload?.after;

      if (!payload?.fileId || !payload.entityId) {
        this.logger.error(
          `Invalid payload for ${String(this.expectedEventType)}: missing required fields`,
          {
            messageId,
            payload: event.payload,
          },
        );
        continue;
      }

      if (payload.entityType !== StorageEntityType.POST) {
        this.logger.debug(
          `Ignoring storage event for non-post entity: ${payload.entityType}`,
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
        const updated = await this.postRepository.updateMediaScanStatus(
          payload.entityId,
          payload.fileId,
          this.targetStatus,
        );

        if (!updated) {
          this.logger.warn(
            `Post not found when applying media scan result for post ${payload.entityId}`,
            {
              messageId,
              postId: payload.entityId,
              fileId: payload.fileId,
            },
          );
          continue;
        }

        this.logger.info(
          `Successfully applied media scan status ${this.targetStatus} to post ${payload.entityId} for file ${payload.fileId}`,
          {
            messageId,
            postId: payload.entityId,
            fileId: payload.fileId,
            status: this.targetStatus,
          },
        );
      } catch (error) {
        this.logger.error(
          `Failed to apply media scan status ${this.targetStatus} for post ${payload.entityId}`,
          error,
          {
            messageId,
            postId: payload.entityId,
            fileId: payload.fileId,
          },
        );
        throw error;
      }
    }
  }
}
