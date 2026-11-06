import { jest } from '@jest/globals';
import type { IPostAuthorResolver } from '../../core/clients/post-author.resolver.js';

export function createMockPostAuthorResolver(): jest.Mocked<IPostAuthorResolver> {
  return {
    getPostAuthorId: jest.fn<IPostAuthorResolver['getPostAuthorId']>(),
  };
}
