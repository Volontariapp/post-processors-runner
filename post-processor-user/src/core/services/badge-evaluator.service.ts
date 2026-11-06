import type { DataSource, EntityManager } from 'typeorm';
import type { Redis } from 'ioredis';
import {
  BadgeModel,
  UserBadgeModel,
  BadgeProgressModel,
  BadgeProgressEventModel,
  BadgeProgressDedupModel,
  BadgePointCreditModel,
  UserModel,
} from '@volontariapp/domain-user';
import { EventType } from '@volontariapp/contracts-nest';
import {
  databaseMapper,
  EventQueueEntity,
  EventQueueModel,
  type EventTraceContext,
} from '@volontariapp/database';
import { EventQueueRepository } from '@volontariapp/outbox';
import {
  type IBadgePayload,
  UserEventMessagingType,
} from '@volontariapp/messaging';
import {
  Streams,
  BADGE_METRICS,
  BADGE_POINTS_VERSION,
  getBadgePoints,
  getBadgeRule,
} from '@volontariapp/shared';
import { Logger } from '@volontariapp/logger';
import type { ISocialInteractionClient } from '../clients/social-interaction.client.js';
import type { IPostAuthorResolver } from '../clients/post-author.resolver.js';

databaseMapper.registerBidirectional(EventQueueEntity, EventQueueModel);

export const PARTICIPATION_BADGE_SLUGS = [
  'EVENT_PARTICIPATION_TIER_1',
  'EVENT_PARTICIPATION_TIER_2',
  'EVENT_PARTICIPATION_TIER_3',
  'EVENT_PARTICIPATION_TIER_4',
  'EVENT_SOCIAL_TIER_1',
  'EVENT_SOCIAL_TIER_2',
  'EVENT_ECOLOGY_TIER_1',
  'EVENT_ECOLOGY_TIER_2',
  'EVENT_HYBRID_ECO_SOCIAL_TIER_1',
] as const;

export const BADGE_PROGRESS_METRICS = {
  EVENTS_FINISHED_TOTAL: 'EVENTS_FINISHED_TOTAL',
  EVENTS_FINISHED_SOCIAL: 'EVENTS_FINISHED_SOCIAL',
  EVENTS_FINISHED_ECOLOGY: 'EVENTS_FINISHED_ECOLOGY',
} as const;

export type EvaluationContext = EventTraceContext;

export interface BadgeEvaluatorOptions {
  /** Crédite les points du badge dans `users.total_impact_score` à l'attribution. Désactivé par défaut. */
  readonly pointsEnabled?: boolean;
  /** Requis pour les badges de likes : permet d'exclure les auto-likes. */
  readonly postAuthorResolver?: IPostAuthorResolver;
}

export class BadgeEvaluator {
  private readonly logger = new Logger({
    context: 'BadgeEvaluator',
    format: 'json',
  });
  private readonly badgeCache = new Map<string, BadgeModel>();

  constructor(
    private readonly db: DataSource,
    private readonly socialClient?: ISocialInteractionClient,
    private readonly redis?: Redis,
    private readonly options: BadgeEvaluatorOptions = {},
  ) {}

  async evaluateEventHostBadge(
    userId: string,
    context: EvaluationContext,
  ): Promise<IBadgePayload[]> {
    return this.evaluateBadge('EVENT_HOST_COUNT_1', userId, context);
  }

  async evaluateCommunityPostBadge(
    userId: string,
    context: EvaluationContext,
  ): Promise<IBadgePayload[]> {
    return this.evaluateBadge('COMMUNITY_POST_COUNT_1', userId, context);
  }

  /**
   * Compte un like distinct `(postId, userId)` (jamais décrémenté) et attribue le badge au seuil.
   * Les likes sur ses propres posts sont ignorés. Un échec de ms-post lève : le message est rejoué.
   */
  async evaluateSocialLikeBadge(
    userId: string,
    context: EvaluationContext,
    postId: string,
  ): Promise<IBadgePayload[]> {
    const badgeSlug = 'SOCIAL_LIKE_COUNT_10';
    const badge = await this.getBadgeBySlug(badgeSlug);

    if (!badge) {
      this.logger.warn(`Badge with slug ${badgeSlug} not found in database`);
      return [];
    }

    if (await this.isBadgeOwned(userId, badge.id, badgeSlug)) {
      return [];
    }

    if (!this.options.postAuthorResolver) {
      throw new Error('PostAuthorResolver is not configured in BadgeEvaluator');
    }

    const postAuthorId =
      await this.options.postAuthorResolver.getPostAuthorId(postId);
    if (postAuthorId === undefined) {
      this.logger.warn(
        `Post ${postId} not found, like by user ${userId} not counted`,
      );
      return [];
    }
    if (postAuthorId === userId) {
      this.logger.info(
        `User ${userId} liked own post ${postId}, not counted for ${badgeSlug}`,
      );
      return [];
    }

    return this.countAndAward(
      badge,
      BADGE_METRICS.SOCIAL_LIKES_GIVEN,
      userId,
      postId,
      context,
    );
  }

