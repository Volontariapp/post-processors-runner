import { EventEventMessagingType } from '@volontariapp/messaging';
import type { EventType } from '@volontariapp/contracts-nest';
import {
  type PostProcessorOptions,
  BatchPostProcessor,
  type BatchEventItem,
} from '@volontariapp/post-processors';
import type { Redis } from 'ioredis';
import type { BadgeEvaluator } from '../../core/services/badge-evaluator.service.js';

export class EventFinishedBadgePostProcessor extends BatchPostProcessor<EventEventMessagingType.EVENT_FINISHED> {
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
    return eventType === EventEventMessagingType.EVENT_FINISHED.toString();
  }

  protected async processEvents(
    events: BatchEventItem<EventEventMessagingType.EVENT_FINISHED>[],
  ): Promise<void> {
    for (const { event, messageId } of events) {
      const payload =
        (
          event.payload as {
            after?: { eventId?: string; eventType?: EventType };
          }
        ).after ??
        (event.payload as { eventId?: string; eventType?: EventType });
      const eventId = payload.eventId;
      const eventType = payload.eventType;

      if (!eventId || eventType === undefined) {
        this.logger.error(
          'Invalid payload for EVENT_FINISHED: missing eventId or eventType',
          {
            messageId,
            eventId,
            eventType,
          },
        );
        continue;
      }

      try {
        this.logger.log(
          `Evaluating participation badges for finished event ${eventId} (type: ${String(eventType)})`,
          {
            messageId,
            eventId,
            eventType,
          },
        );

        const awardedMap = await this.badgeEvaluator.evaluateEventFinished(
          eventId,
          eventType,
          {
            correlationId: event.correlationId,
            traceId: event.traceId,
          },
        );

        let totalAwarded = 0;
        for (const [userId, badges] of awardedMap.entries()) {
          totalAwarded += badges.length;
          if (badges.length > 0) {
            this.logger.log(
              `Awarded ${String(badges.length)} badges to user ${userId} for event ${eventId}`,
              {
                messageId,
                eventId,
                userId,
                badges,
              },
            );
          }
        }

        this.logger.log(
          `Finished evaluation of event ${eventId}: ${String(totalAwarded)} total badges awarded across ${String(awardedMap.size)} participants`,
        );
      } catch (err: unknown) {
        this.logger.error(
          `Failed to process EVENT_FINISHED for event ${eventId}: ${err instanceof Error ? err.message : String(err)}`,
          {
            messageId,
            eventId,
            error: err,
          },
        );
        throw err;
      }
    }
  }
}
