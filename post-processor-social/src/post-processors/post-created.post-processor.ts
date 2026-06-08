import { BatchPostProcessor } from '@volontariapp/post-processors';
import { Injectable } from '@nestjs/common';
import {
  PublicationService,
  PostId,
  UserId,
} from '@volontariapp/domain-social';
import type {
  BatchEventItem,
  ParseResult,
  PostProcessorOptions,
} from '@volontariapp/post-processors';
import type { Redis } from 'ioredis';
import {
  PostEventMessagingType,
  WebsocketEventMessagingType,
  type IPostCreatedPayload,
  type IPostCreatedWebsocketPayload,
  type IPostCreationFailedWebsocketPayload,
  StreamEvent,
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
export class PostCreatedPostProcessor extends BatchPostProcessor<PostEventMessagingType.POST_CREATED> {
  protected async processEvents(
    events: BatchEventItem<PostEventMessagingType.POST_CREATED>[],
  ): Promise<void> {
    const postIds: PostId[] = [];
    const ownershipPairs: { userId: UserId; postId: PostId }[] = [];
    const validEvents: BatchEventItem<PostEventMessagingType.POST_CREATED>[] =
      [];

    for (const item of events) {
      const { event, messageId } = item;
      const payload: IPostCreatedPayload = event.payload.after;

      if (!payload.id) {
        this.logger.error('Invalid payload for POST_CREATED: missing id', {
          messageId,
          payload: event.payload,
        });
        continue;
      }

      if (!event.emitterId) {
        this.logger.error(
          'Invalid event for POST_CREATED: missing emitterId (userId)',
          {
            messageId,
            payload: event.payload,
          },
        );
        continue;
      }

      const postId = new PostId(payload.id);
      const userId = new UserId(event.emitterId);

      postIds.push(postId);
      ownershipPairs.push({ userId, postId });
      validEvents.push(item);
    }

    if (postIds.length === 0) return;

    try {
      this.logger.info(
        `Batch processing ${String(postIds.length)} POST_CREATED events...`,
      );
      await this.publicationService.createPosts(postIds);
      await this.publicationService.ownPosts(ownershipPairs);
      this.logger.info('Successfully batch processed POST_CREATED events');
    } catch (error) {
      this.logger.error('Error processing batch of POST_CREATED events', error);
      throw error;
    }

    const queueEntities: EventQueueEntity<WebsocketEventMessagingType.WS_POST_CREATED>[] =
      [];

    for (const { event } of validEvents) {
      const payload: IPostCreatedPayload = event.payload.after;

      const payloadWsEvent: IPostCreatedWebsocketPayload = { id: payload.id };
      queueEntities.push(
        EventQueueEntity.createEvent<WebsocketEventMessagingType.WS_POST_CREATED>(
          {
            type: WebsocketEventMessagingType.WS_POST_CREATED,
            emitter: event.emitter,
            emitterId: event.emitterId,
            traceId: event.traceId,
            correlationId: event.correlationId,
            payload: payloadWsEvent,
            targetServices: [Streams.WS_POST_CREATED_FEEDBACK],
          },
        ),
      );
    }

    if (queueEntities.length > 0) {
      try {
        const repo =
          new EventQueueRepository<WebsocketEventMessagingType.WS_POST_CREATED>(
            this.typeormRepository,
          );
        const eventQueueWriter = new EventQueueWriter(this.logger, repo);

        this.logger.info(
          `Inserting ${String(queueEntities.length)} WS success feedback events into event_queue for ${Streams.WS_POST_CREATED_FEEDBACK} stream`,
        );

        await eventQueueWriter.createMany(queueEntities);
      } catch (error) {
        this.logger.error(
          'Error batch inserting WS success feedback events into event_queue',
          error,
        );
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
      ) as StreamEvent<IPostCreatedPayload>;
      const payload: IPostCreatedPayload = event.payload.after;

      const payloadWsEvent: IPostCreationFailedWebsocketPayload = {
        id: payload.id,
      };
      const queueEntity =
        EventQueueEntity.createEvent<WebsocketEventMessagingType.WS_POST_CREATION_FAILED>(
          {
            type: WebsocketEventMessagingType.WS_POST_CREATION_FAILED,
            emitter: event.emitter,
            emitterId: event.emitterId,
            traceId: event.traceId,
            correlationId: event.correlationId,
            payload: payloadWsEvent,
            targetServices: [Streams.WS_POST_CREATED_FEEDBACK],
          },
        );

      const repo =
        new EventQueueRepository<WebsocketEventMessagingType.WS_POST_CREATION_FAILED>(
          this.typeormRepository,
        );
      const eventQueueWriter = new EventQueueWriter(this.logger, repo);

      await eventQueueWriter.createMany([queueEntity]);
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
    private readonly publicationService: PublicationService,
    @InjectRepository(EventQueueModel)
    private readonly typeormRepository: Repository<EventQueueModel>,
  ) {
    super(redisClient, options);
  }

  protected override shouldProcess(
    eventType: PostEventMessagingType | string,
  ): boolean {
    return eventType === PostEventMessagingType.POST_CREATED.toString();
  }
}
