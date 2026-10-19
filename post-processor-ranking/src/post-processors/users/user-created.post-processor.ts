import { Injectable } from '@nestjs/common';
import { BatchPostProcessor } from '@volontariapp/post-processors';
import type {
  BatchEventItem,
  PostProcessorOptions,
} from '@volontariapp/post-processors';
import {
  UserEventMessagingType,
  type IUserCreatedPayload,
} from '@volontariapp/messaging';
import { RankingListKind } from '@volontariapp/domain-ranking';
import type { Redis } from 'ioredis';
import type { ComputeRequest } from '../../domain/interfaces/compute-request.interface.js';
import { RankingJobWriter } from '../../domain/ranking-job-writer.js';

/** Un compte neuf demande le calcul de ses deux listes, dans une seule transaction. */
@Injectable()
export class UserCreatedPostProcessor extends BatchPostProcessor<UserEventMessagingType.USER_CREATED> {
  constructor(
    redisClient: Redis,
    options: PostProcessorOptions,
    private readonly jobWriter: RankingJobWriter,
  ) {
    super(redisClient, options);
  }

  protected async processEvents(
    events: BatchEventItem<UserEventMessagingType.USER_CREATED>[],
  ): Promise<void> {
    const requests: ComputeRequest[] = [];
    for (const { event, messageId } of events) {
      const payload: IUserCreatedPayload = event.payload.after;
      if (!payload.id) {
        this.logger.error('Invalid payload for USER_CREATED: missing id', {
          messageId,
        });
        continue;
      }
      requests.push(
        {
          userId: payload.id,
          listKind: RankingListKind.EVENT,
          reason: 'USER_CREATED',
        },
        {
          userId: payload.id,
          listKind: RankingListKind.POST,
          reason: 'USER_CREATED',
        },
      );
    }
    if (requests.length > 0) {
      await this.jobWriter.requestCompute(requests);
    }
  }

  protected override shouldProcess(
    eventType: UserEventMessagingType | string,
  ): boolean {
    return eventType === UserEventMessagingType.USER_CREATED.toString();
  }
}
