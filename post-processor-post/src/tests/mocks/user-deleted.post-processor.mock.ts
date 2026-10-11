import { jest } from '@jest/globals';
import {
  PostService,
  CommentService,
  type IPostRepository,
  type ICommentRepository,
} from '@volontariapp/domain-post';
import type { Redis } from 'ioredis';
import type { PostProcessorOptions } from '@volontariapp/post-processors';

export function createMockPostRepository(): IPostRepository {
  return {
    findById: jest.fn<IPostRepository['findById']>(),
    findByAuthorId: jest.fn<IPostRepository['findByAuthorId']>(),
    findAll: jest.fn<IPostRepository['findAll']>(),
    create: jest.fn<IPostRepository['create']>(),
    createWithPostCreated: jest.fn<IPostRepository['createWithPostCreated']>(),
    update: jest.fn<IPostRepository['update']>(),
    delete: jest.fn<IPostRepository['delete']>(),
    deleteWithPostDeleted: jest.fn<IPostRepository['deleteWithPostDeleted']>(),
    deleteByAuthorId: jest.fn<IPostRepository['deleteByAuthorId']>(),
    search: jest.fn<IPostRepository['search']>(),
    listPaginated: jest.fn<IPostRepository['listPaginated']>(),
    purgePostsByAuthor: jest.fn<IPostRepository['purgePostsByAuthor']>(),
  };
}

export function createMockCommentRepository(): ICommentRepository {
  return {
    findById: jest.fn<ICommentRepository['findById']>(),
    create: jest.fn<ICommentRepository['create']>(),
    createWithCommentCreated:
      jest.fn<ICommentRepository['createWithCommentCreated']>(),
    update: jest.fn<ICommentRepository['update']>(),
    delete: jest.fn<ICommentRepository['delete']>(),
    deleteWithCommentDeleted:
      jest.fn<ICommentRepository['deleteWithCommentDeleted']>(),
    listPaginatedByPostId:
      jest.fn<ICommentRepository['listPaginatedByPostId']>(),
    anonymizeCommentsByAuthor:
      jest.fn<ICommentRepository['anonymizeCommentsByAuthor']>(),
  };
}

export function createMockPostService(): PostService {
  return new PostService(createMockPostRepository());
}

export function createMockCommentService(): CommentService {
  return new CommentService(
    createMockCommentRepository(),
    createMockPostRepository(),
  );
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
    streamName: 'user:deleted:post',
    batchSize: 10,
    blockMs: 1000,
    idempotencyTtlSeconds: 3600,
  };
}
