import { Injectable } from '@nestjs/common';
import {
  BatchPostProcessor,
  type BatchEventItem,
  type PostProcessorOptions,
} from '@volontariapp/post-processors';
import type { Redis } from 'ioredis';
import {
  PostEventMessagingType,
  type IPostDeletedPayload,
} from '@volontariapp/messaging';
import { EntityType } from '@volontariapp/domain-storage';
import { PostgresFileRepository } from '@volontariapp/domain-storage/repositories';

@Injectable()
export class PostDeletedPostProcessor extends BatchPostProcessor<PostEventMessagingType.POST_DELETED> {
  constructor(
    redisClient: Redis,
    options: PostProcessorOptions,
    private readonly fileRepository: PostgresFileRepository,
  ) {
    super(redisClient, options);
  }

  protected override shouldProcess(
    eventType: PostEventMessagingType | string,
  ): boolean {
    return eventType === PostEventMessagingType.POST_DELETED.toString();
  }

  protected async processEvents(
    events: BatchEventItem<PostEventMessagingType.POST_DELETED>[],
  ): Promise<void> {
    for (const { event, messageId } of events) {
      const rawPayload = event.payload as
        { after?: IPostDeletedPayload } | null | undefined;
      const payload = rawPayload?.after;

      if (!payload?.postId) {
        this.logger.error('Invalid payload for POST_DELETED: missing postId', {
          messageId,
          payload: event.payload,
        });
        continue;
      }

      try {
        const result = await this.fileRepository.releaseForEntity({
          entityType: EntityType.POST,
          entityId: payload.postId,
        });

        this.logger.info(
          `Successfully released ${String(result.releasedFileIds.length)} file(s) for deleted post ${payload.postId}`,
          {
            messageId,
            postId: payload.postId,
            releasedCount: result.releasedFileIds.length,
            tombstoneCreated: result.tombstoneCreated,
          },
        );
      } catch (error) {
        this.logger.error(
          `Error releasing files for deleted post ${payload.postId}`,
          error,
          {
            messageId,
            postId: payload.postId,
          },
        );
        throw error;
      }
    }
  }
}
