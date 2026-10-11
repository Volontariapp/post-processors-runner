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
  StorageEventMessagingType,
} from '@volontariapp/messaging';
import type { ParseResult } from '@volontariapp/post-processors';
import { Streams } from '@volontariapp/shared';
import type { Repository } from 'typeorm';
import type { EventQueueModel } from '@volontariapp/database';
import type { PostgresFileRepository } from '@volontariapp/domain-storage/repositories';
import {
  createMockFileRepository,
  createMockEventQueueRepository,
  createMockRedisClient,
  createMockOptions,
  type IMockFileRepository,
  type IMockEventQueueRepository,
} from '../mocks/user-deleted.post-processor.mock.js';
import { UserDeletedFactory } from '../factories/user-deleted.factory.js';

describe('UserDeletedPostProcessor (storage)', () => {
  let postProcessor: UserDeletedPostProcessor;
  let mockFileRepo: IMockFileRepository;
  let mockEventQueueRepo: IMockEventQueueRepository;

  beforeEach(() => {
    mockFileRepo = createMockFileRepository();
    mockEventQueueRepo = createMockEventQueueRepository();
    const redisClient = createMockRedisClient();
    const options = createMockOptions();

    postProcessor = new UserDeletedPostProcessor(
      redisClient,
      options,
      mockFileRepo as never as PostgresFileRepository,
      mockEventQueueRepo as never as Repository<EventQueueModel>,
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
      const result = postProcessor['shouldProcess']('storage.file_scanned');
      expect(result).toBe(false);
    });
  });

  describe('processEvents', () => {
    it('should mark files for deletion and save USER_STORAGE_DELETED event', async () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      const batchItem = UserDeletedFactory.buildBatchEventItem({ id: userId });

      await postProcessor['processEvents']([batchItem]);

      expect(mockFileRepo.markFilesForDeletionByOwner).toHaveBeenCalledWith(
        userId,
      );
      expect(mockEventQueueRepo.save).toHaveBeenCalledTimes(1);

      const savedEntities = mockEventQueueRepo.save.mock.calls[0][0] as Array<{
        type: string;
        targetServices: string[];
        payload: { after: { userId: string } };
      }>;

      expect(savedEntities).toHaveLength(1);
      expect(savedEntities[0].type).toBe(
        StorageEventMessagingType.USER_STORAGE_DELETED,
      );
      expect(savedEntities[0].targetServices).toContain(
        Streams.WS_USER_DELETED_FEEDBACK,
      );
      expect(savedEntities[0].payload.after.userId).toBe(userId);
    });

    it('should rethrow error if markFilesForDeletionByOwner throws', async () => {
      const batchItem = UserDeletedFactory.buildBatchEventItem();
      const testError = new Error('Database error on storage mark files');
      mockFileRepo.markFilesForDeletionByOwner.mockRejectedValueOnce(testError);

      await expect(postProcessor['processEvents']([batchItem])).rejects.toThrow(
        'Database error on storage mark files',
      );
    });

    it('should skip processing if payload has no id', async () => {
      const batchItem = UserDeletedFactory.buildBatchEventItem({ id: '' });

      await postProcessor['processEvents']([batchItem]);

      expect(mockFileRepo.markFilesForDeletionByOwner).not.toHaveBeenCalled();
      expect(mockEventQueueRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('sendMessageToDlq', () => {
    it('should insert USER_STORAGE_DELETION_FAILED feedback event when original payload is valid', async () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      const batchItem = UserDeletedFactory.buildBatchEventItem({ id: userId });
      const messageId = '1700000000000-1';
      const originalPayload: ParseResult = {
        success: true,
        payload: JSON.stringify(batchItem.event),
      };
      const dlqError = 'Max retries reached in post-processor-storage';

      await postProcessor['sendMessageToDlq'](
        messageId,
        originalPayload,
        dlqError,
      );

      expect(mockEventQueueRepo.save).toHaveBeenCalledTimes(1);
      const savedEntities = mockEventQueueRepo.save.mock.calls[0][0] as Array<{
        type: string;
        targetServices: string[];
        payload: { after: { userId: string; errorReason: string } };
      }>;

      expect(savedEntities).toHaveLength(1);
      expect(savedEntities[0].type).toBe(
        StorageEventMessagingType.USER_STORAGE_DELETION_FAILED,
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