  /** Compte un souhait distinct `(eventId, userId)` (jamais décrémenté) et attribue le badge au seuil. */
  async evaluateEventWishlistBadge(
    userId: string,
    context: EvaluationContext,
    eventId: string,
  ): Promise<IBadgePayload[]> {
    const badgeSlug = 'EVENT_WISHLIST_COUNT_10';
    const badge = await this.getBadgeBySlug(badgeSlug);

    if (!badge) {
      this.logger.warn(`Badge with slug ${badgeSlug} not found in database`);
      return [];
    }

    if (await this.isBadgeOwned(userId, badge.id, badgeSlug)) {
      return [];
    }

    return this.countAndAward(
      badge,
      BADGE_METRICS.SOCIAL_WISHES,
      userId,
      eventId,
      context,
    );
  }

  async evaluateEventFinished(
    eventId: string,
    eventType: EventType,
    context: EvaluationContext,
    participantIdsOverride?: string[],
  ): Promise<Map<string, IBadgePayload[]>> {
    let participantIds = participantIdsOverride;
    if (!participantIds) {
      if (!this.socialClient) {
        throw new Error('SocialClient is not configured in BadgeEvaluator');
      }
      participantIds =
        await this.socialClient.getAllEventParticipantIds(eventId);
    }

    this.logger.info(
      `Evaluating event ${eventId} (type: ${String(eventType)}) for ${String(participantIds.length)} participants`,
    );

    const resultMap = new Map<string, IBadgePayload[]>();

    for (const userId of participantIds) {
      const awarded = await this.evaluateParticipantEventFinished(
        eventId,
        eventType,
        userId,
        context,
      );
      resultMap.set(userId, awarded);
    }

    return resultMap;
  }

