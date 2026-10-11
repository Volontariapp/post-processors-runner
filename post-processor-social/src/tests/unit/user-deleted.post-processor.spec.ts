import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import { UserDeletedPostProcessor } from '../../post-processors/users/user-deleted.post-processor.js';
import {
  UserEventMessagingType,
  SocialEventMessagingType,
} from '@volontariapp/messaging';
import type { ParseResult } from '@volontariapp/post-processors';
import { Streams } from '@volontariapp/shared';
import type { Repository } from 'typeorm';
import type { EventQueueModel } from '@volontariapp/database';
import {
  createMockRedisClient,
  createMockOptions,
} from '../mocks/event-deleted.post-processor.mock.js';
import {
  createMockSocialUserService,
  createMockUserDeletedEventQueueRepository,
  type IMockEventQueueRepository,
} from '../mocks/user-deleted.post-processor.mock.js';
import { UserDeletedFactory } from '../factories/user-deleted.factory.js';
import type { SocialUserService } from '@volontariapp/domain-social';

describe('UserDeletedPostProcessor', () => {
  let postProcessor: UserDeletedPostProcessor;
  let socialUserService: SocialUserService;
  let mockEventQueueRepo: IMockEventQueueRepository;

  beforeEach(() => {
    socialUserService = createMockSocialUserService();
    mockEventQueueRepo = createMockUserDeletedEventQueueRepository();

    const redisClient = createMockRedisClient();
    const options = createMockOptions();

    postProcessor = new UserDeletedPostProcessor(
      redisClient,
      options,
      socialUserService,
      mockEventQueueRepo as never as Repository<EventQueueModel>,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('shouldProcess', () => {
    it('should return true for UserEventMessagingType.USER_DELETED', () => {
      const result = postProcessor['shouldProcess'](
        UserEventMessagingType.USER_DELETED,
      );
      expect(result).toBe(true);
    });

    it('should return false for other event types', () => {
      const result = postProcessor['shouldProcess']('user.created');
      expect(result).toBe(false);
    });
  });

  describe('processEvents', () => {
    it('should process USER_DELETED event, call socialUserService.purgeUser and save to event_queue', async () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      const batchItem = UserDeletedFactory.buildBatchEventItem({ id: userId });
      const purgeSpy = jest
        .spyOn(socialUserService, 'purgeUser')
        .mockResolvedValue(undefined);

      await postProcessor['processEvents']([batchItem]);

      expect(purgeSpy).toHaveBeenCalledTimes(1);
      expect(mockEventQueueRepo.save).toHaveBeenCalledTimes(1);

      const savedEntities = mockEventQueueRepo.save.mock.calls[0][0] as Array<{
        type: string;
        targetServices: string[];
        payload: { after: { userId: string } };
      }>;

      expect(savedEntities).toHaveLength(1);
      expect(savedEntities[0].type).toBe(
        SocialEventMessagingType.USER_SOCIAL_DELETED,
      );
      expect(savedEntities[0].targetServices).toContain(
        Streams.WS_USER_DELETED_FEEDBACK,
      );
      expect(savedEntities[0].payload.after.userId).toBe(userId);
    });

    it('should rethrow error if socialUserService.purgeUser throws', async () => {
      const batchItem = UserDeletedFactory.buildBatchEventItem();
      const testError = new Error('Neo4j purge error');
      jest
        .spyOn(socialUserService, 'purgeUser')
        .mockRejectedValueOnce(testError);

      await expect(postProcessor['processEvents']([batchItem])).rejects.toThrow(
        'Neo4j purge error',
      );
    });

    it('should skip processing if payload has no id', async () => {
      const batchItem = UserDeletedFactory.buildBatchEventItem({ id: '' });
      const purgeSpy = jest
        .spyOn(socialUserService, 'purgeUser')
        .mockResolvedValue(undefined);

      await postProcessor['processEvents']([batchItem]);

      expect(purgeSpy).not.toHaveBeenCalled();
      expect(mockEventQueueRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('sendMessageToDlq', () => {
    it('should insert USER_SOCIAL_DELETION_FAILED feedback event when original payload is valid', async () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      const batchItem = UserDeletedFactory.buildBatchEventItem({ id: userId });
      const messageId = '1700000000000-1';
      const originalPayload: ParseResult = {
        success: true,
        payload: JSON.stringify(batchItem.event),
      };
      const dlqError = 'Max retries reached';

      await postProcessor['sendMessageToDlq'](
        messageId,
        originalPayload,
        dlqError,
      );

      expect(mockEventQueueRepo.save).toHaveBeenCalledTimes(1);
      const savedEntities = mockEventQueueRepo.save.mock.calls[0][0] as Array<{
        type: string;
        targetServices: string[];
        payload: { after: { userId: string; errorReason: string } };
      }>;

      expect(savedEntities).toHaveLength(1);
      expect(savedEntities[0].type).toBe(
        SocialEventMessagingType.USER_SOCIAL_DELETION_FAILED,
      );
      expect(savedEntities[0].targetServices).toContain(
        Streams.WS_USER_DELETED_FEEDBACK,
      );
      expect(savedEntities[0].payload.after.userId).toBe(userId);
      expect(savedEntities[0].payload.after.errorReason).toBe(dlqError);
    });

    it('should skip feedback when originalPayload.success is false', async () => {
      const messageId = '1700000000000-2';
      const originalPayload: ParseResult = {
        success: false,
        error: 'Invalid JSON',
      };

      await postProcessor['sendMessageToDlq'](
        messageId,
        originalPayload,
        'Parse failure',
      );

      expect(mockEventQueueRepo.save).not.toHaveBeenCalled();
    });
  });
});
