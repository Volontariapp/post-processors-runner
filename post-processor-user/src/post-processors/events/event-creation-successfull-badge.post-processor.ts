import { EventEventMessagingType } from '@volontariapp/messaging';
import {
  type PostProcessorOptions,
  BatchPostProcessor,
  type BatchEventItem,
} from '@volontariapp/post-processors';
import type { Redis } from 'ioredis';
import type { BadgeEvaluator } from '../../core/services/badge-evaluator.service.js';

export class EventCreationSuccessfullBadgePostProcessor extends BatchPostProcessor<EventEventMessagingType.EVENT_CREATION_SUCCESSFULL> {
  constructor(
    private readonly badgeEvaluator: BadgeEvaluator,
    redisDriver: Redis,
    options: PostProcessorOptions,
  ) {
    super(redisDriver, options);
  }

  protected override shouldProcess(
    eventType: EventEventMessagingType | string,
  ): boolean {
    return (
      eventType ===
      EventEventMessagingType.EVENT_CREATION_SUCCESSFULL.toString()
    );
  }

  protected async processEvents(
    events: BatchEventItem<EventEventMessagingType.EVENT_CREATION_SUCCESSFULL>[],
  ): Promise<void> {
    for (const { event, messageId } of events) {
      const { eventId, userId } = event.payload.after;

      if (!userId) {
        this.logger.error(
          'Invalid payload for EVENT_CREATION_SUCCESSFULL: missing userId',
          {
            messageId,
            eventId,
          },
        );
        continue;
      }

      try {
        this.logger.log(
          `Evaluating badge EVENT_HOST_COUNT_1 for user ${userId} on event ${String(eventId)}`,
          {
            messageId,
            eventId,
            userId,
          },
        );

        const awarded = await this.badgeEvaluator.evaluateEventHostBadge(
          userId,
          {
            correlationId: event.correlationId,
            traceId: event.traceId,
          },
        );

        if (awarded.length > 0) {
          this.logger.log(
            `Badge EVENT_HOST_COUNT_1 awarded to user ${userId}`,
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
