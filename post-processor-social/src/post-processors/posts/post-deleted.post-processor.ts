import { BatchPostProcessor } from '@volontariapp/post-processors';
import { Injectable } from '@nestjs/common';
import { PublicationService, PostId } from '@volontariapp/domain-social';
import type {
  BatchEventItem,
  ParseResult,
  PostProcessorOptions,
} from '@volontariapp/post-processors';
import type { Redis } from 'ioredis';
import {
  PostEventMessagingType,
  type IPostDeletedPayload,
  type IPostDeletedWebsocketPayload,
  type IPostDeletionFailedWebsocketPayload,
  type StreamEvent,
  SocialEventMessagingType,
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
export class PostDeletedPostProcessor extends BatchPostProcessor<PostEventMessagingType.POST_DELETED> {
  protected async processEvents(
    events: BatchEventItem<PostEventMessagingType.POST_DELETED>[],
  ): Promise<void> {
    const postIds: PostId[] = [];
    const validEvents: BatchEventItem<PostEventMessagingType.POST_DELETED>[] =
      [];

    for (const item of events) {
      const { event, messageId } = item;
      const payload: IPostDeletedPayload = event.payload.after;

      if (!payload.postId) {
        this.logger.error('Invalid payload for POST_DELETED: missing postId', {
          messageId,
          payload: event.payload,
        });
        continue;
      }

      postIds.push(new PostId(payload.postId));
      validEvents.push(item);
    }

    if (postIds.length === 0) return;

    try {
      this.logger.info(
        `Batch processing ${String(postIds.length)} POST_DELETED events...`,
      );
      await this.publicationService.deletePosts(postIds);
      this.logger.info('Successfully batch processed POST_DELETED events');
    } catch (error) {
      this.logger.error('Error processing batch of POST_DELETED events', error);
      throw error;
    }

    const queueEntities: EventQueueEntity<SocialEventMessagingType.POST_SOCIAL_DELETED>[] =
      [];

    for (const { event } of validEvents) {
      const payload: IPostDeletedPayload = event.payload.after;

      const payloadWsEvent: IPostDeletedWebsocketPayload = {
        postId: payload.postId,
      };
      queueEntities.push(
        EventQueueEntity.createEvent<SocialEventMessagingType.POST_SOCIAL_DELETED>(
          {
            type: SocialEventMessagingType.POST_SOCIAL_DELETED,
            emitter: event.emitter,
            emitterId: event.emitterId,
            traceId: event.traceId,
            correlationId: event.correlationId,
            payload: payloadWsEvent,
            targetServices: [Streams.WS_POST_DELETED_FEEDBACK],
          },
        ),
      );
    }

    if (queueEntities.length > 0) {
      try {
        const repo =
          new EventQueueRepository<SocialEventMessagingType.POST_SOCIAL_DELETED>(
            this.typeormRepository,
          );
        const eventQueueWriter = new EventQueueWriter(this.logger, repo);

        this.logger.info(
          `Inserting ${String(queueEntities.length)} WS success feedback events into event_queue for ${Streams.WS_POST_DELETED_FEEDBACK} stream`,
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
      ) as StreamEvent<IPostDeletedPayload>;
      const payload: IPostDeletedPayload = event.payload.after;

      const payloadWsEvent: IPostDeletionFailedWebsocketPayload = {
        postId: payload.postId,
      };
      const queueEntity =
        EventQueueEntity.createEvent<SocialEventMessagingType.POST_SOCIAL_DELETION_FAILED>(
          {
            type: SocialEventMessagingType.POST_SOCIAL_DELETION_FAILED,
            emitter: event.emitter,
            emitterId: event.emitterId,
            traceId: event.traceId,
            correlationId: event.correlationId,
            payload: payloadWsEvent,
            targetServices: [Streams.WS_POST_DELETED_FEEDBACK],
          },
        );

      const repo =
        new EventQueueRepository<SocialEventMessagingType.POST_SOCIAL_DELETION_FAILED>(
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
    return eventType === PostEventMessagingType.POST_DELETED.toString();
  }
}
