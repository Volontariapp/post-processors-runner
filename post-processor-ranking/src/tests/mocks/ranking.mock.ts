import { createMock } from '@volontariapp/testing';
import type { jest } from '@jest/globals';
import type { Redis } from 'ioredis';
import type { PostProcessorOptions } from '@volontariapp/post-processors';
import type {
  RankingLikeLogService,
  RankingMentionService,
  RankingPurgeService,
  RankingRequestService,
  RankingWishService,
} from '@volontariapp/domain-ranking';
import type { RankingJobWriter } from '../../domain/ranking-job-writer.js';

export const createMockRedis = (): jest.Mocked<Redis> => createMock<Redis>();

export const createMockOptions = (): PostProcessorOptions => ({
  groupName: 'TestGroup',
  streamName: 'test:stream',
  batchSize: 10,
  blockMs: 1000,
  idempotencyTtlSeconds: 3600,
});

export const createMockJobWriter = (): jest.Mocked<RankingJobWriter> =>
  createMock<RankingJobWriter>();

export const createMockWishService = (): jest.Mocked<RankingWishService> =>
  createMock<RankingWishService>();

export const createMockMentionService =
  (): jest.Mocked<RankingMentionService> => createMock<RankingMentionService>();

export const createMockLikeLogService =
  (): jest.Mocked<RankingLikeLogService> => createMock<RankingLikeLogService>();

export const createMockPurgeService = (): jest.Mocked<RankingPurgeService> =>
  createMock<RankingPurgeService>();

export const createMockRequestService =
  (): jest.Mocked<RankingRequestService> => createMock<RankingRequestService>();

export interface IMockEventQueueRepository {
  create: jest.Mock;
  save: jest.Mock;
}
