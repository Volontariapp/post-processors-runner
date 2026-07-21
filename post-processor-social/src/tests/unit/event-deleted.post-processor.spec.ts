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
  createMockParticipationService,
  createMockEventQueueRepository,
  createMockRedisClient,
  createMockOptions,
  createMockLogger,
} from '../mocks/event-deleted.post-processor.mock.js';
import type { ParseResult } from '@volontariapp/post-processors';

describe('EventDeletedPostProcessor', () => {
  let postProcessor: EventDeletedPostProcessor;
  let participationService: ReturnType<typeof createMockParticipationService>;
  let typeormRepository: ReturnType<typeof createMockEventQueueRepository>;
  let redisClient: ReturnType<typeof createMockRedisClient>;
  let options: ReturnType<typeof createMockOptions>;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    participationService = createMockParticipationService();
    typeormRepository = createMockEventQueueRepository();
    redisClient = createMockRedisClient();
    options = createMockOptions();
    logger = createMockLogger();

    postProcessor = new EventDeletedPostProcessor(
      redisClient,
      options,
      participationService,
      typeormRepository,
    );

    // Replace internal logger with mock logger
    postProcessor['logger'] = logger;
  });

  describe('shouldProcess', () => {
    it('should return true for EventEventMessagingType.EVENT_DELETED', () => {
      const result = postProcessor['shouldProcess'](
        EventEventMessagingType.EVENT_DELETED,
      );

      expect(result).toBe(true);
    });

    it('should return true for string "event.deleted"', () => {
      const result = postProcessor['shouldProcess']('event.deleted');

      expect(result).toBe(true);
    });

    it('should return false for other event types', () => {
      const result = postProcessor['shouldProcess'](
        EventEventMessagingType.EVENT_CREATED,
      );

      expect(result).toBe(false);
    });
  });

  describe('processEvents', () => {
    it('should process a valid batch of EVENT_DELETED events successfully', async () => {
      const item1 = EventDeletedFactory.buildBatchEventItem();
      const item2 = EventDeletedFactory.buildBatchEventItem();
      const events = [item1, item2];

      await postProcessor['processEvents'](events);

      const payload1 = item1.event.payload.after;
      const payload2 = item2.event.payload.after;

      // Verify Neo4j delete calls
      expect(participationService.deleteEventsBatch).toHaveBeenCalledTimes(1);
      expect(participationService.deleteEventsBatch).toHaveBeenCalledWith([
        expect.objectContaining({ value: payload1.eventId }),
        expect.objectContaining({ value: payload2.eventId }),
      ]);

      // Verify EventQueue insertion (save on repository)
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

    it('should skip invalid event items missing eventId and process valid ones', async () => {
      const invalidItem = EventDeletedFactory.buildInvalidBatchEventItem();
      const validItem = EventDeletedFactory.buildBatchEventItem();
      const events = [invalidItem, validItem];

      await postProcessor['processEvents'](events);

      const validPayload = validItem.event.payload.after;

      // Verify logger called for invalid payload
      expect(logger.error).toHaveBeenCalledWith(
        'Invalid payload for EVENT_DELETED: missing eventId',
        expect.objectContaining({ messageId: invalidItem.messageId }),
      );

      // Only valid event processed in Neo4j
      expect(participationService.deleteEventsBatch).toHaveBeenCalledTimes(1);
      expect(participationService.deleteEventsBatch).toHaveBeenCalledWith([
        expect.objectContaining({ value: validPayload.eventId }),
      ]);

      // Only 1 feedback event queued
      expect(typeormRepository.save).toHaveBeenCalledTimes(1);
      const savedEntities = (typeormRepository.save as jest.Mock).mock
        .calls[0][0] as Array<{ payload: { after: { eventId: string } } }>;
      expect(savedEntities).toHaveLength(1);
      expect(savedEntities[0].payload.after.eventId).toBe(validPayload.eventId);
    });

    it('should do nothing if batch contains no valid event items', async () => {
      const invalidItem = EventDeletedFactory.buildInvalidBatchEventItem();

      await postProcessor['processEvents']([invalidItem]);

      expect(participationService.deleteEventsBatch).not.toHaveBeenCalled();
      expect(typeormRepository.save).not.toHaveBeenCalled();
    });

    it('should re-throw error if participationService.deleteEventsBatch throws', async () => {
      const item = EventDeletedFactory.buildBatchEventItem();
      const error = new Error('Neo4j connection error');
      participationService.deleteEventsBatch.mockRejectedValueOnce(error);

      await expect(postProcessor['processEvents']([item])).rejects.toThrow(
        'Neo4j connection error',
      );
    });
  });

  describe('sendMessageToDlq', () => {
    it('should insert EVENT_SOCIAL_DELETION_FAILED feedback event when original payload is valid', async () => {
      const item = EventDeletedFactory.buildBatchEventItem();
      const messageId = '1700000000000-1';
      const originalPayload: ParseResult = {
        success: true,
        payload: JSON.stringify(item.event),
      };
      const dlqError = 'Max retries reached';

      await postProcessor['sendMessageToDlq'](
        messageId,
        originalPayload,
        dlqError,
      );

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

    it('should log warning and not emit WS feedback when original payload parsing failed', async () => {
      const messageId = '1700000000000-2';
      const originalPayload: ParseResult = {
        success: false,
        raw: 'corrupted-data',
      };
      const dlqError = 'Parse error';

      await postProcessor['sendMessageToDlq'](
        messageId,
        originalPayload,
        dlqError,
      );

      expect(logger.warn).toHaveBeenCalledWith(
        'Original payload failed to parse, cannot send WS feedback',
        { messageId },
      );
      expect(typeormRepository.save).not.toHaveBeenCalled();
    });
  });
});
