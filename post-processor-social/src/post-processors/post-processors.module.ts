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
import { UserDeletedPostProcessor } from './users/user-deleted.post-processor.js';
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
  userDeletedOptionsProvider,
  POST_PROCESSORS_JOB_OUTBOX_SUCCESS_OPTIONS,
  POST_PROCESSORS_JOB_OUTBOX_FAILURE_OPTIONS,
  POST_PROCESSOR_EVENT_CREATED_OPTIONS,
  POST_PROCESSOR_EVENT_DELETED_OPTIONS,
  POST_PROCESSOR_USER_CREATED_OPTIONS,
  POST_PROCESSOR_USER_DELETED_OPTIONS,
  POST_PROCESSOR_POST_CREATED_OPTIONS,
  POST_PROCESSOR_POST_DELETED_OPTIONS,
  postCreatedOptionsProvider,
  postDeletedOptionsProvider,
} from './options/index.js';
import { PostProcessorRegistry } from './post-processor-registry.service.js';

@Module({
  imports: [DomainSocialModule, TypeOrmModule.forFeature([EventQueueModel])],
  providers: [
    PostProcessorRegistry,
    postProcessorsJobOutboxSuccessOptionsProvider,
    postProcessorsJobOutboxFailureOptionsProvider,
    eventCreatedOptionsProvider,
    eventDeletedOptionsProvider,
    userCreatedOptionsProvider,
    userDeletedOptionsProvider,
    postCreatedOptionsProvider,
    postDeletedOptionsProvider,
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
        redisProvider: RedisProvider,
        options: PostProcessorOptions,
        participationService: ParticipationService,
        typeormRepository: Repository<EventQueueModel>,
        registry: PostProcessorRegistry,
      ) => {
        await redisProvider.connect();
        return registry.launch(
          options,
          (launchOptions) =>
            new EventCreatedPostProcessor(
              redisProvider.getDriver(),
              launchOptions,
              participationService,
              typeormRepository,
            ),
        );
      },
      inject: [
        NestRedisProvider,
        POST_PROCESSOR_EVENT_CREATED_OPTIONS,
        ParticipationService,
        getRepositoryToken(EventQueueModel),
        PostProcessorRegistry,
      ],
    },
    {
      provide: EventDeletedPostProcessor,
      useFactory: async (
        redisProvider: RedisProvider,
        options: PostProcessorOptions,
        participationService: ParticipationService,
        typeormRepository: Repository<EventQueueModel>,
        registry: PostProcessorRegistry,
      ) => {
        await redisProvider.connect();
        return registry.launch(
          options,
          (launchOptions) =>
            new EventDeletedPostProcessor(
              redisProvider.getDriver(),
              launchOptions,
              participationService,
              typeormRepository,
            ),
        );
      },
      inject: [
        NestRedisProvider,
        POST_PROCESSOR_EVENT_DELETED_OPTIONS,
        ParticipationService,
        getRepositoryToken(EventQueueModel),
        PostProcessorRegistry,
      ],
    },
    {
      provide: UserCreatedPostProcessor,
      useFactory: async (
        redisProvider: RedisProvider,
        options: PostProcessorOptions,
        socialUserService: SocialUserService,
        typeormRepository: Repository<EventQueueModel>,
        registry: PostProcessorRegistry,
      ) => {
        await redisProvider.connect();
        return registry.launch(
          options,
          (launchOptions) =>
            new UserCreatedPostProcessor(
              redisProvider.getDriver(),
              launchOptions,
              socialUserService,
              typeormRepository,
            ),
        );
      },
      inject: [
        NestRedisProvider,
        POST_PROCESSOR_USER_CREATED_OPTIONS,
        SocialUserService,
        getRepositoryToken(EventQueueModel),
        PostProcessorRegistry,
      ],
    },
    {
      provide: UserDeletedPostProcessor,
      useFactory: async (
        redisProvider: RedisProvider,
        options: PostProcessorOptions,
        socialUserService: SocialUserService,
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
              socialUserService,
              typeormRepository,
            ),
        );
      },
      inject: [
        NestRedisProvider,
        POST_PROCESSOR_USER_DELETED_OPTIONS,
        SocialUserService,
        getRepositoryToken(EventQueueModel),
        PostProcessorRegistry,
      ],
    },
    {
      provide: PostCreatedPostProcessor,
      useFactory: async (
        redisProvider: RedisProvider,
        options: PostProcessorOptions,
        publicationService: PublicationService,
        typeormRepository: Repository<EventQueueModel>,
        registry: PostProcessorRegistry,
      ) => {
        await redisProvider.connect();
        return registry.launch(
          options,
          (launchOptions) =>
            new PostCreatedPostProcessor(
              redisProvider.getDriver(),
              launchOptions,
              publicationService,
              typeormRepository,
            ),
        );
      },
      inject: [
        NestRedisProvider,
        POST_PROCESSOR_POST_CREATED_OPTIONS,
        PublicationService,
        getRepositoryToken(EventQueueModel),
        PostProcessorRegistry,
      ],
    },
    {
      provide: PostDeletedPostProcessor,
      useFactory: async (
        redisProvider: RedisProvider,
        options: PostProcessorOptions,
        publicationService: PublicationService,
        typeormRepository: Repository<EventQueueModel>,
        registry: PostProcessorRegistry,
      ) => {
        await redisProvider.connect();
        return registry.launch(
          options,
          (launchOptions) =>
            new PostDeletedPostProcessor(
              redisProvider.getDriver(),
              launchOptions,
              publicationService,
              typeormRepository,
            ),
        );
      },
      inject: [
        NestRedisProvider,
        POST_PROCESSOR_POST_DELETED_OPTIONS,
        PublicationService,
        getRepositoryToken(EventQueueModel),
        PostProcessorRegistry,
      ],
    },
  ],
})
export class PostProcessorsModule {}
