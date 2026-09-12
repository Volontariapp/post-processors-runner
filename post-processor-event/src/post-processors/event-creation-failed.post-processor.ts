import { EventEventMessagingType } from '@volontariapp/messaging';
import {
  type PostProcessorOptions,
  BatchPostProcessor,
  type BatchEventItem,
} from '@volontariapp/post-processors';
import {
  EventModel,
  PostgresEventRepository,
} from '@volontariapp/domain-event';
import type { DataSource } from 'typeorm';
import type { Redis } from 'ioredis';
import { SagaStatus } from '@volontariapp/shared';

export class EventCreationFailedPostProcessor extends BatchPostProcessor<EventEventMessagingType.EVENT_CREATION_FAILED> {
  private readonly eventRepository: PostgresEventRepository;

  constructor(
    private readonly db: DataSource,
    redisDriver: Redis,
    options: PostProcessorOptions,
  ) {
    super(redisDriver, options);

    this.eventRepository = new PostgresEventRepository(
      this.db.getRepository(EventModel),
    );
  }

  protected override shouldProcess(
    eventType: EventEventMessagingType | string,
  ): boolean {
    return (
      eventType === EventEventMessagingType.EVENT_CREATION_FAILED.toString()
    );
  }

  protected async processEvents(
    events: BatchEventItem<EventEventMessagingType.EVENT_CREATION_FAILED>[],
  ): Promise<void> {
    for (const { event, messageId } of events) {
      const { eventId } = event.payload.after;

      if (!eventId) {
        this.logger.error(
          'Invalid payload for EVENT_CREATION_FAILED: missing eventId',
          {
            messageId,
          },
        );
        continue;
      }

      try {
        this.logger.log(
          `Updating saga status to CANCEL for failed event creation: ${String(eventId)}`,
          { messageId, eventId },
        );

        await this.eventRepository.update(eventId, {
          saga_status: SagaStatus.CANCEL,
        });

        this.logger.log(
          `Successfully updated saga status to CANCEL for event ${String(eventId)}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to update saga status for event ${String(eventId)}`,
          { messageId, eventId, error },
        );
        throw error;
      }
    }
  }
}
