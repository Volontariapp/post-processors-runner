import type { DataSource } from 'typeorm';
import type { Redis } from 'ioredis';
import { BadgeModel, UserBadgeModel } from '@volontariapp/domain-user';
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
