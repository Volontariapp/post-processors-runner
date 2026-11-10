import { Module } from '@nestjs/common';
import { PostgresProvider, RedisProvider } from '@volontariapp/bridge';
import {
  NestPostgresProvider,
  NestRedisProvider,
} from '@volontariapp/bridge-nest';
import {
  JobOutboxSuccessPostProcessor,
  JobOutboxFailedPostProcessor,
  PostProcessorOptions,
} from '@volontariapp/post-processors';
import {
  postProcessorsJobOutboxFailureOptionsProvider,
  postProcessorsJobOutboxSuccessOptionsProvider,
  eventCreationSuccessfullBadgeOptionsProvider,
  postCreationSuccessfullBadgeOptionsProvider,
  postLikedBadgeOptionsProvider,
  eventSocialWishedBadgeOptionsProvider,
  eventFinishedBadgeOptionsProvider,
  eventFinishedImpactScoreOptionsProvider,
  JOB_OUTBOX_SUCCESS_POST_PROCESSOR_OPTIONS,
  JOB_OUTBOX_FAILED_POST_PROCESSOR_OPTIONS,
  EVENT_CREATION_SUCCESSFULL_BADGE_POST_PROCESSOR_OPTIONS,
  POST_CREATION_SUCCESSFULL_BADGE_POST_PROCESSOR_OPTIONS,
  POST_LIKED_BADGE_POST_PROCESSOR_OPTIONS,
  EVENT_SOCIAL_WISHED_BADGE_POST_PROCESSOR_OPTIONS,
  EVENT_FINISHED_BADGE_POST_PROCESSOR_OPTIONS,
  EVENT_FINISHED_IMPACT_SCORE_POST_PROCESSOR_OPTIONS,
  userDeletionSuccessOptionsProvider,
  USER_DELETION_SUCCESS_POST_PROCESSOR_OPTIONS,
} from './options/index.js';
import { BadgeEvaluator } from '../core/services/badge-evaluator.service.js';
import { ImpactScoreCrediter } from '../core/services/impact-score-crediter.service.js';
import { SocialInteractionClient } from '../core/clients/social-interaction.client.js';
import {
  CachedPostAuthorResolver,
  PostQueryClient,
} from '../core/clients/post-author.resolver.js';
import { CustomConfig } from '../config/custom-config.js';
import { EventCreationSuccessfullBadgePostProcessor } from './events/event-creation-successfull-badge.post-processor.js';
import { EventSocialWishedBadgePostProcessor } from './events/event-social-wished-badge.post-processor.js';
import { EventFinishedBadgePostProcessor } from './events/event-finished-badge.post-processor.js';
import { EventFinishedImpactScorePostProcessor } from './events/event-finished-impact-score.post-processor.js';
import { PostCreationSuccessfullBadgePostProcessor } from './posts/post-creation-successfull-badge.post-processor.js';
import { PostLikedBadgePostProcessor } from './posts/post-liked-badge.post-processor.js';
import { UserDeletionSuccessPostProcessor } from './users/user-deletion-success.post-processor.js';
import { DomainUserModule } from '../domain/domain-user.module.js';
import { UserService } from '@volontariapp/domain-user';
import { PostProcessorRegistry } from './post-processor-registry.service.js';

