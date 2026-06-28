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
import { EventQueueModel } from '@volontariapp/database';
import { Streams } from '@volontariapp/shared';

export class EventCreatedPostProcessor extends BatchPostProcessor<EventEventMessagingType.EVENT_CREATED> {
  private readonly geocodingService: GeocodingService;
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

  protected async processEvents(
    events: BatchEventItem<EventEventMessagingType.EVENT_CREATED>[],
  ): Promise<void> {
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

          // Write EVENT_GEOCODED to outbox database (event_queue)
          const eventQueueRepo = this.db.getRepository(EventQueueModel);
          await eventQueueRepo.save({
            type: EventEventMessagingType.EVENT_GEOCODED,
            emitter: 'ms-event',
            emitterId: event.emitterId,
            traceId: event.traceId,
            correlationId: event.correlationId,
            version: 1,
            payload: {
              before: undefined,
              after: {
                eventId,
              },
            },
            targetServices: [Streams.WS_EVENT_CREATED_FEEDBACK],
          });
          this.logger.log(
            `Feedback event EVENT_GEOCODED registered in outbox for event ${String(eventId)}`,
          );
        } else {
          this.logger.warn(
            `Geocoding failed to return results for event ${String(eventId)}`,
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
