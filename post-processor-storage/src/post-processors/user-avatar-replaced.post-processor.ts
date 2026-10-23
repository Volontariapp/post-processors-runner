import { Injectable } from '@nestjs/common';
import {
  BatchPostProcessor,
  type BatchEventItem,
  type PostProcessorOptions,
} from '@volontariapp/post-processors';
import type { Redis } from 'ioredis';
import {
  UserEventMessagingType,
  type IUserAvatarReplacedPayload,
} from '@volontariapp/messaging';
import { EntityType } from '@volontariapp/domain-storage';
import { PostgresFileRepository } from '@volontariapp/domain-storage/repositories';

@Injectable()
export class UserAvatarReplacedPostProcessor extends BatchPostProcessor<UserEventMessagingType.USER_AVATAR_REPLACED> {
  constructor(
    redisClient: Redis,
    options: PostProcessorOptions,
    private readonly fileRepository: PostgresFileRepository,
  ) {
    super(redisClient, options);
  }

  protected override shouldProcess(
    eventType: UserEventMessagingType | string,
  ): boolean {
    return eventType === UserEventMessagingType.USER_AVATAR_REPLACED.toString();
  }

  protected async processEvents(
    events: BatchEventItem<UserEventMessagingType.USER_AVATAR_REPLACED>[],
  ): Promise<void> {
    for (const { event, messageId } of events) {
      const rawPayload = event.payload as
        { after?: IUserAvatarReplacedPayload } | null | undefined;
      const payload = rawPayload?.after;

      if (!payload?.userId) {
        this.logger.error(
          'Invalid payload for USER_AVATAR_REPLACED: missing userId',
          {
            messageId,
            payload: event.payload,
          },
        );
        continue;
      }

      if (payload.oldFileId) {
        try {
          await this.fileRepository.releaseFile({
            fileId: payload.oldFileId,
            entityType: EntityType.USER_AVATAR,
            entityId: payload.userId,
            ownerId: payload.userId,
            newFileId: payload.newFileId,
          });

          this.logger.info(
            `Successfully released old avatar file ${payload.oldFileId} for user ${payload.userId}`,
            {
              messageId,
              userId: payload.userId,
              oldFileId: payload.oldFileId,
            },
          );
        } catch (error) {
          this.logger.error(
            `Error releasing old avatar file for user ${payload.userId}`,
            error,
            {
              messageId,
              userId: payload.userId,
            },
          );
          throw error;
        }
      }

      if (!payload.newFileId) {
        this.logger.debug(
          `No new avatar file to attach for user ${payload.userId}`,
          {
            messageId,
            userId: payload.userId,
          },
        );
        continue;
      }

      try {
        const results = await this.fileRepository.attachFromConfirmationEvent({
          fileIds: [payload.newFileId],
          entityType: EntityType.USER_AVATAR,
          entityId: payload.userId,
          ownerId: payload.userId,
        });

        this.logger.info(
          `Successfully processed avatar attachment for user ${payload.userId}`,
          {
            messageId,
            userId: payload.userId,
            results,
          },
        );
      } catch (error) {
        this.logger.error(
          `Error attaching avatar file for user ${payload.userId}`,
          error,
          {
            messageId,
            userId: payload.userId,
          },
        );
        throw error;
      }
    }
  }
}