  async evaluateParticipantEventFinished(
    eventId: string,
    eventType: EventType,
    userId: string,
    context: EvaluationContext,
  ): Promise<IBadgePayload[]> {
    // 1. Fast path: check if user already possesses all 9 participation badges
    let ownsAllBadges = true;
    for (const slug of PARTICIPATION_BADGE_SLUGS) {
      const badge = await this.getBadgeBySlug(slug);
      if (!badge) {
        ownsAllBadges = false;
        continue;
      }
      const owned = await this.isBadgeOwned(userId, badge.id, slug);
      if (!owned) {
        ownsAllBadges = false;
        break;
      }
    }

    if (ownsAllBadges) {
      this.logger.info(
        `User ${userId} already owns all 9 participation badges, skipping`,
      );
      return [];
    }

    const awardedBadges: IBadgePayload[] = [];

    // 2. Transaction per participant
    await this.db.transaction(async (manager) => {
      // Step A: Deduplication via badge_progress_events
      const dedupResult = await manager
        .createQueryBuilder()
        .insert()
        .into(BadgeProgressEventModel)
        .values({
          eventId,
          userId,
        })
        .orIgnore()
        .returning('event_id')
        .execute();

      const dedupRaw = dedupResult.raw as Array<{ event_id: string }>;
      const isNewEvent = Array.isArray(dedupRaw) && dedupRaw.length > 0;

      if (!isNewEvent) {
        this.logger.info(
          `Event ${eventId} already processed for user ${userId} in badge_progress_events (dedup), skipping`,
        );
        return;
      }

      // Step B: Increment total counter in badge_progress
      const totalCount = await this.incrementCounter(
        manager,
        userId,
        BADGE_PROGRESS_METRICS.EVENTS_FINISHED_TOTAL,
      );

      // Step C: Increment specific counter based on eventType and read other counters
      let socialCount = 0;
      let ecoCount = 0;

      if (this.isSocialEvent(eventType)) {
        socialCount = await this.incrementCounter(
          manager,
          userId,
          BADGE_PROGRESS_METRICS.EVENTS_FINISHED_SOCIAL,
        );
        const ecoRow = await manager
          .getRepository(BadgeProgressModel)
          .findOneBy({
            userId,
            metric: BADGE_PROGRESS_METRICS.EVENTS_FINISHED_ECOLOGY,
          });
        ecoCount = ecoRow?.value ?? 0;
      } else if (this.isEcologyEvent(eventType)) {
        ecoCount = await this.incrementCounter(
          manager,
          userId,
          BADGE_PROGRESS_METRICS.EVENTS_FINISHED_ECOLOGY,
        );
        const socialRow = await manager
          .getRepository(BadgeProgressModel)
          .findOneBy({
            userId,
            metric: BADGE_PROGRESS_METRICS.EVENTS_FINISHED_SOCIAL,
          });
        socialCount = socialRow?.value ?? 0;
      } else {
        const progressRows = await manager
          .getRepository(BadgeProgressModel)
          .findBy({ userId });
        socialCount =
          progressRows.find(
            (r) => r.metric === BADGE_PROGRESS_METRICS.EVENTS_FINISHED_SOCIAL,
          )?.value ?? 0;
        ecoCount =
          progressRows.find(
            (r) => r.metric === BADGE_PROGRESS_METRICS.EVENTS_FINISHED_ECOLOGY,
          )?.value ?? 0;
      }

      this.logger.info(
        `User ${userId} progress after event ${eventId}: total=${String(totalCount)}, social=${String(socialCount)}, eco=${String(ecoCount)}`,
      );

      // Step E: Determine eligible badge slugs from the shared catalogue
      const counters: Record<string, number> = {
        [BADGE_METRICS.EVENTS_FINISHED_TOTAL]: totalCount,
        [BADGE_METRICS.EVENTS_FINISHED_SOCIAL]: socialCount,
        [BADGE_METRICS.EVENTS_FINISHED_ECOLOGY]: ecoCount,
      };
      const eligibleSlugs = PARTICIPATION_BADGE_SLUGS.filter(
        (slug) =>
          getBadgeRule(slug)?.requirements.every(
            (req) => (counters[req.metric] ?? 0) >= req.target,
          ) ?? false,
      );

      // Step F: Award newly eligible badges
      for (const slug of eligibleSlugs) {
        const badge = await this.getBadgeBySlug(slug);
        if (!badge) {
          this.logger.warn(`Badge with slug ${slug} not found in database`);
          continue;
        }

        const owned = await this.isBadgeOwned(userId, badge.id, slug);
        if (owned) {
          continue;
        }

        const isNewlyAwarded = await this.insertUserBadge(
          manager,
          userId,
          badge,
        );

        if (isNewlyAwarded) {
          const points = await this.creditBadgePoints(manager, userId, badge);
          awardedBadges.push(this.toBadgePayload(badge, points));
        }
      }

      // Step G: Emit ONE outbox event with all awarded badges (decision 3)
      if (awardedBadges.length > 0) {
        const eventEntity =
          EventQueueEntity.createFollowUp<UserEventMessagingType.USER_BADGE_AWARDED>(
            context,
            {
              type: UserEventMessagingType.USER_BADGE_AWARDED,
              emitter: 'post-processor-user',
              emitterId: userId,
              payload: {
                userId,
                badges: awardedBadges,
              },
              targetServices: [Streams.USER_BADGE_AWARDED],
            },
          );

        const eventQueueRepo =
          new EventQueueRepository<UserEventMessagingType.USER_BADGE_AWARDED>(
            manager.getRepository(EventQueueModel),
          );
        await eventQueueRepo.create(eventEntity);

        this.logger.info(
          `Awarded ${String(awardedBadges.length)} participation badges to user ${userId} and created outbox event: ${awardedBadges.map((b) => b.slug).join(', ')}`,
        );
      }
    });

    // Cache written after the commit: a rolled-back award must not look owned.
    await this.cacheOwnedBadges(
      userId,
      awardedBadges.map((b) => b.slug),
    );

    return awardedBadges;
  }

  private isSocialEvent(type: EventType | number | string): boolean {
    return (
      type === EventType.EVENT_TYPE_SOCIAL ||
      type === 1 ||
      type === '1' ||
      type === 'EVENT_TYPE_SOCIAL' ||
      type === 'SOCIAL'
    );
  }

  private isEcologyEvent(type: EventType | number | string): boolean {
    return (
      type === EventType.EVENT_TYPE_ECOLOGY ||
      type === 2 ||
      type === '2' ||
      type === 'EVENT_TYPE_ECOLOGY' ||
      type === 'ECOLOGY'
    );
  }

  private async incrementCounter(
    manager: EntityManager,
    userId: string,
    metric: string,
  ): Promise<number> {
    const repo = manager.getRepository(BadgeProgressModel);
    const existing = await repo.findOneBy({ userId, metric });

    if (existing) {
      existing.value += 1;
      const saved = await repo.save(existing);
      return saved.value;
    }

    const created = repo.create({
      userId,
      metric,
      value: 1,
    });
    const saved = await repo.save(created);
    return saved.value;
  }

