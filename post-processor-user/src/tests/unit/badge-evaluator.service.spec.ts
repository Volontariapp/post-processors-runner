import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { BadgeEvaluator } from '../../core/services/badge-evaluator.service.js';
import { createMockDataSource } from '../mocks/data-source.mock.js';
import {
  createBadgeModel,
  createCommunityPostBadgeModel,
  createSocialLikeBadgeModel,
  createEventWishlistBadgeModel,
  createParticipationBadgeModel,
} from '../factories/badge.factory.js';
import { createMockSocialInteractionClient } from '../mocks/social-interaction-client.mock.js';
import { UserEventMessagingType } from '@volontariapp/messaging';
import { Streams } from '@volontariapp/shared';
import { EventType } from '@volontariapp/contracts-nest';
import {
  BADGE_PROGRESS_METRICS,
  PARTICIPATION_BADGE_SLUGS,
} from '../../core/services/badge-evaluator.service.js';
import type { Redis } from 'ioredis';
import { createMock } from '@volontariapp/testing';

describe('BadgeEvaluator', () => {
  let evaluator: BadgeEvaluator;
  let mockEnv: ReturnType<typeof createMockDataSource>;

  beforeEach(() => {
    mockEnv = createMockDataSource();
    evaluator = new BadgeEvaluator(mockEnv.dataSource);

    const mockLogger = {
      log: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
    Object.defineProperty(evaluator, 'logger', { value: mockLogger });
  });

  describe('evaluateEventHostBadge', () => {
    it('should return empty array if badge EVENT_HOST_COUNT_1 does not exist in DB', async () => {
      mockEnv.repositories.badgeRepo.findOneBy.mockResolvedValue(null);

      const result = await evaluator.evaluateEventHostBadge('user-1');

      expect(result).toEqual([]);
      expect(mockEnv.repositories.badgeRepo.findOneBy).toHaveBeenCalledWith({
        slug: 'EVENT_HOST_COUNT_1',
      });
      expect(
        mockEnv.repositories.userBadgeRepo.findOneBy,
      ).not.toHaveBeenCalled();
      expect(mockEnv.dataSource.transaction).not.toHaveBeenCalled();
    });

    it('should return empty array and skip transaction if user already owns the badge', async () => {
      const badge = createBadgeModel();
      mockEnv.repositories.badgeRepo.findOneBy.mockResolvedValue(badge);
      mockEnv.repositories.userBadgeRepo.findOneBy.mockResolvedValue({
        userId: 'user-1',
        badgeId: badge.id,
      });

      const result = await evaluator.evaluateEventHostBadge('user-1');

      expect(result).toEqual([]);
      expect(mockEnv.repositories.userBadgeRepo.findOneBy).toHaveBeenCalledWith(
        {
          userId: 'user-1',
          badgeId: badge.id,
        },
      );
      expect(mockEnv.dataSource.transaction).not.toHaveBeenCalled();
    });

    it('should award badge and emit outbox event when user does not possess it', async () => {
      const badge = createBadgeModel();
      mockEnv.repositories.badgeRepo.findOneBy.mockResolvedValue(badge);
      mockEnv.repositories.userBadgeRepo.findOneBy.mockResolvedValue(null);
      mockEnv.queryBuilder.execute.mockResolvedValue({
        raw: [{ badge_id: badge.id }],
      });
      mockEnv.repositories.eventQueueRepo.save.mockResolvedValue({});

      const result = await evaluator.evaluateEventHostBadge('user-1', {
        correlationId: 'corr-123',
        traceId: 'trace-456',
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: badge.id,
        name: badge.name,
        slug: badge.slug,
        description: badge.description,
        iconPath: badge.iconPath,
      });

      expect(mockEnv.dataSource.transaction).toHaveBeenCalled();
      expect(mockEnv.queryBuilder.insert).toHaveBeenCalled();
      expect(mockEnv.queryBuilder.values).toHaveBeenCalledWith({
        userId: 'user-1',
        badgeId: badge.id,
      });

      // Verify outbox creation
      expect(mockEnv.repositories.eventQueueRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          type: UserEventMessagingType.USER_BADGE_AWARDED,
          emitter: 'post-processor-user',
          emitterId: 'user-1',
          correlationId: 'corr-123',
          traceId: 'trace-456',
          targetServices: [Streams.USER_BADGE_AWARDED],
          payload: {
            after: {
              userId: 'user-1',
              badges: [
                {
                  id: badge.id,
                  name: badge.name,
                  slug: badge.slug,
                  description: badge.description,
                  iconPath: badge.iconPath,
                },
              ],
            },
          },
        }),
        undefined,
      );
    });

    it('should return empty array and not emit outbox if conflict detected during insert', async () => {
      const badge = createBadgeModel();
      mockEnv.repositories.badgeRepo.findOneBy.mockResolvedValue(badge);
      mockEnv.repositories.userBadgeRepo.findOneBy.mockResolvedValue(null);
      // Simulate concurrent insert where ON CONFLICT DO NOTHING returns 0 rows
      mockEnv.queryBuilder.execute.mockResolvedValue({
        raw: [],
      });

      const result = await evaluator.evaluateEventHostBadge('user-1');

      expect(result).toEqual([]);
      expect(mockEnv.repositories.eventQueueRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('evaluateCommunityPostBadge', () => {
    it('should return empty array if badge COMMUNITY_POST_COUNT_1 does not exist in DB', async () => {
      mockEnv.repositories.badgeRepo.findOneBy.mockResolvedValue(null);

      const result = await evaluator.evaluateCommunityPostBadge('user-1');

      expect(result).toEqual([]);
      expect(mockEnv.repositories.badgeRepo.findOneBy).toHaveBeenCalledWith({
        slug: 'COMMUNITY_POST_COUNT_1',
      });
      expect(
        mockEnv.repositories.userBadgeRepo.findOneBy,
      ).not.toHaveBeenCalled();
      expect(mockEnv.dataSource.transaction).not.toHaveBeenCalled();
    });

    it('should return empty array and skip transaction if user already owns the badge', async () => {
      const badge = createCommunityPostBadgeModel();
      mockEnv.repositories.badgeRepo.findOneBy.mockResolvedValue(badge);
      mockEnv.repositories.userBadgeRepo.findOneBy.mockResolvedValue({
        userId: 'user-1',
        badgeId: badge.id,
      });

      const result = await evaluator.evaluateCommunityPostBadge('user-1');

      expect(result).toEqual([]);
      expect(mockEnv.repositories.userBadgeRepo.findOneBy).toHaveBeenCalledWith(
        {
          userId: 'user-1',
          badgeId: badge.id,
        },
      );
      expect(mockEnv.dataSource.transaction).not.toHaveBeenCalled();
    });

    it('should award badge and emit outbox event when user does not possess it', async () => {
      const badge = createCommunityPostBadgeModel();
      mockEnv.repositories.badgeRepo.findOneBy.mockResolvedValue(badge);
      mockEnv.repositories.userBadgeRepo.findOneBy.mockResolvedValue(null);
      mockEnv.queryBuilder.execute.mockResolvedValue({
        raw: [{ badge_id: badge.id }],
      });
      mockEnv.repositories.eventQueueRepo.save.mockResolvedValue({});

      const result = await evaluator.evaluateCommunityPostBadge('user-1', {
        correlationId: 'corr-123',
        traceId: 'trace-456',
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: badge.id,
        name: badge.name,
        slug: badge.slug,
        description: badge.description,
        iconPath: badge.iconPath,
      });

      expect(mockEnv.dataSource.transaction).toHaveBeenCalled();
      expect(mockEnv.queryBuilder.insert).toHaveBeenCalled();
      expect(mockEnv.queryBuilder.values).toHaveBeenCalledWith({
        userId: 'user-1',
        badgeId: badge.id,
      });

      // Verify outbox creation
      expect(mockEnv.repositories.eventQueueRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          type: UserEventMessagingType.USER_BADGE_AWARDED,
          emitter: 'post-processor-user',
          emitterId: 'user-1',
          correlationId: 'corr-123',
          traceId: 'trace-456',
          targetServices: [Streams.USER_BADGE_AWARDED],
          payload: {
            after: {
              userId: 'user-1',
              badges: [
                {
                  id: badge.id,
                  name: badge.name,
                  slug: badge.slug,
                  description: badge.description,
                  iconPath: badge.iconPath,
                },
              ],
            },
          },
        }),
        undefined,
      );
    });

    it('should return empty array and not emit outbox if conflict detected during insert', async () => {
      const badge = createCommunityPostBadgeModel();
      mockEnv.repositories.badgeRepo.findOneBy.mockResolvedValue(badge);
      mockEnv.repositories.userBadgeRepo.findOneBy.mockResolvedValue(null);
      mockEnv.queryBuilder.execute.mockResolvedValue({
        raw: [],
      });

      const result = await evaluator.evaluateCommunityPostBadge('user-1');

      expect(result).toEqual([]);
      expect(mockEnv.repositories.eventQueueRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('evaluateSocialLikeBadge', () => {
    let mockSocialClient: ReturnType<typeof createMockSocialInteractionClient>;
    let mockRedis: jest.Mocked<Redis>;

    beforeEach(() => {
      mockSocialClient = createMockSocialInteractionClient();
      mockRedis = createMock<Redis>();
      mockRedis.sismember.mockResolvedValue(0);
      mockRedis.sadd.mockResolvedValue(1);
      evaluator = new BadgeEvaluator(
        mockEnv.dataSource,
        mockSocialClient,
        mockRedis,
      );

      const mockLogger = {
        log: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      };
      Object.defineProperty(evaluator, 'logger', { value: mockLogger });
    });

    it('should return empty array if badge SOCIAL_LIKE_COUNT_10 not found in DB', async () => {
      mockEnv.repositories.badgeRepo.findOneBy.mockResolvedValue(null);

      const result = await evaluator.evaluateSocialLikeBadge('user-1');

      expect(result).toEqual([]);
      expect(mockEnv.repositories.badgeRepo.findOneBy).toHaveBeenCalledWith({
        slug: 'SOCIAL_LIKE_COUNT_10',
      });
      expect(mockSocialClient.getUserLikesCount).not.toHaveBeenCalled();
    });

    it('should return empty array if badge is already owned according to Redis cache', async () => {
      const badge = createSocialLikeBadgeModel();
      mockEnv.repositories.badgeRepo.findOneBy.mockResolvedValue(badge);
      mockRedis.sismember.mockResolvedValue(1);

      const result = await evaluator.evaluateSocialLikeBadge('user-1');

      expect(result).toEqual([]);
      expect(mockRedis.sismember).toHaveBeenCalledWith(
        'badges:owned:user-1',
        'SOCIAL_LIKE_COUNT_10',
      );
      expect(
        mockEnv.repositories.userBadgeRepo.findOneBy,
      ).not.toHaveBeenCalled();
      expect(mockSocialClient.getUserLikesCount).not.toHaveBeenCalled();
    });

    it('should return empty array and update Redis cache if badge is already owned in DB', async () => {
      const badge = createSocialLikeBadgeModel();
      mockEnv.repositories.badgeRepo.findOneBy.mockResolvedValue(badge);
      mockRedis.sismember.mockResolvedValue(0);
      mockEnv.repositories.userBadgeRepo.findOneBy.mockResolvedValue({
        userId: 'user-1',
        badgeId: badge.id,
      });

      const result = await evaluator.evaluateSocialLikeBadge('user-1');

      expect(result).toEqual([]);
      expect(mockRedis.sadd).toHaveBeenCalledWith(
        'badges:owned:user-1',
        'SOCIAL_LIKE_COUNT_10',
      );
      expect(mockSocialClient.getUserLikesCount).not.toHaveBeenCalled();
    });

    it('should throw error if socialClient is not configured', async () => {
      const badge = createSocialLikeBadgeModel();
      mockEnv.repositories.badgeRepo.findOneBy.mockResolvedValue(badge);
      const unconfiguredEvaluator = new BadgeEvaluator(mockEnv.dataSource);

      await expect(
        unconfiguredEvaluator.evaluateSocialLikeBadge('user-1'),
      ).rejects.toThrow('SocialClient is not configured in BadgeEvaluator');
    });

    it('should return empty array if user has fewer than 10 likes', async () => {
      const badge = createSocialLikeBadgeModel();
      mockEnv.repositories.badgeRepo.findOneBy.mockResolvedValue(badge);
      mockRedis.sismember.mockResolvedValue(0);
      mockEnv.repositories.userBadgeRepo.findOneBy.mockResolvedValue(null);
      mockSocialClient.getUserLikesCount.mockResolvedValue(9);

      const result = await evaluator.evaluateSocialLikeBadge('user-1');

      expect(result).toEqual([]);
      expect(mockSocialClient.getUserLikesCount).toHaveBeenCalledWith('user-1');
      expect(mockEnv.dataSource.transaction).not.toHaveBeenCalled();
    });

    it('should award badge and emit outbox event when user has 10 or more likes', async () => {
      const badge = createSocialLikeBadgeModel();
      mockEnv.repositories.badgeRepo.findOneBy.mockResolvedValue(badge);
      mockRedis.sismember.mockResolvedValue(0);
      mockEnv.repositories.userBadgeRepo.findOneBy.mockResolvedValue(null);
      mockSocialClient.getUserLikesCount.mockResolvedValue(10);
      mockEnv.queryBuilder.execute.mockResolvedValue({
        raw: [{ badge_id: badge.id }],
      });
      mockEnv.repositories.eventQueueRepo.save.mockResolvedValue({});

      const result = await evaluator.evaluateSocialLikeBadge('user-1', {
        correlationId: 'corr-like',
        traceId: 'trace-like',
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: badge.id,
        name: badge.name,
        slug: badge.slug,
        description: badge.description,
        iconPath: badge.iconPath,
      });

      expect(mockEnv.dataSource.transaction).toHaveBeenCalled();
      expect(mockEnv.repositories.eventQueueRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          type: UserEventMessagingType.USER_BADGE_AWARDED,
          emitter: 'post-processor-user',
          emitterId: 'user-1',
          correlationId: 'corr-like',
          traceId: 'trace-like',
          targetServices: [Streams.USER_BADGE_AWARDED],
        }),
        undefined,
      );
      expect(mockRedis.sadd).toHaveBeenCalledWith(
        'badges:owned:user-1',
        'SOCIAL_LIKE_COUNT_10',
      );
    });
  });

  describe('evaluateEventWishlistBadge', () => {
    let mockSocialClient: ReturnType<typeof createMockSocialInteractionClient>;
    let mockRedis: jest.Mocked<Redis>;

    beforeEach(() => {
      mockSocialClient = createMockSocialInteractionClient();
      mockRedis = createMock<Redis>();
      evaluator = new BadgeEvaluator(
        mockEnv.dataSource,
        mockSocialClient,
        mockRedis,
      );

      const mockLogger = {
        log: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      };
      Object.defineProperty(evaluator, 'logger', { value: mockLogger });
    });

    it('should return empty array if badge EVENT_WISHLIST_COUNT_10 does not exist in DB', async () => {
      mockEnv.repositories.badgeRepo.findOneBy.mockResolvedValue(null);

      const result = await evaluator.evaluateEventWishlistBadge('user-1');

      expect(result).toEqual([]);
      expect(mockEnv.repositories.badgeRepo.findOneBy).toHaveBeenCalledWith({
        slug: 'EVENT_WISHLIST_COUNT_10',
      });
      expect(mockSocialClient.getUserWishEventsCount).not.toHaveBeenCalled();
      expect(mockEnv.dataSource.transaction).not.toHaveBeenCalled();
    });

    it('should return empty array and skip DB/client if user already owns the badge in Redis cache', async () => {
      const badge = createEventWishlistBadgeModel();
      mockEnv.repositories.badgeRepo.findOneBy.mockResolvedValue(badge);
      mockRedis.sismember.mockResolvedValue(1);

      const result = await evaluator.evaluateEventWishlistBadge('user-1');

      expect(result).toEqual([]);
      expect(mockRedis.sismember).toHaveBeenCalledWith(
        'badges:owned:user-1',
        'EVENT_WISHLIST_COUNT_10',
      );
      expect(
        mockEnv.repositories.userBadgeRepo.findOneBy,
      ).not.toHaveBeenCalled();
      expect(mockSocialClient.getUserWishEventsCount).not.toHaveBeenCalled();
    });

    it('should return empty array and update Redis cache if badge is already owned in DB', async () => {
      const badge = createEventWishlistBadgeModel();
      mockEnv.repositories.badgeRepo.findOneBy.mockResolvedValue(badge);
      mockRedis.sismember.mockResolvedValue(0);
      mockEnv.repositories.userBadgeRepo.findOneBy.mockResolvedValue({
        userId: 'user-1',
        badgeId: badge.id,
      });

      const result = await evaluator.evaluateEventWishlistBadge('user-1');

      expect(result).toEqual([]);
      expect(mockRedis.sadd).toHaveBeenCalledWith(
        'badges:owned:user-1',
        'EVENT_WISHLIST_COUNT_10',
      );
      expect(mockSocialClient.getUserWishEventsCount).not.toHaveBeenCalled();
    });

    it('should throw error if socialClient is not configured', async () => {
      const badge = createEventWishlistBadgeModel();
      mockEnv.repositories.badgeRepo.findOneBy.mockResolvedValue(badge);
      const unconfiguredEvaluator = new BadgeEvaluator(mockEnv.dataSource);

      await expect(
        unconfiguredEvaluator.evaluateEventWishlistBadge('user-1'),
      ).rejects.toThrow('SocialClient is not configured in BadgeEvaluator');
    });

    it('should return empty array if user has fewer than 10 wish events', async () => {
      const badge = createEventWishlistBadgeModel();
      mockEnv.repositories.badgeRepo.findOneBy.mockResolvedValue(badge);
      mockRedis.sismember.mockResolvedValue(0);
      mockEnv.repositories.userBadgeRepo.findOneBy.mockResolvedValue(null);
      mockSocialClient.getUserWishEventsCount.mockResolvedValue(9);

      const result = await evaluator.evaluateEventWishlistBadge('user-1');

      expect(result).toEqual([]);
      expect(mockSocialClient.getUserWishEventsCount).toHaveBeenCalledWith(
        'user-1',
      );
      expect(mockEnv.dataSource.transaction).not.toHaveBeenCalled();
    });

    it('should award badge and emit outbox event when user has 10 or more wish events', async () => {
      const badge = createEventWishlistBadgeModel();
      mockEnv.repositories.badgeRepo.findOneBy.mockResolvedValue(badge);
      mockRedis.sismember.mockResolvedValue(0);
      mockEnv.repositories.userBadgeRepo.findOneBy.mockResolvedValue(null);
      mockSocialClient.getUserWishEventsCount.mockResolvedValue(10);
      mockEnv.queryBuilder.execute.mockResolvedValue({
        raw: [{ badge_id: badge.id }],
      });
      mockEnv.repositories.eventQueueRepo.save.mockResolvedValue({});

      const result = await evaluator.evaluateEventWishlistBadge('user-1', {
        correlationId: 'corr-wish',
        traceId: 'trace-wish',
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: badge.id,
        name: badge.name,
        slug: badge.slug,
        description: badge.description,
        iconPath: badge.iconPath,
      });

      expect(mockEnv.dataSource.transaction).toHaveBeenCalled();
      expect(mockEnv.repositories.eventQueueRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          type: UserEventMessagingType.USER_BADGE_AWARDED,
          emitter: 'post-processor-user',
          emitterId: 'user-1',
          correlationId: 'corr-wish',
          traceId: 'trace-wish',
          targetServices: [Streams.USER_BADGE_AWARDED],
        }),
        undefined,
      );
      expect(mockRedis.sadd).toHaveBeenCalledWith(
        'badges:owned:user-1',
        'EVENT_WISHLIST_COUNT_10',
      );
    });
  });

  describe('evaluateEventFinished', () => {
    let mockSocialClient: ReturnType<typeof createMockSocialInteractionClient>;
    let mockRedis: jest.Mocked<Redis>;

    beforeEach(() => {
      mockSocialClient = createMockSocialInteractionClient();
      mockRedis = createMock<Redis>();
      evaluator = new BadgeEvaluator(
        mockEnv.dataSource,
        mockSocialClient,
        mockRedis,
      );

      const mockLogger = {
        log: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      };
      Object.defineProperty(evaluator, 'logger', { value: mockLogger });
    });

    it('should skip evaluation if user already possesses all 9 participation badges (fast path)', async () => {
      for (const slug of PARTICIPATION_BADGE_SLUGS) {
        const badge = createParticipationBadgeModel(slug);
        mockEnv.repositories.badgeRepo.findOneBy.mockResolvedValueOnce(badge);
      }
      mockRedis.sismember.mockResolvedValue(1); // all owned in Redis

      const result = await evaluator.evaluateParticipantEventFinished(
        'event-1',
        EventType.EVENT_TYPE_SOCIAL,
        'user-1',
      );

      expect(result).toEqual([]);
      expect(mockEnv.dataSource.transaction).not.toHaveBeenCalled();
    });

    it('should skip evaluation if event was already counted for user (dedup)', async () => {
      // Not all badges owned
      const badge = createParticipationBadgeModel(PARTICIPATION_BADGE_SLUGS[0]);
      mockEnv.repositories.badgeRepo.findOneBy.mockResolvedValue(badge);
      mockRedis.sismember.mockResolvedValue(0);
      mockEnv.repositories.userBadgeRepo.findOneBy.mockResolvedValue(null);

      // Dedup returns empty raw array (duplicate event)
      mockEnv.queryBuilder.execute.mockResolvedValueOnce({ raw: [] });

      const result = await evaluator.evaluateParticipantEventFinished(
        'event-dup',
        EventType.EVENT_TYPE_SOCIAL,
        'user-1',
      );

      expect(result).toEqual([]);
      expect(mockEnv.dataSource.transaction).toHaveBeenCalled();
      expect(mockEnv.repositories.eventQueueRepo.save).not.toHaveBeenCalled();
    });

    it('should award EVENT_PARTICIPATION_TIER_1 and EVENT_SOCIAL_TIER_1 on first social event in a single outbox event', async () => {
      mockEnv.repositories.badgeRepo.findOneBy.mockImplementation(
        (criteria: unknown) => {
          const slug = (criteria as { slug?: string }).slug;
          if (slug) {
            return Promise.resolve(createParticipationBadgeModel(slug));
          }
          return Promise.resolve(null);
        },
      );

      mockRedis.sismember.mockResolvedValue(0);
      mockEnv.repositories.userBadgeRepo.findOneBy.mockResolvedValue(null);

      // Query builder execute returns success for dedup, total upsert, social upsert, and badge inserts
      mockEnv.queryBuilder.execute.mockResolvedValue({
        raw: [{ event_id: 'event-1', badge_id: 'badge-id' }],
      });

      // Mock progress counters: total = 1, social = 1
      mockEnv.repositories.badgeProgressRepo.find.mockResolvedValue([
        {
          userId: 'user-1',
          metric: BADGE_PROGRESS_METRICS.EVENTS_FINISHED_TOTAL,
          value: 1,
        },
        {
          userId: 'user-1',
          metric: BADGE_PROGRESS_METRICS.EVENTS_FINISHED_SOCIAL,
          value: 1,
        },
      ]);

      const result = await evaluator.evaluateParticipantEventFinished(
        'event-1',
        EventType.EVENT_TYPE_SOCIAL,
        'user-1',
        { correlationId: 'corr-1', traceId: 'trace-1' },
      );

      expect(result).toHaveLength(2);
      expect(result.map((b) => b.slug)).toEqual([
        'EVENT_PARTICIPATION_TIER_1',
        'EVENT_SOCIAL_TIER_1',
      ]);

      // Exactly ONE outbox event with both badges packaged
      expect(mockEnv.repositories.eventQueueRepo.save).toHaveBeenCalledTimes(1);
      expect(mockEnv.repositories.eventQueueRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          type: UserEventMessagingType.USER_BADGE_AWARDED,
          emitter: 'post-processor-user',
          emitterId: 'user-1',
          payload: {
            after: {
              userId: 'user-1',
              badges: expect.arrayContaining([
                expect.objectContaining({ slug: 'EVENT_PARTICIPATION_TIER_1' }),
                expect.objectContaining({ slug: 'EVENT_SOCIAL_TIER_1' }),
              ]),
            },
          },
          targetServices: [Streams.USER_BADGE_AWARDED],
        }),
        undefined,
      );

      // Redis cache updated for both badges
      expect(mockRedis.sadd).toHaveBeenCalledWith(
        'badges:owned:user-1',
        'EVENT_PARTICIPATION_TIER_1',
      );
      expect(mockRedis.sadd).toHaveBeenCalledWith(
        'badges:owned:user-1',
        'EVENT_SOCIAL_TIER_1',
      );
    });

    it('should award EVENT_HYBRID_ECO_SOCIAL_TIER_1 when social >= 5 and eco >= 5', async () => {
      mockEnv.repositories.badgeRepo.findOneBy.mockImplementation(
        (criteria: unknown) => {
          const slug = (criteria as { slug?: string }).slug;
          if (slug) {
            return Promise.resolve(createParticipationBadgeModel(slug));
          }
          return Promise.resolve(null);
        },
      );

      // User already owns total tiers and individual social/eco tiers in Redis, only missing hybrid
      mockRedis.sismember.mockImplementation((_key: string, member: string) => {
        if (member === 'EVENT_HYBRID_ECO_SOCIAL_TIER_1') {
          return Promise.resolve(0);
        }
        return Promise.resolve(1);
      });

      mockEnv.queryBuilder.execute.mockResolvedValue({
        raw: [{ event_id: 'event-5', badge_id: 'badge-hybrid' }],
      });

      mockEnv.repositories.badgeProgressRepo.findOneBy.mockImplementation(
        (criteria: unknown) => {
          const metric = (criteria as { metric?: string }).metric;
          if (metric === BADGE_PROGRESS_METRICS.EVENTS_FINISHED_TOTAL) {
            return Promise.resolve({
              userId: 'user-1',
              metric,
              value: 9,
            });
          }
          if (metric === BADGE_PROGRESS_METRICS.EVENTS_FINISHED_SOCIAL) {
            return Promise.resolve({
              userId: 'user-1',
              metric,
              value: 5,
            });
          }
          if (metric === BADGE_PROGRESS_METRICS.EVENTS_FINISHED_ECOLOGY) {
            return Promise.resolve({
              userId: 'user-1',
              metric,
              value: 4,
            });
          }
          return Promise.resolve(null);
        },
      );

      const result = await evaluator.evaluateParticipantEventFinished(
        'event-5',
        EventType.EVENT_TYPE_ECOLOGY,
        'user-1',
      );

      expect(result).toHaveLength(1);
      expect(result[0].slug).toBe('EVENT_HYBRID_ECO_SOCIAL_TIER_1');
      expect(mockRedis.sadd).toHaveBeenCalledWith(
        'badges:owned:user-1',
        'EVENT_HYBRID_ECO_SOCIAL_TIER_1',
      );
    });

    it('should evaluate all participants fetched from social client in evaluateEventFinished', async () => {
      mockSocialClient.getAllEventParticipantIds.mockResolvedValue([
        'user-1',
        'user-2',
      ]);

      // User-1 and User-2 both already have all 9 badges (fast path)
      mockEnv.repositories.badgeRepo.findOneBy.mockImplementation(
        (criteria: unknown) => {
          const slug = (criteria as { slug?: string }).slug;
          return Promise.resolve(createParticipationBadgeModel(slug ?? ''));
        },
      );
      mockRedis.sismember.mockResolvedValue(1);

      const resultMap = await evaluator.evaluateEventFinished(
        'event-all',
        EventType.EVENT_TYPE_SOCIAL,
      );

      expect(mockSocialClient.getAllEventParticipantIds).toHaveBeenCalledWith(
        'event-all',
      );
      expect(resultMap.size).toBe(2);
      expect(resultMap.get('user-1')).toEqual([]);
      expect(resultMap.get('user-2')).toEqual([]);
    });
  });
});
