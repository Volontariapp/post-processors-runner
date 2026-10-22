import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import { EventCoverReplacedPostProcessor } from '../../post-processors/event-cover-replaced.post-processor.js';
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

describe('EventCoverReplacedPostProcessor', () => {
  let postProcessor: EventCoverReplacedPostProcessor;
  let mockFileRepo: IMockFileRepository;

  beforeEach(() => {
    mockFileRepo = createMockFileRepository();
    const redisClient = createMockRedisClient();
    const options = createMockOptions(
      'StorageEventCoverReplacedPostProcessors',
      'stream:event:cover_replaced',
    );

    postProcessor = new EventCoverReplacedPostProcessor(
      redisClient,
      options,
      mockFileRepo as never as PostgresFileRepository,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('shouldProcess', () => {
    it('should return true for EventEventMessagingType.EVENT_COVER_REPLACED', () => {
      const result = postProcessor['shouldProcess'](
        EventEventMessagingType.EVENT_COVER_REPLACED,
      );
      expect(result).toBe(true);
    });

    it('should return false for other event types', () => {
      const result = postProcessor['shouldProcess']('event.created');
      expect(result).toBe(false);
    });
  });

  describe('processEvents', () => {
    it('should attach replaced cover file and release old file for valid EVENT_COVER_REPLACED event', async () => {
      const eventId = '11111111-1111-1111-1111-111111111111';
      const userId = '22222222-2222-2222-2222-222222222222';
      const newFileId = '33333333-3333-3333-3333-333333333333';
      const oldFileId = '44444444-4444-4444-4444-444444444444';

      const batchItem =
        FileAttachmentEventsFactory.buildEventCoverReplacedBatchItem({
          eventId,
          userId,
          newFileId,
          oldFileId,
        });

      await postProcessor['processEvents']([batchItem]);

      expect(mockFileRepo.releaseFile).toHaveBeenCalledTimes(1);
      expect(mockFileRepo.releaseFile).toHaveBeenCalledWith({
        fileId: oldFileId,
        entityType: EntityType.EVENT_COVER,
        entityId: eventId,
        ownerId: userId,
        newFileId,
      });

      expect(mockFileRepo.attachFromConfirmationEvent).toHaveBeenCalledTimes(1);
      expect(mockFileRepo.attachFromConfirmationEvent).toHaveBeenCalledWith({
        fileIds: [newFileId],
        entityType: EntityType.EVENT_COVER,
        entityId: eventId,
        ownerId: userId,
      });
    });

    it('should attach new cover without releasing if oldFileId is not provided', async () => {
      const eventId = '11111111-1111-1111-1111-111111111111';
      const userId = '22222222-2222-2222-2222-222222222222';
      const newFileId = '33333333-3333-3333-3333-333333333333';

      const batchItem =
        FileAttachmentEventsFactory.buildEventCoverReplacedBatchItem({
          eventId,
          userId,
          newFileId,
          oldFileId: undefined,
        });

      await postProcessor['processEvents']([batchItem]);

      expect(mockFileRepo.releaseFile).not.toHaveBeenCalled();
      expect(mockFileRepo.attachFromConfirmationEvent).toHaveBeenCalledTimes(1);
    });

    it('should release old cover even if newFileId is missing', async () => {
      const eventId = '11111111-1111-1111-1111-111111111111';
      const userId = '22222222-2222-2222-2222-222222222222';
      const oldFileId = '44444444-4444-4444-4444-444444444444';

      const batchItem =
        FileAttachmentEventsFactory.buildEventCoverReplacedBatchItem({
          eventId,
          userId,
          newFileId: undefined,
          oldFileId,
        });

      await postProcessor['processEvents']([batchItem]);

      expect(mockFileRepo.releaseFile).toHaveBeenCalledTimes(1);
      expect(mockFileRepo.releaseFile).toHaveBeenCalledWith({
        fileId: oldFileId,
        entityType: EntityType.EVENT_COVER,
        entityId: eventId,
        ownerId: userId,
        newFileId: undefined,
      });
      expect(mockFileRepo.attachFromConfirmationEvent).not.toHaveBeenCalled();
    });

    it('should skip processing if eventId is missing', async () => {
      const batchItem =
        FileAttachmentEventsFactory.buildEventCoverReplacedBatchItem({
          eventId: '',
          userId: '22222222-2222-2222-2222-222222222222',
          newFileId: '33333333-3333-3333-3333-333333333333',
        });

      await postProcessor['processEvents']([batchItem]);

      expect(mockFileRepo.releaseFile).not.toHaveBeenCalled();
      expect(mockFileRepo.attachFromConfirmationEvent).not.toHaveBeenCalled();
    });

    it('should skip processing if userId is missing', async () => {
      const batchItem =
        FileAttachmentEventsFactory.buildEventCoverReplacedBatchItem({
          eventId: '11111111-1111-1111-1111-111111111111',
          userId: '',
          newFileId: '33333333-3333-3333-3333-333333333333',
        });

      await postProcessor['processEvents']([batchItem]);

      expect(mockFileRepo.releaseFile).not.toHaveBeenCalled();
      expect(mockFileRepo.attachFromConfirmationEvent).not.toHaveBeenCalled();
    });

    it('should rethrow error if releaseFile fails', async () => {
      const testError = new Error('Database error on release old cover');
      mockFileRepo.releaseFile.mockRejectedValueOnce(testError);

      const batchItem =
        FileAttachmentEventsFactory.buildEventCoverReplacedBatchItem();

      await expect(postProcessor['processEvents']([batchItem])).rejects.toThrow(
        'Database error on release old cover',
      );
    });

    it('should rethrow error if attachFromConfirmationEvent fails', async () => {
      const testError = new Error('Database error on replace cover');
      mockFileRepo.attachFromConfirmationEvent.mockRejectedValueOnce(testError);

      const batchItem =
        FileAttachmentEventsFactory.buildEventCoverReplacedBatchItem();

      await expect(postProcessor['processEvents']([batchItem])).rejects.toThrow(
        'Database error on replace cover',
      );
    });
  });
});