  private async getBadgeBySlug(badgeSlug: string): Promise<BadgeModel | null> {
    const cachedBadge = this.badgeCache.get(badgeSlug);
    if (cachedBadge) {
      return cachedBadge;
    }

    const badgeRepo = this.db.getRepository(BadgeModel);
    const badge = await badgeRepo.findOneBy({ slug: badgeSlug });

    if (badge) {
      this.badgeCache.set(badgeSlug, badge);
    }

    return badge;
  }

  private async isBadgeOwned(
    userId: string,
    badgeId: string,
    badgeSlug: string,
  ): Promise<boolean> {
    const cacheKey = `badges:owned:${userId}`;

    if (this.redis) {
      try {
        const isMember = await this.redis.sismember(cacheKey, badgeSlug);
        if (isMember === 1) {
          this.logger.info(
            `User ${userId} already possesses badge ${badgeSlug} (cache hit), skipping`,
          );
          return true;
        }
      } catch (cacheErr: unknown) {
        this.logger.warn(
          `Redis cache check failed for user ${userId} and badge ${badgeSlug}: ${cacheErr instanceof Error ? cacheErr.message : String(cacheErr)}`,
        );
      }
    }

    const userBadgeRepo = this.db.getRepository(UserBadgeModel);
    const alreadyOwned = await userBadgeRepo.findOneBy({
      userId,
      badgeId,
    });

    if (alreadyOwned) {
      this.logger.info(
        `User ${userId} already possesses badge ${badgeSlug} (db hit), skipping`,
      );
      if (this.redis) {
        try {
          await this.redis.sadd(cacheKey, badgeSlug);
        } catch (cacheErr: unknown) {
          this.logger.warn(
            `Failed to populate Redis cache for user ${userId}: ${cacheErr instanceof Error ? cacheErr.message : String(cacheErr)}`,
          );
        }
      }
      return true;
    }

    return false;
  }

  private async evaluateBadge(
    badgeSlug: string,
    userId: string,
    context: EvaluationContext,
  ): Promise<IBadgePayload[]> {
    const badge = await this.getBadgeBySlug(badgeSlug);

    if (!badge) {
      this.logger.warn(`Badge with slug ${badgeSlug} not found in database`);
      return [];
    }

    const alreadyOwned = await this.isBadgeOwned(userId, badge.id, badgeSlug);
    if (alreadyOwned) {
      return [];
    }

    return this.awardBadge(badge, userId, context);
  }

  private async awardBadge(
    badge: BadgeModel,
    userId: string,
    context: EvaluationContext,
  ): Promise<IBadgePayload[]> {
    const awarded = await this.db.transaction((manager) =>
      this.awardInTransaction(manager, badge, userId, context),
    );

    if (!awarded) {
      return [];
    }

    await this.cacheOwnedBadges(userId, [awarded.slug]);
    return [awarded];
  }

  /**
   * Incrémente le compteur `metric` si `refId` n'a jamais été compté pour cet utilisateur, puis attribue
   * le badge quand le seuil du catalogue est atteint. Compteur et attribution partagent la transaction.
   */
  private async countAndAward(
    badge: BadgeModel,
    metric: string,
    userId: string,
    refId: string,
    context: EvaluationContext,
  ): Promise<IBadgePayload[]> {
    const target = getBadgeRule(badge.slug)?.requirements.find(
      (req) => req.metric === metric,
    )?.target;
    if (target === undefined) {
      throw new Error(
        `No ${metric} requirement in catalogue for ${badge.slug}`,
      );
    }

    const awarded = await this.db.transaction(async (manager) => {
      const value = await this.recordProgress(manager, userId, metric, refId);
      if (value === undefined) {
        this.logger.info(
          `${metric} already counted for user ${userId} and ${refId}, skipping`,
        );
        return undefined;
      }
      this.logger.info(
        `User ${userId} ${metric}=${String(value)}/${String(target)} for ${badge.slug}`,
      );
      if (value < target) {
        return undefined;
      }
      return this.awardInTransaction(manager, badge, userId, context);
    });

    if (!awarded) {
      return [];
    }

    await this.cacheOwnedBadges(userId, [awarded.slug]);
    return [awarded];
  }

