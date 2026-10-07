import { PostEventMessagingType } from '@volontariapp/messaging';
import {
  type PostProcessorOptions,
  BatchPostProcessor,
  type BatchEventItem,
} from '@volontariapp/post-processors';
import type { Redis } from 'ioredis';
import type { BadgeEvaluator } from '../../core/services/badge-evaluator.service.js';

export class PostLikedBadgePostProcessor extends BatchPostProcessor<PostEventMessagingType.POST_LIKED> {
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
    return eventType === PostEventMessagingType.POST_LIKED.toString();
  }

  protected async processEvents(
    events: BatchEventItem<PostEventMessagingType.POST_LIKED>[],
  ): Promise<void> {
    for (const { event, messageId } of events) {
      // In post.liked, emitterId is the user who liked the post.
      // event.payload.after.authorId is also set to this user.
      const userId = event.emitterId || event.payload.after.authorId;
      const postId = event.payload.after.postId;

      if (!userId) {
        this.logger.error(
          'Invalid payload for POST_LIKED: missing emitterId or authorId',
          {
            messageId,
            postId,
          },
        );
        continue;
      }

      try {
        this.logger.log(
          `Evaluating badge SOCIAL_LIKE_COUNT_10 for user ${userId} on post ${String(postId)}`,
          {
            messageId,
            postId,
            userId,
          },
        );

        const awarded = await this.badgeEvaluator.evaluateSocialLikeBadge(
          userId,
          {
            correlationId: event.correlationId,
            traceId: event.traceId,
          },
        );

        if (awarded.length > 0) {
          this.logger.log(
            `Badge SOCIAL_LIKE_COUNT_10 awarded to user ${userId}`,
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
