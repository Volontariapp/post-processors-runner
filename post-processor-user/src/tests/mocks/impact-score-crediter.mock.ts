import { jest } from '@jest/globals';
import type {
  ImpactScoreCrediter,
  ImpactScoreCreditSummary,
} from '../../core/services/impact-score-crediter.service.js';

export function createMockImpactScoreCrediter(): jest.Mocked<
  Pick<ImpactScoreCrediter, 'creditEventFinished'>
> {
  return {
    creditEventFinished: jest
      .fn<
        (
          eventId: string,
          awardedImpactScore: number,
        ) => Promise<ImpactScoreCreditSummary>
      >()
      .mockResolvedValue({ credited: 0, skipped: 0 }),
  };
}
