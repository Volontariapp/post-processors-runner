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
import { PostProcessorRegistry } from './post-processor-registry.service.js';

@Module({
  imports: [DomainStorageModule, TypeOrmModule.forFeature([EventQueueModel])],
  providers: [
    PostProcessorRegistry,
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
      provide: UserDeletedPostProcessor,
      useFactory: async (
        redisProvider: RedisProvider,
        options: PostProcessorOptions,
        fileRepository: PostgresFileRepository,
        typeormRepository: Repository<EventQueueModel>,
        registry: PostProcessorRegistry,
      ) => {
        await redisProvider.connect();
        return registry.launch(
          options,
          (launchOptions) =>
            new UserDeletedPostProcessor(
              redisProvider.getDriver(),
              launchOptions,
              fileRepository,
              typeormRepository,
            ),
        );
      },
      inject: [
        NestRedisProvider,
        POST_PROCESSOR_USER_DELETED_OPTIONS,
        PostgresFileRepository,
        getRepositoryToken(EventQueueModel),
        PostProcessorRegistry,
      ],
    },
    {
      provide: PostCreatedPostProcessor,
      useFactory: async (
        redisProvider: RedisProvider,
        options: PostProcessorOptions,
        fileRepository: PostgresFileRepository,
        registry: PostProcessorRegistry,
      ) => {
        await redisProvider.connect();
        return registry.launch(
          options,
          (launchOptions) =>
            new PostCreatedPostProcessor(
              redisProvider.getDriver(),
              launchOptions,
              fileRepository,
            ),
        );
      },
      inject: [
        NestRedisProvider,
        POST_PROCESSOR_POST_CREATED_OPTIONS,
        PostgresFileRepository,
        PostProcessorRegistry,
      ],
    },
    {
      provide: EventCreatedPostProcessor,
      useFactory: async (
        redisProvider: RedisProvider,
        options: PostProcessorOptions,
        fileRepository: PostgresFileRepository,
        registry: PostProcessorRegistry,
      ) => {
        await redisProvider.connect();
        return registry.launch(
          options,
          (launchOptions) =>
            new EventCreatedPostProcessor(
              redisProvider.getDriver(),
              launchOptions,
              fileRepository,
            ),
        );
      },
      inject: [
        NestRedisProvider,
        POST_PROCESSOR_EVENT_CREATED_OPTIONS,
        PostgresFileRepository,
        PostProcessorRegistry,
      ],
    },
    {
      provide: EventCoverReplacedPostProcessor,
      useFactory: async (
        redisProvider: RedisProvider,
        options: PostProcessorOptions,
        fileRepository: PostgresFileRepository,
        registry: PostProcessorRegistry,
      ) => {
        await redisProvider.connect();
        return registry.launch(
          options,
          (launchOptions) =>
            new EventCoverReplacedPostProcessor(
              redisProvider.getDriver(),
              launchOptions,
              fileRepository,
            ),
        );
      },
      inject: [
        NestRedisProvider,
        POST_PROCESSOR_EVENT_COVER_REPLACED_OPTIONS,
        PostgresFileRepository,
        PostProcessorRegistry,
      ],
    },
    {
      provide: UserAvatarReplacedPostProcessor,
      useFactory: async (
        redisProvider: RedisProvider,
        options: PostProcessorOptions,
        fileRepository: PostgresFileRepository,
        registry: PostProcessorRegistry,
      ) => {
        await redisProvider.connect();
        return registry.launch(
          options,
          (launchOptions) =>
            new UserAvatarReplacedPostProcessor(
              redisProvider.getDriver(),
              launchOptions,
              fileRepository,
            ),
        );
      },
      inject: [
        NestRedisProvider,
        POST_PROCESSOR_USER_AVATAR_REPLACED_OPTIONS,
        PostgresFileRepository,
        PostProcessorRegistry,
      ],
    },
    {
      provide: PostDeletedPostProcessor,
      useFactory: async (
        redisProvider: RedisProvider,
        options: PostProcessorOptions,
        fileRepository: PostgresFileRepository,
        registry: PostProcessorRegistry,
      ) => {
        await redisProvider.connect();
        return registry.launch(
          options,
          (launchOptions) =>
            new PostDeletedPostProcessor(
              redisProvider.getDriver(),
              launchOptions,
              fileRepository,
            ),
        );
      },
      inject: [
        NestRedisProvider,
        POST_PROCESSOR_POST_DELETED_OPTIONS,
        PostgresFileRepository,
        PostProcessorRegistry,
      ],
    },
    {
      provide: EventDeletedPostProcessor,
      useFactory: async (
        redisProvider: RedisProvider,
        options: PostProcessorOptions,
        fileRepository: PostgresFileRepository,
        registry: PostProcessorRegistry,
      ) => {
        await redisProvider.connect();
        return registry.launch(
          options,
          (launchOptions) =>
            new EventDeletedPostProcessor(
              redisProvider.getDriver(),
              launchOptions,
              fileRepository,
            ),
        );
      },
      inject: [
        NestRedisProvider,
        POST_PROCESSOR_EVENT_DELETED_OPTIONS,
        PostgresFileRepository,
        PostProcessorRegistry,
      ],
    },
  ],
})
export class PostProcessorsModule {}
