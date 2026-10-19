import { Injectable } from '@nestjs/common';
import { BatchPostProcessor } from '@volontariapp/post-processors';
import type {
  BatchEventItem,
  PostProcessorOptions,
} from '@volontariapp/post-processors';
import {
  PostEventMessagingType,
  type IPostDeletedPayload,
} from '@volontariapp/messaging';
import { RankingMentionService } from '@volontariapp/domain-ranking';
import type { Redis } from 'ioredis';

/** La suppression d'un post retire sa mention ; l'identifiant disparait du feed a la lecture. */
@Injectable()
export class PostDeletedPostProcessor extends BatchPostProcessor<PostEventMessagingType.POST_DELETED> {
  constructor(
    redisClient: Redis,
    options: PostProcessorOptions,
    private readonly mentionService: RankingMentionService,
  ) {
    super(redisClient, options);
  }

  protected async processEvents(
    events: BatchEventItem<PostEventMessagingType.POST_DELETED>[],
  ): Promise<void> {
    for (const { event, messageId } of events) {
      const payload: IPostDeletedPayload = event.payload.after;
      if (!payload.postId) {
        this.logger.error('Invalid payload for POST_DELETED: missing postId', {
          messageId,
        });
        continue;
      }
      await this.mentionService.removeMention(payload.postId);
    }
  }

  protected override shouldProcess(
    eventType: PostEventMessagingType | string,
  ): boolean {
    return eventType === PostEventMessagingType.POST_DELETED.toString();
  }
}
