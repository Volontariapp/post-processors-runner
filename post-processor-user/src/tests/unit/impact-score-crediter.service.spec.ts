import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ImpactScoreCreditModel, UserModel } from '@volontariapp/domain-user';
import { UserEventMessagingType } from '@volontariapp/messaging';
import { Streams } from '@volontariapp/shared';
import type { EventTraceContext } from '@volontariapp/database';
import { ImpactScoreCrediter } from '../../core/services/impact-score-crediter.service.js';
import { createMockDataSource } from '../mocks/data-source.mock.js';
import { createMockSocialInteractionClient } from '../mocks/social-interaction-client.mock.js';
import { SOURCE_TRACEPARENT } from '../factories/trace.factory.js';

const EVENT_ID = 'event-1';
const SCORE = 40;
const INSERTED = { raw: [{ event_id: EVENT_ID }] };
const ALREADY_CREDITED = { raw: [] };
const TRACE_CONTEXT: EventTraceContext = {
  correlationId: 'corr-123',
  traceId: 'trace-456',
  traceparent: SOURCE_TRACEPARENT,
};

describe('ImpactScoreCrediter', () => {
  let crediter: ImpactScoreCrediter;
  let mockEnv: ReturnType<typeof createMockDataSource>;
  let socialClient: ReturnType<typeof createMockSocialInteractionClient>;

  beforeEach(() => {
    mockEnv = createMockDataSource();
    socialClient = createMockSocialInteractionClient();
    crediter = new ImpactScoreCrediter(mockEnv.dataSource, socialClient);

    Object.defineProperty(crediter, 'logger', {
      value: {
        log: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      },
    });
  });

  describe('creditEventFinished', () => {
    it('credits the awarded score to every participant and reports the count', async () => {
      socialClient.getAllEventParticipantIds.mockResolvedValue([
        'user-1',
        'user-2',
      ]);
      mockEnv.queryBuilder.execute.mockResolvedValue(INSERTED);

      const summary = await crediter.creditEventFinished(
        EVENT_ID,
        SCORE,
        TRACE_CONTEXT,
      );

      expect(summary).toEqual({ credited: 2, skipped: 0 });
      expect(mockEnv.manager.increment).toHaveBeenCalledWith(
        UserModel,
        { id: 'user-1' },
        'totalImpactScore',
        SCORE,
      );
      expect(mockEnv.manager.increment).toHaveBeenCalledWith(
        UserModel,
        { id: 'user-2' },
        'totalImpactScore',
        SCORE,
      );
    });

    it('records the credited score in the ledger for the event and participant', async () => {
      socialClient.getAllEventParticipantIds.mockResolvedValue(['user-1']);
      mockEnv.queryBuilder.execute.mockResolvedValue(INSERTED);

      await crediter.creditEventFinished(EVENT_ID, SCORE, TRACE_CONTEXT);

      expect(mockEnv.queryBuilder.into).toHaveBeenCalledWith(
        ImpactScoreCreditModel,
      );
      expect(mockEnv.queryBuilder.values).toHaveBeenCalledWith({
        eventId: EVENT_ID,
        userId: 'user-1',
        score: SCORE,
      });
    });

    it('writes a user.impact_score_credited outbox row per credited participant, carrying the source trace context', async () => {
      socialClient.getAllEventParticipantIds.mockResolvedValue([
        'user-1',
        'user-2',
      ]);
      mockEnv.queryBuilder.execute.mockResolvedValue(INSERTED);

      await crediter.creditEventFinished(EVENT_ID, SCORE, TRACE_CONTEXT);

      const outboxSave = mockEnv.repositories.eventQueueRepo.save;
      expect(outboxSave).toHaveBeenCalledTimes(2);
      for (const userId of ['user-1', 'user-2']) {
        expect(outboxSave).toHaveBeenCalledWith(
          expect.objectContaining({
            type: UserEventMessagingType.USER_IMPACT_SCORE_CREDITED,
            emitter: 'post-processor-user',
            emitterId: userId,
            correlationId: 'corr-123',
            traceId: 'trace-456',
            traceparent: SOURCE_TRACEPARENT,
            targetServices: [Streams.USER_IMPACT_SCORE_CREDITED],
            payload: {
              after: { userId, eventId: EVENT_ID, scoreIncrement: SCORE },
            },
          }),
          undefined,
        );
      }
    });

    it('does not credit again when the ledger already holds the pair (replay)', async () => {
      socialClient.getAllEventParticipantIds.mockResolvedValue([
        'user-1',
        'user-2',
      ]);
      mockEnv.queryBuilder.execute.mockResolvedValue(ALREADY_CREDITED);

      const summary = await crediter.creditEventFinished(
        EVENT_ID,
        SCORE,
        TRACE_CONTEXT,
      );

      expect(summary).toEqual({ credited: 0, skipped: 2 });
      expect(mockEnv.manager.increment).not.toHaveBeenCalled();
    });

    it('writes no outbox row when the ledger already holds the pair (replay)', async () => {
      socialClient.getAllEventParticipantIds.mockResolvedValue(['user-1']);
      mockEnv.queryBuilder.execute.mockResolvedValue(ALREADY_CREDITED);

      await crediter.creditEventFinished(EVENT_ID, SCORE, TRACE_CONTEXT);

      expect(mockEnv.repositories.eventQueueRepo.save).not.toHaveBeenCalled();
    });

    it('credits nothing and reads no participants when the score is not positive', async () => {
      const summary = await crediter.creditEventFinished(
        EVENT_ID,
        0,
        TRACE_CONTEXT,
      );

      expect(summary).toEqual({ credited: 0, skipped: 0 });
      expect(socialClient.getAllEventParticipantIds).not.toHaveBeenCalled();
      expect(mockEnv.dataSource.transaction).not.toHaveBeenCalled();
    });

    it('rethrows a participant failure so the message is retried', async () => {
      socialClient.getAllEventParticipantIds.mockResolvedValue(['user-1']);
      mockEnv.queryBuilder.execute.mockRejectedValue(new Error('db down'));

      await expect(
        crediter.creditEventFinished(EVENT_ID, SCORE, TRACE_CONTEXT),
      ).rejects.toThrow('db down');
    });
  });
});
