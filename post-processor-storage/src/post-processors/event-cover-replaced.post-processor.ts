import { Injectable } from '@nestjs/common';
import {
  BatchPostProcessor,
  type BatchEventItem,
  type PostProcessorOptions,
} from '@volontariapp/post-processors';
import type { Redis } from 'ioredis';
import {
  EventEventMessagingType,
  type IEventCoverReplacedPayload,
} from '@volontariapp/messaging';
import { EntityType } from '@volontariapp/domain-storage';
import { PostgresFileRepository } from '@volontariapp/domain-storage/repositories';

@Injectable()
export class EventCoverReplacedPostProcessor extends BatchPostProcessor<EventEventMessagingType.EVENT_COVER_REPLACED> {
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
    return (
      eventType === EventEventMessagingType.EVENT_COVER_REPLACED.toString()
    );
  }

  protected async processEvents(
    events: BatchEventItem<EventEventMessagingType.EVENT_COVER_REPLACED>[],
  ): Promise<void> {
    for (const { event, messageId } of events) {
      const rawPayload = event.payload as
        { after?: IEventCoverReplacedPayload } | null | undefined;
      const payload = rawPayload?.after;

      if (!payload?.eventId || !payload.userId) {
        this.logger.error(
          'Invalid payload for EVENT_COVER_REPLACED: missing eventId or userId',
          {
            messageId,
            payload: event.payload,
          },
        );
        continue;
      }

      if (payload.oldFileId) {
        try {
          await this.fileRepository.releaseFile({
            fileId: payload.oldFileId,
            entityType: EntityType.EVENT_COVER,
            entityId: payload.eventId,
            ownerId: payload.userId,
            newFileId: payload.newFileId,
          });

          this.logger.info(
            `Successfully released old cover file ${payload.oldFileId} for event ${payload.eventId}`,
            {
              messageId,
              eventId: payload.eventId,
              oldFileId: payload.oldFileId,
            },
          );
        } catch (error) {
          this.logger.error(
            `Error releasing old cover file for event ${payload.eventId}`,
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

      if (!payload.newFileId) {
        this.logger.debug(
          `No new cover file to attach for replaced event cover on event ${payload.eventId}`,
          {
            messageId,
            eventId: payload.eventId,
          },
        );
        continue;
      }

      try {
        const results = await this.fileRepository.attachFromConfirmationEvent({
          fileIds: [payload.newFileId],
          entityType: EntityType.EVENT_COVER,
          entityId: payload.eventId,
          ownerId: payload.userId,
        });

        this.logger.info(
          `Successfully processed replaced cover attachment for event ${payload.eventId}`,
          {
            messageId,
            eventId: payload.eventId,
            userId: payload.userId,
            results,
          },
        );
      } catch (error) {
        this.logger.error(
          `Error attaching replaced cover file for event ${payload.eventId}`,
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
