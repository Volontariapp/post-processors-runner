import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import { UserAvatarReplacedPostProcessor } from '../../post-processors/user-avatar-replaced.post-processor.js';
import { UserEventMessagingType } from '@volontariapp/messaging';
import { EntityType } from '@volontariapp/domain-storage';
import type { PostgresFileRepository } from '@volontariapp/domain-storage/repositories';
import {
  createMockFileRepository,
  createMockRedisClient,
  createMockOptions,
  type IMockFileRepository,
} from '../mocks/file-attachment.mock.js';
import { FileAttachmentEventsFactory } from '../factories/file-attachment-events.factory.js';

describe('UserAvatarReplacedPostProcessor', () => {
  let postProcessor: UserAvatarReplacedPostProcessor;
  let mockFileRepo: IMockFileRepository;

  beforeEach(() => {
    mockFileRepo = createMockFileRepository();
    const redisClient = createMockRedisClient();
    const options = createMockOptions(
      'StorageUserAvatarReplacedPostProcessors',
      'stream:user:avatar_replaced',
    );

    postProcessor = new UserAvatarReplacedPostProcessor(
      redisClient,
      options,
      mockFileRepo as never as PostgresFileRepository,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('shouldProcess', () => {
    it('should return true for UserEventMessagingType.USER_AVATAR_REPLACED', () => {
      const result = postProcessor['shouldProcess'](
        UserEventMessagingType.USER_AVATAR_REPLACED,
      );
      expect(result).toBe(true);
    });

    it('should return false for other event types', () => {
      const result = postProcessor['shouldProcess']('post.created');
      expect(result).toBe(false);
    });
  });

  describe('processEvents', () => {
    it('should attach replaced avatar file for valid USER_AVATAR_REPLACED event', async () => {
      const userId = '11111111-1111-1111-1111-111111111111';
      const newFileId = '22222222-2222-2222-2222-222222222222';
      const oldFileId = '33333333-3333-3333-3333-333333333333';

      const batchItem =
        FileAttachmentEventsFactory.buildUserAvatarReplacedBatchItem({
          userId,
          newFileId,
          oldFileId,
        });

      await postProcessor['processEvents']([batchItem]);

      expect(mockFileRepo.attachFromConfirmationEvent).toHaveBeenCalledTimes(1);
      expect(mockFileRepo.attachFromConfirmationEvent).toHaveBeenCalledWith({
        fileIds: [newFileId],
        entityType: EntityType.USER_AVATAR,
        entityId: userId,
        ownerId: userId,
      });
    });

    it('should skip processing if userId is missing', async () => {
      const batchItem =
        FileAttachmentEventsFactory.buildUserAvatarReplacedBatchItem({
          userId: '',
          newFileId: '22222222-2222-2222-2222-222222222222',
        });

      await postProcessor['processEvents']([batchItem]);

      expect(mockFileRepo.attachFromConfirmationEvent).not.toHaveBeenCalled();
    });

    it('should skip processing if newFileId is missing', async () => {
      const batchItem =
        FileAttachmentEventsFactory.buildUserAvatarReplacedBatchItem({
          userId: '11111111-1111-1111-1111-111111111111',
          newFileId: undefined,
        });

      await postProcessor['processEvents']([batchItem]);

      expect(mockFileRepo.attachFromConfirmationEvent).not.toHaveBeenCalled();
    });

    it('should rethrow error if attachFromConfirmationEvent fails', async () => {
      const testError = new Error('Database error on replace avatar');
      mockFileRepo.attachFromConfirmationEvent.mockRejectedValueOnce(testError);

      const batchItem =
        FileAttachmentEventsFactory.buildUserAvatarReplacedBatchItem();

      await expect(postProcessor['processEvents']([batchItem])).rejects.toThrow(
        'Database error on replace avatar',
      );
    });
  });
});
