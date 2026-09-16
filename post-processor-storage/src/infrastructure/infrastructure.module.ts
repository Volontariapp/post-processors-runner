import {
  Module,
  Global,
  type DynamicModule,
  type OnApplicationShutdown,
  Inject,
} from '@nestjs/common';
import {
  PostgresBridgeModule,
  RedisBridgeModule,
  NestPostgresProvider,
  NestRedisProvider,
} from '@volontariapp/bridge-nest';
import { PostgresProvider, RedisProvider } from '@volontariapp/bridge';
import { CustomConfig } from '../config/custom-config.js';
import { Logger } from '@volontariapp/logger';

@Global()
@Module({})
export class InfrastructureModule implements OnApplicationShutdown {
  constructor(
    @Inject(NestPostgresProvider) private readonly dbProvider: PostgresProvider,
    @Inject(NestRedisProvider) private readonly redisProvider: RedisProvider,
    @Inject(Logger) private readonly logger: Logger,
  ) {}

  static forRoot(config: CustomConfig): DynamicModule {
    return {
      module: InfrastructureModule,
      imports: [
        PostgresBridgeModule.register(config.db),
        RedisBridgeModule.register(config.redis),
      ],
      exports: [PostgresBridgeModule, RedisBridgeModule],
    };
  }

  async onApplicationShutdown(signal?: string) {
    this.logger.info(
      `Shutdown signal received: ${signal ?? 'none'}. Closing background connection pools...`,
    );
    await Promise.all([
      this.dbProvider.disconnect(),
      this.redisProvider.disconnect(),
    ]);
    this.logger.info(
      'Database and Redis connection pools closed successfully.',
    );
  }
}
