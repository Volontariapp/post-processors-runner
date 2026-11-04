import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import type { PublicationService } from '@volontariapp/domain-social';
import { createMock } from '@volontariapp/testing';
import { EventCreatedPostProcessor } from '../../post-processors/events/event-created.post-processor.js';
import { EventDeletedPostProcessor } from '../../post-processors/events/event-deleted.post-processor.js';
import { PostCreatedPostProcessor } from '../../post-processors/posts/post-created.post-processor.js';
import { PostDeletedPostProcessor } from '../../post-processors/posts/post-deleted.post-processor.js';
import { tombstoneKey } from '../../post-processors/tombstone.js';
import {
  createMockParticipationService,
  createMockEventQueueRepository,
  createMockRedisClient,
  createMockOptions,
} from '../mocks/event-deleted.post-processor.mock.js';
import { CreationEventsFactory } from '../factories/creation-events.factory.js';
import { EventDeletedFactory } from '../factories/event-deleted.factory.js';

/** Gap G4: post and event creations may be processed after their deletion. */
describe('creation processed after the deletion (G4)', () => {
  let redisClient: ReturnType<typeof createMockRedisClient>;
  let typeormRepository: ReturnType<typeof createMockEventQueueRepository>;

  const markedOnly = (marked: string) => (key: string) =>
    Promise.resolve(key === marked ? 1 : 0);

  beforeEach(() => {
    redisClient = createMockRedisClient();
    typeormRepository = createMockEventQueueRepository();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('events', () => {
    let participationService: ReturnType<typeof createMockParticipationService>;

    beforeEach(() => {
      participationService = createMockParticipationService();
    });

    it('should mark the deleted events before removing their nodes', async () => {
      const item = EventDeletedFactory.buildBatchEventItem();
      const setSpy = jest.spyOn(redisClient, 'set');
      const processor = new EventDeletedPostProcessor(
        redisClient,
        createMockOptions(),
        participationService,
        typeormRepository,
      );

      await processor['processEvents']([item]);

      expect(setSpy.mock.calls[0][0]).toBe(
        tombstoneKey('event', item.event.payload.after.eventId),
      );
      expect(setSpy.mock.invocationCallOrder[0]).toBeLessThan(
        participationService.deleteEventsBatch.mock.invocationCallOrder[0],
      );
    });

    it('should remove again only the created events already deleted, and still send every feedback', async () => {
      const [kept, deleted] = [
        CreationEventsFactory.eventCreated(),
        CreationEventsFactory.eventCreated(),
      ];
      const deletedId = deleted.event.payload.after.eventId;
      jest
        .spyOn(redisClient, 'exists')
        .mockImplementation(markedOnly(tombstoneKey('event', deletedId)));
      const createSpy = jest.spyOn(participationService, 'createEventsBatch');
      const deleteSpy = jest.spyOn(participationService, 'deleteEventsBatch');
      const processor = new EventCreatedPostProcessor(
        redisClient,
        createMockOptions(),
        participationService,
        typeormRepository,
      );

      await processor['processEvents']([kept, deleted]);

      expect(createSpy).toHaveBeenCalledTimes(1);
      expect(deleteSpy).toHaveBeenCalledTimes(1);
      expect(deleteSpy.mock.calls[0][0].map((id) => id.value)).toEqual([
        deletedId,
      ]);
      expect(createSpy.mock.invocationCallOrder[0]).toBeLessThan(
        deleteSpy.mock.invocationCallOrder[0],
      );
      const saved = typeormRepository.save.mock.calls[0][0] as unknown[];
      expect(saved).toHaveLength(2);
    });
  });

  describe('posts', () => {
    let publicationService: jest.Mocked<PublicationService>;

    beforeEach(() => {
      publicationService = createMock<PublicationService>();
      jest
        .spyOn(publicationService, 'createAndLinkPosts')
        .mockResolvedValue({ invalidEventIds: [] });
      jest
        .spyOn(publicationService, 'deletePosts')
        .mockResolvedValue(undefined);
    });

    it('should mark the deleted posts before removing their nodes', async () => {
      const item = CreationEventsFactory.postDeleted();
      const setSpy = jest.spyOn(redisClient, 'set');
      const processor = new PostDeletedPostProcessor(
        redisClient,
        createMockOptions(),
        publicationService,
        typeormRepository,
      );

      await processor['processEvents']([item]);

      expect(setSpy.mock.calls[0][0]).toBe(
        tombstoneKey('post', item.event.payload.after.postId),
      );
      expect(setSpy.mock.invocationCallOrder[0]).toBeLessThan(
        publicationService.deletePosts.mock.invocationCallOrder[0],
      );
    });

    it('should remove again only the created posts already deleted, and still send every feedback', async () => {
      const [kept, deleted] = [
        CreationEventsFactory.postCreated(),
        CreationEventsFactory.postCreated(),
      ];
      const deletedId = deleted.event.payload.after.postId;
      jest
        .spyOn(redisClient, 'exists')
        .mockImplementation(markedOnly(tombstoneKey('post', deletedId)));
      const processor = new PostCreatedPostProcessor(
        redisClient,
        createMockOptions(),
        publicationService,
        typeormRepository,
      );

      const deleteSpy = jest.spyOn(publicationService, 'deletePosts');

      await processor['processEvents']([kept, deleted]);

      expect(deleteSpy).toHaveBeenCalledTimes(1);
      expect(deleteSpy.mock.calls[0][0].map((id) => id.value)).toEqual([
        deletedId,
      ]);
      const saved = typeormRepository.save.mock.calls[0][0] as unknown[];
      expect(saved).toHaveLength(2);
    });
  });
});
