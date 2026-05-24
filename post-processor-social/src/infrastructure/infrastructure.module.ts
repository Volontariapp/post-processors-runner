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
  Neo4jBridgeModule,
  NestPostgresProvider,
  NestRedisProvider,
  NestNeo4jProvider,
} from '@volontariapp/bridge-nest';
import {
  PostgresProvider,
  RedisProvider,
  Neo4jProvider,
} from '@volontariapp/bridge';
import { CustomConfig } from '../config/custom-config.js';
import { Logger } from '@volontariapp/logger';
import { TypeOrmModule } from '@nestjs/typeorm';

@Global()
@Module({})
export class InfrastructureModule implements OnApplicationShutdown {
  constructor(
    @Inject(NestPostgresProvider) private readonly dbProvider: PostgresProvider,
    @Inject(NestRedisProvider) private readonly redisProvider: RedisProvider,
    @Inject(NestNeo4jProvider) private readonly neo4jProvider: Neo4jProvider,
    @Inject(Logger) private readonly logger: Logger,
  ) {}

  static forRoot(config: CustomConfig): DynamicModule {
    return {
      module: InfrastructureModule,
      imports: [
        PostgresBridgeModule.register(config.db),
        RedisBridgeModule.register(config.redis),
        Neo4jBridgeModule.register(config.neo4j),
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: config.db.host,
          port: config.db.port,
          username: config.db.username,
          password: config.db.password,
          database: config.db.database,
          ssl: config.db.ssl ? { rejectUnauthorized: false } : false,
          autoLoadEntities: true,
          synchronize: false,
        }),
      ],
      exports: [
        PostgresBridgeModule,
        RedisBridgeModule,
        Neo4jBridgeModule,
        TypeOrmModule,
      ],
    };
  }

  async onApplicationShutdown(signal?: string) {
    this.logger.info(
      `Shutdown signal received: ${signal ?? 'none'}. Closing background connection pools...`,
    );
    await Promise.all([
      this.dbProvider.disconnect(),
      this.redisProvider.disconnect(),
      this.neo4jProvider.disconnect(),
    ]);
    this.logger.info(
      'Database, Redis and Neo4j connection pools closed successfully.',
    );
  }
}
