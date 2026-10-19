import { Injectable } from '@nestjs/common';
import { BatchPostProcessor } from '@volontariapp/post-processors';
import type {
  BatchEventItem,
  PostProcessorOptions,
} from '@volontariapp/post-processors';
import {
  SocialEventMessagingType,
  type IEventSocialUnwishedPayload,
} from '@volontariapp/messaging';
import {
  RankingListKind,
  RankingWishService,
} from '@volontariapp/domain-ranking';
import type { Redis } from 'ioredis';
import { RankingJobWriter } from '../../domain/ranking-job-writer.js';
import { resolveUserId } from '../resolve-user-id.js';

/** Un souhait retire met a jour ranking_event_wish puis demande un recalcul des evenements. */
@Injectable()
export class EventUnwishedPostProcessor extends BatchPostProcessor<SocialEventMessagingType.EVENT_SOCIAL_UNWISHED> {
  constructor(
    redisClient: Redis,
    options: PostProcessorOptions,
    private readonly wishService: RankingWishService,
    private readonly jobWriter: RankingJobWriter,
  ) {
    super(redisClient, options);
  }

  protected async processEvents(
    events: BatchEventItem<SocialEventMessagingType.EVENT_SOCIAL_UNWISHED>[],
  ): Promise<void> {
    const userIds = new Set<string>();
    for (const { event, messageId } of events) {
      const payload: IEventSocialUnwishedPayload = event.payload.after;
      const userId = resolveUserId(payload.userId, event.emitterId);
      if (!userId || !payload.eventId) {
        this.logger.error(
          'Invalid payload for EVENT_SOCIAL_UNWISHED: missing user or event',
          {
            messageId,
          },
        );
        continue;
      }
      await this.wishService.removeWish(userId, payload.eventId);
      userIds.add(userId);
    }
    if (userIds.size > 0) {
      await this.jobWriter.requestCompute(
        [...userIds].map((userId) => ({
          userId,
          listKind: RankingListKind.EVENT,
          reason: 'WISH_CHANGED' as const,
        })),
      );
    }
  }

  protected override shouldProcess(
    eventType: SocialEventMessagingType | string,
  ): boolean {
    return (
      eventType === SocialEventMessagingType.EVENT_SOCIAL_UNWISHED.toString()
    );
  }
}