  /** Renvoie la nouvelle valeur du compteur, ou `undefined` si `(userId, metric, refId)` était déjà compté. */
  private async recordProgress(
    manager: EntityManager,
    userId: string,
    metric: string,
    refId: string,
  ): Promise<number | undefined> {
    const insertResult = await manager
      .createQueryBuilder()
      .insert()
      .into(BadgeProgressDedupModel)
      .values({ userId, metric, refId })
      .orIgnore()
      .returning('ref_id')
      .execute();

    const rawResults = insertResult.raw as Array<{ ref_id: string }>;
    if (!Array.isArray(rawResults) || rawResults.length === 0) {
      return undefined;
    }

    return this.incrementCounter(manager, userId, metric);
  }

  /** Attribue un badge, crédite ses points et écrit l'outbox, dans la transaction de l'appelant. */
  private async awardInTransaction(
    manager: EntityManager,
    badge: BadgeModel,
    userId: string,
    context: EvaluationContext,
  ): Promise<IBadgePayload | undefined> {
    const isNewlyAwarded = await this.insertUserBadge(manager, userId, badge);

    if (!isNewlyAwarded) {
      this.logger.info(
        `Conflict detected for user ${userId} and badge ${badge.slug}, already awarded concurrently`,
      );
      return undefined;
    }

    const points = await this.creditBadgePoints(manager, userId, badge);
    const badgePayload = this.toBadgePayload(badge, points);

    const eventEntity =
      EventQueueEntity.createFollowUp<UserEventMessagingType.USER_BADGE_AWARDED>(
        context,
        {
          type: UserEventMessagingType.USER_BADGE_AWARDED,
          emitter: 'post-processor-user',
          emitterId: userId,
          payload: {
            userId,
            badges: [badgePayload],
          },
          targetServices: [Streams.USER_BADGE_AWARDED],
        },
      );

    const eventQueueRepo =
      new EventQueueRepository<UserEventMessagingType.USER_BADGE_AWARDED>(
        manager.getRepository(EventQueueModel),
      );
    await eventQueueRepo.create(eventEntity);

    this.logger.info(
      `Badge ${badge.slug} successfully awarded to user ${userId} and outbox event created`,
    );

    return badgePayload;
  }

  private async insertUserBadge(
    manager: EntityManager,
    userId: string,
    badge: BadgeModel,
  ): Promise<boolean> {
    const insertResult = await manager
      .createQueryBuilder()
      .insert()
      .into(UserBadgeModel)
      .values({
        userId,
        badgeId: badge.id,
      })
      .orIgnore()
      .returning('badge_id')
      .execute();

    const rawResults = insertResult.raw as Array<{ badge_id: string }>;
    return Array.isArray(rawResults) && rawResults.length > 0;
  }

  /**
   * Crédite les points d'un badge fraîchement attribué. Idempotent par `(userId, badgeId)` et lié
   * à la transaction d'attribution. Renvoie les points crédités, `undefined` si désactivé ou déjà crédité.
   */
  private async creditBadgePoints(
    manager: EntityManager,
    userId: string,
    badge: BadgeModel,
  ): Promise<number | undefined> {
    if (!this.options.pointsEnabled) {
      return undefined;
    }

    const points = badge.points ?? getBadgePoints(badge.slug);
    if (points <= 0) {
      return undefined;
    }

    const insertResult = await manager
      .createQueryBuilder()
      .insert()
      .into(BadgePointCreditModel)
      .values({
        userId,
        badgeId: badge.id,
        points,
        formulaVersion: BADGE_POINTS_VERSION,
      })
      .orIgnore()
      .returning('badge_id')
      .execute();

    const rawResults = insertResult.raw as Array<{ badge_id: string }>;
    if (!Array.isArray(rawResults) || rawResults.length === 0) {
      return undefined;
    }

    await manager.increment(
      UserModel,
      { id: userId },
      'totalImpactScore',
      points,
    );
    return points;
  }

  private toBadgePayload(badge: BadgeModel, points?: number): IBadgePayload {
    return {
      id: badge.id,
      name: badge.name,
      slug: badge.slug,
      description: badge.description,
      iconPath: badge.iconPath,
      ...(points !== undefined ? { points } : {}),
    };
  }

  private async cacheOwnedBadges(
    userId: string,
    slugs: readonly string[],
  ): Promise<void> {
    if (!this.redis || slugs.length === 0) {
      return;
    }

    for (const slug of slugs) {
      try {
        await this.redis.sadd(`badges:owned:${userId}`, slug);
      } catch (cacheErr: unknown) {
        this.logger.warn(
          `Failed to populate Redis cache for user ${userId}: ${cacheErr instanceof Error ? cacheErr.message : String(cacheErr)}`,
        );
      }
    }
  }
}
