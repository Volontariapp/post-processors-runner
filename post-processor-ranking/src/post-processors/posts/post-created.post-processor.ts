import { Injectable } from '@nestjs/common';
import { BatchPostProcessor } from '@volontariapp/post-processors';
import type {
  BatchEventItem,
  PostProcessorOptions,
} from '@volontariapp/post-processors';
import {
  PostEventMessagingType,
  type IPostCreatedPayload,
} from '@volontariapp/messaging';
import { RankingMentionService } from '@volontariapp/domain-ranking';
import type { Redis } from 'ioredis';
import { RankingJobWriter } from '../../domain/ranking-job-writer.js';

/** Un post note la mention de son evenement (signal de popularite) et declenche le fan-out du feed. */
@Injectable()
export class PostCreatedPostProcessor extends BatchPostProcessor<PostEventMessagingType.POST_CREATED> {
  constructor(
    redisClient: Redis,
    options: PostProcessorOptions,
    private readonly mentionService: RankingMentionService,
    private readonly jobWriter: RankingJobWriter,
  ) {
    super(redisClient, options);
  }

  protected async processEvents(
    events: BatchEventItem<PostEventMessagingType.POST_CREATED>[],
  ): Promise<void> {
    for (const { event, messageId } of events) {
      const payload: IPostCreatedPayload = event.payload.after;
      if (!payload.postId || !payload.userId) {
        this.logger.error('Invalid payload for POST_CREATED: missing ids', {
          messageId,
        });
        continue;
      }
      if (payload.eventId) {
        await this.mentionService.addMention({
          postId: payload.postId,
          eventId: payload.eventId,
          authorId: payload.userId,
        });
      }
      await this.jobWriter.enqueueFanout({
        trigger: 'POST_CREATED',
        subjectId: payload.postId,
        postId: payload.postId,
        authorId: payload.userId,
      });
    }
  }

  protected override shouldProcess(
    eventType: PostEventMessagingType | string,
  ): boolean {
    return eventType === PostEventMessagingType.POST_CREATED.toString();
  }
}
