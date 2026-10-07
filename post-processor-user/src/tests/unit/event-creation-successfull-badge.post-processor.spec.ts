import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { EventCreationSuccessfullBadgePostProcessor } from '../../post-processors/events/event-creation-successfull-badge.post-processor.js';
import { EventEventMessagingType } from '@volontariapp/messaging';
import type {
  BatchEventItem,
  PostProcessorOptions,
} from '@volontariapp/post-processors';
import type { Redis } from 'ioredis';
import { createMock } from '@volontariapp/testing';
import { createMockBadgeEvaluator } from '../mocks/badge-evaluator.mock.js';
import { createBadgePayload } from '../factories/badge.factory.js';

describe('EventCreationSuccessfullBadgePostProcessor', () => {
  let postProcessor: EventCreationSuccessfullBadgePostProcessor;
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
      blockTimeout: 1000,
      idempotencyTtlSeconds: 86400,
      maxRetries: 3,
      retryDelayMs: 1000,
    };

    postProcessor = new EventCreationSuccessfullBadgePostProcessor(
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
    it('should return true for EVENT_CREATION_SUCCESSFULL event type', () => {
      const result = postProcessor['shouldProcess'](
        EventEventMessagingType.EVENT_CREATION_SUCCESSFULL,
      );
      expect(result).toBe(true);
    });

    it('should return false for other event types', () => {
      const result = postProcessor['shouldProcess'](
        EventEventMessagingType.EVENT_CREATED,
      );
      expect(result).toBe(false);
    });
  });

  describe('processEvents', () => {
    it('should skip processing if userId is missing', async () => {
      const eventItem = {
        messageId: 'msg-1',
        event: {
          id: 'event-1',
          type: EventEventMessagingType.EVENT_CREATION_SUCCESSFULL,
          emitter: 'ws-service',
          emitterId: 'emitter-1',
          correlationId: 'corr-1',
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          targetServices: [],
          status: 'PENDING',
          attempts: 0,
          payload: {
            after: {
              eventId: 'event-123',
            },
          },
        },
      } as unknown as BatchEventItem<EventEventMessagingType.EVENT_CREATION_SUCCESSFULL>;

      await postProcessor['processEvents']([eventItem]);

      expect(mockBadgeEvaluator.evaluateEventHostBadge).not.toHaveBeenCalled();
    });

    it('should call badgeEvaluator when userId is present', async () => {
      mockBadgeEvaluator.evaluateEventHostBadge.mockResolvedValue([
        createBadgePayload(),
      ]);

      const eventItem = {
        messageId: 'msg-2',
        event: {
          id: 'event-2',
          type: EventEventMessagingType.EVENT_CREATION_SUCCESSFULL,
          emitter: 'ws-service',
          emitterId: 'emitter-1',
          correlationId: 'corr-123',
          traceId: 'trace-456',
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          targetServices: [],
          status: 'PENDING',
          attempts: 0,
          payload: {
            after: {
              eventId: 'event-123',
              userId: 'user-789',
            },
          },
        },
      } as unknown as BatchEventItem<EventEventMessagingType.EVENT_CREATION_SUCCESSFULL>;

      await postProcessor['processEvents']([eventItem]);

      expect(mockBadgeEvaluator.evaluateEventHostBadge).toHaveBeenCalledWith(
        'user-789',
        {
          correlationId: 'corr-123',
          traceId: 'trace-456',
        },
      );
    });

    it('should rethrow error when badgeEvaluator fails', async () => {
      mockBadgeEvaluator.evaluateEventHostBadge.mockRejectedValue(
        new Error('DB connection lost'),
      );

      const eventItem = {
        messageId: 'msg-3',
        event: {
          id: 'event-3',
          type: EventEventMessagingType.EVENT_CREATION_SUCCESSFULL,
          emitter: 'ws-service',
          emitterId: 'emitter-1',
          correlationId: 'corr-123',
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          targetServices: [],
          status: 'PENDING',
          attempts: 0,
          payload: {
            after: {
              eventId: 'event-123',
              userId: 'user-789',
            },
          },
        },
      } as unknown as BatchEventItem<EventEventMessagingType.EVENT_CREATION_SUCCESSFULL>;

      await expect(postProcessor['processEvents']([eventItem])).rejects.toThrow(
        'DB connection lost',
      );
    });
  });
});
