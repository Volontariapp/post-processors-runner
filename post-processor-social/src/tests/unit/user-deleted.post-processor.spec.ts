import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { UserDeletedPostProcessor } from '../../post-processors/users/user-deleted.post-processor.js';
import {
  UserEventMessagingType,
  SocialEventMessagingType,
  type StreamEvent,
  type IUserDeleledPayload,
} from '@volontariapp/messaging';
import { Streams } from '@volontariapp/shared';
import type { Redis } from 'ioredis';
import type { PostProcessorOptions, BatchEventItem } from '@volontariapp/post-processors';
import type { Repository } from 'typeorm';
import type { EventQueueModel } from '@volontariapp/database';
import type { SocialUserService } from '@volontariapp/domain-social';

import {
  createMockRedisClient,
  createMockOptions,
  createMockEventQueueRepository,
} from '../mocks/event-deleted.post-processor.mock.js';

describe('UserDeletedPostProcessor', () => {
  let postProcessor: UserDeletedPostProcessor;
  let socialUserServiceMock: jest.Mocked<SocialUserService>;
  let typeormRepositoryMock: jest.Mocked<Repository<EventQueueModel>>;
  let redisClientMock: jest.Mocked<Redis>;
  let optionsMock: PostProcessorOptions;

  beforeEach(() => {
    socialUserServiceMock = {
      deleteUser: jest.fn<SocialUserService['deleteUser']>().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<SocialUserService>;

    typeormRepositoryMock = createMockEventQueueRepository();

    redisClientMock = createMockRedisClient();
    optionsMock = createMockOptions();

    postProcessor = new UserDeletedPostProcessor(
      redisClientMock,
      optionsMock,
      socialUserServiceMock,
      typeormRepositoryMock,
    );
  });

  describe('shouldProcess', () => {
    it('should return true for UserEventMessagingType.USER_DELETED', () => {
      const result = postProcessor['shouldProcess'](UserEventMessagingType.USER_DELETED);
      expect(result).toBe(true);
    });

    it('should return false for other event types', () => {
      const result = postProcessor['shouldProcess']('user.created');
      expect(result).toBe(false);
    });
  });

  describe('processEvents', () => {
    it('should process USER_DELETED event, call socialUserService.deleteUser and save to event_queue', async () => {
      const userId = 'user-uuid-123';
      const streamEvent: StreamEvent<IUserDeleledPayload> = {
        id: 'msg-id-1',
        type: UserEventMessagingType.USER_DELETED,
        emitter: 'user-service',
        emitterId: userId,
        traceId: 'trace-id-123',
        correlationId: 'correlation-id-123',
        version: 1,
        createdAt: new Date().toISOString(),
        payload: {
          before: undefined,
          after: {
            id: userId,
            role: 'VOLUNTEER' as never,
          },
        },
      };

      const batchItems: BatchEventItem<UserEventMessagingType.USER_DELETED>[] = [
        { event: streamEvent, messageId: 'msg-id-1' },
      ];

      await postProcessor['processEvents'](batchItems);

      expect(socialUserServiceMock.deleteUser).toHaveBeenCalledTimes(1);
      expect(typeormRepositoryMock.save).toHaveBeenCalledTimes(1);

      const savedEntities = (typeormRepositoryMock.save as jest.Mock).mock.calls[0][0] as Array<{
        type: string;
        targetServices: string[];
        payload: { after: { userId: string } };
      }>;

      expect(savedEntities).toHaveLength(1);
      expect(savedEntities[0].type).toBe(SocialEventMessagingType.USER_SOCIAL_DELETED);
      expect(savedEntities[0].targetServices).toContain(Streams.WS_USER_DELETED_FEEDBACK);
      expect(savedEntities[0].payload.after.userId).toBe(userId);
    });
  });
});
