import { Module } from '@nestjs/common';
import { PostgresProvider, RedisProvider } from '@volontariapp/bridge';
import {
  NestPostgresProvider,
  NestRedisProvider,
} from '@volontariapp/bridge-nest';
import { ParticipationService } from '@volontariapp/domain-social';
import {
  JobOutboxSuccessPostProcessor,
  JobOutboxFailedPostProcessor,
  PostProcessorOptions,
} from '@volontariapp/post-processors';
import { EventCreatedPostProcessor } from './events/event-created.post-processor.js';
import { EventDeletedPostProcessor } from './events/event-deleted.post-processor.js';
import { UserCreatedPostProcessor } from './users/user-created.post-processor.js';
import { PostCreatedPostProcessor } from './posts/post-created.post-processor.js';
import { PostDeletedPostProcessor } from './posts/post-deleted.post-processor.js';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { EventQueueModel } from '@volontariapp/database';
import { Repository } from 'typeorm';
import { DomainSocialModule } from '../domain/domain-social.module.js';
import {
  SocialUserService,
  PublicationService,
} from '@volontariapp/domain-social';
import {
  postProcessorsJobOutboxFailureOptionsProvider,
  postProcessorsJobOutboxSuccessOptionsProvider,
  eventCreatedOptionsProvider,
  eventDeletedOptionsProvider,
  userCreatedOptionsProvider,
  POST_PROCESSORS_JOB_OUTBOX_SUCCESS_OPTIONS,
  POST_PROCESSORS_JOB_OUTBOX_FAILURE_OPTIONS,
  POST_PROCESSOR_EVENT_CREATED_OPTIONS,
  POST_PROCESSOR_EVENT_DELETED_OPTIONS,
  POST_PROCESSOR_USER_CREATED_OPTIONS,
  POST_PROCESSOR_POST_CREATED_OPTIONS,
  POST_PROCESSOR_POST_DELETED_OPTIONS,
  postCreatedOptionsProvider,
  postDeletedOptionsProvider,
} from './options/index.js';
@Module({
  imports: [DomainSocialModule, TypeOrmModule.forFeature([EventQueueModel])],
  providers: [
    postProcessorsJobOutboxSuccessOptionsProvider,
    postProcessorsJobOutboxFailureOptionsProvider,
    eventCreatedOptionsProvider,
    eventDeletedOptionsProvider,
    userCreatedOptionsProvider,
    postCreatedOptionsProvider,
    postDeletedOptionsProvider,
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
        redisProvider: RedisProvider,
        options: PostProcessorOptions,
        participationService: ParticipationService,
        typeormRepository: Repository<EventQueueModel>,
      ) => {
        await redisProvider.connect();
        const postProcessor = new EventCreatedPostProcessor(
          redisProvider.getDriver(),
          options,
          participationService,
          typeormRepository,
        );
        void postProcessor.start();
        return postProcessor;
      },
      inject: [
        NestRedisProvider,
        POST_PROCESSOR_EVENT_CREATED_OPTIONS,
        ParticipationService,
        getRepositoryToken(EventQueueModel),
      ],
    },
    {
      provide: EventDeletedPostProcessor,
      useFactory: async (
        redisProvider: RedisProvider,
        options: PostProcessorOptions,
        participationService: ParticipationService,
        typeormRepository: Repository<EventQueueModel>,
      ) => {
        await redisProvider.connect();
        const postProcessor = new EventDeletedPostProcessor(
          redisProvider.getDriver(),
          options,
          participationService,
          typeormRepository,
        );
        void postProcessor.start();
        return postProcessor;
      },
      inject: [
        NestRedisProvider,
        POST_PROCESSOR_EVENT_DELETED_OPTIONS,
        ParticipationService,
        getRepositoryToken(EventQueueModel),
      ],
    },
    {
      provide: UserCreatedPostProcessor,
      useFactory: async (
        redisProvider: RedisProvider,
        options: PostProcessorOptions,
        socialUserService: SocialUserService,
        typeormRepository: Repository<EventQueueModel>,
      ) => {
        await redisProvider.connect();
        const postProcessor = new UserCreatedPostProcessor(
          redisProvider.getDriver(),
          options,
          socialUserService,
          typeormRepository,
        );
        void postProcessor.start();
        return postProcessor;
      },
      inject: [
        NestRedisProvider,
        POST_PROCESSOR_USER_CREATED_OPTIONS,
        SocialUserService,
        getRepositoryToken(EventQueueModel),
      ],
    },
    {
      provide: PostCreatedPostProcessor,
      useFactory: async (
        redisProvider: RedisProvider,
        options: PostProcessorOptions,
        publicationService: PublicationService,
        typeormRepository: Repository<EventQueueModel>,
      ) => {
        await redisProvider.connect();
        const postProcessor = new PostCreatedPostProcessor(
          redisProvider.getDriver(),
          options,
          publicationService,
          typeormRepository,
        );
        void postProcessor.start();
        return postProcessor;
      },
      inject: [
        NestRedisProvider,
        POST_PROCESSOR_POST_CREATED_OPTIONS,
        PublicationService,
        getRepositoryToken(EventQueueModel),
      ],
    },
    {
      provide: PostDeletedPostProcessor,
      useFactory: async (
        redisProvider: RedisProvider,
        options: PostProcessorOptions,
        publicationService: PublicationService,
        typeormRepository: Repository<EventQueueModel>,
      ) => {
        await redisProvider.connect();
        const postProcessor = new PostDeletedPostProcessor(
          redisProvider.getDriver(),
          options,
          publicationService,
          typeormRepository,
        );
        void postProcessor.start();
        return postProcessor;
      },
      inject: [
        NestRedisProvider,
        POST_PROCESSOR_POST_DELETED_OPTIONS,
        PublicationService,
        getRepositoryToken(EventQueueModel),
      ],
    },
  ],
})
export class PostProcessorsModule {}
