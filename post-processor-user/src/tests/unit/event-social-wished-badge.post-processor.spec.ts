import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { EventSocialWishedBadgePostProcessor } from '../../post-processors/events/event-social-wished-badge.post-processor.js';
import { SocialEventMessagingType } from '@volontariapp/messaging';
import type { PostProcessorOptions } from '@volontariapp/post-processors';
import type { Redis } from 'ioredis';
import { createMock } from '@volontariapp/testing';
import { createMockBadgeEvaluator } from '../mocks/badge-evaluator.mock.js';
import { createEventWishlistBadgePayload } from '../factories/badge.factory.js';
import { createEventSocialWishedBatchItem } from '../factories/event-social-wished-batch-event.factory.js';

describe('EventSocialWishedBadgePostProcessor', () => {
  let postProcessor: EventSocialWishedBadgePostProcessor;
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

    postProcessor = new EventSocialWishedBadgePostProcessor(
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
    it('should return true for EVENT_SOCIAL_WISHED event type', () => {
      const result = postProcessor['shouldProcess'](
        SocialEventMessagingType.EVENT_SOCIAL_WISHED,
      );
      expect(result).toBe(true);
    });

    it('should return false for other event types', () => {
      const result = postProcessor['shouldProcess'](
        SocialEventMessagingType.EVENT_SOCIAL_UNWISHED,
      );
      expect(result).toBe(false);
    });
  });

  describe('processEvents', () => {
    it('should skip processing if neither emitterId nor userId is present', async () => {
      const eventItem = createEventSocialWishedBatchItem({
        messageId: 'msg-1',
        eventId: 'event-123',
        emitterId: '',
        userId: '',
      });

      await postProcessor['processEvents']([eventItem]);

      expect(
        mockBadgeEvaluator.evaluateEventWishlistBadge,
      ).not.toHaveBeenCalled();
    });

    it('should call badgeEvaluator when emitterId is present', async () => {
      mockBadgeEvaluator.evaluateEventWishlistBadge.mockResolvedValue([
        createEventWishlistBadgePayload(),
      ]);

      const eventItem = createEventSocialWishedBatchItem({
        messageId: 'msg-2',
        eventId: 'event-123',
        userId: 'user-wisher-1',
        correlationId: 'corr-123',
        traceId: 'trace-456',
      });

      await postProcessor['processEvents']([eventItem]);

      expect(
        mockBadgeEvaluator.evaluateEventWishlistBadge,
      ).toHaveBeenCalledWith('user-wisher-1', {
        correlationId: 'corr-123',
        traceId: 'trace-456',
      });
    });

    it('should fallback to payload.userId if emitterId is missing', async () => {
      mockBadgeEvaluator.evaluateEventWishlistBadge.mockResolvedValue([]);

      const eventItem = createEventSocialWishedBatchItem({
        messageId: 'msg-3',
        eventId: 'event-123',
        emitterId: '',
        userId: 'user-wisher-payload',
      });

      await postProcessor['processEvents']([eventItem]);

      expect(
        mockBadgeEvaluator.evaluateEventWishlistBadge,
      ).toHaveBeenCalledWith('user-wisher-payload', {
        correlationId: 'corr-wish-1',
        traceId: undefined,
      });
    });

    it('should rethrow error when badgeEvaluator fails', async () => {
      const error = new Error('Database connection failure');
      mockBadgeEvaluator.evaluateEventWishlistBadge.mockRejectedValue(error);

      const eventItem = createEventSocialWishedBatchItem({
        messageId: 'msg-4',
        eventId: 'event-123',
        userId: 'user-wisher-1',
      });

      await expect(postProcessor['processEvents']([eventItem])).rejects.toThrow(
        'Database connection failure',
      );
    });
  });
});
