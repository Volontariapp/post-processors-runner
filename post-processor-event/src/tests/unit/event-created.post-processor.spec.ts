import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import type { Redis } from 'ioredis';
import { createMock } from '@volontariapp/testing';
import {
  GeocodingService,
  PostgresEventRepository,
} from '@volontariapp/domain-event';
import { EventQueueRepository } from '@volontariapp/outbox';
import { EventCreatedPostProcessor } from '../../post-processors/event-created.post-processor.js';
import { EventCreatedFactory } from '../factories/event-created.factory.js';
import {
  createMockGeocodingDb,
  mockLogger,
} from '../mocks/event-created.post-processor.mock.js';
import { createMockOptions } from '../mocks/user-deleted.post-processor.mock.js';

describe('EventCreatedPostProcessor', () => {
  let updateEvent: jest.SpiedFunction<PostgresEventRepository['update']>;
  let writeFollowUp: jest.SpiedFunction<EventQueueRepository['create']>;

  const build = (geocodingEnabled: boolean): EventCreatedPostProcessor => {
    const postProcessor = new EventCreatedPostProcessor(
      createMockGeocodingDb(),
      createMock<Redis>(),
      createMockOptions(),
      geocodingEnabled,
    );
    Object.defineProperty(postProcessor, 'logger', { value: mockLogger() });
    return postProcessor;
  };

  beforeEach(() => {
    updateEvent = jest
      .spyOn(PostgresEventRepository.prototype, 'update')
      .mockResolvedValue(null);
    writeFollowUp = jest
      .spyOn(EventQueueRepository.prototype, 'create')
      .mockImplementation((entity) => Promise.resolve(entity));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('geocodes the event and writes event.geocoded when geocoding is enabled', async () => {
    const geocode = jest
      .spyOn(GeocodingService.prototype, 'geocode')
      .mockResolvedValue({ lat: 45.76, lng: 4.83 });
    const item = EventCreatedFactory.buildBatchEventItem();

    await build(true)['processEvents']([item]);

    expect(geocode).toHaveBeenCalledWith('Lyon, France');
    expect(updateEvent).toHaveBeenCalledTimes(1);
    expect(writeFollowUp).toHaveBeenCalledTimes(1);
  });

  it('acknowledges without geocoding nor writing when geocoding is disabled', async () => {
    const geocode = jest.spyOn(GeocodingService.prototype, 'geocode');
    const items = [
      EventCreatedFactory.buildBatchEventItem(),
      EventCreatedFactory.buildBatchEventItem(),
    ];

    await expect(build(false)['processEvents'](items)).resolves.toBeUndefined();

    expect(geocode).not.toHaveBeenCalled();
    expect(updateEvent).not.toHaveBeenCalled();
    expect(writeFollowUp).not.toHaveBeenCalled();
  });
});
