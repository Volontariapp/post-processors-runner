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
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { EventQueueModel } from '@volontariapp/database';
import type { Repository } from 'typeorm';
import { DomainStorageModule } from '../domain/domain-storage.module.js';
import { PostgresFileRepository } from '@volontariapp/domain-storage/repositories';
import {
  postProcessorsJobOutboxFailureOptionsProvider,
  postProcessorsJobOutboxSuccessOptionsProvider,
  userDeletedOptionsProvider,
  postCreatedOptionsProvider,
  eventCreatedOptionsProvider,
  eventCoverReplacedOptionsProvider,
  userAvatarReplacedOptionsProvider,
  postDeletedOptionsProvider,
  eventDeletedOptionsProvider,
  JOB_OUTBOX_SUCCESS_POST_PROCESSOR_OPTIONS,
  JOB_OUTBOX_FAILED_POST_PROCESSOR_OPTIONS,
  POST_PROCESSOR_USER_DELETED_OPTIONS,
  POST_PROCESSOR_POST_CREATED_OPTIONS,
  POST_PROCESSOR_EVENT_CREATED_OPTIONS,
  POST_PROCESSOR_EVENT_COVER_REPLACED_OPTIONS,
  POST_PROCESSOR_USER_AVATAR_REPLACED_OPTIONS,
  POST_PROCESSOR_POST_DELETED_OPTIONS,
  POST_PROCESSOR_EVENT_DELETED_OPTIONS,
} from './options/index.js';
import { UserDeletedPostProcessor } from './user-deleted.post-processor.js';
import { PostCreatedPostProcessor } from './post-created.post-processor.js';
import { EventCreatedPostProcessor } from './event-created.post-processor.js';
import { EventCoverReplacedPostProcessor } from './event-cover-replaced.post-processor.js';
import { UserAvatarReplacedPostProcessor } from './user-avatar-replaced.post-processor.js';
import { PostDeletedPostProcessor } from './post-deleted.post-processor.js';
import { EventDeletedPostProcessor } from './event-deleted.post-processor.js';

@Module({
  imports: [DomainStorageModule, TypeOrmModule.forFeature([EventQueueModel])],
  providers: [
    postProcessorsJobOutboxSuccessOptionsProvider,
    postProcessorsJobOutboxFailureOptionsProvider,
    userDeletedOptionsProvider,
    postCreatedOptionsProvider,
    eventCreatedOptionsProvider,
    eventCoverReplacedOptionsProvider,
    userAvatarReplacedOptionsProvider,
    postDeletedOptionsProvider,
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
      provide: UserDeletedPostProcessor,
      useFactory: async (
        redisProvider: RedisProvider,
        options: PostProcessorOptions,
        fileRepository: PostgresFileRepository,
        typeormRepository: Repository<EventQueueModel>,
      ) => {
        await redisProvider.connect();
        const postProcessor = new UserDeletedPostProcessor(
          redisProvider.getDriver(),
          options,
          fileRepository,
          typeormRepository,
        );
        void postProcessor.start();
        return postProcessor;
      },
      inject: [
        NestRedisProvider,
        POST_PROCESSOR_USER_DELETED_OPTIONS,
        PostgresFileRepository,
        getRepositoryToken(EventQueueModel),
      ],
    },
    {
      provide: PostCreatedPostProcessor,
      useFactory: async (
        redisProvider: RedisProvider,
        options: PostProcessorOptions,
        fileRepository: PostgresFileRepository,
      ) => {
        await redisProvider.connect();
        const postProcessor = new PostCreatedPostProcessor(
          redisProvider.getDriver(),
          options,
          fileRepository,
        );
        void postProcessor.start();
        return postProcessor;
      },
      inject: [
        NestRedisProvider,
        POST_PROCESSOR_POST_CREATED_OPTIONS,
        PostgresFileRepository,
      ],
    },
    {
      provide: EventCreatedPostProcessor,
      useFactory: async (
        redisProvider: RedisProvider,
        options: PostProcessorOptions,
        fileRepository: PostgresFileRepository,
      ) => {
        await redisProvider.connect();
        const postProcessor = new EventCreatedPostProcessor(
          redisProvider.getDriver(),
          options,
          fileRepository,
        );
        void postProcessor.start();
        return postProcessor;
      },
      inject: [
        NestRedisProvider,
        POST_PROCESSOR_EVENT_CREATED_OPTIONS,
        PostgresFileRepository,
      ],
    },
    {
      provide: EventCoverReplacedPostProcessor,
      useFactory: async (
        redisProvider: RedisProvider,
        options: PostProcessorOptions,
        fileRepository: PostgresFileRepository,
      ) => {
        await redisProvider.connect();
        const postProcessor = new EventCoverReplacedPostProcessor(
          redisProvider.getDriver(),
          options,
          fileRepository,
        );
        void postProcessor.start();
        return postProcessor;
      },
      inject: [
        NestRedisProvider,
        POST_PROCESSOR_EVENT_COVER_REPLACED_OPTIONS,
        PostgresFileRepository,
      ],
    },
    {
      provide: UserAvatarReplacedPostProcessor,
      useFactory: async (
        redisProvider: RedisProvider,
        options: PostProcessorOptions,
        fileRepository: PostgresFileRepository,
      ) => {
        await redisProvider.connect();
        const postProcessor = new UserAvatarReplacedPostProcessor(
          redisProvider.getDriver(),
          options,
          fileRepository,
        );
        void postProcessor.start();
        return postProcessor;
      },
      inject: [
        NestRedisProvider,
        POST_PROCESSOR_USER_AVATAR_REPLACED_OPTIONS,
        PostgresFileRepository,
      ],
    },
    {
      provide: PostDeletedPostProcessor,
      useFactory: async (
        redisProvider: RedisProvider,
        options: PostProcessorOptions,
        fileRepository: PostgresFileRepository,
      ) => {
        await redisProvider.connect();
        const postProcessor = new PostDeletedPostProcessor(
          redisProvider.getDriver(),
          options,
          fileRepository,
        );
        void postProcessor.start();
        return postProcessor;
      },
      inject: [
        NestRedisProvider,
        POST_PROCESSOR_POST_DELETED_OPTIONS,
        PostgresFileRepository,
      ],
    },
    {
      provide: EventDeletedPostProcessor,
      useFactory: async (
        redisProvider: RedisProvider,
        options: PostProcessorOptions,
        fileRepository: PostgresFileRepository,
      ) => {
        await redisProvider.connect();
        const postProcessor = new EventDeletedPostProcessor(
          redisProvider.getDriver(),
          options,
          fileRepository,
        );
        void postProcessor.start();
        return postProcessor;
      },
      inject: [
        NestRedisProvider,
        POST_PROCESSOR_EVENT_DELETED_OPTIONS,
        PostgresFileRepository,
      ],
    },
  ],
})
export class PostProcessorsModule {}
