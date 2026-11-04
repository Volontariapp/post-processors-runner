import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import {
  TOMBSTONE_TTL_SECONDS,
  findDeleted,
  markDeleted,
  tombstoneKey,
} from '../../post-processors/tombstone.js';
import { createMockRedisClient } from '../mocks/event-deleted.post-processor.mock.js';

describe('tombstone', () => {
  let redisClient: ReturnType<typeof createMockRedisClient>;

  beforeEach(() => {
    redisClient = createMockRedisClient();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should keep the user key of post-processors-runner#61', () => {
    expect(tombstoneKey('user', 'u1')).toBe(
      'post-processor-social:user-tombstone:u1',
    );
  });

  it('should set one marker per id with the TTL', async () => {
    const setSpy = jest.spyOn(redisClient, 'set');

    await markDeleted(redisClient, 'post', ['p1', 'p2']);

    expect(setSpy).toHaveBeenCalledTimes(2);
    expect(setSpy).toHaveBeenCalledWith(
      'post-processor-social:post-tombstone:p2',
      '1',
      'EX',
      TOMBSTONE_TTL_SECONDS,
    );
  });

  it('should return only the marked ids', async () => {
    jest
      .spyOn(redisClient, 'exists')
      .mockImplementation((key) =>
        Promise.resolve(
          key === 'post-processor-social:event-tombstone:e2' ? 1 : 0,
        ),
      );

    await expect(
      findDeleted(redisClient, 'event', ['e1', 'e2', 'e3']),
    ).resolves.toEqual(new Set(['e2']));
  });
});
