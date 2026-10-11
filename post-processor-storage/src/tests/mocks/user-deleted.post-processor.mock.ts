import { jest } from '@jest/globals';
import type { Redis } from 'ioredis';
import type { PostProcessorOptions } from '@volontariapp/post-processors';

export interface IMockFileRepository {
  markFilesForDeletionByOwner: jest.Mock;
}

export function createMockFileRepository(): IMockFileRepository {
  return {
    markFilesForDeletionByOwner: jest
      .fn()
      .mockResolvedValue(['file-1', 'file-2'] as never),
  };
}

export interface IMockEventQueueRepository {
  create: jest.Mock;
  save: jest.Mock;
}

export function createMockEventQueueRepository(): IMockEventQueueRepository {
  return {
    create: jest.fn().mockImplementation((entity) => entity),
    save: jest.fn().mockImplementation((entities) => Promise.resolve(entities)),
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

export function createMockOptions(): PostProcessorOptions {
  return {
    groupName: 'TestGroup',
    streamName: 'user:deleted:storage',
    batchSize: 10,
    blockMs: 1000,
    idempotencyTtlSeconds: 3600,
  };
}
