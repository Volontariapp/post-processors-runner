import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { EventEventMessagingType } from '@volontariapp/messaging';
import type { PostProcessorOptions } from '@volontariapp/post-processors';
import type { Redis } from 'ioredis';
import { createMock } from '@volontariapp/testing';
import { EventFinishedImpactScorePostProcessor } from '../../post-processors/events/event-finished-impact-score.post-processor.js';
import { createMockImpactScoreCrediter } from '../mocks/impact-score-crediter.mock.js';
import { createEventFinishedBatchItem } from '../factories/event-finished-batch-event.factory.js';

describe('EventFinishedImpactScorePostProcessor', () => {
  let postProcessor: EventFinishedImpactScorePostProcessor;
  let crediter: ReturnType<typeof createMockImpactScoreCrediter>;

  beforeEach(() => {
    crediter = createMockImpactScoreCrediter();
    const options: PostProcessorOptions = {
      streamName: 'test-stream',
      groupName: 'test-group-impact-score',
      consumerName: 'test-consumer',
      batchSize: 10,
      blockMs: 1000,
      idempotencyTtlSeconds: 86400,
      retry: { maxRetries: 3, initialDelayMs: 1000 },
    };

    postProcessor = new EventFinishedImpactScorePostProcessor(
      crediter,
      createMock<Redis>(),
      options,
    );

    Object.defineProperty(postProcessor, 'logger', {
      value: {
        log: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      },
    });
  });

  describe('shouldProcess', () => {
    it('accepts event.finished only', () => {
      expect(
        postProcessor['shouldProcess'](EventEventMessagingType.EVENT_FINISHED),
      ).toBe(true);
      expect(
        postProcessor['shouldProcess'](EventEventMessagingType.EVENT_CREATED),
      ).toBe(false);
    });
  });

  describe('processEvents', () => {
    it('credits the awarded impact score of the finished event', async () => {
      const item = createEventFinishedBatchItem({
        eventId: 'event-123',
        awardedImpactScore: 40,
      });

      await postProcessor['processEvents']([item]);

      expect(crediter.creditEventFinished).toHaveBeenCalledWith(
        'event-123',
        40,
        expect.anything(),
      );
    });

    it('passes the source event trace context to the crediter', async () => {
      const item = createEventFinishedBatchItem({
        correlationId: 'corr-finished-9',
        traceId: 'trace-finished-9',
      });

      await postProcessor['processEvents']([item]);

      expect(crediter.creditEventFinished).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Number),
        expect.objectContaining({
          correlationId: 'corr-finished-9',
          traceId: 'trace-finished-9',
        }),
      );
    });

    it('credits every message of the batch', async () => {
      const items = [
        createEventFinishedBatchItem({
          messageId: 'msg-1',
          eventId: 'event-1',
          awardedImpactScore: 10,
        }),
        createEventFinishedBatchItem({
          messageId: 'msg-2',
          eventId: 'event-2',
          awardedImpactScore: 25,
        }),
      ];

      await postProcessor['processEvents'](items);

      expect(crediter.creditEventFinished).toHaveBeenCalledTimes(2);
      expect(crediter.creditEventFinished).toHaveBeenCalledWith(
        'event-1',
        10,
        expect.anything(),
      );
      expect(crediter.creditEventFinished).toHaveBeenCalledWith(
        'event-2',
        25,
        expect.anything(),
      );
    });

    it('skips a message emitted before the payload carried the score', async () => {
      const item = createEventFinishedBatchItem();
      Reflect.deleteProperty(item.event.payload.after, 'awardedImpactScore');

      await postProcessor['processEvents']([item]);

      expect(crediter.creditEventFinished).not.toHaveBeenCalled();
    });

    it('skips a message without event id', async () => {
      const item = createEventFinishedBatchItem({ eventId: '' });

      await postProcessor['processEvents']([item]);

      expect(crediter.creditEventFinished).not.toHaveBeenCalled();
    });

    it('rethrows a crediter failure so the message is retried', async () => {
      crediter.creditEventFinished.mockRejectedValue(new Error('db down'));

      await expect(
        postProcessor['processEvents']([createEventFinishedBatchItem()]),
      ).rejects.toThrow('db down');
    });
  });
});
