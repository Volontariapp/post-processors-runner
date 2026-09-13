import { BatchPostProcessor } from '@volontariapp/post-processors';
import { Injectable } from '@nestjs/common';
import { SocialUserService, UserId } from '@volontariapp/domain-social';
import type {
  BatchEventItem,
  PostProcessorOptions,
} from '@volontariapp/post-processors';
import type { Redis } from 'ioredis';
import {
  UserEventMessagingType,
  SocialEventMessagingType,
  IUserDeleledPayload,
  IUserSocialDeletedPayload,
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

    await Promise.all(
      events.map(async ({ event, messageId }) => {
        const payload: IUserDeleledPayload = event.payload.after;

        if (!payload.id) {
          this.logger.error('Invalid payload for USER_DELETED: missing id', {
            messageId,
            payload: event.payload,
          });
          return;
        }

        try {
          await this.socialUserService.deleteUser(new UserId(payload.id));
          this.logger.info('Successfully deleted social user node', {
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
            payload: event.payload,
          });
        }
      }),
    );

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
      }
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
