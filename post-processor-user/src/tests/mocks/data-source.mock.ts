import { jest } from '@jest/globals';
import type {
  DataSource,
  EntityManager,
  Repository,
  ObjectLiteral,
} from 'typeorm';

export interface MockRepositories {
  badgeRepo: {
    findOneBy: jest.Mock<(...args: unknown[]) => Promise<unknown>>;
  };
  userBadgeRepo: {
    findOneBy: jest.Mock<(...args: unknown[]) => Promise<unknown>>;
  };
  eventQueueRepo: {
    create: jest.Mock<(...args: unknown[]) => unknown>;
    save: jest.Mock<(...args: unknown[]) => Promise<unknown>>;
  };
}

export function createMockDataSource(): {
  dataSource: jest.Mocked<DataSource>;
  manager: jest.Mocked<EntityManager>;
  repositories: MockRepositories;
  queryBuilder: {
    insert: jest.Mock;
    into: jest.Mock;
    values: jest.Mock;
    onConflict: jest.Mock;
    orIgnore: jest.Mock;
    returning: jest.Mock;
    execute: jest.Mock<(...args: unknown[]) => Promise<unknown>>;
  };
} {
  const badgeRepo = {
    findOneBy: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  };

  const userBadgeRepo = {
    findOneBy: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  };

  const eventQueueRepo = {
    create: jest
      .fn<(...args: unknown[]) => unknown>()
      .mockImplementation((val: unknown) => val),
    save: jest
      .fn<(...args: unknown[]) => Promise<unknown>>()
      .mockImplementation((val: unknown) => Promise.resolve(val)),
  };

  const queryBuilder = {
    insert: jest.fn().mockReturnThis(),
    into: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    onConflict: jest.fn().mockReturnThis(),
    orIgnore: jest.fn().mockReturnThis(),
    returning: jest.fn().mockReturnThis(),
    execute: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  };

  const manager = {
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    getRepository: jest.fn().mockReturnValue(eventQueueRepo),
  } as unknown as jest.Mocked<EntityManager>;

  const dataSource = {
    getRepository: jest.fn().mockImplementation((entity: unknown) => {
      const name = (entity as { name?: string }).name;
      if (name === 'BadgeModel')
        return badgeRepo as unknown as Repository<ObjectLiteral>;
      if (name === 'UserBadgeModel')
        return userBadgeRepo as unknown as Repository<ObjectLiteral>;
      return eventQueueRepo as unknown as Repository<ObjectLiteral>;
    }),
    transaction: jest.fn().mockImplementation((...args: unknown[]) => {
      const cb = args[0] as (m: EntityManager) => Promise<unknown>;
      return cb(manager);
    }),
  } as unknown as jest.Mocked<DataSource>;

  return {
    dataSource,
    manager,
    repositories: {
      badgeRepo,
      userBadgeRepo,
      eventQueueRepo,
    },
    queryBuilder,
  };
}
