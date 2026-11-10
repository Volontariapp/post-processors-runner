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
  postProcessorsUserDeletedOptionsProvider,
  postProcessorsStorageFileScannedOptionsProvider,
  postProcessorsStorageFileRejectedOptionsProvider,
  postProcessorsStorageAttachmentRejectedOptionsProvider,
  POST_PROCESSORS_JOB_OUTBOX_SUCCESS_OPTIONS,
  POST_PROCESSORS_JOB_OUTBOX_FAILURE_OPTIONS,
  POST_PROCESSORS_EVENT_CREATED_OPTIONS,
  POST_PROCESSORS_EVENT_CREATION_FAILED_OPTIONS,
  POST_PROCESSORS_EVENT_CREATION_SUCCESSFULL_OPTIONS,
  POST_PROCESSORS_USER_DELETED_OPTIONS,
  POST_PROCESSORS_STORAGE_FILE_SCANNED_OPTIONS,
  POST_PROCESSORS_STORAGE_FILE_REJECTED_OPTIONS,
  POST_PROCESSORS_STORAGE_ATTACHMENT_REJECTED_OPTIONS,
} from './options/index.js';
import { CustomConfig } from '../config/custom-config.js';
import { EventCreatedPostProcessor } from './event-created.post-processor.js';
import { EventCreationFailedPostProcessor } from './event-creation-failed.post-processor.js';
import { EventCreationSuccessfullPostProcessor } from './event-creation-successfull.post-processor.js';
import { UserDeletedPostProcessor } from './user-deleted.post-processor.js';
import { StorageFileScannedPostProcessor } from './storage-file-scanned.post-processor.js';
import { StorageFileRejectedPostProcessor } from './storage-file-rejected.post-processor.js';
import { StorageAttachmentRejectedPostProcessor } from './storage-attachment-rejected.post-processor.js';
import { PostProcessorRegistry } from './post-processor-registry.service.js';

@Module({
  providers: [
    PostProcessorRegistry,
    postProcessorsJobOutboxSuccessOptionsProvider,
    postProcessorsJobOutboxFailureOptionsProvider,
    postProcessorsEventCreatedOptionsProvider,
    postProcessorsEventCreationFailedOptionsProvider,
    postProcessorsEventCreationSuccessfullOptionsProvider,
    postProcessorsUserDeletedOptionsProvider,
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
      provide: EventCreatedPostProcessor,
      useFactory: async (
        dbProvider: PostgresProvider,
        redisProvider: RedisProvider,
        options: PostProcessorOptions,
        customConfig: CustomConfig,
        registry: PostProcessorRegistry,
      ) => {
        await dbProvider.connect();
        await redisProvider.connect();
        return registry.launch(
          options,
          (launchOptions) =>
            new EventCreatedPostProcessor(
              dbProvider.getDriver(),
              redisProvider.getDriver(),
              launchOptions,
              customConfig.geocoding.enabled,
            ),
        );
      },
      inject: [
        NestPostgresProvider,
        NestRedisProvider,
        POST_PROCESSORS_EVENT_CREATED_OPTIONS,
        CustomConfig,
        PostProcessorRegistry,
      ],
    },
    {
      provide: EventCreationFailedPostProcessor,
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
            new EventCreationFailedPostProcessor(
              dbProvider.getDriver(),
              redisProvider.getDriver(),
              launchOptions,
            ),
        );
      },
      inject: [
        NestPostgresProvider,
        NestRedisProvider,
        POST_PROCESSORS_EVENT_CREATION_FAILED_OPTIONS,
        PostProcessorRegistry,
      ],
    },
    {
      provide: EventCreationSuccessfullPostProcessor,
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
            new EventCreationSuccessfullPostProcessor(
              dbProvider.getDriver(),
              redisProvider.getDriver(),
              launchOptions,
            ),
        );
      },
      inject: [
        NestPostgresProvider,
        NestRedisProvider,
        POST_PROCESSORS_EVENT_CREATION_SUCCESSFULL_OPTIONS,
        PostProcessorRegistry,
      ],
    },
    {
      provide: UserDeletedPostProcessor,
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
            new UserDeletedPostProcessor(
              dbProvider.getDriver(),
              redisProvider.getDriver(),
              launchOptions,
            ),
        );
      },
      inject: [
        NestPostgresProvider,
        NestRedisProvider,
        POST_PROCESSORS_USER_DELETED_OPTIONS,
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
            ),
        );
      },
      inject: [
        NestPostgresProvider,
        NestRedisProvider,
        POST_PROCESSORS_STORAGE_FILE_SCANNED_OPTIONS,
        PostProcessorRegistry,
      ],
    },
    {
      provide: StorageFileRejectedPostProcessor,
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
            new StorageFileRejectedPostProcessor(
              dbProvider.getDriver(),
              redisProvider.getDriver(),
              launchOptions,
            ),
        );
      },
      inject: [
        NestPostgresProvider,
        NestRedisProvider,
        POST_PROCESSORS_STORAGE_FILE_REJECTED_OPTIONS,
        PostProcessorRegistry,
      ],
    },
    {
      provide: StorageAttachmentRejectedPostProcessor,
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
            new StorageAttachmentRejectedPostProcessor(
              dbProvider.getDriver(),
              redisProvider.getDriver(),
              launchOptions,
            ),
        );
      },
      inject: [
        NestPostgresProvider,
        NestRedisProvider,
        POST_PROCESSORS_STORAGE_ATTACHMENT_REJECTED_OPTIONS,
        PostProcessorRegistry,
      ],
    },
  ],
})
export class PostProcessorsModule {}
