import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { BadgeEvaluator } from '../../core/services/badge-evaluator.service.js';
import { createMockDataSource } from '../mocks/data-source.mock.js';
import {
  createBadgeModel,
  createCommunityPostBadgeModel,
} from '../factories/badge.factory.js';
import { UserEventMessagingType } from '@volontariapp/messaging';
import { Streams } from '@volontariapp/shared';

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
});
