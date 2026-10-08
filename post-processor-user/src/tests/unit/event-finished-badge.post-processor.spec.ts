import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { EventFinishedBadgePostProcessor } from '../../post-processors/events/event-finished-badge.post-processor.js';
import { EventEventMessagingType } from '@volontariapp/messaging';
import { EventType } from '@volontariapp/contracts-nest';
import type {
  BatchEventItem,
  PostProcessorOptions,
} from '@volontariapp/post-processors';
import type { Redis } from 'ioredis';
import { createMock } from '@volontariapp/testing';
import { createMockBadgeEvaluator } from '../mocks/badge-evaluator.mock.js';
import { createParticipationBadgePayload } from '../factories/badge.factory.js';

describe('EventFinishedBadgePostProcessor', () => {
  let postProcessor: EventFinishedBadgePostProcessor;
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

    postProcessor = new EventFinishedBadgePostProcessor(
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
    it('should return true for EVENT_FINISHED event type', () => {
      const result = postProcessor['shouldProcess'](
        EventEventMessagingType.EVENT_FINISHED,
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
    it('should skip processing if eventId is missing', async () => {
      const eventItem = {
        messageId: 'msg-1',
        event: {
          id: 'event-1',
          type: EventEventMessagingType.EVENT_FINISHED,
          emitter: 'ms-event',
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
              eventType: EventType.EVENT_TYPE_SOCIAL,
            },
          },
        },
      } as unknown as BatchEventItem<EventEventMessagingType.EVENT_FINISHED>;

      await postProcessor['processEvents']([eventItem]);

      expect(mockBadgeEvaluator.evaluateEventFinished).not.toHaveBeenCalled();
    });

    it('should skip processing if eventType is undefined', async () => {
      const eventItem = {
        messageId: 'msg-1',
        event: {
          id: 'event-1',
          type: EventEventMessagingType.EVENT_FINISHED,
          emitter: 'ms-event',
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
      } as unknown as BatchEventItem<EventEventMessagingType.EVENT_FINISHED>;

      await postProcessor['processEvents']([eventItem]);

      expect(mockBadgeEvaluator.evaluateEventFinished).not.toHaveBeenCalled();
    });

    it('should call badgeEvaluator when eventId and eventType are present', async () => {
      const resultMap = new Map([
        [
          'user-1',
          [createParticipationBadgePayload('EVENT_PARTICIPATION_TIER_1')],
        ],
      ]);
      mockBadgeEvaluator.evaluateEventFinished.mockResolvedValue(resultMap);

      const eventItem = {
        messageId: 'msg-1',
        event: {
          id: 'event-1',
          type: EventEventMessagingType.EVENT_FINISHED,
          emitter: 'ms-event',
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
              eventType: EventType.EVENT_TYPE_SOCIAL,
            },
          },
        },
      } as unknown as BatchEventItem<EventEventMessagingType.EVENT_FINISHED>;

      await postProcessor['processEvents']([eventItem]);

      expect(mockBadgeEvaluator.evaluateEventFinished).toHaveBeenCalledWith(
        'event-123',
        EventType.EVENT_TYPE_SOCIAL,
        {
          correlationId: 'corr-123',
          traceId: 'trace-456',
        },
      );
    });

    it('should support direct payload without after property', async () => {
      mockBadgeEvaluator.evaluateEventFinished.mockResolvedValue(new Map());

      const eventItem = {
        messageId: 'msg-1',
        event: {
          id: 'event-1',
          type: EventEventMessagingType.EVENT_FINISHED,
          emitter: 'ms-event',
          emitterId: 'emitter-1',
          correlationId: 'corr-direct',
          traceId: 'trace-direct',
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          targetServices: [],
          status: 'PENDING',
          attempts: 0,
          payload: {
            eventId: 'event-direct-123',
            eventType: EventType.EVENT_TYPE_ECOLOGY,
          },
        },
      } as unknown as BatchEventItem<EventEventMessagingType.EVENT_FINISHED>;

      await postProcessor['processEvents']([eventItem]);

      expect(mockBadgeEvaluator.evaluateEventFinished).toHaveBeenCalledWith(
        'event-direct-123',
        EventType.EVENT_TYPE_ECOLOGY,
        {
          correlationId: 'corr-direct',
          traceId: 'trace-direct',
        },
      );
    });

    it('should rethrow error when badge evaluation fails to trigger batch retry', async () => {
      mockBadgeEvaluator.evaluateEventFinished.mockRejectedValue(
        new Error('Social service unavailable'),
      );

      const eventItem = {
        messageId: 'msg-1',
        event: {
          id: 'event-1',
          type: EventEventMessagingType.EVENT_FINISHED,
          emitter: 'ms-event',
          emitterId: 'emitter-1',
          correlationId: 'corr-err',
          traceId: 'trace-err',
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          targetServices: [],
          status: 'PENDING',
          attempts: 0,
          payload: {
            after: {
              eventId: 'event-fail-123',
              eventType: EventType.EVENT_TYPE_SOCIAL,
            },
          },
        },
      } as unknown as BatchEventItem<EventEventMessagingType.EVENT_FINISHED>;

      await expect(postProcessor['processEvents']([eventItem])).rejects.toThrow(
        'Social service unavailable',
      );
    });
  });
});
