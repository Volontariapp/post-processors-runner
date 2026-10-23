import { jest } from '@jest/globals';
import type { Redis } from 'ioredis';
import type { PostProcessorOptions } from '@volontariapp/post-processors';
import {
  FileAttachmentOutcome,
  type FileAttachmentResult,
} from '@volontariapp/domain-storage';

export interface IMockFileRepository {
  attachFromConfirmationEvent: jest.Mock;
  releaseForEntity: jest.Mock;
  releaseFile: jest.Mock;
}

export function createMockFileRepository(): IMockFileRepository {
  const defaultResults: FileAttachmentResult[] = [
    {
      fileId: 'file-123',
      outcome: FileAttachmentOutcome.ATTACHED,
      scanEventEmitted: false,
    },
  ];

  return {
    attachFromConfirmationEvent: jest
      .fn()
      .mockResolvedValue(defaultResults as never),
    releaseForEntity: jest.fn().mockResolvedValue({
      releasedFileIds: ['file-123'],
      tombstoneCreated: true,
    } as never),
    releaseFile: jest.fn().mockResolvedValue(true as never),
  };
}

export function createMockRedisClient(): jest.Mocked<Redis> {
  const mockRedis = {
    call: jest.fn<Redis['call']>().mockResolvedValue('OK'),
    xack: jest.fn<Redis['xack']>().mockResolvedValue(1),
    xadd: jest.fn<Redis['xadd']>().mockResolvedValue('1700000000000-0'),
    duplicate: jest.fn<Redis['duplicate']>(),
  } as never as jest.Mocked<Redis>;

  (mockRedis.duplicate as jest.Mock).mockReturnValue(mockRedis);
  return mockRedis;
}

export function createMockOptions(
  groupName = 'TestAttachmentGroup',
  streamName = 'test:attachment:stream',
): PostProcessorOptions {
  return {
    groupName,
    streamName,
    batchSize: 10,
    blockMs: 1000,
    idempotencyTtlSeconds: 3600,
  };
}
