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

export class EventCreationSuccessfullPostProcessor extends BatchPostProcessor<EventEventMessagingType.EVENT_CREATION_SUCCESSFULL> {
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
      eventType ===
      EventEventMessagingType.EVENT_CREATION_SUCCESSFULL.toString()
    );
  }

  protected async processEvents(
    events: BatchEventItem<EventEventMessagingType.EVENT_CREATION_SUCCESSFULL>[],
  ): Promise<void> {
    for (const { event, messageId } of events) {
      const { eventId } = event.payload.after;

      if (!eventId) {
        this.logger.error(
          'Invalid payload for EVENT_CREATION_SUCCESSFULL: missing eventId',
          {
            messageId,
          },
        );
        continue;
      }

      try {
        this.logger.log(
          `Updating saga status to DONE for successfully created event: ${String(eventId)}`,
          { messageId, eventId },
        );

        await this.eventRepository.update(eventId, {
          saga_status: SagaStatus.DONE,
        });

        this.logger.log(
          `Successfully updated saga status to DONE for event ${String(eventId)}`,
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
