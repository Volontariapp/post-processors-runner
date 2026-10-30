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
import { Streams, computeEventScoring } from '@volontariapp/shared';
import { Logger } from '@volontariapp/logger';
import type { ISocialInteractionClient } from '../clients/social-interaction.client.js';

databaseMapper.registerBidirectional(EventQueueEntity, EventQueueModel);

export interface ImpactScoreCreditSummary {
  credited: number;
  skipped: number;
}

export interface CreditEventFinishedParams {
  eventId: string;
  awardedImpactScore?: number;
  scoringVersion?: number;
  startAt?: string;
  endAt?: string;
  maxParticipants?: number;
  organizerId?: string;
  context: EventTraceContext;
}

/**
 * Credite le score d'impact d'un evenement termine a chacun de ses participants (et a l'organisateur selon la formule).
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
    params: CreditEventFinishedParams,
  ): Promise<ImpactScoreCreditSummary>;
  async creditEventFinished(
    eventId: string,
    awardedImpactScore: number,
    context: EventTraceContext,
  ): Promise<ImpactScoreCreditSummary>;
  async creditEventFinished(
    paramsOrEventId: CreditEventFinishedParams | string,
    legacyScoreOrContext?: number | EventTraceContext,
    legacyContext?: EventTraceContext,
  ): Promise<ImpactScoreCreditSummary> {
    if (typeof paramsOrEventId === 'string') {
      const score =
        typeof legacyScoreOrContext === 'number' ? legacyScoreOrContext : 0;
      const context: EventTraceContext =
        legacyContext ??
        (typeof legacyScoreOrContext === 'object'
          ? legacyScoreOrContext
          : { correlationId: 'unknown', traceparent: '' });
      return this.creditLegacyEventFinished(paramsOrEventId, score, context);
    }

    const {
      eventId,
      awardedImpactScore,
      scoringVersion,
      startAt,
      endAt,
      maxParticipants,
      organizerId,
      context,
    } = paramsOrEventId;

    if (scoringVersion !== undefined && scoringVersion >= 1) {
      return this.creditDynamicEventFinished({
        eventId,
        startAt,
        endAt,
        maxParticipants,
        organizerId,
        context,
      });
    }

    return this.creditLegacyEventFinished(
      eventId,
      awardedImpactScore ?? 0,
      context,
    );
  }

  private async creditDynamicEventFinished(params: {
    eventId: string;
    startAt?: string;
    endAt?: string;
    maxParticipants?: number;
    organizerId?: string;
    context: EventTraceContext;
  }): Promise<ImpactScoreCreditSummary> {
    const { eventId, startAt, endAt, maxParticipants, organizerId, context } =
      params;

    const attendees = await this.socialClient.getAllEventAttendees(eventId);
    const checkedInAttendees = attendees.filter((a) => a.checkedIn);

    const now = new Date();
    const scoringResult = computeEventScoring({
      attendees: checkedInAttendees.map((a) => ({
        userId: a.userId,
        registeredAt: a.registeredAt,
      })),
      startAt: startAt ? new Date(startAt) : now,
      endAt: endAt ? new Date(endAt) : now,
      maxParticipants: maxParticipants ?? checkedInAttendees.length,
      organizerId,
    });

    let credited = 0;
    let skipped = 0;

    // 1. Credit scored participants
    for (const participant of scoringResult.participants) {
      if (participant.points <= 0) continue;
      const wasCredited = await this.creditUser({
        eventId,
        userId: participant.userId,
        score: participant.points,
        role: 'PARTICIPANT',
        rank: participant.rank,
        formulaVersion: scoringResult.formulaVersion,
        eventPool: scoringResult.pool,
        context,
      });
      if (wasCredited) {
        credited += 1;
      } else {
        skipped += 1;
      }
    }

    // 2. Credit organizer prime if applicable
    if (organizerId && scoringResult.organizerPoints > 0) {
      const wasCredited = await this.creditUser({
        eventId,
        userId: organizerId,
        score: scoringResult.organizerPoints,
        role: 'ORGANIZER',
        rank: undefined,
        formulaVersion: scoringResult.formulaVersion,
        eventPool: scoringResult.pool,
        context,
      });
      if (wasCredited) {
        credited += 1;
      } else {
        skipped += 1;
      }
    }

    const summary = { credited, skipped };
    this.logger.info(
      `Dynamic impact score for event ${eventId} (v${String(scoringResult.formulaVersion)}): ${String(summary.credited)} credited, ${String(summary.skipped)} already credited`,
    );
    return summary;
  }

  private async creditLegacyEventFinished(
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
      const wasCredited = await this.creditUser({
        eventId,
        userId,
        score: awardedImpactScore,
        context,
      });
      if (wasCredited) credited += 1;
    }

    const summary = { credited, skipped: participantIds.length - credited };
    this.logger.info(
      `Impact score of event ${eventId}: ${String(summary.credited)} credited, ${String(summary.skipped)} already credited`,
    );
    return summary;
  }

  private async creditUser(params: {
    eventId: string;
    userId: string;
    score: number;
    role?: 'PARTICIPANT' | 'ORGANIZER';
    rank?: number;
    formulaVersion?: number;
    eventPool?: number;
    context: EventTraceContext;
  }): Promise<boolean> {
    const {
      eventId,
      userId,
      score,
      role,
      rank,
      formulaVersion,
      eventPool,
      context,
    } = params;

    return this.db.transaction(async (manager) => {
      const values: Partial<ImpactScoreCreditModel> = {
        eventId,
        userId,
        score,
      };
      if (role !== undefined) values.role = role;
      if (rank !== undefined) values.rank = rank;
      if (formulaVersion !== undefined) values.formulaVersion = formulaVersion;
      if (eventPool !== undefined) values.eventPool = eventPool;

      const insertResult = await manager
        .createQueryBuilder()
        .insert()
        .into(ImpactScoreCreditModel)
        .values(values)
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

      const payload: {
        userId: string;
        eventId: string;
        scoreIncrement: number;
        role?: 'PARTICIPANT' | 'ORGANIZER';
        rank?: number;
      } = {
        userId,
        eventId,
        scoreIncrement: score,
      };
      if (role !== undefined) payload.role = role;
      if (rank !== undefined) payload.rank = rank;

      const notification =
        EventQueueEntity.createFollowUp<UserEventMessagingType.USER_IMPACT_SCORE_CREDITED>(
          context,
          {
            type: UserEventMessagingType.USER_IMPACT_SCORE_CREDITED,
            emitter: 'post-processor-user',
            emitterId: userId,
            payload,
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
