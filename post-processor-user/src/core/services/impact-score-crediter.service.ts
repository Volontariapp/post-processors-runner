import type { DataSource } from 'typeorm';
import { ImpactScoreCreditModel, UserModel } from '@volontariapp/domain-user';
import {
  databaseMapper,
  EventQueueEntity,
  EventQueueModel,
  type EventTraceContext,
} from '@volontariapp/database';
import { EventQueueRepository } from '@volontariapp/outbox';
import { UserEventMessagingType } from '@volontariapp/messaging';
import { Streams } from '@volontariapp/shared';
import { Logger } from '@volontariapp/logger';
import type { ISocialInteractionClient } from '../clients/social-interaction.client.js';

databaseMapper.registerBidirectional(EventQueueEntity, EventQueueModel);

export interface ImpactScoreCreditSummary {
  credited: number;
  skipped: number;
}

/**
 * Credite le score d'impact d'un evenement termine a chacun de ses participants.
 *
 * Idempotent par couple (evenement, participant) : le registre `impact_score_credits`,
 * l'increment de `users.total_impact_score` et la ligne outbox `user.impact_score_credited`
 * partagent la meme transaction. Un rejeu de `event.finished` ne credite donc jamais deux fois,
 * et la notification part toujours apres un score deja valide en base.
 * Independant de l'evaluation des badges.
 */
export class ImpactScoreCrediter {
  private readonly logger = new Logger({
    context: 'ImpactScoreCrediter',
    format: 'json',
  });

  constructor(
    private readonly db: DataSource,
    private readonly socialClient: ISocialInteractionClient,
  ) {}

  async creditEventFinished(
    eventId: string,
    awardedImpactScore: number,
    context: EventTraceContext,
  ): Promise<ImpactScoreCreditSummary> {
    if (awardedImpactScore <= 0) {
      this.logger.info(
        `Event ${eventId} awards no impact score (${String(awardedImpactScore)}), nothing to credit`,
      );
      return { credited: 0, skipped: 0 };
    }

    const participantIds =
      await this.socialClient.getAllEventParticipantIds(eventId);

    let credited = 0;
    // Sequentiel volontaire : une transaction courte par participant, sans rafale sur la base.
    for (const userId of participantIds) {
      const wasCredited = await this.creditParticipant(
        eventId,
        userId,
        awardedImpactScore,
        context,
      );
      if (wasCredited) credited += 1;
    }

    const summary = { credited, skipped: participantIds.length - credited };
    this.logger.info(
      `Impact score of event ${eventId}: ${String(summary.credited)} credited, ${String(summary.skipped)} already credited`,
    );
    return summary;
  }

  private async creditParticipant(
    eventId: string,
    userId: string,
    score: number,
    context: EventTraceContext,
  ): Promise<boolean> {
    return this.db.transaction(async (manager) => {
      const insertResult = await manager
        .createQueryBuilder()
        .insert()
        .into(ImpactScoreCreditModel)
        .values({ eventId, userId, score })
        .orIgnore()
        .returning('event_id')
        .execute();

      const insertedRows = insertResult.raw as Array<{ event_id: string }>;
      const isNewCredit =
        Array.isArray(insertedRows) && insertedRows.length > 0;
      if (!isNewCredit) return false;

      await manager.increment(
        UserModel,
        { id: userId },
        'totalImpactScore',
        score,
      );

      const notification =
        EventQueueEntity.createFollowUp<UserEventMessagingType.USER_IMPACT_SCORE_CREDITED>(
          context,
          {
            type: UserEventMessagingType.USER_IMPACT_SCORE_CREDITED,
            emitter: 'post-processor-user',
            emitterId: userId,
            payload: { userId, eventId, scoreIncrement: score },
            targetServices: [Streams.USER_IMPACT_SCORE_CREDITED],
          },
        );
      const outbox =
        new EventQueueRepository<UserEventMessagingType.USER_IMPACT_SCORE_CREDITED>(
          manager.getRepository(EventQueueModel),
        );
      await outbox.create(notification);

      return true;
    });
  }
}