@Module({
  imports: [DomainUserModule],
  providers: [
    PostProcessorRegistry,
    postProcessorsJobOutboxSuccessOptionsProvider,
    postProcessorsJobOutboxFailureOptionsProvider,
    eventCreationSuccessfullBadgeOptionsProvider,
    postCreationSuccessfullBadgeOptionsProvider,
    postLikedBadgeOptionsProvider,
    eventSocialWishedBadgeOptionsProvider,
    eventFinishedBadgeOptionsProvider,
    eventFinishedImpactScoreOptionsProvider,
    SocialInteractionClient,
    PostQueryClient,
    {
      provide: ImpactScoreCrediter,
      useFactory: async (
        dbProvider: PostgresProvider,
        socialClient: SocialInteractionClient,
      ) => {
        await dbProvider.connect();
        return new ImpactScoreCrediter(dbProvider.getDriver(), socialClient);
      },
      inject: [NestPostgresProvider, SocialInteractionClient],
    },
    {
      provide: BadgeEvaluator,
      useFactory: async (
        dbProvider: PostgresProvider,
        redisProvider: RedisProvider,
        socialClient: SocialInteractionClient,
        postQueryClient: PostQueryClient,
        config: CustomConfig,
      ) => {
        await dbProvider.connect();
        await redisProvider.connect();
        const redis = redisProvider.getDriver();
        return new BadgeEvaluator(dbProvider.getDriver(), socialClient, redis, {
          pointsEnabled: config.badges.pointsEnabled,
          postAuthorResolver: new CachedPostAuthorResolver(
            postQueryClient,
            redis,
          ),
        });
      },
      inject: [
        NestPostgresProvider,
        NestRedisProvider,
        SocialInteractionClient,
        PostQueryClient,
        CustomConfig,
      ],
    },
    {
      provide: JobOutboxSuccessPostProcessor,
      useFactory: async (
        dbProvider: PostgresProvider,
        redisProvider: RedisProvider,
        options: PostProcessorOptions,
        registry: PostProcessorRegistry,
      ) => {
        await dbProvider.connect();
        await redisProvider.connect();
        return registry.launch(
          options,
          (launchOptions) =>
            new JobOutboxSuccessPostProcessor(
              dbProvider.getDriver(),
              redisProvider.getDriver(),
              launchOptions,
            ),
        );
      },
      inject: [
        NestPostgresProvider,
        NestRedisProvider,
        JOB_OUTBOX_SUCCESS_POST_PROCESSOR_OPTIONS,
        PostProcessorRegistry,
      ],
    },
    {
      provide: JobOutboxFailedPostProcessor,
      useFactory: async (
        dbProvider: PostgresProvider,
        redisProvider: RedisProvider,
        options: PostProcessorOptions,
        registry: PostProcessorRegistry,
      ) => {
        await dbProvider.connect();
        await redisProvider.connect();
        return registry.launch(
          options,
          (launchOptions) =>
            new JobOutboxFailedPostProcessor(
              dbProvider.getDriver(),
              redisProvider.getDriver(),
              launchOptions,
            ),
        );
      },
      inject: [
        NestPostgresProvider,
        NestRedisProvider,
        JOB_OUTBOX_FAILED_POST_PROCESSOR_OPTIONS,
        PostProcessorRegistry,
      ],
    },
    {
      provide: EventCreationSuccessfullBadgePostProcessor,
      useFactory: async (
        dbProvider: PostgresProvider,
        redisProvider: RedisProvider,
        badgeEvaluator: BadgeEvaluator,
        options: PostProcessorOptions,
        registry: PostProcessorRegistry,
      ) => {
        await dbProvider.connect();
        await redisProvider.connect();
        return registry.launch(
          options,
          (launchOptions) =>
            new EventCreationSuccessfullBadgePostProcessor(
              badgeEvaluator,
              redisProvider.getDriver(),
              launchOptions,
            ),
        );
      },
      inject: [
        NestPostgresProvider,
        NestRedisProvider,
        BadgeEvaluator,
        EVENT_CREATION_SUCCESSFULL_BADGE_POST_PROCESSOR_OPTIONS,
        PostProcessorRegistry,
      ],
    },
    {
      provide: PostCreationSuccessfullBadgePostProcessor,
      useFactory: async (
        dbProvider: PostgresProvider,
        redisProvider: RedisProvider,
        badgeEvaluator: BadgeEvaluator,
        options: PostProcessorOptions,
        registry: PostProcessorRegistry,
      ) => {
        await dbProvider.connect();
        await redisProvider.connect();
        return registry.launch(
          options,
          (launchOptions) =>
            new PostCreationSuccessfullBadgePostProcessor(
              badgeEvaluator,
              redisProvider.getDriver(),
              launchOptions,
            ),
        );
      },
      inject: [
        NestPostgresProvider,
        NestRedisProvider,
        BadgeEvaluator,
        POST_CREATION_SUCCESSFULL_BADGE_POST_PROCESSOR_OPTIONS,
        PostProcessorRegistry,
      ],
    },
    {
      provide: PostLikedBadgePostProcessor,
      useFactory: async (
        redisProvider: RedisProvider,
        badgeEvaluator: BadgeEvaluator,
        options: PostProcessorOptions,
        registry: PostProcessorRegistry,
      ) => {
        await redisProvider.connect();
        return registry.launch(
          options,
          (launchOptions) =>
            new PostLikedBadgePostProcessor(
              badgeEvaluator,
              redisProvider.getDriver(),
              launchOptions,
            ),
        );
      },
      inject: [
        NestRedisProvider,
        BadgeEvaluator,
        POST_LIKED_BADGE_POST_PROCESSOR_OPTIONS,
        PostProcessorRegistry,
      ],
    },
    {
      provide: EventSocialWishedBadgePostProcessor,
      useFactory: async (
        redisProvider: RedisProvider,
        badgeEvaluator: BadgeEvaluator,
        options: PostProcessorOptions,
        registry: PostProcessorRegistry,
      ) => {
        await redisProvider.connect();
        return registry.launch(
          options,
          (launchOptions) =>
            new EventSocialWishedBadgePostProcessor(
              badgeEvaluator,
              redisProvider.getDriver(),
              launchOptions,
            ),
        );
      },
      inject: [
        NestRedisProvider,
        BadgeEvaluator,
        EVENT_SOCIAL_WISHED_BADGE_POST_PROCESSOR_OPTIONS,
        PostProcessorRegistry,
      ],
    },
    {
      provide: EventFinishedBadgePostProcessor,
      useFactory: async (
        redisProvider: RedisProvider,
        badgeEvaluator: BadgeEvaluator,
        options: PostProcessorOptions,
        registry: PostProcessorRegistry,
      ) => {
        await redisProvider.connect();
        return registry.launch(
          options,
          (launchOptions) =>
            new EventFinishedBadgePostProcessor(
              badgeEvaluator,
              redisProvider.getDriver(),
              launchOptions,
            ),
        );
      },
      inject: [
        NestRedisProvider,
        BadgeEvaluator,
        EVENT_FINISHED_BADGE_POST_PROCESSOR_OPTIONS,
        PostProcessorRegistry,
      ],
    },
    {
      provide: EventFinishedImpactScorePostProcessor,
      useFactory: async (
        redisProvider: RedisProvider,
        impactScoreCrediter: ImpactScoreCrediter,
        options: PostProcessorOptions,
        registry: PostProcessorRegistry,
      ) => {
        await redisProvider.connect();
        return registry.launch(
          options,
          (launchOptions) =>
            new EventFinishedImpactScorePostProcessor(
              impactScoreCrediter,
              redisProvider.getDriver(),
              launchOptions,
            ),
        );
      },
      inject: [
        NestRedisProvider,
        ImpactScoreCrediter,
        EVENT_FINISHED_IMPACT_SCORE_POST_PROCESSOR_OPTIONS,
        PostProcessorRegistry,
      ],
    },
    userDeletionSuccessOptionsProvider,
    {
      provide: UserDeletionSuccessPostProcessor,
      useFactory: async (
        redisProvider: RedisProvider,
        userService: UserService,
        options: PostProcessorOptions,
        registry: PostProcessorRegistry,
      ) => {
        await redisProvider.connect();
        return registry.launch(
          options,
          (launchOptions) =>
            new UserDeletionSuccessPostProcessor(
              userService,
              redisProvider.getDriver(),
              launchOptions,
            ),
        );
      },
      inject: [
        NestRedisProvider,
        UserService,
        USER_DELETION_SUCCESS_POST_PROCESSOR_OPTIONS,
        PostProcessorRegistry,
      ],
    },
  ],
})
export class PostProcessorsModule {}
