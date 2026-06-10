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
import { AppDataSource } from '../config/data-source.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  EventModel,
  TagModel,
  RequirementModel,
} from '@volontariapp/domain-event';
import {
  EventQueueModel,
  JobsOutboxModel,
  JobAuditModel,
} from '@volontariapp/database';
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
    const entities = AppDataSource.options.entities;

    return {
      module: InfrastructureModule,
      imports: [
        PostgresBridgeModule.register({
          host: config.db.host,
          port: config.db.port,
          username: config.db.username,
          password: config.db.password,
          database: config.db.database,
          ssl: config.db.ssl ? { rejectUnauthorized: false } : false,
          entities,
          migrations: AppDataSource.options.migrations,
          synchronize: false,
        }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: config.db.host,
          port: config.db.port,
          username: config.db.username,
          password: config.db.password,
          database: config.db.database,
          ssl: config.db.ssl ? { rejectUnauthorized: false } : false,
          entities,
          migrations: AppDataSource.options.migrations,
          synchronize: false,
        }),
        TypeOrmModule.forFeature([
          EventModel,
          TagModel,
          RequirementModel,
          EventQueueModel,
          JobsOutboxModel,
          JobAuditModel,
        ]),
        RedisBridgeModule.register(config.redis),
      ],
      exports: [PostgresBridgeModule, RedisBridgeModule, TypeOrmModule],
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
