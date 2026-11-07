import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import { EventCreatedPostProcessor } from '../../post-processors/events/event-created.post-processor.js';
import {
  createMockParticipationService,
  createMockEventQueueRepository,
  createMockRedisClient,
  createMockOptions,
} from '../mocks/event-deleted.post-processor.mock.js';
import { CreationEventsFactory } from '../factories/creation-events.factory.js';

/** A Neo4j failure must not be swallowed: the framework retries the batch, then sends it to the DLQ. */
describe('EventCreatedPostProcessor Neo4j failures', () => {
  let participationService: ReturnType<typeof createMockParticipationService>;
  let typeormRepository: ReturnType<typeof createMockEventQueueRepository>;
  let processor: EventCreatedPostProcessor;

  beforeEach(() => {
    participationService = createMockParticipationService();
    typeormRepository = createMockEventQueueRepository();
    processor = new EventCreatedPostProcessor(
      createMockRedisClient(),
      createMockOptions(),
      participationService,
      typeormRepository,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should rethrow a Neo4j deadlock so the batch is retried', async () => {
    const deadlock = new Error('ForsetiClient can not acquire ExclusiveLock');
    jest
      .spyOn(participationService, 'createEventsBatch')
      .mockRejectedValue(deadlock);

    await expect(
      processor['processEvents']([CreationEventsFactory.eventCreated()]),
    ).rejects.toBe(deadlock);
  });

  it('should not emit the websocket feedback when the node creation failed', async () => {
    jest
      .spyOn(participationService, 'createEventsBatch')
      .mockRejectedValue(new Error('deadlock'));
    const saveSpy = jest.spyOn(typeormRepository, 'save');

    await processor['processEvents']([
      CreationEventsFactory.eventCreated(),
    ]).catch(() => undefined);

    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('should create the nodes then emit one feedback per event on success', async () => {
    const items = [
      CreationEventsFactory.eventCreated(),
      CreationEventsFactory.eventCreated(),
    ];
    const createSpy = jest.spyOn(participationService, 'createEventsBatch');

    await processor['processEvents'](items);

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(createSpy.mock.calls[0][0]).toHaveLength(2);
    expect(typeormRepository.save.mock.calls[0][0] as unknown[]).toHaveLength(
      2,
    );
  });
});
