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
import { DomainPostModule } from '../domain/domain-post.module.js';
import {
  PostService,
  CommentService,
  PostgresPostRepository,
} from '@volontariapp/domain-post';
import {
  postProcessorsJobOutboxFailureOptionsProvider,
  postProcessorsJobOutboxSuccessOptionsProvider,
  userDeletedOptionsProvider,
  postProcessorsStorageFileScannedOptionsProvider,
  postProcessorsStorageFileRejectedOptionsProvider,
  postProcessorsStorageAttachmentRejectedOptionsProvider,
  POST_PROCESSORS_JOB_OUTBOX_SUCCESS_OPTIONS,
  POST_PROCESSORS_JOB_OUTBOX_FAILURE_OPTIONS,
  POST_PROCESSOR_USER_DELETED_OPTIONS,
  POST_PROCESSORS_STORAGE_FILE_SCANNED_OPTIONS,
  POST_PROCESSORS_STORAGE_FILE_REJECTED_OPTIONS,
  POST_PROCESSORS_STORAGE_ATTACHMENT_REJECTED_OPTIONS,
} from './options/index.js';
import { UserDeletedPostProcessor } from './user-deleted.post-processor.js';
import { StorageFileScannedPostProcessor } from './storage-file-scanned.post-processor.js';
import { StorageFileRejectedPostProcessor } from './storage-file-rejected.post-processor.js';
import { StorageAttachmentRejectedPostProcessor } from './storage-attachment-rejected.post-processor.js';
import { PostProcessorRegistry } from './post-processor-registry.service.js';

@Module({
  imports: [DomainPostModule, TypeOrmModule.forFeature([EventQueueModel])],
  providers: [
    PostProcessorRegistry,
    postProcessorsJobOutboxSuccessOptionsProvider,
    postProcessorsJobOutboxFailureOptionsProvider,
    userDeletedOptionsProvider,
    postProcessorsStorageFileScannedOptionsProvider,
    postProcessorsStorageFileRejectedOptionsProvider,
    postProcessorsStorageAttachmentRejectedOptionsProvider,
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
        POST_PROCESSORS_JOB_OUTBOX_SUCCESS_OPTIONS,
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
        POST_PROCESSORS_JOB_OUTBOX_FAILURE_OPTIONS,
        PostProcessorRegistry,
      ],
    },
    {
      provide: UserDeletedPostProcessor,
      useFactory: async (
        redisProvider: RedisProvider,
        options: PostProcessorOptions,
        postService: PostService,
        commentService: CommentService,
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
              postService,
              commentService,
              typeormRepository,
            ),
        );
      },
      inject: [
        NestRedisProvider,
        POST_PROCESSOR_USER_DELETED_OPTIONS,
        PostService,
        CommentService,
        getRepositoryToken(EventQueueModel),
        PostProcessorRegistry,
      ],
    },
    {
      provide: StorageFileScannedPostProcessor,
      useFactory: async (
        dbProvider: PostgresProvider,
        redisProvider: RedisProvider,
        options: PostProcessorOptions,
        registry: PostProcessorRegistry,
        postRepository: PostgresPostRepository,
      ) => {
        await dbProvider.connect();
        await redisProvider.connect();
        return registry.launch(
          options,
          (launchOptions) =>
            new StorageFileScannedPostProcessor(
              dbProvider.getDriver(),
              redisProvider.getDriver(),
              launchOptions,
              postRepository,
            ),
        );
      },
      inject: [
        NestPostgresProvider,
        NestRedisProvider,
        POST_PROCESSORS_STORAGE_FILE_SCANNED_OPTIONS,
        PostProcessorRegistry,
        PostgresPostRepository,
      ],
    },
    {
      provide: StorageFileRejectedPostProcessor,
      useFactory: async (
        dbProvider: PostgresProvider,
        redisProvider: RedisProvider,
        options: PostProcessorOptions,
        registry: PostProcessorRegistry,
        postRepository: PostgresPostRepository,
      ) => {
        await dbProvider.connect();
        await redisProvider.connect();
        return registry.launch(
          options,
          (launchOptions) =>
            new StorageFileRejectedPostProcessor(
              dbProvider.getDriver(),
              redisProvider.getDriver(),
              launchOptions,
              postRepository,
            ),
        );
      },
      inject: [
        NestPostgresProvider,
        NestRedisProvider,
        POST_PROCESSORS_STORAGE_FILE_REJECTED_OPTIONS,
        PostProcessorRegistry,
        PostgresPostRepository,
      ],
    },
    {
      provide: StorageAttachmentRejectedPostProcessor,
      useFactory: async (
        dbProvider: PostgresProvider,
        redisProvider: RedisProvider,
        options: PostProcessorOptions,
        registry: PostProcessorRegistry,
        postRepository: PostgresPostRepository,
      ) => {
        await dbProvider.connect();
        await redisProvider.connect();
        return registry.launch(
          options,
          (launchOptions) =>
            new StorageAttachmentRejectedPostProcessor(
              dbProvider.getDriver(),
              redisProvider.getDriver(),
              launchOptions,
              postRepository,
            ),
        );
      },
      inject: [
        NestPostgresProvider,
        NestRedisProvider,
        POST_PROCESSORS_STORAGE_ATTACHMENT_REJECTED_OPTIONS,
        PostProcessorRegistry,
        PostgresPostRepository,
      ],
    },
  ],
})
export class PostProcessorsModule {}
