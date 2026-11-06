import { Module, type DynamicModule } from '@nestjs/common';
import { AuthModule } from '@volontariapp/auth';
import type { PostgresProvider, RedisProvider } from '@volontariapp/bridge';
import {
  NestPostgresProvider,
  NestRedisProvider,
} from '@volontariapp/bridge-nest';
import { ConfigModule } from '../config/config.module.js';
import type { CustomConfig } from '../config/custom-config.js';
import { InfrastructureModule } from '../infrastructure/infrastructure.module.js';
import { GrpcClientModule } from '../infrastructure/grpc/grpc-client.module.js';
import { SocialInteractionClient } from '../core/clients/social-interaction.client.js';
import {
  CachedPostAuthorResolver,
  PostQueryClient,
} from '../core/clients/post-author.resolver.js';
import { BadgeCounterBackfill } from '../core/services/badge-counter-backfill.service.js';

/**
 * Module minimal du backfill : mêmes clients et même base que le post-processor, mais sans
 * PostProcessorsModule, donc aucun consommateur de stream n'est démarré.
 */
@Module({})
export class BackfillModule {
  static register(config: CustomConfig): DynamicModule {
    return {
      module: BackfillModule,
      imports: [
        ConfigModule,
        InfrastructureModule.forRoot(config),
        AuthModule.registerGateway(config.auth),
        GrpcClientModule,
      ],
      providers: [
        SocialInteractionClient,
        PostQueryClient,
        {
          provide: BadgeCounterBackfill,
          useFactory: async (
            dbProvider: PostgresProvider,
            redisProvider: RedisProvider,
            socialClient: SocialInteractionClient,
            postQueryClient: PostQueryClient,
          ) => {
            await dbProvider.connect();
            await redisProvider.connect();
            return new BadgeCounterBackfill(
              dbProvider.getDriver(),
              socialClient,
              new CachedPostAuthorResolver(
                postQueryClient,
                redisProvider.getDriver(),
              ),
            );
          },
          inject: [
            NestPostgresProvider,
            NestRedisProvider,
            SocialInteractionClient,
            PostQueryClient,
          ],
        },
      ],
    };
  }
}
