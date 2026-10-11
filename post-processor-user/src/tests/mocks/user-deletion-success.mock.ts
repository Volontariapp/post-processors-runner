import { jest } from '@jest/globals';
import {
  UserService,
  BadgeService,
  type IUserRepository,
  type IBadgeRepository,
} from '@volontariapp/domain-user';
import type { PostProcessorOptions } from '@volontariapp/post-processors';

export function createMockUserRepository(): IUserRepository {
  return {
    findById: jest.fn<IUserRepository['findById']>(),
    findByEmail: jest.fn<IUserRepository['findByEmail']>(),
    findByRna: jest.fn<IUserRepository['findByRna']>(),
    findAll: jest.fn<IUserRepository['findAll']>(),
    create: jest.fn<IUserRepository['create']>(),
    update: jest.fn<IUserRepository['update']>(),
    delete: jest.fn<IUserRepository['delete']>(),
    requestDeletionWithUserDeleted:
      jest.fn<IUserRepository['requestDeletionWithUserDeleted']>(),
    finalizeDeletion: jest.fn<IUserRepository['finalizeDeletion']>(),
    addBadgeToUser: jest.fn<IUserRepository['addBadgeToUser']>(),
    removeBadgeFromUser: jest.fn<IUserRepository['removeBadgeFromUser']>(),
    incrementImpactScore: jest.fn<IUserRepository['incrementImpactScore']>(),
    createWithHashedPassword:
      jest.fn<IUserRepository['createWithHashedPassword']>(),
    findPasswordHashByEmail:
      jest.fn<IUserRepository['findPasswordHashByEmail']>(),
    findPasswordHashById: jest.fn<IUserRepository['findPasswordHashById']>(),
  };
}

export function createMockBadgeRepository(): IBadgeRepository {
  return {
    findById: jest.fn<IBadgeRepository['findById']>(),
    findManyByIds: jest.fn<IBadgeRepository['findManyByIds']>(),
    findBySlug: jest.fn<IBadgeRepository['findBySlug']>(),
    findAll: jest.fn<IBadgeRepository['findAll']>(),
    create: jest.fn<IBadgeRepository['create']>(),
    update: jest.fn<IBadgeRepository['update']>(),
    delete: jest.fn<IBadgeRepository['delete']>(),
  };
}

export function createMockUserService(userRepo?: IUserRepository): UserService {
  const userRepository = userRepo ?? createMockUserRepository();
  const badgeRepository = createMockBadgeRepository();
  const badgeService = new BadgeService(badgeRepository);
  return new UserService(userRepository, badgeService);
}

export function createMockOptions(): PostProcessorOptions {
  return {
    groupName: 'TestGroup',
    streamName: 'user:deletion_success',
    batchSize: 10,
    blockMs: 1000,
    idempotencyTtlSeconds: 3600,
  };
}
