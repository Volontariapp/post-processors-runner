import { Module } from '@nestjs/common';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { EventQueueModel } from '@volontariapp/database';
import {
  RankingLikeLogService,
  RankingMentionService,
  RankingPurgeService,
  RankingWishService,
} from '@volontariapp/domain-ranking';
import { DomainRankingModule } from '../domain/domain-ranking.module.js';
import { RankingJobWriter } from '../domain/ranking-job-writer.js';
import { postProcessorProvider } from './helpers/post-processor-provider.helpers.js';
import { EventCreatedPostProcessor } from './events/event-created.post-processor.js';
import { EventFinishedPostProcessor } from './events/event-finished.post-processor.js';
import { EventUnwishedPostProcessor } from './events/event-unwished.post-processor.js';
import { EventWishedPostProcessor } from './events/event-wished.post-processor.js';
import { PostCreatedPostProcessor } from './posts/post-created.post-processor.js';
import { PostDeletedPostProcessor } from './posts/post-deleted.post-processor.js';
import { PostLikedPostProcessor } from './posts/post-liked.post-processor.js';
import { PostUnlikedPostProcessor } from './posts/post-unliked.post-processor.js';
import { UserCreatedPostProcessor } from './users/user-created.post-processor.js';
import { UserDeletedPostProcessor } from './users/user-deleted.post-processor.js';
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
  JOB_OUTBOX_SUCCESS_POST_PROCESSOR_OPTIONS,
  JOB_OUTBOX_FAILED_POST_PROCESSOR_OPTIONS,
  rankingOptionsProviders,
  EVENT_CREATED_OPTIONS,
  EVENT_FINISHED_OPTIONS,
  EVENT_UNWISHED_OPTIONS,
  EVENT_WISHED_OPTIONS,
  POST_CREATED_OPTIONS,
  POST_DELETED_OPTIONS,
  POST_LIKED_OPTIONS,
  POST_UNLIKED_OPTIONS,
  USER_CREATED_OPTIONS,
  USER_DELETED_OPTIONS,
} from './options/index.js';

@Module({
  imports: [DomainRankingModule, TypeOrmModule.forFeature([EventQueueModel])],
  providers: [
    postProcessorsJobOutboxSuccessOptionsProvider,
    postProcessorsJobOutboxFailureOptionsProvider,
    ...rankingOptionsProviders,
    postProcessorProvider(UserCreatedPostProcessor, USER_CREATED_OPTIONS, [
      RankingJobWriter,
    ]),
    postProcessorProvider(UserDeletedPostProcessor, USER_DELETED_OPTIONS, [
      RankingPurgeService,
      getRepositoryToken(EventQueueModel),
    ]),
    postProcessorProvider(EventWishedPostProcessor, EVENT_WISHED_OPTIONS, [
      RankingWishService,
      RankingJobWriter,
    ]),
    postProcessorProvider(EventUnwishedPostProcessor, EVENT_UNWISHED_OPTIONS, [
      RankingWishService,
      RankingJobWriter,
    ]),
    postProcessorProvider(EventCreatedPostProcessor, EVENT_CREATED_OPTIONS, [
      RankingJobWriter,
    ]),
    postProcessorProvider(EventFinishedPostProcessor, EVENT_FINISHED_OPTIONS, [
      RankingJobWriter,
    ]),
    postProcessorProvider(PostCreatedPostProcessor, POST_CREATED_OPTIONS, [
      RankingMentionService,
      RankingJobWriter,
    ]),
    postProcessorProvider(PostLikedPostProcessor, POST_LIKED_OPTIONS, [
      RankingLikeLogService,
    ]),
    postProcessorProvider(PostUnlikedPostProcessor, POST_UNLIKED_OPTIONS, [
      RankingLikeLogService,
    ]),
    postProcessorProvider(PostDeletedPostProcessor, POST_DELETED_OPTIONS, [
      RankingMentionService,
    ]),
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
  ],
})
export class PostProcessorsModule {}
