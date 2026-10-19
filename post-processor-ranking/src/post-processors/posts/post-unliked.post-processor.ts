import { Injectable } from '@nestjs/common';
import { BatchPostProcessor } from '@volontariapp/post-processors';
import type {
  BatchEventItem,
  PostProcessorOptions,
} from '@volontariapp/post-processors';
import {
  PostEventMessagingType,
  type IPostUnlikedPayload,
} from '@volontariapp/messaging';
import { RankingLikeLogService } from '@volontariapp/domain-ranking';
import type { Redis } from 'ioredis';
import { resolveUserId } from '../helpers/resolve-user-id.helpers.js';

/** POST_UNLIKED n'ecrit que le journal de likes : aucun recalcul, le feed ne doit pas bouger sous les yeux. */
@Injectable()
export class PostUnlikedPostProcessor extends BatchPostProcessor<PostEventMessagingType.POST_UNLIKED> {
  constructor(
    redisClient: Redis,
    options: PostProcessorOptions,
    private readonly likeLogService: RankingLikeLogService,
  ) {
    super(redisClient, options);
  }

  protected async processEvents(
    events: BatchEventItem<PostEventMessagingType.POST_UNLIKED>[],
  ): Promise<void> {
    for (const { event, messageId } of events) {
      const payload: IPostUnlikedPayload = event.payload.after;
      const userId = resolveUserId(payload.userId, event.emitterId);
      if (!userId || !payload.postId) {
        this.logger.error(
          'Invalid payload for POST_UNLIKED: missing user or post',
          {
            messageId,
          },
        );
        continue;
      }
      const occurredAt = new Date(event.createdAt);
      await this.likeLogService.recordUnlike({
        userId,
        postId: payload.postId,
        at: occurredAt,
      });
    }
  }

  protected override shouldProcess(
    eventType: PostEventMessagingType | string,
  ): boolean {
    return eventType === PostEventMessagingType.POST_UNLIKED.toString();
  }
}
