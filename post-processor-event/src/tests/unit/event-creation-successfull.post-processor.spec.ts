import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { EventCreationSuccessfullPostProcessor } from '../../post-processors/event-creation-successfull.post-processor.js';
import { EventEventMessagingType } from '@volontariapp/messaging';
import { SagaStatus } from '@volontariapp/shared';
import type { BatchEventItem } from '@volontariapp/post-processors';
import type { DataSource } from 'typeorm';
import type { Redis } from 'ioredis';
import type { PostProcessorOptions } from '@volontariapp/post-processors';
import { createMock } from '@volontariapp/testing';

describe('EventCreationSuccessfullPostProcessor', () => {
  let postProcessor: EventCreationSuccessfullPostProcessor;
  let mockDb: jest.Mocked<DataSource>;
  let mockRedisDriver: jest.Mocked<Redis>;
  let mockOptions: PostProcessorOptions;
  let mockEventRepository: { update: jest.Mock };

  beforeEach(() => {
    mockEventRepository = {
      update: jest.fn().mockResolvedValue({ affected: 1 } as never),
    };

    mockDb = createMock<DataSource>();
    mockDb.getRepository.mockReturnValue(mockEventRepository as never);

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

    postProcessor = new EventCreationSuccessfullPostProcessor(
      mockDb,
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
    it('should update saga status to DONE for valid event creation successfull payload', async () => {
      const item: BatchEventItem<EventEventMessagingType.EVENT_CREATION_SUCCESSFULL> =
        {
          messageId: 'msg-1',
          event: {
            id: 'evt-msg-1',
            type: EventEventMessagingType.EVENT_CREATION_SUCCESSFULL,
            emitter: 'ws-service',
            emitterId: 'emitter-1',
            correlationId: 'corr-1',
            traceId: 'trace-1',
            version: 1,
            createdAt: new Date().toISOString(),
            payload: {
              before: undefined,
              after: {
                eventId: 'evt-123',
              },
            },
          },
        };

      await postProcessor['processEvents']([item]);

      expect(mockEventRepository.update).toHaveBeenCalledTimes(1);
      expect(mockEventRepository.update).toHaveBeenCalledWith('evt-123', {
        saga_status: SagaStatus.DONE,
      });
    });

    it('should skip processing if eventId is missing', async () => {
      const invalidItem: BatchEventItem<EventEventMessagingType.EVENT_CREATION_SUCCESSFULL> =
        {
          messageId: 'msg-2',
          event: {
            id: 'evt-msg-2',
            type: EventEventMessagingType.EVENT_CREATION_SUCCESSFULL,
            emitter: 'ws-service',
            emitterId: 'emitter-1',
            correlationId: 'corr-2',
            traceId: 'trace-2',
            version: 1,
            createdAt: new Date().toISOString(),
            payload: {
              before: undefined,
              after: {
                eventId: '',
              },
            },
          },
        };

      await postProcessor['processEvents']([invalidItem]);

      expect(mockEventRepository.update).not.toHaveBeenCalled();
    });

    it('should re-throw error if repository update fails', async () => {
      const item: BatchEventItem<EventEventMessagingType.EVENT_CREATION_SUCCESSFULL> =
        {
          messageId: 'msg-3',
          event: {
            id: 'evt-msg-3',
            type: EventEventMessagingType.EVENT_CREATION_SUCCESSFULL,
            emitter: 'ws-service',
            emitterId: 'emitter-1',
            correlationId: 'corr-3',
            traceId: 'trace-3',
            version: 1,
            createdAt: new Date().toISOString(),
            payload: {
              before: undefined,
              after: {
                eventId: 'evt-999',
              },
            },
          },
        };

      const error = new Error('Database connection failed');
      mockEventRepository.update.mockRejectedValueOnce(error);

      await expect(postProcessor['processEvents']([item])).rejects.toThrow(
        'Database connection failed',
      );
    });
  });
});
