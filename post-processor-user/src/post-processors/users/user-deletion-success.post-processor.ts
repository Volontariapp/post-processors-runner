import { UserEventMessagingType } from '@volontariapp/messaging';
import type { IUserDeletionSuccessfullPayload } from '@volontariapp/messaging';
import {
  type PostProcessorOptions,
  BatchPostProcessor,
  type BatchEventItem,
} from '@volontariapp/post-processors';
import type { Redis } from 'ioredis';
import { UserService, UserId } from '@volontariapp/domain-user';
import { Injectable } from '@nestjs/common';

@Injectable()
export class UserDeletionSuccessPostProcessor extends BatchPostProcessor<UserEventMessagingType.USER_DELETION_SUCCESSFULL> {
  constructor(
    private readonly userService: UserService,
    redisDriver: Redis,
    options: PostProcessorOptions,
  ) {
    super(redisDriver, options);
  }

  protected override shouldProcess(
    eventType: UserEventMessagingType | string,
  ): boolean {
    return (
      eventType === UserEventMessagingType.USER_DELETION_SUCCESSFULL.toString()
    );
  }

  protected async processEvents(
    events: BatchEventItem<UserEventMessagingType.USER_DELETION_SUCCESSFULL>[],
  ): Promise<void> {
    for (const { event, messageId } of events) {
      const payload: IUserDeletionSuccessfullPayload = event.payload.after;
      const userId = payload.userId;

      if (!userId) {
        this.logger.error(
          'Invalid payload for USER_DELETION_SUCCESSFULL: missing userId',
          {
            messageId,
            payload: event.payload,
          },
        );
        continue;
      }

      try {
        this.logger.log(`Finalizing user deletion for user ${userId}`, {
          messageId,
          userId,
        });

        await this.userService.finalizeDeletion(new UserId(userId));

        this.logger.log(
          `Successfully finalized user deletion for user ${userId}`,
          {
            messageId,
            userId,
          },
        );
      } catch (err: unknown) {
        this.logger.error(
          `Error while finalizing deletion for user ${userId}: ${err instanceof Error ? err.message : String(err)}`,
          {
            messageId,
            userId,
            error: err,
          },
        );
        throw err;
      }
    }
  }
}
