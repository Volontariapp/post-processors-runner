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
import { CoverStatus } from '@volontariapp/contracts';
import type { PostgresEventRepository } from '@volontariapp/domain-event';
import type { DataSource } from 'typeorm';
import type { Redis } from 'ioredis';
import type { PostProcessorOptions } from '@volontariapp/post-processors';
import { StorageCoverEventsFactory } from '../factories/storage-cover-events.factory.js';
import {
  createMockDb,
  createMockRedisClient,
  createMockOptions,
  createMockEventQueueRepository,
} from '../mocks/user-deleted.post-processor.mock.js';

interface IMockPostgresEventRepository {
  applyCoverResult: jest.Mock;
}

function createMockEventRepo(): IMockPostgresEventRepository {
  return {
    applyCoverResult: jest.fn(),
  };
}

describe('Storage Cover Post-Processors (event)', () => {
  let mockEventRepo: IMockPostgresEventRepository;
  let mockDb: jest.Mocked<DataSource>;
  let mockRedis: jest.Mocked<Redis>;
  let mockOptions: PostProcessorOptions;

  beforeEach(() => {
    mockEventRepo = createMockEventRepo();
    mockDb = createMockDb(createMockEventQueueRepository());
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
        mockEventRepo as unknown as PostgresEventRepository,
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
        expect(processor['shouldProcess']('event.created')).toBe(false);
      });
    });

    describe('processEvents', () => {
      it('should apply COVER_STATUS_READY when entityType is EVENT_COVER', async () => {
        const item = StorageCoverEventsFactory.buildFileScannedItem({
          fileId: 'file-123',
          entityId: 'event-456',
          entityType: StorageEntityType.EVENT_COVER,
        });

        mockEventRepo.applyCoverResult.mockResolvedValue({
          id: 'event-456',
          coverFileId: 'file-123',
          coverStatus: CoverStatus.COVER_STATUS_READY,
        } as never);

        await processor['processEvents']([item]);

        expect(mockEventRepo.applyCoverResult).toHaveBeenCalledTimes(1);
        expect(mockEventRepo.applyCoverResult).toHaveBeenCalledWith(
          'event-456',
          'file-123',
          CoverStatus.COVER_STATUS_READY,
        );
      });

      it('should support direct payload not wrapped in { after }', async () => {
        const item = StorageCoverEventsFactory.buildFileScannedItem();
        const innerPayload = item.event.payload.after;
        (item.event as unknown as { payload: unknown }).payload = innerPayload;

        mockEventRepo.applyCoverResult.mockResolvedValue({
          id: 'event-456',
          coverFileId: 'file-123',
          coverStatus: CoverStatus.COVER_STATUS_READY,
        } as never);

        await processor['processEvents']([item]);

        expect(mockEventRepo.applyCoverResult).toHaveBeenCalledTimes(1);
        expect(mockEventRepo.applyCoverResult).toHaveBeenCalledWith(
          'event-456',
          'file-123',
          CoverStatus.COVER_STATUS_READY,
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
        mockEventRepo as unknown as PostgresEventRepository,
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
      });
    });

    describe('processEvents', () => {
      it('should apply COVER_STATUS_REJECTED when entityType is EVENT_COVER', async () => {
        const item = StorageCoverEventsFactory.buildFileRejectedItem({
          fileId: 'file-virus',
          entityId: 'event-456',
          entityType: StorageEntityType.EVENT_COVER,
        });

        mockEventRepo.applyCoverResult.mockResolvedValue({
          id: 'event-456',
          coverFileId: 'file-virus',
          coverStatus: CoverStatus.COVER_STATUS_REJECTED,
        } as never);

        await processor['processEvents']([item]);

        expect(mockEventRepo.applyCoverResult).toHaveBeenCalledTimes(1);
        expect(mockEventRepo.applyCoverResult).toHaveBeenCalledWith(
          'event-456',
          'file-virus',
          CoverStatus.COVER_STATUS_REJECTED,
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
        mockEventRepo as unknown as PostgresEventRepository,
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
      });
    });

    describe('processEvents', () => {
      it('should apply COVER_STATUS_REJECTED when attachment is rejected', async () => {
        const item = StorageCoverEventsFactory.buildAttachmentRejectedItem({
          fileId: 'file-not-found',
          entityId: 'event-456',
          entityType: StorageEntityType.EVENT_COVER,
        });

        mockEventRepo.applyCoverResult.mockResolvedValue({
          id: 'event-456',
          coverFileId: 'file-not-found',
          coverStatus: CoverStatus.COVER_STATUS_REJECTED,
        } as never);

        await processor['processEvents']([item]);

        expect(mockEventRepo.applyCoverResult).toHaveBeenCalledTimes(1);
        expect(mockEventRepo.applyCoverResult).toHaveBeenCalledWith(
          'event-456',
          'file-not-found',
          CoverStatus.COVER_STATUS_REJECTED,
        );
      });
    });
  });

  describe('Shared Edge Cases across Cover Processors', () => {
    let processor: StorageFileScannedPostProcessor;

    beforeEach(() => {
      processor = new StorageFileScannedPostProcessor(
        mockDb,
        mockRedis,
        mockOptions,
        mockEventRepo as unknown as PostgresEventRepository,
      );
    });

    it('should ignore events where entityType is POST without calling repo', async () => {
      const item = StorageCoverEventsFactory.buildFileScannedItem({
        entityType: StorageEntityType.POST,
        entityId: 'post-999',
      });

      await processor['processEvents']([item]);

      expect(mockEventRepo.applyCoverResult).not.toHaveBeenCalled();
    });

    it('should ignore events where entityType is USER_AVATAR without calling repo', async () => {
      const item = StorageCoverEventsFactory.buildFileScannedItem({
        entityType: StorageEntityType.USER_AVATAR,
        entityId: 'user-999',
      });

      await processor['processEvents']([item]);

      expect(mockEventRepo.applyCoverResult).not.toHaveBeenCalled();
    });

    it('should handle cover replaced during scan (fileId !== current coverFileId) gracefully', async () => {
      const item = StorageCoverEventsFactory.buildFileScannedItem({
        fileId: 'old-file-1',
        entityId: 'event-456',
        entityType: StorageEntityType.EVENT_COVER,
      });

      // The repository returns the event which now has a different coverFileId
      mockEventRepo.applyCoverResult.mockResolvedValue({
        id: 'event-456',
        coverFileId: 'new-file-2',
        coverStatus: CoverStatus.COVER_STATUS_PENDING,
      } as never);

      await expect(processor['processEvents']([item])).resolves.not.toThrow();
      expect(mockEventRepo.applyCoverResult).toHaveBeenCalledWith(
        'event-456',
        'old-file-1',
        CoverStatus.COVER_STATUS_READY,
      );
    });

    it('should handle non-existent event in DB (404) with warning and without throwing', async () => {
      const item = StorageCoverEventsFactory.buildFileScannedItem({
        fileId: 'file-123',
        entityId: 'unknown-event',
        entityType: StorageEntityType.EVENT_COVER,
      });

      mockEventRepo.applyCoverResult.mockResolvedValue(null as never);

      await expect(processor['processEvents']([item])).resolves.not.toThrow();
      expect(mockEventRepo.applyCoverResult).toHaveBeenCalledWith(
        'unknown-event',
        'file-123',
        CoverStatus.COVER_STATUS_READY,
      );
    });

    it('should skip invalid payloads missing fileId without throwing', async () => {
      const item = StorageCoverEventsFactory.buildFileScannedItem({
        fileId: '',
      });

      await expect(processor['processEvents']([item])).resolves.not.toThrow();
      expect(mockEventRepo.applyCoverResult).not.toHaveBeenCalled();
    });

    it('should skip invalid payloads missing entityId without throwing', async () => {
      const item = StorageCoverEventsFactory.buildFileScannedItem({
        entityId: '',
      });

      await expect(processor['processEvents']([item])).resolves.not.toThrow();
      expect(mockEventRepo.applyCoverResult).not.toHaveBeenCalled();
    });

    it('should skip non-object payloads without throwing', async () => {
      const item = StorageCoverEventsFactory.buildFileScannedItem();
      (item.event as unknown as { payload: unknown }).payload = null;

      await expect(processor['processEvents']([item])).resolves.not.toThrow();
      expect(mockEventRepo.applyCoverResult).not.toHaveBeenCalled();
    });

    it('should rethrow database errors for retry / DLQ handling', async () => {
      const item = StorageCoverEventsFactory.buildFileScannedItem({
        fileId: 'file-123',
        entityId: 'event-456',
        entityType: StorageEntityType.EVENT_COVER,
      });

      const dbError = new Error('Database connection failed');
      mockEventRepo.applyCoverResult.mockRejectedValue(dbError as never);

      await expect(processor['processEvents']([item])).rejects.toThrow(
        'Database connection failed',
      );
    });
  });
});
