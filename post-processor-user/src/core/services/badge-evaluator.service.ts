import type { DataSource } from 'typeorm';
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

  constructor(private readonly db: DataSource) {}

  async evaluateEventHostBadge(
    userId: string,
    context?: EvaluationContext,
  ): Promise<IBadgePayload[]> {
    const badgeSlug = 'EVENT_HOST_COUNT_1';
    const badgeRepo = this.db.getRepository(BadgeModel);
    const badge = await badgeRepo.findOneBy({ slug: badgeSlug });

    if (!badge) {
      this.logger.warn(`Badge with slug ${badgeSlug} not found in database`);
      return [];
    }

    const userBadgeRepo = this.db.getRepository(UserBadgeModel);
    const alreadyOwned = await userBadgeRepo.findOneBy({
      userId,
      badgeId: badge.id,
    });

    if (alreadyOwned) {
      this.logger.info(
        `User ${userId} already possesses badge ${badgeSlug}, skipping`,
      );
      return [];
    }

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
        .onConflict('("user_id", "badge_id") DO NOTHING')
        .returning('badge_id')
        .execute();

      const rawResults = insertResult.raw as Array<{ badge_id: string }>;
      const isNewlyAwarded = Array.isArray(rawResults) && rawResults.length > 0;

      if (!isNewlyAwarded) {
        this.logger.info(
          `Conflict detected for user ${userId} and badge ${badgeSlug}, already awarded concurrently`,
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
        EventQueueEntity.createEvent<UserEventMessagingType.USER_BADGE_AWARDED>({
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
        });

      const eventQueueRepo =
        new EventQueueRepository<UserEventMessagingType.USER_BADGE_AWARDED>(
          manager.getRepository(EventQueueModel),
        );
      await eventQueueRepo.create(eventEntity);

      this.logger.info(
        `Badge ${badgeSlug} successfully awarded to user ${userId} and outbox event created`,
      );
    });

    return awardedBadges;
  }
}
