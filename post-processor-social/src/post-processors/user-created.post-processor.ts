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
  WebsocketEventMessagingType,
  type IUserCreatedPayload,
  type IUserCreatedWebsocketPayload,
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
export class UserCreatedPostProcessor extends BatchPostProcessor<UserEventMessagingType.USER_CREATED> {
  protected async processEvents(
    events: BatchEventItem<UserEventMessagingType.USER_CREATED>[],
  ): Promise<void> {
    const queueEntities: EventQueueEntity<WebsocketEventMessagingType.WS_USER_CREATED>[] =
      [];

    await Promise.all(
      events.map(async ({ event, messageId }) => {
        const payload: IUserCreatedPayload = event.payload.after;

        if (!payload.id) {
          this.logger.error('Invalid payload for USER_CREATED: missing id', {
            messageId,
            payload: event.payload,
          });
          return;
        }

        try {
          await this.socialUserService.createUser(new UserId(payload.id));
          this.logger.info('Successfully created social user node', {
            messageId,
            userId: payload.id,
          });

          const payloadWsEvent: IUserCreatedWebsocketPayload = {
            id: payload.id,
            role: payload.role,
          };

          const queueEntity =
            EventQueueEntity.createEvent<WebsocketEventMessagingType.WS_USER_CREATED>(
              {
                type: WebsocketEventMessagingType.WS_USER_CREATED,
                emitter: event.emitter,
                emitterId: event.emitterId,
                traceId: event.traceId,
                payload: payloadWsEvent,
                targetServices: [Streams.WS_USER],
              },
            );

          queueEntities.push(queueEntity);
        } catch (error) {
          this.logger.error('Error processing USER_CREATED', error, {
            messageId,
            payload: event.payload,
          });
        }
      }),
    );

    if (queueEntities.length > 0) {
      try {
        const eventQueueWriter =
          new EventQueueWriter<WebsocketEventMessagingType.WS_USER_CREATED>(
            this.logger,
            new EventQueueRepository<WebsocketEventMessagingType.WS_USER_CREATED>(
              this.typeormRepository,
            ),
          );

        this.logger.info(
          `Inserting ${String(queueEntities.length)} USER_CREATED into event_queue for ws:user stream`,
        );

        await eventQueueWriter.createMany(queueEntities);
      } catch (error) {
        this.logger.error(
          'Error batch inserting USER_CREATED into event_queue',
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
    return eventType === UserEventMessagingType.USER_CREATED.toString();
  }
}
