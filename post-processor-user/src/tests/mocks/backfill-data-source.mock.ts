import { jest } from '@jest/globals';
import type { DataSource, EntityManager } from 'typeorm';
import type { IUserSocialActivityClient } from '../../core/clients/social-interaction.client.js';

export function createMockUserSocialActivityClient(): jest.Mocked<IUserSocialActivityClient> {
  return {
    getAllUserLikedPostIds:
      jest.fn<IUserSocialActivityClient['getAllUserLikedPostIds']>(),
    getAllUserWishedEventIds:
      jest.fn<IUserSocialActivityClient['getAllUserWishedEventIds']>(),
  };
}

export function createMockBackfillDataSource(): {
  dataSource: jest.Mocked<DataSource>;
  manager: {
    createQueryBuilder: jest.Mock;
    count: jest.Mock<(...args: unknown[]) => Promise<number>>;
    query: jest.Mock<(...args: unknown[]) => Promise<unknown>>;
  };
  queryBuilder: {
    insert: jest.Mock;
    into: jest.Mock;
    values: jest.Mock;
    orIgnore: jest.Mock;
    execute: jest.Mock<(...args: unknown[]) => Promise<unknown>>;
  };
  query: jest.Mock<(...args: unknown[]) => Promise<unknown>>;
} {
  const queryBuilder = {
    insert: jest.fn().mockReturnThis(),
    into: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    orIgnore: jest.fn().mockReturnThis(),
    execute: jest
      .fn<(...args: unknown[]) => Promise<unknown>>()
      .mockResolvedValue({}),
  };
  const manager = {
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    count: jest
      .fn<(...args: unknown[]) => Promise<number>>()
      .mockResolvedValue(0),
    query: jest
      .fn<(...args: unknown[]) => Promise<unknown>>()
      .mockResolvedValue([]),
  };
  const query = jest
    .fn<(...args: unknown[]) => Promise<unknown>>()
    .mockResolvedValue([]);
  const dataSource = {
    query,
    transaction: jest.fn().mockImplementation((...args: unknown[]) => {
      const cb = args[0] as (m: EntityManager) => Promise<unknown>;
      return cb(manager as unknown as EntityManager);
    }),
  } as unknown as jest.Mocked<DataSource>;

  return { dataSource, manager, queryBuilder, query };
}
