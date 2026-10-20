import { Injectable } from '@nestjs/common';
import {
  BatchPostProcessor,
  type BatchEventItem,
  type PostProcessorOptions,
} from '@volontariapp/post-processors';
import type { Redis } from 'ioredis';
import {
  PostEventMessagingType,
  type IPostCreatedPayload,
} from '@volontariapp/messaging';
import { EntityType } from '@volontariapp/domain-storage';
import { PostgresFileRepository } from '@volontariapp/domain-storage/repositories';

@Injectable()
export class PostCreatedPostProcessor extends BatchPostProcessor<PostEventMessagingType.POST_CREATED> {
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
    return eventType === PostEventMessagingType.POST_CREATED.toString();
  }

  protected async processEvents(
    events: BatchEventItem<PostEventMessagingType.POST_CREATED>[],
  ): Promise<void> {
    for (const { event, messageId } of events) {
      const payload: IPostCreatedPayload = event.payload.after;

      if (!payload.postId || !payload.userId) {
        this.logger.error(
          'Invalid payload for POST_CREATED: missing postId or userId',
          {
            messageId,
            payload: event.payload,
          },
        );
        continue;
      }

      if (payload.fileIds.length === 0) {
        this.logger.debug(`No files to attach for post ${payload.postId}`, {
          messageId,
          postId: payload.postId,
        });
        continue;
      }

      try {
        const results = await this.fileRepository.attachFromConfirmationEvent({
          fileIds: payload.fileIds,
          entityType: EntityType.POST,
          entityId: payload.postId,
          ownerId: payload.userId,
        });

        this.logger.info(
          `Successfully processed attachment for post ${payload.postId} (${String(results.length)} files)`,
          {
            messageId,
            postId: payload.postId,
            userId: payload.userId,
            results,
          },
        );
      } catch (error) {
        this.logger.error(
          `Error attaching files for post ${payload.postId}`,
          error,
          {
            messageId,
            postId: payload.postId,
            userId: payload.userId,
          },
        );
        throw error;
      }
    }
  }
}
