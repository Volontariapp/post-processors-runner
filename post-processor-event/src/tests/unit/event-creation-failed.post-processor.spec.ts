import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { EventCreationFailedPostProcessor } from '../../post-processors/event-creation-failed.post-processor.js';
import { EventEventMessagingType } from '@volontariapp/messaging';
import { SagaStatus } from '@volontariapp/shared';
import { DataSource } from 'typeorm';
import { Redis } from 'ioredis';
import { PostProcessorOptions } from '@volontariapp/post-processors';

describe('EventCreationFailedPostProcessor', () => {
  let postProcessor: EventCreationFailedPostProcessor;
  let mockDb: jest.Mocked<DataSource>;
  let mockRedisDriver: jest.Mocked<Redis>;
  let mockOptions: PostProcessorOptions;
  let mockEventRepository: { update: jest.Mock };

  beforeEach(() => {
    mockEventRepository = {
      update: jest.fn().mockResolvedValue({ affected: 1 } as never),
    };

    mockDb = {
      getRepository: jest.fn().mockReturnValue(mockEventRepository),
    } as unknown as jest.Mocked<DataSource>;

    mockRedisDriver = {} as unknown as jest.Mocked<Redis>;
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

    postProcessor = new EventCreationFailedPostProcessor(
      mockDb,
      mockRedisDriver,
      mockOptions,
    );

    postProcessor['logger'] = {
      log: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as any;
  });

  describe('shouldProcess', () => {
    it('should return true for EVENT_CREATION_FAILED event type', () => {
      const result = postProcessor['shouldProcess'](
        EventEventMessagingType.EVENT_CREATION_FAILED,
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
    it('should update saga status to CANCEL for valid event creation failed payload', async () => {
      const item = {
        messageId: 'msg-1',
        event: {
          id: 'evt-msg-1',
          type: EventEventMessagingType.EVENT_CREATION_FAILED.toString(),
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
              failedEvents: ['GEOCODED_SUCCESS'],
            },
          },
        },
      };

      await postProcessor['processEvents']([item as any]);

      expect(mockEventRepository.update).toHaveBeenCalledTimes(1);
      expect(mockEventRepository.update).toHaveBeenCalledWith('evt-123', {
        saga_status: SagaStatus.CANCEL,
      });
    });

    it('should skip processing if eventId is missing', async () => {
      const invalidItem = {
        messageId: 'msg-2',
        event: {
          id: 'evt-msg-2',
          type: EventEventMessagingType.EVENT_CREATION_FAILED.toString(),
          emitter: 'ws-service',
          emitterId: 'emitter-1',
          correlationId: 'corr-2',
          traceId: 'trace-2',
          version: 1,
          createdAt: new Date().toISOString(),
          payload: {
            before: undefined,
            after: {},
          },
        },
      };

      await postProcessor['processEvents']([invalidItem as any]);

      expect(mockEventRepository.update).not.toHaveBeenCalled();
    });

    it('should re-throw error if repository update fails', async () => {
      const item = {
        messageId: 'msg-3',
        event: {
          id: 'evt-msg-3',
          type: EventEventMessagingType.EVENT_CREATION_FAILED.toString(),
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

      await expect(postProcessor['processEvents']([item as any])).rejects.toThrow(
        'Database connection failed',
      );
    });
  });
});
