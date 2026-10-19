import 'reflect-metadata';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import { JobsOutboxEntity, type JobsOutboxModel } from '@volontariapp/database';
import { JobsOutboxRepository } from '@volontariapp/outbox';
import { RankingListKind } from '@volontariapp/domain-ranking';
import { createMock } from '@volontariapp/testing';
import type { CustomConfig } from '../../config/custom-config.js';
import { RankingJobWriter } from '../../domain/ranking-job-writer.js';
import { createMockRequestService } from '../mocks/ranking.mock.js';

const USER = '11111111-1111-4111-a111-111111111111';
const REQUESTED_AT = '2026-10-19 10:00:00.123456+00';

describe('RankingJobWriter (Unit)', () => {
  const requestService = createMockRequestService();
  let manager: jest.Mocked<EntityManager>;
  let dataSource: jest.Mocked<DataSource>;
  let writer: RankingJobWriter;
  let transactionSpy: jest.SpiedFunction<DataSource['transaction']>;
  let createSpy: jest.SpiedFunction<JobsOutboxRepository['create']>;

  beforeEach(() => {
    manager = createMock<EntityManager>();
    dataSource = createMock<DataSource>();
    transactionSpy = jest
      .spyOn(dataSource, 'transaction')
      .mockImplementation((work: unknown) =>
        (work as (entityManager: EntityManager) => Promise<unknown>)(manager),
      );
    jest
      .spyOn(manager, 'getRepository')
      .mockReturnValue(createMock<Repository<JobsOutboxModel>>());
    createSpy = jest
      .spyOn(JobsOutboxRepository.prototype, 'create')
      .mockResolvedValue(
        JobsOutboxEntity.createJob({
          type: 'ranking.fanout',
          emitter: 'ms-ranking',
          emitterId: USER,
          target: 'ranking-queue',
          payload: { trigger: 'EVENT_CREATED', requestedAt: REQUESTED_AT },
        }),
      );
    jest.spyOn(requestService, 'databaseClock').mockResolvedValue(REQUESTED_AT);
    writer = new RankingJobWriter(dataSource, requestService, {
      ranking: { requestTtlSeconds: 120, debounceSeconds: 30 },
    } as CustomConfig);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('writes one delayed job per list on its background queue, in a single transaction', async () => {
    const requestSpy = jest
      .spyOn(requestService, 'requestCompute')
      .mockResolvedValue({ requestedAt: REQUESTED_AT, needsJob: true });
    const before = Date.now();

    await writer.requestCompute([
      { userId: USER, listKind: RankingListKind.EVENT, reason: 'USER_CREATED' },
      { userId: USER, listKind: RankingListKind.POST, reason: 'USER_CREATED' },
    ]);

    expect(transactionSpy).toHaveBeenCalledTimes(1);
    expect(requestSpy.mock.calls[0]?.[0]).toEqual({
      userId: USER,
      listKind: 'EVENT',
      reason: 'USER_CREATED',
      force: false,
      ttlSeconds: 120,
    });
    const [events, posts] = createSpy.mock.calls.map((call) => call[0]);
    expect(events.type).toBe('ranking.compute_user_ranking');
    expect(events.target).toBe('ranking-queue');
    expect(posts.type).toBe('ranking.compute_user_feed');
    expect(posts.target).toBe('ranking-feed-queue');
    expect(events.payload).toEqual({
      userId: USER,
      reason: 'USER_CREATED',
      requestedAt: REQUESTED_AT,
    });
    expect(events.scheduledAt?.getTime()).toBeGreaterThanOrEqual(
      before + 30_000,
    );
  });

  it('writes no job when a recent one already covers the request', async () => {
    jest
      .spyOn(requestService, 'requestCompute')
      .mockResolvedValue({ requestedAt: REQUESTED_AT, needsJob: false });

    await writer.requestCompute([
      { userId: USER, listKind: RankingListKind.EVENT, reason: 'WISH_CHANGED' },
    ]);

    expect(createSpy).not.toHaveBeenCalled();
  });

  it('routes the post fan-out to the feed queue and the event fan-outs to the ranking queue', async () => {
    await writer.enqueueFanout({
      trigger: 'POST_CREATED',
      subjectId: 'post-1',
      postId: 'post-1',
      authorId: USER,
    });
    await writer.enqueueFanout({
      trigger: 'EVENT_FINISHED',
      subjectId: 'event-1',
      eventId: 'event-1',
    });

    const [post, event] = createSpy.mock.calls.map((call) => call[0]);
    expect(post.type).toBe('ranking.fanout');
    expect(post.target).toBe('ranking-feed-queue');
    expect(post.emitterId).toBe('post-1');
    expect(post.payload).toEqual({
      trigger: 'POST_CREATED',
      requestedAt: REQUESTED_AT,
      postId: 'post-1',
      authorId: USER,
    });
    expect(event.target).toBe('ranking-queue');
    expect(event.payload).toEqual({
      trigger: 'EVENT_FINISHED',
      requestedAt: REQUESTED_AT,
      eventId: 'event-1',
    });
  });
});
