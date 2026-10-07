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
  JOB_OUTBOX_SUCCESS_POST_PROCESSOR_OPTIONS,
  JOB_OUTBOX_FAILED_POST_PROCESSOR_OPTIONS,
  EVENT_CREATION_SUCCESSFULL_BADGE_POST_PROCESSOR_OPTIONS,
} from './options/index.js';
import { BadgeEvaluator } from '../core/services/badge-evaluator.service.js';
import { EventCreationSuccessfullBadgePostProcessor } from './events/event-creation-successfull-badge.post-processor.js';

@Module({
  providers: [
    postProcessorsJobOutboxSuccessOptionsProvider,
    postProcessorsJobOutboxFailureOptionsProvider,
    eventCreationSuccessfullBadgeOptionsProvider,
    {
      provide: BadgeEvaluator,
      useFactory: async (dbProvider: PostgresProvider) => {
        await dbProvider.connect();
        return new BadgeEvaluator(dbProvider.getDriver());
      },
      inject: [NestPostgresProvider],
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
  ],
})
export class PostProcessorsModule {}
