import 'reflect-metadata';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import {
  RankingEventMessagingType,
  UserEventMessagingType,
} from '@volontariapp/messaging';
import type { EventQueueModel } from '@volontariapp/database';
import type { Repository } from 'typeorm';
import { UserDeletedPostProcessor } from '../../post-processors/users/user-deleted.post-processor.js';
import { buildBatchItem } from '../factories/event.factory.js';
import {
  createMockOptions,
  createMockPurgeService,
  createMockRedis,
  type IMockEventQueueRepository,
} from '../mocks/ranking.mock.js';

const USER = '11111111-1111-4111-a111-111111111111';

describe('UserDeletedPostProcessor (ranking, Unit)', () => {
  const purgeService = createMockPurgeService();
  let queue: IMockEventQueueRepository;
  let processor: UserDeletedPostProcessor;

  beforeEach(() => {
    queue = {
      create: jest.fn().mockImplementation((entity) => entity),
      save: jest
        .fn()
        .mockImplementation((entities) => Promise.resolve(entities)),
    };
    processor = new UserDeletedPostProcessor(
      createMockRedis(),
      createMockOptions(),
      purgeService,
      queue as never as Repository<EventQueueModel>,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('only handles user.deleted', () => {
    expect(
      processor['shouldProcess'](UserEventMessagingType.USER_DELETED),
    ).toBe(true);
    expect(processor['shouldProcess']('user.created')).toBe(false);
  });

  it('purges the account then acknowledges to the ws gather', async () => {
    const purgeSpy = jest
      .spyOn(purgeService, 'purgeUser')
      .mockResolvedValue({} as never);

    await processor['processEvents']([
      buildBatchItem(UserEventMessagingType.USER_DELETED, { id: USER }),
    ] as never);

    expect(purgeSpy).toHaveBeenCalledWith(USER);
    expect(queue.save).toHaveBeenCalledTimes(1);
    const saved = queue.save.mock.calls[0]?.[0] as Array<{
      type: string;
      payload: unknown;
      targetServices: string[];
    }>;
    expect(saved[0]?.type).toBe(RankingEventMessagingType.USER_RANKING_DELETED);
    expect(saved[0]?.payload).toEqual({ after: { userId: USER } });
    expect(saved[0]?.targetServices).toEqual(['ws:user-deleted-feedback']);
  });

  it('does not acknowledge when the purge fails, so the batch is retried', async () => {
    jest
      .spyOn(purgeService, 'purgeUser')
      .mockRejectedValue(new Error('db down'));

    await expect(
      processor['processEvents']([
        buildBatchItem(UserEventMessagingType.USER_DELETED, { id: USER }),
      ] as never),
    ).rejects.toThrow('db down');
    expect(queue.save).not.toHaveBeenCalled();
  });

  it('ignores a message without account id', async () => {
    const purgeSpy = jest.spyOn(purgeService, 'purgeUser');

    await processor['processEvents']([
      buildBatchItem(UserEventMessagingType.USER_DELETED, { id: '' }),
    ] as never);

    expect(purgeSpy).not.toHaveBeenCalled();
    expect(queue.save).not.toHaveBeenCalled();
  });
});
