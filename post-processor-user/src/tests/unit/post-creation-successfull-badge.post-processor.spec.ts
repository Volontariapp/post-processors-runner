import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PostCreationSuccessfullBadgePostProcessor } from '../../post-processors/posts/post-creation-successfull-badge.post-processor.js';
import { PostEventMessagingType } from '@volontariapp/messaging';
import type { PostProcessorOptions } from '@volontariapp/post-processors';
import type { Redis } from 'ioredis';
import { createMock } from '@volontariapp/testing';
import { createMockBadgeEvaluator } from '../mocks/badge-evaluator.mock.js';
import { createCommunityPostBadgePayload } from '../factories/badge.factory.js';
import { createPostCreationSuccessfullBatchItem } from '../factories/post-batch-event.factory.js';

describe('PostCreationSuccessfullBadgePostProcessor', () => {
  let postProcessor: PostCreationSuccessfullBadgePostProcessor;
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

    postProcessor = new PostCreationSuccessfullBadgePostProcessor(
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
    it('should return true for POST_CREATION_SUCCESSFULL event type', () => {
      const result = postProcessor['shouldProcess'](
        PostEventMessagingType.POST_CREATION_SUCCESSFULL,
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
    it('should skip processing if userId is missing', async () => {
      const eventItem = createPostCreationSuccessfullBatchItem({
        messageId: 'msg-1',
        postId: 'post-123',
      });

      await postProcessor['processEvents']([eventItem]);

      expect(
        mockBadgeEvaluator.evaluateCommunityPostBadge,
      ).not.toHaveBeenCalled();
    });

    it('should call badgeEvaluator when userId is present', async () => {
      mockBadgeEvaluator.evaluateCommunityPostBadge.mockResolvedValue([
        createCommunityPostBadgePayload(),
      ]);

      const eventItem = createPostCreationSuccessfullBatchItem({
        messageId: 'msg-2',
        postId: 'post-123',
        userId: 'user-789',
        correlationId: 'corr-123',
        traceId: 'trace-456',
      });

      await postProcessor['processEvents']([eventItem]);

      expect(
        mockBadgeEvaluator.evaluateCommunityPostBadge,
      ).toHaveBeenCalledWith('user-789', {
        correlationId: 'corr-123',
        traceId: 'trace-456',
      });
    });

    it('should rethrow error when badgeEvaluator fails', async () => {
      mockBadgeEvaluator.evaluateCommunityPostBadge.mockRejectedValue(
        new Error('DB connection lost'),
      );

      const eventItem = createPostCreationSuccessfullBatchItem({
        messageId: 'msg-3',
        postId: 'post-123',
        userId: 'user-789',
        correlationId: 'corr-123',
      });

      await expect(postProcessor['processEvents']([eventItem])).rejects.toThrow(
        'DB connection lost',
      );
    });
  });
});
