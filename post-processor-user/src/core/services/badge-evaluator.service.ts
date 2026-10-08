import type { DataSource, EntityManager } from 'typeorm';
import type { Redis } from 'ioredis';
import {
  BadgeModel,
  UserBadgeModel,
  BadgeProgressModel,
  BadgeProgressEventModel,
} from '@volontariapp/domain-user';
import { EventType } from '@volontariapp/contracts-nest';
import {
  databaseMapper,
  EventQueueEntity,
  EventQueueModel,
} from '@volontariapp/database';
import { EventQueueRepository } from '@volontariapp/outbox';
import {
  type IBadgePayload,
  UserEventMessagingType,
} from '@volontariapp/messaging';
import { Streams } from '@volontariapp/shared';
import { Logger } from '@volontariapp/logger';
import type { ISocialInteractionClient } from '../clients/social-interaction.client.js';

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

export interface EvaluationContext {
  correlationId?: string;
  traceId?: string;
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
  ) {}

  async evaluateEventHostBadge(
    userId: string,
    context?: EvaluationContext,
  ): Promise<IBadgePayload[]> {
    return this.evaluateBadge('EVENT_HOST_COUNT_1', userId, context);
  }

  async evaluateCommunityPostBadge(
    userId: string,
    context?: EvaluationContext,
  ): Promise<IBadgePayload[]> {
    return this.evaluateBadge('COMMUNITY_POST_COUNT_1', userId, context);
  }

  async evaluateSocialLikeBadge(
    userId: string,
    context?: EvaluationContext,
  ): Promise<IBadgePayload[]> {
    const badgeSlug = 'SOCIAL_LIKE_COUNT_10';
    const badge = await this.getBadgeBySlug(badgeSlug);

    if (!badge) {
      this.logger.warn(`Badge with slug ${badgeSlug} not found in database`);
      return [];
    }

    const alreadyOwned = await this.isBadgeOwned(userId, badge.id, badgeSlug);
    if (alreadyOwned) {
      return [];
    }

    if (!this.socialClient) {
      throw new Error('SocialClient is not configured in BadgeEvaluator');
    }

    const totalLikes = await this.socialClient.getUserLikesCount(userId);
    this.logger.info(
      `User ${userId} has ${String(totalLikes)} total likes evaluated for badge ${badgeSlug}`,
    );

    if (totalLikes < 10) {
      return [];
    }

    return this.awardBadge(badge, userId, context);
  }

  async evaluateEventWishlistBadge(
    userId: string,
    context?: EvaluationContext,
  ): Promise<IBadgePayload[]> {
    const badgeSlug = 'EVENT_WISHLIST_COUNT_10';
    const badge = await this.getBadgeBySlug(badgeSlug);

    if (!badge) {
      this.logger.warn(`Badge with slug ${badgeSlug} not found in database`);
      return [];
    }

    const alreadyOwned = await this.isBadgeOwned(userId, badge.id, badgeSlug);
    if (alreadyOwned) {
      return [];
    }

    if (!this.socialClient) {
      throw new Error('SocialClient is not configured in BadgeEvaluator');
    }

    const totalWishes = await this.socialClient.getUserWishEventsCount(userId);
    this.logger.info(
      `User ${userId} has ${String(totalWishes)} total wishes evaluated for badge ${badgeSlug}`,
    );

    if (totalWishes < 10) {
      return [];
    }

    return this.awardBadge(badge, userId, context);
  }

  async evaluateEventFinished(
    eventId: string,
    eventType: EventType,
    context?: EvaluationContext,
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
    context?: EvaluationContext,
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

      // Step E: Determine eligible badge slugs
      const eligibleSlugs: string[] = [];
      if (totalCount >= 1) eligibleSlugs.push('EVENT_PARTICIPATION_TIER_1');
      if (totalCount >= 5) eligibleSlugs.push('EVENT_PARTICIPATION_TIER_2');
      if (totalCount >= 10) eligibleSlugs.push('EVENT_PARTICIPATION_TIER_3');
      if (totalCount >= 20) eligibleSlugs.push('EVENT_PARTICIPATION_TIER_4');

      if (socialCount >= 1) eligibleSlugs.push('EVENT_SOCIAL_TIER_1');
      if (socialCount >= 5) eligibleSlugs.push('EVENT_SOCIAL_TIER_2');

      if (ecoCount >= 1) eligibleSlugs.push('EVENT_ECOLOGY_TIER_1');
      if (ecoCount >= 5) eligibleSlugs.push('EVENT_ECOLOGY_TIER_2');

      if (socialCount >= 5 && ecoCount >= 5) {
        eligibleSlugs.push('EVENT_HYBRID_ECO_SOCIAL_TIER_1');
      }

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
        const isNewlyAwarded =
          Array.isArray(rawResults) && rawResults.length > 0;

        if (isNewlyAwarded) {
          awardedBadges.push({
            id: badge.id,
            name: badge.name,
            slug: badge.slug,
            description: badge.description,
            iconPath: badge.iconPath,
          });
        }
      }

      // Step G: Emit ONE outbox event with all awarded badges (decision 3)
      if (awardedBadges.length > 0) {
        const eventEntity =
          EventQueueEntity.createEvent<UserEventMessagingType.USER_BADGE_AWARDED>(
            {
              type: UserEventMessagingType.USER_BADGE_AWARDED,
              emitter: 'post-processor-user',
              emitterId: userId,
              traceId: context?.traceId,
              correlationId: context?.correlationId,
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

        if (this.redis) {
          for (const b of awardedBadges) {
            try {
              await this.redis.sadd(`badges:owned:${userId}`, b.slug);
            } catch (cacheErr: unknown) {
              this.logger.warn(
                `Failed to populate Redis cache for user ${userId}: ${cacheErr instanceof Error ? cacheErr.message : String(cacheErr)}`,
              );
            }
          }
        }

        this.logger.info(
          `Awarded ${String(awardedBadges.length)} participation badges to user ${userId} and created outbox event: ${awardedBadges.map((b) => b.slug).join(', ')}`,
        );
      }
    });

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
    context?: EvaluationContext,
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
    context?: EvaluationContext,
  ): Promise<IBadgePayload[]> {
    const awardedBadges: IBadgePayload[] = [];

    await this.db.transaction(async (manager) => {
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
      const isNewlyAwarded = Array.isArray(rawResults) && rawResults.length > 0;

      if (!isNewlyAwarded) {
        this.logger.info(
          `Conflict detected for user ${userId} and badge ${badge.slug}, already awarded concurrently`,
        );
        return;
      }

      const badgePayload: IBadgePayload = {
        id: badge.id,
        name: badge.name,
        slug: badge.slug,
        description: badge.description,
        iconPath: badge.iconPath,
      };

      awardedBadges.push(badgePayload);

      const eventEntity =
        EventQueueEntity.createEvent<UserEventMessagingType.USER_BADGE_AWARDED>(
          {
            type: UserEventMessagingType.USER_BADGE_AWARDED,
            emitter: 'post-processor-user',
            emitterId: userId,
            traceId: context?.traceId,
            correlationId: context?.correlationId,
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

      if (this.redis) {
        try {
          await this.redis.sadd(`badges:owned:${userId}`, badge.slug);
        } catch (cacheErr: unknown) {
          this.logger.warn(
            `Failed to populate Redis cache for user ${userId}: ${cacheErr instanceof Error ? cacheErr.message : String(cacheErr)}`,
          );
        }
      }

      this.logger.info(
        `Badge ${badge.slug} successfully awarded to user ${userId} and outbox event created`,
      );
    });

    return awardedBadges;
  }
}
