import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import { UserDeletedPostProcessor } from '../../post-processors/user-deleted.post-processor.js';
import {
  UserEventMessagingType,
  PostEventMessagingType,
} from '@volontariapp/messaging';
import type { ParseResult } from '@volontariapp/post-processors';
import { Streams } from '@volontariapp/shared';
import type { Repository } from 'typeorm';
import type { EventQueueModel } from '@volontariapp/database';
import type { PostService, CommentService } from '@volontariapp/domain-post';
import {
  createMockPostService,
  createMockCommentService,
  createMockEventQueueRepository,
  createMockRedisClient,
  createMockOptions,
  type IMockEventQueueRepository,
} from '../mocks/user-deleted.post-processor.mock.js';
import { UserDeletedFactory } from '../factories/user-deleted.factory.js';

import { SOURCE_TRACEPARENT } from '../factories/trace.factory.js';

describe('UserDeletedPostProcessor (post)', () => {
  let postProcessor: UserDeletedPostProcessor;
  let postService: PostService;
  let commentService: CommentService;
  let mockEventQueueRepo: IMockEventQueueRepository;

  beforeEach(() => {
    postService = createMockPostService();
    commentService = createMockCommentService();
    mockEventQueueRepo = createMockEventQueueRepository();

    const redisClient = createMockRedisClient();
    const options = createMockOptions();

    postProcessor = new UserDeletedPostProcessor(
      redisClient,
      options,
      postService,
      commentService,
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
      const result = postProcessor['shouldProcess']('post.created');
      expect(result).toBe(false);
    });
  });

  describe('processEvents', () => {
    it('should purge posts, anonymize comments and save USER_POST_DELETED event', async () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      const batchItem = UserDeletedFactory.buildBatchEventItem({ id: userId });
      const purgeSpy = jest
        .spyOn(postService, 'purgePostsByAuthor')
        .mockResolvedValue(5);
      const anonymizeSpy = jest
        .spyOn(commentService, 'anonymizeCommentsByAuthor')
        .mockResolvedValue(3);

      await postProcessor['processEvents']([batchItem]);

      expect(purgeSpy).toHaveBeenCalledWith(userId);
      expect(anonymizeSpy).toHaveBeenCalledWith(userId);
      expect(mockEventQueueRepo.save).toHaveBeenCalledTimes(1);

      const savedEntities = mockEventQueueRepo.save.mock.calls[0][0] as Array<{
        type: string;
        targetServices: string[];
        traceparent?: string;
        payload: { after: { userId: string } };
      }>;

      expect(savedEntities).toHaveLength(1);
      expect(savedEntities[0].traceparent).toBe(SOURCE_TRACEPARENT);
      expect(savedEntities[0].type).toBe(
        PostEventMessagingType.USER_POST_DELETED,
      );
      expect(savedEntities[0].targetServices).toContain(
        Streams.WS_USER_DELETED_FEEDBACK,
      );
      expect(savedEntities[0].payload.after.userId).toBe(userId);
    });

    it('should rethrow error if postService.purgePostsByAuthor throws', async () => {
      const batchItem = UserDeletedFactory.buildBatchEventItem();
      const testError = new Error('Database error on post purge');
      jest
        .spyOn(postService, 'purgePostsByAuthor')
        .mockRejectedValueOnce(testError);

      await expect(postProcessor['processEvents']([batchItem])).rejects.toThrow(
        'Database error on post purge',
      );
    });

    it('should rethrow error if commentService.anonymizeCommentsByAuthor throws', async () => {
      const batchItem = UserDeletedFactory.buildBatchEventItem();
      const testError = new Error('Database error on comment anonymization');
      jest.spyOn(postService, 'purgePostsByAuthor').mockResolvedValue(1);
      jest
        .spyOn(commentService, 'anonymizeCommentsByAuthor')
        .mockRejectedValueOnce(testError);

      await expect(postProcessor['processEvents']([batchItem])).rejects.toThrow(
        'Database error on comment anonymization',
      );
    });

    it('should skip processing if payload has no id', async () => {
      const batchItem = UserDeletedFactory.buildBatchEventItem({ id: '' });
      const purgeSpy = jest
        .spyOn(postService, 'purgePostsByAuthor')
        .mockResolvedValue(0);
      const anonymizeSpy = jest
        .spyOn(commentService, 'anonymizeCommentsByAuthor')
        .mockResolvedValue(0);

      await postProcessor['processEvents']([batchItem]);

      expect(purgeSpy).not.toHaveBeenCalled();
      expect(anonymizeSpy).not.toHaveBeenCalled();
      expect(mockEventQueueRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('sendMessageToDlq', () => {
    it('should insert USER_POST_DELETION_FAILED feedback event when original payload is valid', async () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      const batchItem = UserDeletedFactory.buildBatchEventItem({ id: userId });
      const messageId = '1700000000000-1';
      const originalPayload: ParseResult = {
        success: true,
        payload: JSON.stringify(batchItem.event),
      };
      const dlqError = 'Max retries reached in post-processor-post';

      await postProcessor['sendMessageToDlq'](
        messageId,
        originalPayload,
        dlqError,
      );

      expect(mockEventQueueRepo.save).toHaveBeenCalledTimes(1);
      const savedEntities = mockEventQueueRepo.save.mock.calls[0][0] as Array<{
        type: string;
        targetServices: string[];
        traceparent?: string;
        payload: { after: { userId: string; errorReason: string } };
      }>;

      expect(savedEntities).toHaveLength(1);
      expect(savedEntities[0].traceparent).toBe(SOURCE_TRACEPARENT);
      expect(savedEntities[0].type).toBe(
        PostEventMessagingType.USER_POST_DELETION_FAILED,
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
