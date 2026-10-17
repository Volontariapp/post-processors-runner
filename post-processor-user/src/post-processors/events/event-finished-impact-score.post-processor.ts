import { EventEventMessagingType } from '@volontariapp/messaging';
import {
  type PostProcessorOptions,
  BatchPostProcessor,
  type BatchEventItem,
} from '@volontariapp/post-processors';
import type { Redis } from 'ioredis';
import type { ImpactScoreCrediter } from '../../core/services/impact-score-crediter.service.js';

/**
 * Credite le score d'impact d'un evenement termine a ses participants.
 * Consumer group distinct de celui des badges : les deux processors lisent chacun
 * l'integralite du stream `event:finished`.
 */
export class EventFinishedImpactScorePostProcessor extends BatchPostProcessor<EventEventMessagingType.EVENT_FINISHED> {
  constructor(
    private readonly impactScoreCrediter: Pick<
      ImpactScoreCrediter,
      'creditEventFinished'
    >,
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
      const { eventId, awardedImpactScore } = event.payload.after;

      if (!eventId) {
        this.logger.error(
          'Invalid payload for EVENT_FINISHED: missing eventId',
          {
            messageId,
          },
        );
        continue;
      }

      // Les messages deja presents dans le stream avant l'ajout du champ n'ont pas de score :
      // on les ignore au lieu de crediter 0 ou de bloquer le groupe en boucle de retry.
      if (!Number.isFinite(awardedImpactScore)) {
        this.logger.warn(
          `EVENT_FINISHED for event ${eventId} carries no awardedImpactScore (emitted before the payload had it), skipping credit`,
          { messageId, eventId },
        );
        continue;
      }

      try {
        await this.impactScoreCrediter.creditEventFinished(
          eventId,
          awardedImpactScore,
          event,
        );
      } catch (err: unknown) {
        this.logger.error(
          `Failed to credit impact score for event ${eventId}: ${err instanceof Error ? err.message : String(err)}`,
          { messageId, eventId, error: err },
        );
        throw err;
      }
    }
  }
}
