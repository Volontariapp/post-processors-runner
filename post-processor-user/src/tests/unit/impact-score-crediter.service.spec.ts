import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import { ImpactScoreCreditModel, UserModel } from '@volontariapp/domain-user';
import { UserEventMessagingType } from '@volontariapp/messaging';
import { Streams } from '@volontariapp/shared';
import type { EventTraceContext } from '@volontariapp/database';
import { ImpactScoreCrediter } from '../../core/services/impact-score-crediter.service.js';
import { createMockDataSource } from '../mocks/data-source.mock.js';
import { createMockSocialInteractionClient } from '../mocks/social-interaction-client.mock.js';
import { SOURCE_TRACEPARENT } from '../factories/trace.factory.js';
import { createCheckedInAttendees } from '../factories/event-attendee.factory.js';

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
  let loggerWarn: jest.Mock;

  beforeEach(() => {
    mockEnv = createMockDataSource();
    socialClient = createMockSocialInteractionClient();
    crediter = new ImpactScoreCrediter(mockEnv.dataSource, socialClient);

    loggerWarn = jest.fn();
    Object.defineProperty(crediter, 'logger', {
      value: {
        log: jest.fn(),
        info: jest.fn(),
        warn: loggerWarn,
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

  describe('creditEventFinished (dynamic scoring)', () => {
    it('credits present attendees and organizer according to computeEventScoring when N >= 3', async () => {
      socialClient.getAllEventAttendees.mockResolvedValue([
        {
          userId: 'user-1',
          registeredAt: new Date('2026-06-01T10:00:00Z'),
          checkedIn: true,
        },
        {
          userId: 'user-2',
          registeredAt: new Date('2026-06-01T10:05:00Z'),
          checkedIn: true,
        },
        {
          userId: 'user-3',
          registeredAt: new Date('2026-06-01T10:10:00Z'),
          checkedIn: true,
        },
        {
          userId: 'user-absent',
          registeredAt: new Date('2026-06-01T10:15:00Z'),
          checkedIn: false,
        },
      ]);
      mockEnv.queryBuilder.execute.mockResolvedValue(INSERTED);

      const summary = await crediter.creditEventFinished({
        eventId: EVENT_ID,
        scoringVersion: 1,
        startAt: '2026-06-01T14:00:00Z',
        endAt: '2026-06-01T16:00:00Z',
        maxParticipants: 10,
        organizerId: 'organizer-1',
        context: TRACE_CONTEXT,
      });

      // 3 present participants + 1 organizer = 4 credited
      expect(summary.credited).toBe(4);
      expect(summary.skipped).toBe(0);

      // Verify that user-absent was NOT credited
      expect(mockEnv.manager.increment).not.toHaveBeenCalledWith(
        UserModel,
        { id: 'user-absent' },
        'totalImpactScore',
        expect.anything(),
      );

      // Verify organizer was credited with role: 'ORGANIZER'
      expect(mockEnv.queryBuilder.values).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: EVENT_ID,
          userId: 'organizer-1',
          role: 'ORGANIZER',
          formulaVersion: 1,
        }),
      );

      // Verify participant was credited with role: 'PARTICIPANT' and rank
      expect(mockEnv.queryBuilder.values).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: EVENT_ID,
          userId: 'user-1',
          role: 'PARTICIPANT',
          rank: 1,
          formulaVersion: 1,
        }),
      );
    });

    it('does not credit organizer prime when present attendees N < 3 (anti-Sybil)', async () => {
      socialClient.getAllEventAttendees.mockResolvedValue([
        {
          userId: 'user-1',
          registeredAt: new Date('2026-06-01T10:00:00Z'),
          checkedIn: true,
        },
        {
          userId: 'user-2',
          registeredAt: new Date('2026-06-01T10:05:00Z'),
          checkedIn: true,
        },
      ]);
      mockEnv.queryBuilder.execute.mockResolvedValue(INSERTED);

      const summary = await crediter.creditEventFinished({
        eventId: EVENT_ID,
        scoringVersion: 1,
        startAt: '2026-06-01T14:00:00Z',
        endAt: '2026-06-01T16:00:00Z',
        maxParticipants: 10,
        organizerId: 'organizer-1',
        context: TRACE_CONTEXT,
      });

      // 2 participants credited, organizer gets 0 prime
      expect(summary.credited).toBe(2);
      expect(mockEnv.manager.increment).not.toHaveBeenCalledWith(
        UserModel,
        { id: 'organizer-1' },
        'totalImpactScore',
        expect.anything(),
      );
    });
  });
  describe('creditEventFinished (pool inputs, docs/scoring/03 section 6)', () => {
    const TWO_HOURS = {
      startAt: '2026-06-01T14:00:00Z',
      endAt: '2026-06-01T16:00:00Z',
    };

    function creditedParticipantTotal(): number {
      return mockEnv.manager.increment.mock.calls
        .filter(([, where]) => !isOrganizerWhere(where))
        .reduce((sum, call) => sum + Number(call[3]), 0);
    }

    function isOrganizerWhere(where: unknown): boolean {
      return (
        typeof where === 'object' &&
        where !== null &&
        'id' in where &&
        where.id === 'organizer-1'
      );
    }

    beforeEach(() => {
      socialClient.getAllEventAttendees.mockResolvedValue(
        createCheckedInAttendees(5),
      );
      mockEnv.queryBuilder.execute.mockResolvedValue(INSERTED);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('gives no fill bonus when maxParticipants is absent (pool 500 for N=5, alpha 1.0)', async () => {
      await crediter.creditEventFinished({
        eventId: EVENT_ID,
        scoringVersion: 1,
        ...TWO_HOURS,
        organizerId: 'organizer-1',
        context: TRACE_CONTEXT,
      });

      expect(mockEnv.queryBuilder.values).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', eventPool: 500 }),
      );
      expect(creditedParticipantTotal()).toBe(500);
    });

    it('applies the full fill bonus when maxParticipants equals N (pool 1000)', async () => {
      await crediter.creditEventFinished({
        eventId: EVENT_ID,
        scoringVersion: 1,
        ...TWO_HOURS,
        maxParticipants: 5,
        organizerId: 'organizer-1',
        context: TRACE_CONTEXT,
      });

      expect(mockEnv.queryBuilder.values).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', eventPool: 1000 }),
      );
      expect(creditedParticipantTotal()).toBe(1000);
    });

    it.each([
      [
        'garbage startAt',
        { startAt: 'garbage', endAt: '2026-06-01T16:00:00Z' },
      ],
      ['garbage endAt', { startAt: '2026-06-01T14:00:00Z', endAt: 'garbage' }],
    ])(
      'treats %s as missing dates: lowest alpha, warning, no clock read',
      async (_label, dates) => {
        const nowSpy = jest.spyOn(Date, 'now');

        await crediter.creditEventFinished({
          eventId: EVENT_ID,
          scoringVersion: 1,
          ...dates,
          organizerId: 'organizer-1',
          context: TRACE_CONTEXT,
        });

        expect(nowSpy).not.toHaveBeenCalled();
        expect(loggerWarn).toHaveBeenCalledWith(
          expect.stringContaining('invalid startAt/endAt'),
          expect.objectContaining({ eventId: EVENT_ID, ...dates }),
        );
        expect(mockEnv.queryBuilder.values).toHaveBeenCalledWith(
          expect.objectContaining({ userId: 'user-1', eventPool: 500 }),
        );
      },
    );

    it('uses the lowest alpha bracket and warns, without reading the clock, when dates are missing', async () => {
      const nowSpy = jest.spyOn(Date, 'now');

      await crediter.creditEventFinished({
        eventId: EVENT_ID,
        scoringVersion: 1,
        organizerId: 'organizer-1',
        context: TRACE_CONTEXT,
      });

      expect(nowSpy).not.toHaveBeenCalled();
      expect(loggerWarn).toHaveBeenCalledWith(
        expect.stringContaining('startAt/endAt'),
        expect.objectContaining({ eventId: EVENT_ID }),
      );
      expect(mockEnv.queryBuilder.values).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', eventPool: 500 }),
      );
    });
  });
});
