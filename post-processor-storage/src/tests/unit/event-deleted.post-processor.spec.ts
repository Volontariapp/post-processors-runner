import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import { EventDeletedPostProcessor } from '../../post-processors/event-deleted.post-processor.js';
import { EventEventMessagingType } from '@volontariapp/messaging';
import { EntityType } from '@volontariapp/domain-storage';
import type { PostgresFileRepository } from '@volontariapp/domain-storage/repositories';
import {
  createMockFileRepository,
  createMockRedisClient,
  createMockOptions,
  type IMockFileRepository,
} from '../mocks/file-attachment.mock.js';
import { FileAttachmentEventsFactory } from '../factories/file-attachment-events.factory.js';

describe('EventDeletedPostProcessor (storage)', () => {
  let postProcessor: EventDeletedPostProcessor;
  let mockFileRepo: IMockFileRepository;

  beforeEach(() => {
    mockFileRepo = createMockFileRepository();
    const redisClient = createMockRedisClient();
    const options = createMockOptions(
      'StorageFileReleasePostProcessors',
      'stream:event:deleted',
    );

    postProcessor = new EventDeletedPostProcessor(
      redisClient,
      options,
      mockFileRepo as never as PostgresFileRepository,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('shouldProcess', () => {
    it('should return true for EventEventMessagingType.EVENT_DELETED', () => {
      const result = postProcessor['shouldProcess'](
        EventEventMessagingType.EVENT_DELETED,
      );
      expect(result).toBe(true);
    });

    it('should return false for other event types', () => {
      const result = postProcessor['shouldProcess']('event.created');
      expect(result).toBe(false);
    });
  });

  describe('processEvents', () => {
    it('should release files for valid EVENT_DELETED event', async () => {
      const eventId = '11111111-1111-1111-1111-111111111111';
      const userId = '22222222-2222-2222-2222-222222222222';
      const batchItem = FileAttachmentEventsFactory.buildEventDeletedBatchItem({
        eventId,
        userId,
      });

      mockFileRepo.releaseForEntity.mockResolvedValueOnce({
        releasedFileIds: ['file-cover-1'],
        tombstoneCreated: true,
      });

      await postProcessor['processEvents']([batchItem]);

      expect(mockFileRepo.releaseForEntity).toHaveBeenCalledTimes(1);
      expect(mockFileRepo.releaseForEntity).toHaveBeenCalledWith({
        entityType: EntityType.EVENT_COVER,
        entityId: eventId,
      });
    });

    it('should skip processing when payload is missing eventId without throwing', async () => {
      const batchItem = FileAttachmentEventsFactory.buildEventDeletedBatchItem({
        eventId: '',
      });

      await expect(
        postProcessor['processEvents']([batchItem]),
      ).resolves.not.toThrow();

      expect(mockFileRepo.releaseForEntity).not.toHaveBeenCalled();
    });

    it('should skip processing when event payload is not an object without throwing', async () => {
      const batchItem =
        FileAttachmentEventsFactory.buildEventDeletedBatchItem();
      (batchItem.event as unknown as { payload: unknown }).payload = null;

      await expect(
        postProcessor['processEvents']([batchItem]),
      ).resolves.not.toThrow();

      expect(mockFileRepo.releaseForEntity).not.toHaveBeenCalled();
    });

    it('should rethrow error if fileRepository.releaseForEntity throws', async () => {
      const batchItem =
        FileAttachmentEventsFactory.buildEventDeletedBatchItem();
      const testError = new Error('Database transaction failed on release');

      mockFileRepo.releaseForEntity.mockRejectedValueOnce(testError);

      await expect(postProcessor['processEvents']([batchItem])).rejects.toThrow(
        'Database transaction failed on release',
      );
    });
  });
});
