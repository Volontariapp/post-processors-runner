import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import { UserDeletedPostProcessor } from '../../post-processors/user-deleted.post-processor.js';
import {
  UserEventMessagingType,
  EventEventMessagingType,
} from '@volontariapp/messaging';
import type { ParseResult } from '@volontariapp/post-processors';
import { Streams } from '@volontariapp/shared';
import type { PostgresEventRepository } from '@volontariapp/domain-event';
import {
  createMockEventRepository,
  createMockEventQueueRepository,
  createMockDb,
  createMockRedisClient,
  createMockOptions,
  type IMockEventRepository,
  type IMockEventQueueRepository,
} from '../mocks/user-deleted.post-processor.mock.js';
import { UserDeletedFactory } from '../factories/user-deleted.factory.js';

import { SOURCE_TRACEPARENT } from '../factories/trace.factory.js';

describe('UserDeletedPostProcessor (event)', () => {
  let postProcessor: UserDeletedPostProcessor;
  let mockEventRepo: IMockEventRepository;
  let mockEventQueueRepo: IMockEventQueueRepository;

  beforeEach(() => {
    mockEventRepo = createMockEventRepository();
    mockEventQueueRepo = createMockEventQueueRepository();
    const mockDb = createMockDb(mockEventQueueRepo);
    const redisClient = createMockRedisClient();
    const options = createMockOptions();

    postProcessor = new UserDeletedPostProcessor(
      mockDb,
      redisClient,
      options,
      mockEventRepo as never as PostgresEventRepository,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('shouldProcess', () => {
    it('should return true for UserEventMessagingType.USER_DELETED', () => {
      const result = postProcessor['shouldProcess'](
        UserEventMessagingType.USER_DELETED,
      );
      expect(result).toBe(true);
    });

    it('should return false for other event types', () => {
      const result = postProcessor['shouldProcess']('event.created');
      expect(result).toBe(false);
    });
  });

  describe('processEvents', () => {
    it('should delete all events by organizer and save USER_EVENT_DELETED event', async () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      const batchItem = UserDeletedFactory.buildBatchEventItem({ id: userId });

      await postProcessor['processEvents']([batchItem]);

      expect(
        mockEventRepo.deleteAllByOrganizerWithEventDeleted,
      ).toHaveBeenCalledWith(userId);
      expect(mockEventQueueRepo.save).toHaveBeenCalledTimes(1);

      const savedEntities = mockEventQueueRepo.save.mock.calls[0][0] as Array<{
        type: string;
        targetServices: string[];
        traceparent?: string;
        payload: { after: { userId: string } };
      }>;

      expect(savedEntities).toHaveLength(1);
      expect(savedEntities[0].traceparent).toBe(SOURCE_TRACEPARENT);
      expect(savedEntities[0].type).toBe(
        EventEventMessagingType.USER_EVENT_DELETED,
      );
      expect(savedEntities[0].targetServices).toContain(
        Streams.WS_USER_DELETED_FEEDBACK,
      );
      expect(savedEntities[0].payload.after.userId).toBe(userId);
    });

    it('should rethrow error if deleteAllByOrganizerWithEventDeleted throws', async () => {
      const batchItem = UserDeletedFactory.buildBatchEventItem();
      const testError = new Error('Database error on event delete');
      mockEventRepo.deleteAllByOrganizerWithEventDeleted.mockRejectedValueOnce(
        testError,
      );

      await expect(postProcessor['processEvents']([batchItem])).rejects.toThrow(
        'Database error on event delete',
      );
    });

    it('should skip processing if payload has no id', async () => {
      const batchItem = UserDeletedFactory.buildBatchEventItem({ id: '' });

      await postProcessor['processEvents']([batchItem]);

      expect(
        mockEventRepo.deleteAllByOrganizerWithEventDeleted,
      ).not.toHaveBeenCalled();
      expect(mockEventQueueRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('sendMessageToDlq', () => {
    it('should insert USER_EVENT_DELETION_FAILED feedback event when original payload is valid', async () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      const batchItem = UserDeletedFactory.buildBatchEventItem({ id: userId });
      const messageId = '1700000000000-1';
      const originalPayload: ParseResult = {
        success: true,
        payload: JSON.stringify(batchItem.event),
      };
      const dlqError = 'Max retries reached in post-processor-event';

      await postProcessor['sendMessageToDlq'](
        messageId,
        originalPayload,
        dlqError,
      );

      expect(mockEventQueueRepo.save).toHaveBeenCalledTimes(1);
      const savedEntities = mockEventQueueRepo.save.mock.calls[0][0] as Array<{
        type: string;
        targetServices: string[];
        traceparent?: string;
        payload: { after: { userId: string; errorReason: string } };
      }>;

      expect(savedEntities).toHaveLength(1);
      expect(savedEntities[0].traceparent).toBe(SOURCE_TRACEPARENT);
      expect(savedEntities[0].type).toBe(
        EventEventMessagingType.USER_EVENT_DELETION_FAILED,
      );
      expect(savedEntities[0].targetServices).toContain(
        Streams.WS_USER_DELETED_FEEDBACK,
      );
      expect(savedEntities[0].payload.after.userId).toBe(userId);
      expect(savedEntities[0].payload.after.errorReason).toBe(dlqError);
    });

    it('should skip feedback when originalPayload.success is false', async () => {
      const messageId = '1700000000000-2';
      const originalPayload: ParseResult = {
        success: false,
        error: 'Invalid JSON',
      };

      await postProcessor['sendMessageToDlq'](
        messageId,
        originalPayload,
        'Parse failure',
      );

      expect(mockEventQueueRepo.save).not.toHaveBeenCalled();
    });
  });
});
