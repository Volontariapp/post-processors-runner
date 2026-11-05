import { EventEventMessagingType } from '@volontariapp/messaging';
import {
  type PostProcessorOptions,
  BatchPostProcessor,
  type BatchEventItem,
} from '@volontariapp/post-processors';
import {
  EventModel,
  GeocodingService,
  OpenStreetMapStrategy,
  PostgresEventRepository,
  EventLocation,
} from '@volontariapp/domain-event';
import type { DataSource } from 'typeorm';
import type { Redis } from 'ioredis';
import {
  databaseMapper,
  EventQueueEntity,
  EventQueueModel,
} from '@volontariapp/database';
import { EventQueueRepository } from '@volontariapp/outbox';
import { Streams } from '@volontariapp/shared';

databaseMapper.registerBidirectional(EventQueueModel, EventQueueEntity);

type FeedbackType =
  | EventEventMessagingType.EVENT_GEOCODED
  | EventEventMessagingType.EVENT_GEOCODING_FAILED;

type FeedbackPayload<T extends FeedbackType> = Parameters<
  typeof EventQueueEntity.createFollowUp<T>
>[1]['payload'];

export class EventCreatedPostProcessor extends BatchPostProcessor<EventEventMessagingType.EVENT_CREATED> {
  private readonly geocodingService: GeocodingService;
  private readonly eventRepository: PostgresEventRepository;

  constructor(
    private readonly db: DataSource,
    redisDriver: Redis,
    options: PostProcessorOptions,
    private readonly geocodingEnabled: boolean,
  ) {
    super(redisDriver, options);

    this.eventRepository = new PostgresEventRepository(
      this.db.getRepository(EventModel),
    );

    // const apiKey = process.env.GOOGLE_MAPS_API_KEY ?? '';
    const userAgent =
      process.env.OSM_USER_AGENT ?? 'VolontariApp-PostProcessor/1.0';
    const skipInTestEnv =
      process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'local';
    // const googleMapsStrategy = new GoogleMapsStrategy(apiKey, skipInTestEnv);
    const osmStrategy = new OpenStreetMapStrategy(userAgent, skipInTestEnv);

    this.geocodingService = new GeocodingService(osmStrategy, osmStrategy);
  }

  protected override shouldProcess(
    eventType: EventEventMessagingType | string,
  ): boolean {
    return eventType === EventEventMessagingType.EVENT_CREATED.toString();
  }

  private async writeFeedback<T extends FeedbackType>(
    event: BatchEventItem<EventEventMessagingType.EVENT_CREATED>['event'],
    type: T,
    payload: FeedbackPayload<T>,
  ): Promise<void> {
    const followUp = EventQueueEntity.createFollowUp<T>(event, {
      type,
      emitter: 'ms-event',
      emitterId: event.emitterId,
      payload,
      targetServices: [Streams.WS_EVENT_CREATED_FEEDBACK],
    });
    await new EventQueueRepository<T>(
      this.db.getRepository(EventQueueModel),
    ).create(followUp);
  }

  protected async processEvents(
    events: BatchEventItem<EventEventMessagingType.EVENT_CREATED>[],
  ): Promise<void> {
    if (!this.geocodingEnabled) {
      this.logger.info(
        `Geocoding disabled by configuration (GEOCODING_ENABLED=false), ${String(events.length)} event.created acknowledged without geocoding`,
      );
      return;
    }

    for (const { event, messageId } of events) {
      const { eventId, localisationName } = event.payload.after;

      if (!localisationName || localisationName.trim().length === 0) {
        this.logger.debug(
          `Event ${String(eventId)} has no localisationName, skipping geocoding`,
          { messageId },
        );
        continue;
      }

      try {
        this.logger.log(
          `Geocoding event ${String(eventId)} with localisationName: ${localisationName}`,
        );
        const geoResult = await this.geocodingService.geocode(localisationName);

        if (geoResult) {
          this.logger.log(
            `Geocoding successful for event ${String(eventId)}, updating database`,
          );
          await this.eventRepository.update(eventId, {
            location: new EventLocation(geoResult.lat, geoResult.lng),
          });

          await this.writeFeedback(
            event,
            EventEventMessagingType.EVENT_GEOCODED,
            { eventId },
          );
          this.logger.log(
            `Feedback event EVENT_GEOCODED registered in outbox for event ${String(eventId)}`,
          );
        } else {
          this.logger.warn(
            `Geocoding failed to return results for event ${String(eventId)}`,
          );
          await this.writeFeedback(
            event,
            EventEventMessagingType.EVENT_GEOCODING_FAILED,
            { eventId },
          );
          this.logger.log(
            `Feedback event EVENT_GEOCODING_FAILED registered in outbox for event ${String(eventId)}`,
          );
        }
      } catch (error) {
        this.logger.error(
          `Failed to process EVENT_CREATED for event ${String(eventId)}`,
          { messageId, eventId, error },
        );
        throw error;
      }
    }
  }
}
