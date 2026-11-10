import type { InjectionToken, Provider } from '@nestjs/common';
import type { RedisProvider } from '@volontariapp/bridge';
import { NestRedisProvider } from '@volontariapp/bridge-nest';
import type { EventMessagingType } from '@volontariapp/messaging';
import type {
  BasePostProcessor,
  PostProcessorOptions,
} from '@volontariapp/post-processors';
import type { Redis } from 'ioredis';
import { PostProcessorRegistry } from '../post-processor-registry.service.js';

/**
 * Fournit un post-processor dont les dependances metier suivent le client Redis et les options.
 * Il est construit et demarre par le registre, qui l'arrete a la destruction du module.
 */
export const postProcessorProvider = <
  TDeps extends unknown[],
  TProcessor extends BasePostProcessor<EventMessagingType>,
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
    registry: PostProcessorRegistry,
    options: PostProcessorOptions,
    ...resolved: TDeps
  ): Promise<TProcessor> => {
    await redisProvider.connect();
    return registry.launch(
      options,
      (launchOptions) =>
        new processor(redisProvider.getDriver(), launchOptions, ...resolved),
    );
  },
  inject: [NestRedisProvider, PostProcessorRegistry, optionsToken, ...deps],
});
