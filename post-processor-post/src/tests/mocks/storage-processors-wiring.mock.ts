import { jest } from '@jest/globals';
import type { FactoryProvider, Type } from '@nestjs/common';
import {
  NestPostgresProvider,
  NestRedisProvider,
} from '@volontariapp/bridge-nest';
import type { PostgresPostRepository } from '@volontariapp/domain-post';
import type { PostProcessorOptions } from '@volontariapp/post-processors';
import { PostgresPostRepository as PostgresPostRepositoryToken } from '@volontariapp/domain-post';
import { PostProcessorRegistry } from '../../post-processors/post-processor-registry.service.js';
import {
  createMockOptions,
  createMockPostRepository,
  createMockRedisClient,
} from './user-deleted.post-processor.mock.js';

/** Factory provider that builds `token` in a Nest module, read from the module metadata. */
export function findFactoryProvider(
  module: Type<unknown>,
  token: unknown,
): FactoryProvider<unknown> | undefined {
  const providers = Reflect.getMetadata('providers', module) as unknown[];
  return providers.find(
    (provider): provider is FactoryProvider<unknown> =>
      typeof provider === 'object' &&
      provider !== null &&
      'provide' in provider &&
      'useFactory' in provider &&
      provider.provide === token,
  );
}

export interface IStorageProcessorsWiring {
  /** `getRepository` of the DataSource the bridge hands out (it knows no entity). */
  bridgeGetRepository: jest.Mock;
  /** Resolves each token of a factory `inject` list to a test double. */
  resolve: (injectTokens: readonly unknown[]) => unknown[];
}

export function createStorageProcessorsWiring(): IStorageProcessorsWiring {
  const bridgeGetRepository = jest.fn();
  const dbProvider = {
    connect: jest.fn(),
    getDriver: () => ({ getRepository: bridgeGetRepository }),
  };
  const redisProvider = {
    connect: jest.fn(),
    getDriver: () => createMockRedisClient(),
  };
  const registry = {
    launch: (
      options: PostProcessorOptions,
      build: (o: PostProcessorOptions) => unknown,
    ) => build(options),
  };
  const postRepository = createMockPostRepository();

  const doubles = new Map<unknown, unknown>([
    [NestPostgresProvider, dbProvider],
    [NestRedisProvider, redisProvider],
    [PostProcessorRegistry, registry],
    [
      PostgresPostRepositoryToken,
      postRepository as never as PostgresPostRepository,
    ],
  ]);

  return {
    bridgeGetRepository,
    resolve: (injectTokens) =>
      injectTokens.map((token) => doubles.get(token) ?? createMockOptions()),
  };
}
