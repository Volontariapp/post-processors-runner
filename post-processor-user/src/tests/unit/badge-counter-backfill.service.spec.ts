import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { BadgeProgressDedupModel } from '@volontariapp/domain-user';
import { BadgeCounterBackfill } from '../../core/services/badge-counter-backfill.service.js';
import {
  createMockBackfillDataSource,
  createMockUserSocialActivityClient,
} from '../mocks/backfill-data-source.mock.js';
import { createMockPostAuthorResolver } from '../mocks/post-author-resolver.mock.js';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

describe('BadgeCounterBackfill', () => {
  let env: ReturnType<typeof createMockBackfillDataSource>;
  let social: ReturnType<typeof createMockUserSocialActivityClient>;
  let authors: ReturnType<typeof createMockPostAuthorResolver>;
  let backfill: BadgeCounterBackfill;

  beforeEach(() => {
    env = createMockBackfillDataSource();
    social = createMockUserSocialActivityClient();
    authors = createMockPostAuthorResolver();
    social.getAllUserLikedPostIds.mockResolvedValue([]);
    social.getAllUserWishedEventIds.mockResolvedValue([]);
    backfill = new BadgeCounterBackfill(env.dataSource, social, authors);
    Object.defineProperty(backfill, 'logger', {
      value: {
        log: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      },
    });
  });

  describe('backfillUser', () => {
    it('should count likes on other users posts and skip own and deleted posts', async () => {
      social.getAllUserLikedPostIds.mockResolvedValue([
        'p-ok',
        'p-own',
        'p-gone',
      ]);
      authors.getPostAuthorId.mockImplementation((postId) =>
        Promise.resolve(
          postId === 'p-ok' ? OTHER : postId === 'p-own' ? USER : undefined,
        ),
      );
      env.manager.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

      const result = await backfill.backfillUser(USER, false);

      expect(result).toEqual({
        userId: USER,
        likes: 1,
        selfLikesSkipped: 1,
        missingPostsSkipped: 1,
        wishes: 0,
      });
      expect(env.queryBuilder.into).toHaveBeenCalledWith(
        BadgeProgressDedupModel,
      );
      expect(env.queryBuilder.values).toHaveBeenCalledWith([
        { userId: USER, metric: 'SOCIAL_LIKES_GIVEN', refId: 'p-ok' },
      ]);
    });

    it('should record wishes and upsert both counters with GREATEST so a value never decreases', async () => {
      social.getAllUserLikedPostIds.mockResolvedValue(['p-1', 'p-2']);
      social.getAllUserWishedEventIds.mockResolvedValue(['e-1', 'e-2', 'e-3']);
      authors.getPostAuthorId.mockResolvedValue(OTHER);
      env.manager.count.mockResolvedValueOnce(2).mockResolvedValueOnce(3);

      const result = await backfill.backfillUser(USER, false);

      expect(result).toMatchObject({ likes: 2, wishes: 3 });
      expect(env.manager.query).toHaveBeenCalledTimes(2);
      const [sql, params] = env.manager.query.mock.calls[0] as [
        string,
        unknown[],
      ];
      expect(sql).toContain('GREATEST');
      expect(sql).toContain('ON CONFLICT');
      expect(params).toEqual([USER, 'SOCIAL_LIKES_GIVEN', 2]);
      expect(env.manager.query.mock.calls[1]?.[1]).toEqual([
        USER,
        'SOCIAL_WISHES',
        3,
      ]);
    });

    it('should write nothing for a user without activity', async () => {
      const result = await backfill.backfillUser(USER, false);

      expect(result).toEqual({
        userId: USER,
        likes: 0,
        selfLikesSkipped: 0,
        missingPostsSkipped: 0,
        wishes: 0,
      });
      expect(env.queryBuilder.execute).not.toHaveBeenCalled();
      expect(env.manager.query).not.toHaveBeenCalled();
    });

    it('should report the counts without opening a transaction in dry run mode', async () => {
      social.getAllUserLikedPostIds.mockResolvedValue(['p-1']);
      social.getAllUserWishedEventIds.mockResolvedValue(['e-1']);
      authors.getPostAuthorId.mockResolvedValue(OTHER);

      const result = await backfill.backfillUser(USER, true);

      expect(result).toMatchObject({ likes: 1, wishes: 1 });
      expect(env.dataSource.transaction).not.toHaveBeenCalled();
    });

    it('should propagate an ms-post failure instead of counting a guess', async () => {
      social.getAllUserLikedPostIds.mockResolvedValue(['p-1']);
      authors.getPostAuthorId.mockRejectedValue(
        new Error('ms-post unavailable'),
      );

      await expect(backfill.backfillUser(USER, false)).rejects.toThrow(
        'ms-post unavailable',
      );
      expect(env.dataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe('run', () => {
    it('should page through users by keyset until none is left and aggregate the totals', async () => {
      env.query
        .mockResolvedValueOnce([{ id: USER }, { id: OTHER }])
        .mockResolvedValueOnce([]);
      social.getAllUserWishedEventIds.mockResolvedValue(['e-1']);
      env.manager.count.mockResolvedValue(1);

      const summary = await backfill.run({ batchSize: 2 });

      expect(summary).toMatchObject({
        dryRun: false,
        users: 2,
        wishes: 2,
        failedUsers: [],
      });
      expect(env.query.mock.calls[0]?.[1]).toEqual([
        '00000000-0000-0000-0000-000000000000',
        2,
      ]);
      expect(env.query.mock.calls[1]?.[1]).toEqual([OTHER, 2]);
    });

    it('should isolate a failing user, keep going and report it', async () => {
      env.query
        .mockResolvedValueOnce([{ id: USER }, { id: OTHER }])
        .mockResolvedValueOnce([]);
      social.getAllUserLikedPostIds
        .mockRejectedValueOnce(new Error('ms-social unavailable'))
        .mockResolvedValueOnce([]);

      const summary = await backfill.run();

      expect(summary.users).toBe(1);
      expect(summary.failedUsers).toEqual([USER]);
    });

    it('should only process the requested user without listing the users table', async () => {
      const summary = await backfill.run({ userId: USER, dryRun: true });

      expect(env.query).not.toHaveBeenCalled();
      expect(social.getAllUserLikedPostIds).toHaveBeenCalledWith(USER);
      expect(summary).toMatchObject({ dryRun: true, users: 1 });
    });
  });
});
