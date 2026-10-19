import { Injectable } from '@nestjs/common';
import { BatchPostProcessor } from '@volontariapp/post-processors';
import type {
  BatchEventItem,
  PostProcessorOptions,
} from '@volontariapp/post-processors';
import {
  PostEventMessagingType,
  type IPostLikedPayload,
} from '@volontariapp/messaging';
import { RankingLikeLogService } from '@volontariapp/domain-ranking';
import type { Redis } from 'ioredis';
import { resolveUserId } from '../resolve-user-id.js';

/** POST_LIKED n'ecrit que le journal de likes : aucun recalcul, le feed ne doit pas bouger sous les yeux. */
@Injectable()
export class PostLikedPostProcessor extends BatchPostProcessor<PostEventMessagingType.POST_LIKED> {
  constructor(
    redisClient: Redis,
    options: PostProcessorOptions,
    private readonly likeLogService: RankingLikeLogService,
  ) {
    super(redisClient, options);
  }

  protected async processEvents(
    events: BatchEventItem<PostEventMessagingType.POST_LIKED>[],
  ): Promise<void> {
    for (const { event, messageId } of events) {
      const payload: IPostLikedPayload = event.payload.after;
      const userId = resolveUserId(payload.userId, event.emitterId);
      if (!userId || !payload.postId) {
        this.logger.error(
          'Invalid payload for POST_LIKED: missing user or post',
          {
            messageId,
          },
        );
        continue;
      }
      const occurredAt = new Date(event.createdAt);
      await this.likeLogService.recordLike({
        userId,
        postId: payload.postId,
        occurredAt,
      });
    }
  }

  protected override shouldProcess(
    eventType: PostEventMessagingType | string,
  ): boolean {
    return eventType === PostEventMessagingType.POST_LIKED.toString();
  }
}
