import {
  RankingLikeLogService,
  RankingMentionService,
  RankingPurgeService,
  RankingRequestService,
  RankingWishService,
} from '@volontariapp/domain-ranking';
import { RankingJobWriter } from '../ranking-job-writer.js';

export const rankingDomainServices = [
  RankingLikeLogService,
  RankingMentionService,
  RankingPurgeService,
  RankingRequestService,
  RankingWishService,
  RankingJobWriter,
];
