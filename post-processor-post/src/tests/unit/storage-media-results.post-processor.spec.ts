import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import { StorageFileScannedPostProcessor } from '../../post-processors/storage-file-scanned.post-processor.js';
import { StorageFileRejectedPostProcessor } from '../../post-processors/storage-file-rejected.post-processor.js';
import { StorageAttachmentRejectedPostProcessor } from '../../post-processors/storage-attachment-rejected.post-processor.js';
import {
  StorageEventMessagingType,
  StorageEntityType,
} from '@volontariapp/messaging';
import {
  PostMediaScanStatus,
  type PostgresPostRepository,
} from '@volontariapp/domain-post';
import type { DataSource } from 'typeorm';
import type { Redis } from 'ioredis';
import type { PostProcessorOptions } from '@volontariapp/post-processors';
import { StorageMediaEventsFactory } from '../factories/storage-media-events.factory.js';
import {
  createMockDb,
  createMockRedisClient,
  createMockOptions,
} from '../mocks/user-deleted.post-processor.mock.js';

interface IMockPostRepository {
  updateMediaScanStatus: jest.Mock;
}

function createMockPostRepo(): IMockPostRepository {
  return {
    updateMediaScanStatus: jest.fn(),
  };
}

describe('Storage Media Post-Processors (post)', () => {
  let mockPostRepo: IMockPostRepository;
  let mockDb: jest.Mocked<DataSource>;
  let mockRedis: jest.Mocked<Redis>;
  let mockOptions: PostProcessorOptions;

  beforeEach(() => {
    mockPostRepo = createMockPostRepo();
    mockDb = createMockDb(mockPostRepo);
    mockRedis = createMockRedisClient();
    mockOptions = createMockOptions();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('StorageFileScannedPostProcessor', () => {
    let processor: StorageFileScannedPostProcessor;

    beforeEach(() => {
      processor = new StorageFileScannedPostProcessor(
        mockDb,
        mockRedis,
        mockOptions,
        mockPostRepo as unknown as PostgresPostRepository,
      );
    });

    describe('shouldProcess', () => {
      it('should return true for FILE_SCANNED', () => {
        expect(
          processor['shouldProcess'](StorageEventMessagingType.FILE_SCANNED),
        ).toBe(true);
      });

      it('should return false for other types', () => {
        expect(
          processor['shouldProcess'](StorageEventMessagingType.FILE_REJECTED),
        ).toBe(false);
        expect(processor['shouldProcess']('post.created')).toBe(false);
      });
    });

    describe('processEvents', () => {
      it('should apply PostMediaScanStatus.CLEAN when entityType is POST', async () => {
        const item = StorageMediaEventsFactory.buildFileScannedItem({
          fileId: 'file-123',
          entityId: 'post-456',
          entityType: StorageEntityType.POST,
        });

        mockPostRepo.updateMediaScanStatus.mockResolvedValue({
          id: 'post-456',
        } as never);

        await processor['processEvents']([item]);

        expect(mockPostRepo.updateMediaScanStatus).toHaveBeenCalledTimes(1);
        expect(mockPostRepo.updateMediaScanStatus).toHaveBeenCalledWith(
          'post-456',
          'file-123',
          PostMediaScanStatus.CLEAN,
        );
      });
    });
  });

  describe('StorageFileRejectedPostProcessor', () => {
    let processor: StorageFileRejectedPostProcessor;

    beforeEach(() => {
      processor = new StorageFileRejectedPostProcessor(
        mockDb,
        mockRedis,
        mockOptions,
        mockPostRepo as unknown as PostgresPostRepository,
      );
    });

    describe('shouldProcess', () => {
      it('should return true for FILE_REJECTED', () => {
        expect(
          processor['shouldProcess'](StorageEventMessagingType.FILE_REJECTED),
        ).toBe(true);
      });

      it('should return false for other types', () => {
        expect(
          processor['shouldProcess'](StorageEventMessagingType.FILE_SCANNED),
        ).toBe(false);
        expect(processor['shouldProcess']('post.created')).toBe(false);
      });
    });

    describe('processEvents', () => {
      it('should apply PostMediaScanStatus.REJECTED when entityType is POST', async () => {
        const item = StorageMediaEventsFactory.buildFileRejectedItem({
          fileId: 'file-virus',
          entityId: 'post-456',
          entityType: StorageEntityType.POST,
        });

        mockPostRepo.updateMediaScanStatus.mockResolvedValue({
          id: 'post-456',
        } as never);

        await processor['processEvents']([item]);

        expect(mockPostRepo.updateMediaScanStatus).toHaveBeenCalledTimes(1);
        expect(mockPostRepo.updateMediaScanStatus).toHaveBeenCalledWith(
          'post-456',
          'file-virus',
          PostMediaScanStatus.REJECTED,
        );
      });
    });
  });

  describe('StorageAttachmentRejectedPostProcessor', () => {
    let processor: StorageAttachmentRejectedPostProcessor;

    beforeEach(() => {
      processor = new StorageAttachmentRejectedPostProcessor(
        mockDb,
        mockRedis,
        mockOptions,
        mockPostRepo as unknown as PostgresPostRepository,
      );
    });

    describe('shouldProcess', () => {
      it('should return true for ATTACHMENT_REJECTED', () => {
        expect(
          processor['shouldProcess'](
            StorageEventMessagingType.ATTACHMENT_REJECTED,
          ),
        ).toBe(true);
      });

      it('should return false for other types', () => {
        expect(
          processor['shouldProcess'](StorageEventMessagingType.FILE_SCANNED),
        ).toBe(false);
        expect(processor['shouldProcess']('post.created')).toBe(false);
      });
    });

    describe('processEvents', () => {
      it('should apply PostMediaScanStatus.REJECTED when attachment is rejected', async () => {
        const item = StorageMediaEventsFactory.buildAttachmentRejectedItem({
          fileId: 'file-not-found',
          entityId: 'post-456',
          entityType: StorageEntityType.POST,
        });

        mockPostRepo.updateMediaScanStatus.mockResolvedValue({
          id: 'post-456',
        } as never);

        await processor['processEvents']([item]);

        expect(mockPostRepo.updateMediaScanStatus).toHaveBeenCalledTimes(1);
        expect(mockPostRepo.updateMediaScanStatus).toHaveBeenCalledWith(
          'post-456',
          'file-not-found',
          PostMediaScanStatus.REJECTED,
        );
      });
    });
  });

  describe('Shared Edge Cases across Media Processors', () => {
    let processor: StorageFileScannedPostProcessor;

    beforeEach(() => {
      processor = new StorageFileScannedPostProcessor(
        mockDb,
        mockRedis,
        mockOptions,
        mockPostRepo as unknown as PostgresPostRepository,
      );
    });

    it('should ignore events where entityType is EVENT_COVER without calling repo', async () => {
      const item = StorageMediaEventsFactory.buildFileScannedItem({
        fileId: 'file-123',
        entityId: 'event-999',
        entityType: StorageEntityType.EVENT_COVER,
      });

      await processor['processEvents']([item]);

      expect(mockPostRepo.updateMediaScanStatus).not.toHaveBeenCalled();
    });

    it('should ignore events where entityType is USER_AVATAR without calling repo', async () => {
      const item = StorageMediaEventsFactory.buildFileScannedItem({
        fileId: 'file-123',
        entityId: 'user-999',
        entityType: StorageEntityType.USER_AVATAR,
      });

      await processor['processEvents']([item]);

      expect(mockPostRepo.updateMediaScanStatus).not.toHaveBeenCalled();
    });

    it('should handle non-existent post in DB (404) with warning and without throwing', async () => {
      const item = StorageMediaEventsFactory.buildFileScannedItem({
        fileId: 'file-123',
        entityId: 'unknown-post',
        entityType: StorageEntityType.POST,
      });

      mockPostRepo.updateMediaScanStatus.mockResolvedValue(null as never);

      await expect(processor['processEvents']([item])).resolves.not.toThrow();
      expect(mockPostRepo.updateMediaScanStatus).toHaveBeenCalledWith(
        'unknown-post',
        'file-123',
        PostMediaScanStatus.CLEAN,
      );
    });

    it('should skip invalid payloads missing fileId without throwing', async () => {
      const item = StorageMediaEventsFactory.buildFileScannedItem({
        fileId: '',
      });

      await expect(processor['processEvents']([item])).resolves.not.toThrow();
      expect(mockPostRepo.updateMediaScanStatus).not.toHaveBeenCalled();
    });

    it('should skip invalid payloads missing entityId without throwing', async () => {
      const item = StorageMediaEventsFactory.buildFileScannedItem({
        entityId: '',
      });

      await expect(processor['processEvents']([item])).resolves.not.toThrow();
      expect(mockPostRepo.updateMediaScanStatus).not.toHaveBeenCalled();
    });

    it('should skip non-object payloads without throwing', async () => {
      const item = StorageMediaEventsFactory.buildFileScannedItem();
      (item.event as unknown as { payload: unknown }).payload = null;

      await expect(processor['processEvents']([item])).resolves.not.toThrow();
      expect(mockPostRepo.updateMediaScanStatus).not.toHaveBeenCalled();
    });

    it('should rethrow database errors for retry / DLQ handling', async () => {
      const item = StorageMediaEventsFactory.buildFileScannedItem({
        fileId: 'file-123',
        entityId: 'post-456',
        entityType: StorageEntityType.POST,
      });

      const dbError = new Error('Database connection failed');
      mockPostRepo.updateMediaScanStatus.mockRejectedValue(dbError as never);

      await expect(processor['processEvents']([item])).rejects.toThrow(
        'Database connection failed',
      );
    });
  });
});
