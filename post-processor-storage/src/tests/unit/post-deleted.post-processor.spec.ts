import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import { PostDeletedPostProcessor } from '../../post-processors/post-deleted.post-processor.js';
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

describe('PostDeletedPostProcessor (storage)', () => {
  let postProcessor: PostDeletedPostProcessor;
  let mockFileRepo: IMockFileRepository;

  beforeEach(() => {
    mockFileRepo = createMockFileRepository();
    const redisClient = createMockRedisClient();
    const options = createMockOptions(
      'StorageFileReleasePostProcessors',
      'stream:post:deleted',
    );

    postProcessor = new PostDeletedPostProcessor(
      redisClient,
      options,
      mockFileRepo as never as PostgresFileRepository,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('shouldProcess', () => {
    it('should return true for PostEventMessagingType.POST_DELETED', () => {
      const result = postProcessor['shouldProcess'](
        PostEventMessagingType.POST_DELETED,
      );
      expect(result).toBe(true);
    });

    it('should return false for other event types', () => {
      const result = postProcessor['shouldProcess']('post.created');
      expect(result).toBe(false);
    });
  });

  describe('processEvents', () => {
    it('should release files for valid POST_DELETED event', async () => {
      const postId = '11111111-1111-1111-1111-111111111111';
      const userId = '22222222-2222-2222-2222-222222222222';
      const batchItem = FileAttachmentEventsFactory.buildPostDeletedBatchItem({
        postId,
        userId,
      });

      mockFileRepo.releaseForEntity.mockResolvedValueOnce({
        releasedFileIds: ['file-1', 'file-2'],
        tombstoneCreated: true,
      });

      await postProcessor['processEvents']([batchItem]);

      expect(mockFileRepo.releaseForEntity).toHaveBeenCalledTimes(1);
      expect(mockFileRepo.releaseForEntity).toHaveBeenCalledWith({
        entityType: EntityType.POST,
        entityId: postId,
      });
    });

    it('should skip processing when payload is missing postId without throwing', async () => {
      const batchItem = FileAttachmentEventsFactory.buildPostDeletedBatchItem({
        postId: '',
      });

      await expect(
        postProcessor['processEvents']([batchItem]),
      ).resolves.not.toThrow();

      expect(mockFileRepo.releaseForEntity).not.toHaveBeenCalled();
    });

    it('should skip processing when event payload is not an object without throwing', async () => {
      const batchItem = FileAttachmentEventsFactory.buildPostDeletedBatchItem();
      (batchItem.event as unknown as { payload: unknown }).payload = null;

      await expect(
        postProcessor['processEvents']([batchItem]),
      ).resolves.not.toThrow();

      expect(mockFileRepo.releaseForEntity).not.toHaveBeenCalled();
    });

    it('should rethrow error if fileRepository.releaseForEntity throws', async () => {
      const batchItem = FileAttachmentEventsFactory.buildPostDeletedBatchItem();
      const testError = new Error('Database transaction failed on release');

      mockFileRepo.releaseForEntity.mockRejectedValueOnce(testError);

      await expect(postProcessor['processEvents']([batchItem])).rejects.toThrow(
        'Database transaction failed on release',
      );
    });
  });
});
