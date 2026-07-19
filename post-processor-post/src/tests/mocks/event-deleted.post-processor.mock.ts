import { jest } from '@jest/globals';
import type { PostService } from '@volontariapp/domain-post';
import type { EventQueueModel } from '@volontariapp/database';
import type { Repository } from 'typeorm';
import type { Redis } from 'ioredis';
import type { PostProcessorOptions } from '@volontariapp/post-processors';
import { createMockLogger } from '@volontariapp/testing';

export function createMockPostService(): jest.Mocked<PostService> {
  return {
    deleteByEventId: (
      jest.fn() as unknown as jest.MockedFunction<
        (eventId: string) => Promise<number>
      >
    ).mockResolvedValue(1),
    findById: jest.fn<PostService['findById']>(),
    findByAuthorId: jest.fn<PostService['findByAuthorId']>(),
    findAll: jest.fn<PostService['findAll']>(),
    listPosts: jest.fn<PostService['listPosts']>(),
    create: jest.fn<PostService['create']>(),
    update: jest.fn<PostService['update']>(),
    updateSaga: jest.fn<PostService['updateSaga']>(),
    delete: jest.fn<PostService['delete']>(),
    deleteByAuthorId: jest.fn<PostService['deleteByAuthorId']>(),
  } as unknown as jest.Mocked<PostService>;
}

export function createMockEventQueueRepository(): jest.Mocked<
  Repository<EventQueueModel>
> {
  const repo = {
    create: jest.fn().mockImplementation((entity) => entity),
    save: jest.fn(),
    insert: jest.fn(),
  } as unknown as jest.Mocked<Repository<EventQueueModel>>;

  (repo.save as jest.Mock).mockImplementation(() => Promise.resolve([]));
  (repo.insert as jest.Mock).mockImplementation(() =>
    Promise.resolve({ identifiers: [], generatedMaps: [], raw: [] }),
  );

  return repo;
}

export function createMockRedisClient(): jest.Mocked<Redis> {
  const mockRedis = {
    call: jest.fn<Redis['call']>().mockResolvedValue('OK'),
    xack: jest.fn<Redis['xack']>().mockResolvedValue(1),
    xadd: jest.fn<Redis['xadd']>().mockResolvedValue('1700000000000-0'),
    duplicate: jest.fn<Redis['duplicate']>(),
  } as unknown as jest.Mocked<Redis>;

  (mockRedis.duplicate as jest.Mock).mockReturnValue(mockRedis);
  return mockRedis;
}

export function createMockOptions(): PostProcessorOptions {
  return {
    groupName: 'TestGroup',
    streamName: 'event:deleted',
    batchSize: 10,
    blockMs: 1000,
    idempotencyTtlSeconds: 3600,
  };
}

export { createMockLogger };
