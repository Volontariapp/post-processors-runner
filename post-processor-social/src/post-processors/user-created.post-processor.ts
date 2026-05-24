import { SinglePostProcessor } from '@volontariapp/post-processors';
import { Injectable } from '@nestjs/common';
import { SocialUserService, UserId } from '@volontariapp/domain-social';
import type { PostProcessorOptions } from '@volontariapp/post-processors';
import type { Redis } from 'ioredis';
import {
  UserEventMessagingType,
  WebsocketEventMessagingType,
  type IUserCreatedPayload,
  type IUserCreatedWebsocketPayload,
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
export class UserCreatedPostProcessor extends SinglePostProcessor<UserEventMessagingType.USER_CREATED> {
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

  protected async processEvent(
    event: StreamEvent<IUserCreatedPayload>,
    messageId: string,
  ): Promise<void> {
    const payload: IUserCreatedPayload = event.payload.after;

    if (!payload.id) {
      this.logger.error('Invalid payload for USER_CREATED: missing id', {
        messageId,
        payload: event.payload,
      });
      return;
    }

    this.logger.info('Processing USER_CREATED: ' + JSON.stringify(payload));

    try {
      await this.socialUserService.createUser(new UserId(payload.id));
      this.logger.info('Successfully created social user node', {
        messageId,
        userId: payload.id,
      });

      this.logger.info(
        'Inserting USER_CREATED into event_queue for ws:user stream',
        {
          messageId,
          eventId: event.id,
          emitterId: event.emitterId,
        },
      );
      const payloadWsEvent: IUserCreatedWebsocketPayload = {
        id: payload.id,
        role: payload.role,
      };
      const eventQueueWriter =
        new EventQueueWriter<WebsocketEventMessagingType.WS_USER_CREATED>(
          this.logger,
          new EventQueueRepository<WebsocketEventMessagingType.WS_USER_CREATED>(
            this.typeormRepository,
          ),
        );

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

      await eventQueueWriter.create(queueEntity);
    } catch (error) {
      this.logger.error('Error processing USER_CREATED', error, {
        messageId,
        payload: event.payload,
      });
    }
  }
}
