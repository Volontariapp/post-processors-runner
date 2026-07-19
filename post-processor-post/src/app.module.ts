import { Module, type DynamicModule } from '@nestjs/common';
import { ConfigModule } from './config/config.module.js';
import { InfrastructureModule } from './infrastructure/infrastructure.module.js';
import { DomainPostModule } from './domain/domain-post.module.js';
import { PostProcessorsModule } from './post-processors/post-processors.module.js';
import { logger } from './config/config.module.js';
import { HealthModule } from '@volontariapp/health-check-nest';
import { TerminusModule } from '@nestjs/terminus';
import type { CustomConfig } from './config/custom-config.js';

@Module({})
export class AppModule {
  static register(config: CustomConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule,
        InfrastructureModule.forRoot(config),
        TerminusModule.forRoot({}),
        HealthModule.register({
          databases: ['postgres', 'redis'],
          failOnMissingProvider: true,
        }),
        DomainPostModule,
        PostProcessorsModule,
      ],
    };
  }
}

export { logger };
