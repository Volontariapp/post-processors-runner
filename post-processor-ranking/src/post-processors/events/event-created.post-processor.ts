import { Injectable } from '@nestjs/common';
import { BatchPostProcessor } from '@volontariapp/post-processors';
import type {
  BatchEventItem,
  PostProcessorOptions,
} from '@volontariapp/post-processors';
import {
  EventEventMessagingType,
  type IEventCreatedPayload,
} from '@volontariapp/messaging';
import type { Redis } from 'ioredis';
import { RankingJobWriter } from '../../domain/ranking-job-writer.js';

/** Un evenement (EVENT_CREATED) declenche un job de fan-out, jamais un calcul dans le post-processor. */
@Injectable()
export class EventCreatedPostProcessor extends BatchPostProcessor<EventEventMessagingType.EVENT_CREATED> {
  constructor(
    redisClient: Redis,
    options: PostProcessorOptions,
    private readonly jobWriter: RankingJobWriter,
  ) {
    super(redisClient, options);
  }

  protected async processEvents(
    events: BatchEventItem<EventEventMessagingType.EVENT_CREATED>[],
  ): Promise<void> {
    for (const { event, messageId } of events) {
      const payload: IEventCreatedPayload = event.payload.after;
      if (!payload.eventId) {
        this.logger.error(
          'Invalid payload for EVENT_CREATED: missing eventId',
          {
            messageId,
          },
        );
        continue;
      }
      await this.jobWriter.enqueueFanout({
        trigger: 'EVENT_CREATED',
        subjectId: payload.eventId,
        eventId: payload.eventId,
      });
    }
  }

  protected override shouldProcess(
    eventType: EventEventMessagingType | string,
  ): boolean {
    return eventType === EventEventMessagingType.EVENT_CREATED.toString();
  }
}
