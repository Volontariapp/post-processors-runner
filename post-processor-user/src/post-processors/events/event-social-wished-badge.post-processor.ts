import { SocialEventMessagingType } from '@volontariapp/messaging';
import {
  type PostProcessorOptions,
  BatchPostProcessor,
  type BatchEventItem,
} from '@volontariapp/post-processors';
import type { Redis } from 'ioredis';
import type { BadgeEvaluator } from '../../core/services/badge-evaluator.service.js';

export class EventSocialWishedBadgePostProcessor extends BatchPostProcessor<SocialEventMessagingType.EVENT_SOCIAL_WISHED> {
  constructor(
    private readonly badgeEvaluator: BadgeEvaluator,
    redisDriver: Redis,
    options: PostProcessorOptions,
  ) {
    super(redisDriver, options);
  }

  protected override shouldProcess(
    eventType: SocialEventMessagingType | string,
  ): boolean {
    return (
      eventType === SocialEventMessagingType.EVENT_SOCIAL_WISHED.toString()
    );
  }

  protected async processEvents(
    events: BatchEventItem<SocialEventMessagingType.EVENT_SOCIAL_WISHED>[],
  ): Promise<void> {
    for (const { event, messageId } of events) {
      const { eventId, userId: payloadUserId } = event.payload.after;
      const userId = event.emitterId || payloadUserId;

      if (!userId) {
        this.logger.error(
          'Invalid payload for EVENT_SOCIAL_WISHED: missing emitterId or userId',
          {
            messageId,
            eventId,
          },
        );
        continue;
      }

      try {
        this.logger.log(
          `Evaluating badge EVENT_WISHLIST_COUNT_10 for user ${userId} on event ${String(eventId)}`,
          {
            messageId,
            eventId,
            userId,
          },
        );

        const awarded = await this.badgeEvaluator.evaluateEventWishlistBadge(
          userId,
          {
            correlationId: event.correlationId,
            traceId: event.traceId,
          },
        );

        if (awarded.length > 0) {
          this.logger.log(
            `Badge EVENT_WISHLIST_COUNT_10 awarded to user ${userId}`,
            {
              messageId,
              eventId,
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
            eventId,
            userId,
            error: err,
          },
        );
        throw err;
      }
    }
  }
}
