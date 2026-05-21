import { Module, type OnApplicationShutdown, Inject } from '@nestjs/common';
import { loadConfig } from '@volontariapp/config';
import { Logger } from '@volontariapp/logger';
import { CustomConfig } from './config/custom-config.js';
import { resolveConfigDirectory } from './config/resolve-config-directory.js';
import { initDatabase } from './providers/database.provider.js';
import { initRedis } from './providers/redis.provider.js';
import { PostgresProvider, RedisProvider } from '@volontariapp/bridge';
import { UserPostProcessor } from './post-processors/user.post-processor.js';
import { PostProcessorOptions } from '@volontariapp/post-processors';

const configDir = resolveConfigDirectory();
const config = loadConfig(configDir, CustomConfig);
const logger = new Logger({
  context: 'POST-PROCESSOR-USER',
  format: config.logger.format,
});

@Module({
  providers: [
    {
      provide: CustomConfig,
      useValue: config,
    },
    {
      provide: Logger,
      useValue: logger,
    },
    {
      provide: PostgresProvider,
      useFactory: async (customConfig: CustomConfig, log: Logger) => {
        return initDatabase(customConfig.db, log);
      },
      inject: [CustomConfig, Logger],
    },
    {
      provide: RedisProvider,
      useFactory: async (customConfig: CustomConfig, log: Logger) => {
        return initRedis(customConfig.redis, log);
      },
      inject: [CustomConfig, Logger],
    },
    {
      provide: 'POST_PROCESSOR_OPTIONS',
      useFactory: (customConfig: CustomConfig) => ({
        groupName: customConfig.postProcessor.groupName,
        streamName: customConfig.postProcessor.streamName,
        batchSize: customConfig.postProcessor.batchSize,
        blockTimeout: customConfig.postProcessor.blockTimeout,
        idempotencyTtlSeconds: customConfig.postProcessor.idempotencyTtlSeconds,
        maxRetries: customConfig.postProcessor.maxRetries,
        retryDelayMs: customConfig.postProcessor.retryDelayMs,
      }),
      inject: [CustomConfig],
    },
    {
      provide: UserPostProcessor,
      useFactory: (redisProvider: RedisProvider, options: PostProcessorOptions) => {
        const postProcessor = new UserPostProcessor(redisProvider, options);
        void postProcessor.start();
        return postProcessor;
      },
      inject: [RedisProvider, 'POST_PROCESSOR_OPTIONS'],
    },
  ],
})
export class AppModule implements OnApplicationShutdown {
  constructor(
    @Inject(PostgresProvider) private readonly dbProvider: PostgresProvider,
    @Inject(RedisProvider) private readonly redisProvider: RedisProvider,
  ) {}

  async onApplicationShutdown(signal?: string) {
    logger.info(
      `Shutdown signal received: ${signal ?? 'none'}. Closing background connection pools...`,
    );
    await Promise.all([this.dbProvider.disconnect(), this.redisProvider.disconnect()]);
    logger.info('Database and Redis connection pools closed successfully.');
  }
}
export { logger };
