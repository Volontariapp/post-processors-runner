import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PostLikedBadgePostProcessor } from '../../post-processors/posts/post-liked-badge.post-processor.js';
import { PostEventMessagingType } from '@volontariapp/messaging';
import type { PostProcessorOptions } from '@volontariapp/post-processors';
import type { Redis } from 'ioredis';
import { createMock } from '@volontariapp/testing';
import { createMockBadgeEvaluator } from '../mocks/badge-evaluator.mock.js';
import { createSocialLikeBadgePayload } from '../factories/badge.factory.js';
import { createPostLikedBatchItem } from '../factories/post-batch-event.factory.js';

describe('PostLikedBadgePostProcessor', () => {
  let postProcessor: PostLikedBadgePostProcessor;
  let mockBadgeEvaluator: ReturnType<typeof createMockBadgeEvaluator>;
  let mockRedisDriver: jest.Mocked<Redis>;
  let mockOptions: PostProcessorOptions;

  beforeEach(() => {
    mockBadgeEvaluator = createMockBadgeEvaluator();
    mockRedisDriver = createMock<Redis>();
    mockOptions = {
      streamName: 'test-stream',
      groupName: 'test-group',
      consumerName: 'test-consumer',
      batchSize: 10,
      blockMs: 1000,
      idempotencyTtlSeconds: 86400,
      retry: {
        maxRetries: 3,
        initialDelayMs: 1000,
      },
    };

    postProcessor = new PostLikedBadgePostProcessor(
      mockBadgeEvaluator,
      mockRedisDriver,
      mockOptions,
    );

    const mockLogger = {
      log: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
    Object.defineProperty(postProcessor, 'logger', { value: mockLogger });
  });

  describe('shouldProcess', () => {
    it('should return true for POST_LIKED event type', () => {
      const result = postProcessor['shouldProcess'](
        PostEventMessagingType.POST_LIKED,
      );
      expect(result).toBe(true);
    });

    it('should return false for other event types', () => {
      const result = postProcessor['shouldProcess'](
        PostEventMessagingType.POST_CREATED,
      );
      expect(result).toBe(false);
    });
  });

  describe('processEvents', () => {
    it('should skip processing if neither emitterId nor authorId is present', async () => {
      const eventItem = createPostLikedBatchItem({
        messageId: 'msg-1',
        postId: 'post-123',
        emitterId: '',
        authorId: '',
      });

      await postProcessor['processEvents']([eventItem]);

      expect(mockBadgeEvaluator.evaluateSocialLikeBadge).not.toHaveBeenCalled();
    });

    it('should call badgeEvaluator when emitterId is present', async () => {
      mockBadgeEvaluator.evaluateSocialLikeBadge.mockResolvedValue([
        createSocialLikeBadgePayload(),
      ]);

      const eventItem = createPostLikedBatchItem({
        messageId: 'msg-2',
        postId: 'post-123',
        userId: 'user-liker-1',
        correlationId: 'corr-123',
        traceId: 'trace-456',
      });

      await postProcessor['processEvents']([eventItem]);

      expect(mockBadgeEvaluator.evaluateSocialLikeBadge).toHaveBeenCalledWith(
        'user-liker-1',
        {
          correlationId: 'corr-123',
          traceId: 'trace-456',
        },
      );
    });

    it('should fallback to authorId if emitterId is missing', async () => {
      mockBadgeEvaluator.evaluateSocialLikeBadge.mockResolvedValue([]);

      const eventItem = createPostLikedBatchItem({
        messageId: 'msg-3',
        postId: 'post-123',
        emitterId: '',
        authorId: 'user-liker-author',
      });

      await postProcessor['processEvents']([eventItem]);

      expect(mockBadgeEvaluator.evaluateSocialLikeBadge).toHaveBeenCalledWith(
        'user-liker-author',
        {
          correlationId: 'corr-like-1',
          traceId: undefined,
        },
      );
    });

    it('should rethrow error when badgeEvaluator fails', async () => {
      const error = new Error('Database connection failure');
      mockBadgeEvaluator.evaluateSocialLikeBadge.mockRejectedValue(error);

      const eventItem = createPostLikedBatchItem({
        messageId: 'msg-4',
        postId: 'post-123',
        userId: 'user-liker-1',
      });

      await expect(postProcessor['processEvents']([eventItem])).rejects.toThrow(
        'Database connection failure',
      );
    });
  });
});
