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
import { EventDeletedPostProcessor } from './events/event-deleted.post-processor.js';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { EventQueueModel } from '@volontariapp/database';
import { Repository } from 'typeorm';
import { PostService } from '@volontariapp/domain-post';
import { DomainPostModule } from '../domain/domain-post.module.js';
import {
  postProcessorsJobOutboxFailureOptionsProvider,
  postProcessorsJobOutboxSuccessOptionsProvider,
  eventDeletedOptionsProvider,
  POST_PROCESSORS_JOB_OUTBOX_SUCCESS_OPTIONS,
  POST_PROCESSORS_JOB_OUTBOX_FAILURE_OPTIONS,
  POST_PROCESSOR_EVENT_DELETED_OPTIONS,
} from './options/index.js';

@Module({
  imports: [DomainPostModule, TypeOrmModule.forFeature([EventQueueModel])],
  providers: [
    postProcessorsJobOutboxSuccessOptionsProvider,
    postProcessorsJobOutboxFailureOptionsProvider,
    eventDeletedOptionsProvider,
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
      provide: EventDeletedPostProcessor,
      useFactory: async (
        redisProvider: RedisProvider,
        options: PostProcessorOptions,
        postService: PostService,
        typeormRepository: Repository<EventQueueModel>,
      ) => {
        await redisProvider.connect();
        const postProcessor = new EventDeletedPostProcessor(
          redisProvider.getDriver(),
          options,
          postService,
          typeormRepository,
        );
        void postProcessor.start();
        return postProcessor;
      },
      inject: [
        NestRedisProvider,
        POST_PROCESSOR_EVENT_DELETED_OPTIONS,
        PostService,
        getRepositoryToken(EventQueueModel),
      ],
    },
  ],
})
export class PostProcessorsModule {}
