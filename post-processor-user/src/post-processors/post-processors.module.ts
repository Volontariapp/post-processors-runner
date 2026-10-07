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
  JOB_OUTBOX_SUCCESS_POST_PROCESSOR_OPTIONS,
  JOB_OUTBOX_FAILED_POST_PROCESSOR_OPTIONS,
  EVENT_CREATION_SUCCESSFULL_BADGE_POST_PROCESSOR_OPTIONS,
  POST_CREATION_SUCCESSFULL_BADGE_POST_PROCESSOR_OPTIONS,
  POST_LIKED_BADGE_POST_PROCESSOR_OPTIONS,
} from './options/index.js';
import { BadgeEvaluator } from '../core/services/badge-evaluator.service.js';
import { SocialInteractionClient } from '../core/clients/social-interaction.client.js';
import { EventCreationSuccessfullBadgePostProcessor } from './events/event-creation-successfull-badge.post-processor.js';
import { PostCreationSuccessfullBadgePostProcessor } from './posts/post-creation-successfull-badge.post-processor.js';
import { PostLikedBadgePostProcessor } from './posts/post-liked-badge.post-processor.js';

@Module({
  providers: [
    postProcessorsJobOutboxSuccessOptionsProvider,
    postProcessorsJobOutboxFailureOptionsProvider,
    eventCreationSuccessfullBadgeOptionsProvider,
    postCreationSuccessfullBadgeOptionsProvider,
    postLikedBadgeOptionsProvider,
    SocialInteractionClient,
    {
      provide: BadgeEvaluator,
      useFactory: async (
        dbProvider: PostgresProvider,
        redisProvider: RedisProvider,
        socialClient: SocialInteractionClient,
      ) => {
        await dbProvider.connect();
        await redisProvider.connect();
        return new BadgeEvaluator(
          dbProvider.getDriver(),
          socialClient,
          redisProvider.getDriver(),
        );
      },
      inject: [
        NestPostgresProvider,
        NestRedisProvider,
        SocialInteractionClient,
      ],
    },
    {
      provide: JobOutboxSuccessPostProcessor,
      useFactory: async (
        dbProvider: PostgresProvider,
        redisProvider: RedisProvider,
        options: PostProcessorOptions,
      ) => {
        await dbProvider.connect();
        await redisProvider.connect();
        const postProcessor = new JobOutboxSuccessPostProcessor(
          dbProvider.getDriver(),
          redisProvider.getDriver(),
          options,
        );
        void postProcessor.start();
        return postProcessor;
      },
      inject: [
        NestPostgresProvider,
        NestRedisProvider,
        JOB_OUTBOX_SUCCESS_POST_PROCESSOR_OPTIONS,
      ],
    },
    {
      provide: JobOutboxFailedPostProcessor,
      useFactory: async (
        dbProvider: PostgresProvider,
        redisProvider: RedisProvider,
        options: PostProcessorOptions,
      ) => {
        await dbProvider.connect();
        await redisProvider.connect();
        const postProcessor = new JobOutboxFailedPostProcessor(
          dbProvider.getDriver(),
          redisProvider.getDriver(),
          options,
        );
        void postProcessor.start();
        return postProcessor;
      },
      inject: [
        NestPostgresProvider,
        NestRedisProvider,
        JOB_OUTBOX_FAILED_POST_PROCESSOR_OPTIONS,
      ],
    },
    {
      provide: EventCreationSuccessfullBadgePostProcessor,
      useFactory: async (
        dbProvider: PostgresProvider,
        redisProvider: RedisProvider,
        badgeEvaluator: BadgeEvaluator,
        options: PostProcessorOptions,
      ) => {
        await dbProvider.connect();
        await redisProvider.connect();
        const postProcessor = new EventCreationSuccessfullBadgePostProcessor(
          badgeEvaluator,
          redisProvider.getDriver(),
          options,
        );
        void postProcessor.start();
        return postProcessor;
      },
      inject: [
        NestPostgresProvider,
        NestRedisProvider,
        BadgeEvaluator,
        EVENT_CREATION_SUCCESSFULL_BADGE_POST_PROCESSOR_OPTIONS,
      ],
    },
    {
      provide: PostCreationSuccessfullBadgePostProcessor,
      useFactory: async (
        dbProvider: PostgresProvider,
        redisProvider: RedisProvider,
        badgeEvaluator: BadgeEvaluator,
        options: PostProcessorOptions,
      ) => {
        await dbProvider.connect();
        await redisProvider.connect();
        const postProcessor = new PostCreationSuccessfullBadgePostProcessor(
          badgeEvaluator,
          redisProvider.getDriver(),
          options,
        );
        void postProcessor.start();
        return postProcessor;
      },
      inject: [
        NestPostgresProvider,
        NestRedisProvider,
        BadgeEvaluator,
        POST_CREATION_SUCCESSFULL_BADGE_POST_PROCESSOR_OPTIONS,
      ],
    },
    {
      provide: PostLikedBadgePostProcessor,
      useFactory: async (
        redisProvider: RedisProvider,
        badgeEvaluator: BadgeEvaluator,
        options: PostProcessorOptions,
      ) => {
        await redisProvider.connect();
        const postProcessor = new PostLikedBadgePostProcessor(
          badgeEvaluator,
          redisProvider.getDriver(),
          options,
        );
        void postProcessor.start();
        return postProcessor;
      },
      inject: [
        NestRedisProvider,
        BadgeEvaluator,
        POST_LIKED_BADGE_POST_PROCESSOR_OPTIONS,
      ],
    },
  ],
})
export class PostProcessorsModule {}
