import { PostEventMessagingType } from '@volontariapp/messaging';
import {
  type PostProcessorOptions,
  BatchPostProcessor,
  type BatchEventItem,
} from '@volontariapp/post-processors';
import type { Redis } from 'ioredis';
import type { BadgeEvaluator } from '../../core/services/badge-evaluator.service.js';

export class PostCreationSuccessfullBadgePostProcessor extends BatchPostProcessor<PostEventMessagingType.POST_CREATION_SUCCESSFULL> {
  constructor(
    private readonly badgeEvaluator: BadgeEvaluator,
    redisDriver: Redis,
    options: PostProcessorOptions,
  ) {
    super(redisDriver, options);
  }

  protected override shouldProcess(
    eventType: PostEventMessagingType | string,
  ): boolean {
    return (
      eventType === PostEventMessagingType.POST_CREATION_SUCCESSFULL.toString()
    );
  }

  protected async processEvents(
    events: BatchEventItem<PostEventMessagingType.POST_CREATION_SUCCESSFULL>[],
  ): Promise<void> {
    for (const { event, messageId } of events) {
      const { postId, userId } = event.payload.after;

      if (!userId) {
        this.logger.error(
          'Invalid payload for POST_CREATION_SUCCESSFULL: missing userId',
          {
            messageId,
            postId,
          },
        );
        continue;
      }

      try {
        this.logger.log(
          `Evaluating badge COMMUNITY_POST_COUNT_1 for user ${userId} on post ${String(postId)}`,
          {
            messageId,
            postId,
            userId,
          },
        );

        const awarded = await this.badgeEvaluator.evaluateCommunityPostBadge(
          userId,
          {
            correlationId: event.correlationId,
            traceId: event.traceId,
          },
        );

        if (awarded.length > 0) {
          this.logger.log(
            `Badge COMMUNITY_POST_COUNT_1 awarded to user ${userId}`,
            {
              messageId,
              postId,
              userId,
              badges: awarded,
            },
          );
        }
      } catch (err: unknown) {
        this.logger.error(
          `Error while evaluating badge for user ${userId}: ${err instanceof Error ? err.message : String(err)}`,
          {
            messageId,
            postId,
            userId,
            error: err,
          },
        );
        throw err;
      }
    }
  }
}
