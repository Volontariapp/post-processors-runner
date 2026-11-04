import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import type { Redis } from 'ioredis';
import type { Repository } from 'typeorm';
import type { EventQueueModel } from '@volontariapp/database';
import type { SocialUserService } from '@volontariapp/domain-social';
import { UserCreatedPostProcessor } from '../../post-processors/users/user-created.post-processor.js';
import {
  createMockRedisClient,
  createMockOptions,
} from '../mocks/event-deleted.post-processor.mock.js';
import {
  createMockSocialUserService,
  createMockUserDeletedEventQueueRepository,
  type IMockEventQueueRepository,
} from '../mocks/user-deleted.post-processor.mock.js';
import { UserCreatedFactory } from '../factories/user-created.factory.js';

describe('UserCreatedPostProcessor', () => {
  let postProcessor: UserCreatedPostProcessor;
  let socialUserService: SocialUserService;
  let redisClient: jest.Mocked<Redis>;
  let mockEventQueueRepo: IMockEventQueueRepository;

  beforeEach(() => {
    socialUserService = createMockSocialUserService();
    mockEventQueueRepo = createMockUserDeletedEventQueueRepository();
    redisClient = createMockRedisClient();

    postProcessor = new UserCreatedPostProcessor(
      redisClient,
      createMockOptions(),
      socialUserService,
      mockEventQueueRepo as never as Repository<EventQueueModel>,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should create the social user node and queue the USER_SOCIAL_CREATED feedback', async () => {
    const batchItem = UserCreatedFactory.buildBatchEventItem();
    const createSpy = jest
      .spyOn(socialUserService, 'createUser')
      .mockResolvedValue(undefined);
    const purgeSpy = jest.spyOn(socialUserService, 'purgeUser');

    await postProcessor['processEvents']([batchItem]);

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(purgeSpy).not.toHaveBeenCalled();
    expect(mockEventQueueRepo.save).toHaveBeenCalledTimes(1);
  });

  it('should purge the node again and send no feedback when the user was already deleted (G3)', async () => {
    const batchItem = UserCreatedFactory.buildBatchEventItem();
    const userId = batchItem.event.payload.after.id;
    const createSpy = jest
      .spyOn(socialUserService, 'createUser')
      .mockResolvedValue(undefined);
    const purgeSpy = jest
      .spyOn(socialUserService, 'purgeUser')
      .mockResolvedValue(undefined);
    const existsSpy = jest.spyOn(redisClient, 'exists').mockResolvedValue(1);

    await postProcessor['processEvents']([batchItem]);

    expect(existsSpy).toHaveBeenCalledWith(
      `post-processor-social:user-tombstone:${userId}`,
    );
    expect(createSpy.mock.invocationCallOrder[0]).toBeLessThan(
      existsSpy.mock.invocationCallOrder[0],
    );
    expect(purgeSpy).toHaveBeenCalledTimes(1);
    expect(purgeSpy.mock.calls[0][0].value).toBe(userId);
    expect(mockEventQueueRepo.save).not.toHaveBeenCalled();
  });
});
