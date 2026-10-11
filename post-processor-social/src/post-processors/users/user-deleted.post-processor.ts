import { BatchPostProcessor } from '@volontariapp/post-processors';
import { Injectable } from '@nestjs/common';
import { SocialUserService, UserId } from '@volontariapp/domain-social';
import type {
  BatchEventItem,
  PostProcessorOptions,
  ParseResult,
} from '@volontariapp/post-processors';
import type { Redis } from 'ioredis';
import {
  UserEventMessagingType,
  SocialEventMessagingType,
  type IUserDeleledPayload,
  type IUserSocialDeletedPayload,
  type IUserSocialDeletionFailedPayload,
  type StreamEvent,
} from '@volontariapp/messaging';
import {
  databaseMapper,
  EventQueueEntity,
  EventQueueModel,
  type Repository,
} from '@volontariapp/database';
import { InjectRepository } from '@nestjs/typeorm';
import { Streams } from '@volontariapp/shared';
import { EventQueueWriter, EventQueueRepository } from '@volontariapp/outbox';

databaseMapper.registerBidirectional(EventQueueModel, EventQueueEntity);

@Injectable()
export class UserDeletedPostProcessor extends BatchPostProcessor<UserEventMessagingType.USER_DELETED> {
  protected async processEvents(
    events: BatchEventItem<UserEventMessagingType.USER_DELETED>[],
  ): Promise<void> {
    const queueEntities: EventQueueEntity<SocialEventMessagingType.USER_SOCIAL_DELETED>[] =
      [];

    for (const { event, messageId } of events) {
      const payload: IUserDeleledPayload = event.payload.after;

      if (!payload.id) {
        this.logger.error('Invalid payload for USER_DELETED: missing id', {
          messageId,
          payload: event.payload,
        });
        continue;
      }

      try {
        await this.socialUserService.purgeUser(new UserId(payload.id));
        this.logger.info('Successfully purged social user node', {
          messageId,
          userId: payload.id,
        });

        const payloadSocialEvent: IUserSocialDeletedPayload = {
          userId: payload.id,
        };

        const queueEntity =
          EventQueueEntity.createEvent<SocialEventMessagingType.USER_SOCIAL_DELETED>(
            {
              type: SocialEventMessagingType.USER_SOCIAL_DELETED,
              emitter: event.emitter,
              emitterId: event.emitterId,
              traceId: event.traceId,
              correlationId: event.correlationId,
              payload: payloadSocialEvent,
              targetServices: [Streams.WS_USER_DELETED_FEEDBACK],
            },
          );

        queueEntities.push(queueEntity);
      } catch (error) {
        this.logger.error('Error processing USER_DELETED', error, {
          messageId,
          userId: payload.id,
        });
        throw error;
      }
    }

    if (queueEntities.length > 0) {
      try {
        const eventQueueWriter =
          new EventQueueWriter<SocialEventMessagingType.USER_SOCIAL_DELETED>(
            this.logger,
            new EventQueueRepository<SocialEventMessagingType.USER_SOCIAL_DELETED>(
              this.typeormRepository,
            ),
          );

        this.logger.info(
          `Inserting ${String(queueEntities.length)} USER_DELETED into event_queue for ws:user stream`,
        );

        await eventQueueWriter.createMany(queueEntities);
      } catch (error) {
        this.logger.error(
          'Error batch inserting USER_DELETED into event_queue',
          error,
        );
        throw error;
      }
    }
  }

  protected override async sendMessageToDlq(
    messageId: string,
    originalPayload: ParseResult,
    error: string,
  ): Promise<void> {
    await super.sendMessageToDlq(messageId, originalPayload, error);

    if (!originalPayload.success) {
      this.logger.warn(
        'Original payload failed to parse, cannot send WS feedback',
        { messageId },
      );
      return;
    }

    try {
      const event = JSON.parse(
        originalPayload.payload,
      ) as StreamEvent<IUserDeleledPayload>;
      const payload: IUserDeleledPayload = event.payload.after;

      const failPayload: IUserSocialDeletionFailedPayload = {
        userId: payload.id,
        errorReason: error,
      };

      const queueEntity =
        EventQueueEntity.createEvent<SocialEventMessagingType.USER_SOCIAL_DELETION_FAILED>(
          {
            type: SocialEventMessagingType.USER_SOCIAL_DELETION_FAILED,
            emitter: event.emitter,
            emitterId: event.emitterId,
            traceId: event.traceId,
            correlationId: event.correlationId,
            payload: failPayload,
            targetServices: [Streams.WS_USER_DELETED_FEEDBACK],
          },
        );

      const repo =
        new EventQueueRepository<SocialEventMessagingType.USER_SOCIAL_DELETION_FAILED>(
          this.typeormRepository,
        );
      await new EventQueueWriter(this.logger, repo).createMany([queueEntity]);

      this.logger.info('Inserted WS failure feedback event into event_queue', {
        messageId,
      });
    } catch (parseError) {
      this.logger.error(
        'Failed to parse original payload for WS failure feedback',
        parseError,
        { messageId },
      );
    }
  }

  constructor(
    redisClient: Redis,
    options: PostProcessorOptions,
    private readonly socialUserService: SocialUserService,
    @InjectRepository(EventQueueModel)
    private readonly typeormRepository: Repository<EventQueueModel>,
  ) {
    super(redisClient, options);
  }

  protected override shouldProcess(
    eventType: UserEventMessagingType | string,
  ): boolean {
    return eventType === UserEventMessagingType.USER_DELETED.toString();
  }
}
