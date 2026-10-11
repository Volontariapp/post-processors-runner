import { jest } from '@jest/globals';
import { SocialUserService } from '@volontariapp/domain-social';
import type { ISocialUserRepository } from '@volontariapp/domain-social';

export function createMockSocialUserService(): SocialUserService {
  const mockRepo: ISocialUserRepository = {
    createNode: jest.fn<ISocialUserRepository['createNode']>(),
    deleteNode: jest.fn<ISocialUserRepository['deleteNode']>(),
    exists: jest.fn<ISocialUserRepository['exists']>(),
    purgeUser: jest.fn<ISocialUserRepository['purgeUser']>(),
  };
  return new SocialUserService(mockRepo);
}

export interface IMockEventQueueRepository {
  create: jest.Mock;
  save: jest.Mock;
}

export function createMockUserDeletedEventQueueRepository(): IMockEventQueueRepository {
  return {
    create: jest.fn().mockImplementation((entity) => entity),
    save: jest.fn().mockImplementation((entities) => Promise.resolve(entities)),
  };
}
