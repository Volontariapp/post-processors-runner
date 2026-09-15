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
  postProcessorsEventCreatedOptionsProvider,
  postProcessorsEventCreationFailedOptionsProvider,
  postProcessorsEventCreationSuccessfullOptionsProvider,
  POST_PROCESSORS_JOB_OUTBOX_SUCCESS_OPTIONS,
  POST_PROCESSORS_JOB_OUTBOX_FAILURE_OPTIONS,
  POST_PROCESSORS_EVENT_CREATED_OPTIONS,
  POST_PROCESSORS_EVENT_CREATION_FAILED_OPTIONS,
  POST_PROCESSORS_EVENT_CREATION_SUCCESSFULL_OPTIONS,
} from './options/index.js';
import { EventCreatedPostProcessor } from './event-created.post-processor.js';
import { EventCreationFailedPostProcessor } from './event-creation-failed.post-processor.js';
import { EventCreationSuccessfullPostProcessor } from './event-creation-successfull.post-processor.js';

@Module({
  providers: [
    postProcessorsJobOutboxSuccessOptionsProvider,
    postProcessorsJobOutboxFailureOptionsProvider,
    postProcessorsEventCreatedOptionsProvider,
    postProcessorsEventCreationFailedOptionsProvider,
    postProcessorsEventCreationSuccessfullOptionsProvider,
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
        POST_PROCESSORS_JOB_OUTBOX_SUCCESS_OPTIONS,
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
        POST_PROCESSORS_JOB_OUTBOX_FAILURE_OPTIONS,
      ],
    },
    {
      provide: EventCreatedPostProcessor,
      useFactory: async (
        dbProvider: PostgresProvider,
        redisProvider: RedisProvider,
        options: PostProcessorOptions,
      ) => {
        await dbProvider.connect();
        await redisProvider.connect();
        const postProcessor = new EventCreatedPostProcessor(
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
        POST_PROCESSORS_EVENT_CREATED_OPTIONS,
      ],
    },
    {
      provide: EventCreationFailedPostProcessor,
      useFactory: async (
        dbProvider: PostgresProvider,
        redisProvider: RedisProvider,
        options: PostProcessorOptions,
      ) => {
        await dbProvider.connect();
        await redisProvider.connect();
        const postProcessor = new EventCreationFailedPostProcessor(
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
        POST_PROCESSORS_EVENT_CREATION_FAILED_OPTIONS,
      ],
    },
    {
      provide: EventCreationSuccessfullPostProcessor,
      useFactory: async (
        dbProvider: PostgresProvider,
        redisProvider: RedisProvider,
        options: PostProcessorOptions,
      ) => {
        await dbProvider.connect();
        await redisProvider.connect();
        const postProcessor = new EventCreationSuccessfullPostProcessor(
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
        POST_PROCESSORS_EVENT_CREATION_SUCCESSFULL_OPTIONS,
      ],
    },
  ],
})
export class PostProcessorsModule {}
