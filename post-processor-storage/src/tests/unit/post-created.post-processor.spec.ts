import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import { PostCreatedPostProcessor } from '../../post-processors/post-created.post-processor.js';
import { PostEventMessagingType } from '@volontariapp/messaging';
import { EntityType } from '@volontariapp/domain-storage';
import type { PostgresFileRepository } from '@volontariapp/domain-storage/repositories';
import {
  createMockFileRepository,
  createMockRedisClient,
  createMockOptions,
  type IMockFileRepository,
} from '../mocks/file-attachment.mock.js';
import { FileAttachmentEventsFactory } from '../factories/file-attachment-events.factory.js';

describe('PostCreatedPostProcessor', () => {
  let postProcessor: PostCreatedPostProcessor;
  let mockFileRepo: IMockFileRepository;

  beforeEach(() => {
    mockFileRepo = createMockFileRepository();
    const redisClient = createMockRedisClient();
    const options = createMockOptions(
      'StoragePostCreatedPostProcessors',
      'stream:post-created',
    );

    postProcessor = new PostCreatedPostProcessor(
      redisClient,
      options,
      mockFileRepo as never as PostgresFileRepository,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('shouldProcess', () => {
    it('should return true for PostEventMessagingType.POST_CREATED', () => {
      const result = postProcessor['shouldProcess'](
        PostEventMessagingType.POST_CREATED,
      );
      expect(result).toBe(true);
    });

    it('should return false for other event types', () => {
      const result = postProcessor['shouldProcess']('event.created');
      expect(result).toBe(false);
    });
  });

  describe('processEvents', () => {
    it('should attach files for valid POST_CREATED event', async () => {
      const postId = '11111111-1111-1111-1111-111111111111';
      const userId = '22222222-2222-2222-2222-222222222222';
      const fileIds = [
        '33333333-3333-3333-3333-333333333333',
        '44444444-4444-4444-4444-444444444444',
      ];

      const batchItem = FileAttachmentEventsFactory.buildPostCreatedBatchItem({
        postId,
        userId,
        fileIds,
      });

      await postProcessor['processEvents']([batchItem]);

      expect(mockFileRepo.attachFromConfirmationEvent).toHaveBeenCalledTimes(1);
      expect(mockFileRepo.attachFromConfirmationEvent).toHaveBeenCalledWith({
        fileIds,
        entityType: EntityType.POST,
        entityId: postId,
        ownerId: userId,
      });
    });

    it('should skip processing if postId is missing', async () => {
      const batchItem = FileAttachmentEventsFactory.buildPostCreatedBatchItem({
        postId: '',
        userId: '22222222-2222-2222-2222-222222222222',
        fileIds: ['33333333-3333-3333-3333-333333333333'],
      });

      await postProcessor['processEvents']([batchItem]);

      expect(mockFileRepo.attachFromConfirmationEvent).not.toHaveBeenCalled();
    });

    it('should skip processing if userId is missing', async () => {
      const batchItem = FileAttachmentEventsFactory.buildPostCreatedBatchItem({
        postId: '11111111-1111-1111-1111-111111111111',
        userId: '',
        fileIds: ['33333333-3333-3333-3333-333333333333'],
      });

      await postProcessor['processEvents']([batchItem]);

      expect(mockFileRepo.attachFromConfirmationEvent).not.toHaveBeenCalled();
    });

    it('should skip processing if fileIds is empty', async () => {
      const batchItem = FileAttachmentEventsFactory.buildPostCreatedBatchItem({
        postId: '11111111-1111-1111-1111-111111111111',
        userId: '22222222-2222-2222-2222-222222222222',
        fileIds: [],
      });

      await postProcessor['processEvents']([batchItem]);

      expect(mockFileRepo.attachFromConfirmationEvent).not.toHaveBeenCalled();
    });

    it('should rethrow error if attachFromConfirmationEvent fails', async () => {
      const testError = new Error('Database transaction failed on attach');
      mockFileRepo.attachFromConfirmationEvent.mockRejectedValueOnce(testError);

      const batchItem = FileAttachmentEventsFactory.buildPostCreatedBatchItem();

      await expect(postProcessor['processEvents']([batchItem])).rejects.toThrow(
        'Database transaction failed on attach',
      );
    });
  });
});
