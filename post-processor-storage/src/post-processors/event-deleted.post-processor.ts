import { Injectable } from '@nestjs/common';
import {
  BatchPostProcessor,
  type BatchEventItem,
  type PostProcessorOptions,
} from '@volontariapp/post-processors';
import type { Redis } from 'ioredis';
import {
  EventEventMessagingType,
  type IEventDeletedPayload,
} from '@volontariapp/messaging';
import { EntityType } from '@volontariapp/domain-storage';
import { PostgresFileRepository } from '@volontariapp/domain-storage/repositories';

@Injectable()
export class EventDeletedPostProcessor extends BatchPostProcessor<EventEventMessagingType.EVENT_DELETED> {
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
    return eventType === EventEventMessagingType.EVENT_DELETED.toString();
  }

  protected async processEvents(
    events: BatchEventItem<EventEventMessagingType.EVENT_DELETED>[],
  ): Promise<void> {
    for (const { event, messageId } of events) {
      const rawPayload = event.payload as
        { after?: IEventDeletedPayload } | null | undefined;
      const payload = rawPayload?.after;

      if (!payload?.eventId) {
        this.logger.error(
          'Invalid payload for EVENT_DELETED: missing eventId',
          {
            messageId,
            payload: event.payload,
          },
        );
        continue;
      }

      try {
        const result = await this.fileRepository.releaseForEntity({
          entityType: EntityType.EVENT_COVER,
          entityId: payload.eventId,
        });

        this.logger.info(
          `Successfully released ${String(result.releasedFileIds.length)} file(s) for deleted event ${payload.eventId}`,
          {
            messageId,
            eventId: payload.eventId,
            releasedCount: result.releasedFileIds.length,
            tombstoneCreated: result.tombstoneCreated,
          },
        );
      } catch (error) {
        this.logger.error(
          `Error releasing files for deleted event ${payload.eventId}`,
          error,
          {
            messageId,
            eventId: payload.eventId,
          },
        );
        throw error;
      }
    }
  }
}
