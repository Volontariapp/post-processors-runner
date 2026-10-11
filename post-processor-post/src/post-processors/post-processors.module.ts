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
import { PostService, CommentService } from '@volontariapp/domain-post';
import {
  postProcessorsJobOutboxFailureOptionsProvider,
  postProcessorsJobOutboxSuccessOptionsProvider,
  userDeletedOptionsProvider,
  POST_PROCESSORS_JOB_OUTBOX_SUCCESS_OPTIONS,
  POST_PROCESSORS_JOB_OUTBOX_FAILURE_OPTIONS,
  POST_PROCESSOR_USER_DELETED_OPTIONS,
} from './options/index.js';
import { UserDeletedPostProcessor } from './user-deleted.post-processor.js';

@Module({
  imports: [DomainPostModule, TypeOrmModule.forFeature([EventQueueModel])],
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
      provide: UserDeletedPostProcessor,
      useFactory: async (
        redisProvider: RedisProvider,
        options: PostProcessorOptions,
        postService: PostService,
        commentService: CommentService,
        typeormRepository: Repository<EventQueueModel>,
      ) => {
        await redisProvider.connect();
        const postProcessor = new UserDeletedPostProcessor(
          redisProvider.getDriver(),
          options,
          postService,
          commentService,
          typeormRepository,
        );
        void postProcessor.start();
        return postProcessor;
      },
      inject: [
        NestRedisProvider,
        POST_PROCESSOR_USER_DELETED_OPTIONS,
        PostService,
        CommentService,
        getRepositoryToken(EventQueueModel),
      ],
    },
  ],
})
export class PostProcessorsModule {}
