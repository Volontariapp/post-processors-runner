import type { InjectionToken, Provider } from '@nestjs/common';
import type { RedisProvider } from '@volontariapp/bridge';
import { NestRedisProvider } from '@volontariapp/bridge-nest';
import type { PostProcessorOptions } from '@volontariapp/post-processors';
import type { Redis } from 'ioredis';
import type { StartablePostProcessor } from '../interfaces/startable-post-processor.interface.js';

/** Fournit un post-processor dont les dependances metier suivent le client Redis et les options. */
export const postProcessorProvider = <
  TDeps extends unknown[],
  TProcessor extends StartablePostProcessor,
>(
  processor: new (
    redisClient: Redis,
    options: PostProcessorOptions,
    ...deps: TDeps
  ) => TProcessor,
  optionsToken: string,
  deps: InjectionToken[],
): Provider => ({
  provide: processor,
  useFactory: async (
    redisProvider: RedisProvider,
    options: PostProcessorOptions,
    ...resolved: TDeps
  ): Promise<TProcessor> => {
    await redisProvider.connect();
    const postProcessor = new processor(
      redisProvider.getDriver(),
      options,
      ...resolved,
    );
    void postProcessor.start();
    return postProcessor;
  },
  inject: [NestRedisProvider, optionsToken, ...deps],
});
