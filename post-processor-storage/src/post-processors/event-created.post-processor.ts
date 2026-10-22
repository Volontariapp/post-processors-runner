import { Injectable } from '@nestjs/common';
import {
  BatchPostProcessor,
  type BatchEventItem,
  type PostProcessorOptions,
} from '@volontariapp/post-processors';
import type { Redis } from 'ioredis';
import {
  EventEventMessagingType,
  type IEventCreatedPayload,
} from '@volontariapp/messaging';
import { EntityType } from '@volontariapp/domain-storage';
import { PostgresFileRepository } from '@volontariapp/domain-storage/repositories';

@Injectable()
export class EventCreatedPostProcessor extends BatchPostProcessor<EventEventMessagingType.EVENT_CREATED> {
  constructor(
    redisClient: Redis,
    options: PostProcessorOptions,
    private readonly fileRepository: PostgresFileRepository,
  ) {
    super(redisClient, options);
  }

  protected override shouldProcess(
    eventType: EventEventMessagingType | string,
  ): boolean {
    return eventType === EventEventMessagingType.EVENT_CREATED.toString();
  }

  protected async processEvents(
    events: BatchEventItem<EventEventMessagingType.EVENT_CREATED>[],
  ): Promise<void> {
    for (const { event, messageId } of events) {
      const payload: IEventCreatedPayload = event.payload.after;

      if (!payload.eventId || !payload.userId) {
        this.logger.error(
          'Invalid payload for EVENT_CREATED: missing eventId or userId',
          {
            messageId,
            payload: event.payload,
          },
        );
        continue;
      }

      if (!payload.coverFileId) {
        this.logger.debug(
          `No cover file to attach for created event ${payload.eventId}`,
          {
            messageId,
            eventId: payload.eventId,
          },
        );
        continue;
      }

      try {
        const results = await this.fileRepository.attachFromConfirmationEvent({
          fileIds: [payload.coverFileId],
          entityType: EntityType.EVENT_COVER,
          entityId: payload.eventId,
          ownerId: payload.userId,
        });

        this.logger.info(
          `Successfully processed cover attachment for event ${payload.eventId}`,
          {
            messageId,
            eventId: payload.eventId,
            userId: payload.userId,
            results,
          },
        );
      } catch (error) {
        this.logger.error(
          `Error attaching cover file for event ${payload.eventId}`,
          error,
          {
            messageId,
            eventId: payload.eventId,
            userId: payload.userId,
          },
        );
        throw error;
      }
    }
  }
}
