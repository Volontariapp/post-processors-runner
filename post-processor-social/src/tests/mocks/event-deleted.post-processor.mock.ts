import { jest } from '@jest/globals';
import type { ParticipationService } from '@volontariapp/domain-social';
import type { EventQueueModel } from '@volontariapp/database';
import type { Repository } from 'typeorm';
import type { Redis } from 'ioredis';
import type { PostProcessorOptions } from '@volontariapp/post-processors';
import { createMockLogger } from '@volontariapp/testing';

export function createMockParticipationService(): jest.Mocked<ParticipationService> {
  return {
    deleteEvent: jest
      .fn<ParticipationService['deleteEvent']>()
      .mockResolvedValue(undefined),
    createEvent: jest
      .fn<ParticipationService['createEvent']>()
      .mockResolvedValue(undefined),
    createEventsBatch: jest
      .fn<ParticipationService['createEventsBatch']>()
      .mockResolvedValue(undefined),
    getEventExists: jest
      .fn<ParticipationService['getEventExists']>()
      .mockResolvedValue(true),
    setEventCreator: jest
      .fn<ParticipationService['setEventCreator']>()
      .mockResolvedValue(undefined),
    removeEventCreator: jest
      .fn<ParticipationService['removeEventCreator']>()
      .mockResolvedValue(undefined),
    participateEvent: jest
      .fn<ParticipationService['participateEvent']>()
      .mockResolvedValue(undefined),
    leaveEvent: jest
      .fn<ParticipationService['leaveEvent']>()
      .mockResolvedValue(undefined),
    getUserEvents: jest.fn<ParticipationService['getUserEvents']>(),
    getUserParticipations:
      jest.fn<ParticipationService['getUserParticipations']>(),
    getEventParticipants:
      jest.fn<ParticipationService['getEventParticipants']>(),
    wishEvent: jest
      .fn<ParticipationService['wishEvent']>()
      .mockResolvedValue(undefined),
    unwishEvent: jest
      .fn<ParticipationService['unwishEvent']>()
      .mockResolvedValue(undefined),
    getUserWishes: jest.fn<ParticipationService['getUserWishes']>(),
  } as unknown as jest.Mocked<ParticipationService>;
}

export function createMockEventQueueRepository(): jest.Mocked<
  Repository<EventQueueModel>
> {
  const repo = {
    create: jest.fn().mockImplementation((entity) => entity),
    save: jest.fn(),
    insert: jest.fn(),
  } as unknown as jest.Mocked<Repository<EventQueueModel>>;

  (repo.save as jest.Mock).mockImplementation(() => Promise.resolve([]));
  (repo.insert as jest.Mock).mockImplementation(() =>
    Promise.resolve({ identifiers: [], generatedMaps: [], raw: [] }),
  );

  return repo;
}

export function createMockRedisClient(): jest.Mocked<Redis> {
  const mockRedis = {
    call: jest.fn<Redis['call']>().mockResolvedValue('OK'),
    xack: jest.fn<Redis['xack']>().mockResolvedValue(1),
    xadd: jest.fn<Redis['xadd']>().mockResolvedValue('1700000000000-0'),
    duplicate: jest.fn<Redis['duplicate']>(),
  } as unknown as jest.Mocked<Redis>;

  (mockRedis.duplicate as jest.Mock).mockReturnValue(mockRedis);
  return mockRedis;
}

export function createMockOptions(): PostProcessorOptions {
  return {
    groupName: 'TestGroup',
    streamName: 'event:deleted',
    batchSize: 10,
    blockMs: 1000,
    idempotencyTtlSeconds: 3600,
  };
}

export { createMockLogger };
