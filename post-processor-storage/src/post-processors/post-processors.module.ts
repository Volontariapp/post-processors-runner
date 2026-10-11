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
  JOB_OUTBOX_SUCCESS_POST_PROCESSOR_OPTIONS,
  JOB_OUTBOX_FAILED_POST_PROCESSOR_OPTIONS,
  POST_PROCESSOR_USER_DELETED_OPTIONS,
} from './options/index.js';
import { UserDeletedPostProcessor } from './user-deleted.post-processor.js';

@Module({
  imports: [DomainStorageModule, TypeOrmModule.forFeature([EventQueueModel])],
  providers: [
    postProcessorsJobOutboxSuccessOptionsProvider,
    postProcessorsJobOutboxFailureOptionsProvider,
    userDeletedOptionsProvider,
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
  ],
})
export class PostProcessorsModule {}
