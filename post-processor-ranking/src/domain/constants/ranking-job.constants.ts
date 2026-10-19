import { RankingListKind } from '@volontariapp/domain-ranking';
import { JobMessagingType, RankingQueue } from '@volontariapp/messaging';

export const JOB_EMITTER = 'ms-ranking';

export const COMPUTE_JOB_TYPE = {
  [RankingListKind.EVENT]: JobMessagingType.COMPUTE_USER_RANKING,
  [RankingListKind.POST]: JobMessagingType.COMPUTE_USER_FEED,
} as const;

export const BACKGROUND_QUEUE = {
  [RankingListKind.EVENT]: RankingQueue.RANKING,
  [RankingListKind.POST]: RankingQueue.FEED,
} as const;
