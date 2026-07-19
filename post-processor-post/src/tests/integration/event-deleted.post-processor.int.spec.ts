/* eslint-disable @typescript-eslint/unbound-method */
import type { jest } from '@jest/globals';
import { describe, it, expect, beforeEach } from '@jest/globals';
import { EventDeletedPostProcessor } from '../../post-processors/events/event-deleted.post-processor.js';
import {
  EventEventMessagingType,
  SocialEventMessagingType,
} from '@volontariapp/messaging';
import { Streams } from '@volontariapp/shared';
import { EventDeletedFactory } from '../factories/event-deleted.factory.js';
import {
  createMockPostService,
  createMockEventQueueRepository,
  createMockRedisClient,
  createMockOptions,
  createMockLogger,
} from '../mocks/event-deleted.post-processor.mock.js';
import type { ParseResult } from '@volontariapp/post-processors';

describe('EventDeletedPostProcessor (Integration Test)', () => {
  let postProcessor: EventDeletedPostProcessor;
  let postService: ReturnType<typeof createMockPostService>;
  let typeormRepository: ReturnType<typeof createMockEventQueueRepository>;
  let redisClient: ReturnType<typeof createMockRedisClient>;
  let options: ReturnType<typeof createMockOptions>;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    postService = createMockPostService();
    typeormRepository = createMockEventQueueRepository();
    redisClient = createMockRedisClient();
    options = createMockOptions();
    logger = createMockLogger();

    postProcessor = new EventDeletedPostProcessor(
      redisClient,
      options,
      postService,
      typeormRepository,
    );

    (postProcessor as unknown as { logger: typeof logger }).logger = logger;
  });

  describe('shouldProcess', () => {
    it('should handle EventEventMessagingType.EVENT_DELETED and "event.deleted"', () => {
      const shouldProcessFn = (
        postProcessor as unknown as {
          shouldProcess(type: string): boolean;
        }
      ).shouldProcess.bind(postProcessor);

      expect(shouldProcessFn(EventEventMessagingType.EVENT_DELETED)).toBe(true);
      expect(shouldProcessFn('event.deleted')).toBe(true);
      expect(shouldProcessFn(EventEventMessagingType.EVENT_CREATED)).toBe(
        false,
      );
    });
  });

  describe('processEvents integration', () => {
    it('should delete posts/comments for eventId and queue WS feedback events', async () => {
      const item1 = EventDeletedFactory.buildBatchEventItem();
      const item2 = EventDeletedFactory.buildBatchEventItem();
      const events = [item1, item2];

      await (
        postProcessor as unknown as {
          processEvents(items: typeof events): Promise<void>;
        }
      ).processEvents(events);

      const payload1 = item1.event.payload.after;
      const payload2 = item2.event.payload.after;

      expect(postService.deleteByEventId).toHaveBeenCalledTimes(2);
      expect(postService.deleteByEventId).toHaveBeenNthCalledWith(
        1,
        payload1.eventId,
      );
      expect(postService.deleteByEventId).toHaveBeenNthCalledWith(
        2,
        payload2.eventId,
      );

      expect(typeormRepository.save).toHaveBeenCalledTimes(1);

      const savedEntities = (typeormRepository.save as jest.Mock).mock
        .calls[0][0] as Array<{
        type: string;
        targetServices: string[];
        payload: { after: { eventId: string } };
      }>;

      expect(savedEntities).toHaveLength(2);
      expect(savedEntities[0].type).toBe(
        SocialEventMessagingType.EVENT_SOCIAL_DELETED,
      );
      expect(savedEntities[0].targetServices).toContain(
        Streams.WS_EVENT_DELETED_FEEDBACK,
      );
      expect(savedEntities[0].payload.after.eventId).toBe(payload1.eventId);
    });

    it('should filter out invalid payloads missing eventId', async () => {
      const invalidItem = EventDeletedFactory.buildInvalidBatchEventItem();
      const validItem = EventDeletedFactory.buildBatchEventItem();
      const events = [invalidItem, validItem];

      await (
        postProcessor as unknown as {
          processEvents(items: typeof events): Promise<void>;
        }
      ).processEvents(events);

      const validPayload = validItem.event.payload.after;

      expect(logger.error).toHaveBeenCalledWith(
        'Invalid payload for EVENT_DELETED: missing eventId',
        expect.objectContaining({ messageId: invalidItem.messageId }),
      );

      expect(postService.deleteByEventId).toHaveBeenCalledTimes(1);
      expect(postService.deleteByEventId).toHaveBeenCalledWith(
        validPayload.eventId,
      );

      expect(typeormRepository.save).toHaveBeenCalledTimes(1);
      const savedEntities = (typeormRepository.save as jest.Mock).mock
        .calls[0][0] as Array<{ payload: { after: { eventId: string } } }>;
      expect(savedEntities).toHaveLength(1);
      expect(savedEntities[0].payload.after.eventId).toBe(validPayload.eventId);
    });

    it('should handle empty batch gracefully', async () => {
      const invalidItem = EventDeletedFactory.buildInvalidBatchEventItem();

      await (
        postProcessor as unknown as {
          processEvents(items: (typeof invalidItem)[]): Promise<void>;
        }
      ).processEvents([invalidItem]);

      expect(postService.deleteByEventId).not.toHaveBeenCalled();
      expect(typeormRepository.save).not.toHaveBeenCalled();
    });

    it('should propagate errors if postService.deleteByEventId fails', async () => {
      const item = EventDeletedFactory.buildBatchEventItem();
      const error = new Error('Database error');
      (
        postService.deleteByEventId as unknown as jest.Mock<
          (eventId: string) => Promise<number>
        >
      ).mockRejectedValueOnce(error);

      await expect(
        (
          postProcessor as unknown as {
            processEvents(items: (typeof item)[]): Promise<void>;
          }
        ).processEvents([item]),
      ).rejects.toThrow('Database error');
    });
  });

  describe('sendMessageToDlq integration', () => {
    it('should emit EVENT_SOCIAL_DELETION_FAILED feedback event when DLQ occurs', async () => {
      const item = EventDeletedFactory.buildBatchEventItem();
      const messageId = '1700000000000-1';
      const originalPayload: ParseResult = {
        success: true,
        payload: JSON.stringify(item.event),
      };
      const dlqError = 'Max retries reached';

      await (
        postProcessor as unknown as {
          sendMessageToDlq(
            id: string,
            payload: ParseResult,
            err: string,
          ): Promise<void>;
        }
      ).sendMessageToDlq(messageId, originalPayload, dlqError);

      const payload = item.event.payload.after;

      expect(typeormRepository.save).toHaveBeenCalledTimes(1);
      const savedEntities = (typeormRepository.save as jest.Mock).mock
        .calls[0][0] as Array<{
        type: string;
        targetServices: string[];
        payload: { after: { eventId: string } };
      }>;

      expect(savedEntities).toHaveLength(1);
      expect(savedEntities[0].type).toBe(
        SocialEventMessagingType.EVENT_SOCIAL_DELETION_FAILED,
      );
      expect(savedEntities[0].targetServices).toContain(
        Streams.WS_EVENT_DELETED_FEEDBACK,
      );
      expect(savedEntities[0].payload.after.eventId).toBe(payload.eventId);
    });

    it('should log warning when original payload cannot be parsed in DLQ', async () => {
      const messageId = '1700000000000-2';
      const originalPayload: ParseResult = {
        success: false,
        raw: 'corrupted-data',
      };
      const dlqError = 'Parse error';

      await (
        postProcessor as unknown as {
          sendMessageToDlq(
            id: string,
            payload: ParseResult,
            err: string,
          ): Promise<void>;
        }
      ).sendMessageToDlq(messageId, originalPayload, dlqError);

      expect(logger.warn).toHaveBeenCalledWith(
        'Original payload failed to parse, cannot send WS feedback',
        { messageId },
      );
      expect(typeormRepository.save).not.toHaveBeenCalled();
    });
  });
});
