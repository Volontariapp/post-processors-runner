import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import { EventCreatedPostProcessor } from '../../post-processors/event-created.post-processor.js';
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

describe('EventCreatedPostProcessor', () => {
  let postProcessor: EventCreatedPostProcessor;
  let mockFileRepo: IMockFileRepository;

  beforeEach(() => {
    mockFileRepo = createMockFileRepository();
    const redisClient = createMockRedisClient();
    const options = createMockOptions(
      'StorageEventCreatedPostProcessors',
      'stream:event:created',
    );

    postProcessor = new EventCreatedPostProcessor(
      redisClient,
      options,
      mockFileRepo as never as PostgresFileRepository,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('shouldProcess', () => {
    it('should return true for EventEventMessagingType.EVENT_CREATED', () => {
      const result = postProcessor['shouldProcess'](
        EventEventMessagingType.EVENT_CREATED,
      );
      expect(result).toBe(true);
    });

    it('should return false for other event types', () => {
      const result = postProcessor['shouldProcess']('post.created');
      expect(result).toBe(false);
    });
  });

  describe('processEvents', () => {
    it('should attach cover file for valid EVENT_CREATED event', async () => {
      const eventId = '11111111-1111-1111-1111-111111111111';
      const userId = '22222222-2222-2222-2222-222222222222';
      const coverFileId = '33333333-3333-3333-3333-333333333333';

      const batchItem = FileAttachmentEventsFactory.buildEventCreatedBatchItem({
        eventId,
        userId,
        coverFileId,
      });

      await postProcessor['processEvents']([batchItem]);

      expect(mockFileRepo.attachFromConfirmationEvent).toHaveBeenCalledTimes(1);
      expect(mockFileRepo.attachFromConfirmationEvent).toHaveBeenCalledWith({
        fileIds: [coverFileId],
        entityType: EntityType.EVENT_COVER,
        entityId: eventId,
        ownerId: userId,
      });
    });

    it('should skip processing if eventId is missing', async () => {
      const batchItem = FileAttachmentEventsFactory.buildEventCreatedBatchItem({
        eventId: '',
        userId: '22222222-2222-2222-2222-222222222222',
        coverFileId: '33333333-3333-3333-3333-333333333333',
      });

      await postProcessor['processEvents']([batchItem]);

      expect(mockFileRepo.attachFromConfirmationEvent).not.toHaveBeenCalled();
    });

    it('should skip processing if userId is missing', async () => {
      const batchItem = FileAttachmentEventsFactory.buildEventCreatedBatchItem({
        eventId: '11111111-1111-1111-1111-111111111111',
        userId: '',
        coverFileId: '33333333-3333-3333-3333-333333333333',
      });

      await postProcessor['processEvents']([batchItem]);

      expect(mockFileRepo.attachFromConfirmationEvent).not.toHaveBeenCalled();
    });

    it('should skip processing if coverFileId is missing', async () => {
      const batchItem = FileAttachmentEventsFactory.buildEventCreatedBatchItem({
        eventId: '11111111-1111-1111-1111-111111111111',
        userId: '22222222-2222-2222-2222-222222222222',
        coverFileId: undefined,
      });

      await postProcessor['processEvents']([batchItem]);

      expect(mockFileRepo.attachFromConfirmationEvent).not.toHaveBeenCalled();
    });

    it('should rethrow error if attachFromConfirmationEvent fails', async () => {
      const testError = new Error('Database error on attach cover');
      mockFileRepo.attachFromConfirmationEvent.mockRejectedValueOnce(testError);

      const batchItem =
        FileAttachmentEventsFactory.buildEventCreatedBatchItem();

      await expect(postProcessor['processEvents']([batchItem])).rejects.toThrow(
        'Database error on attach cover',
      );
    });
  });
});
