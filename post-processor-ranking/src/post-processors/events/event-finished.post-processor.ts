import { Injectable } from '@nestjs/common';
import { BatchPostProcessor } from '@volontariapp/post-processors';
import type {
  BatchEventItem,
  PostProcessorOptions,
} from '@volontariapp/post-processors';
import {
  EventEventMessagingType,
  type IEventFinishedPayload,
} from '@volontariapp/messaging';
import type { Redis } from 'ioredis';
import { RankingJobWriter } from '../../domain/ranking-job-writer.js';

/** Un evenement (EVENT_FINISHED) declenche un job de fan-out, jamais un calcul dans le post-processor. */
@Injectable()
export class EventFinishedPostProcessor extends BatchPostProcessor<EventEventMessagingType.EVENT_FINISHED> {
  constructor(
    redisClient: Redis,
    options: PostProcessorOptions,
    private readonly jobWriter: RankingJobWriter,
  ) {
    super(redisClient, options);
  }

  protected async processEvents(
    events: BatchEventItem<EventEventMessagingType.EVENT_FINISHED>[],
  ): Promise<void> {
    for (const { event, messageId } of events) {
      const payload: IEventFinishedPayload = event.payload.after;
      if (!payload.eventId) {
        this.logger.error(
          'Invalid payload for EVENT_FINISHED: missing eventId',
          {
            messageId,
          },
        );
        continue;
      }
      await this.jobWriter.enqueueFanout({
        trigger: 'EVENT_FINISHED',
        subjectId: payload.eventId,
        eventId: payload.eventId,
      });
    }
  }

  protected override shouldProcess(
    eventType: EventEventMessagingType | string,
  ): boolean {
    return eventType === EventEventMessagingType.EVENT_FINISHED.toString();
  }
}
