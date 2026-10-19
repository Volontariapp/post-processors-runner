import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventQueueModel, JobsOutboxModel } from '@volontariapp/database';
import {
  PostgresRankingEventFeedbackRepository,
  PostgresRankingEventMentionRepository,
  PostgresRankingEventWishRepository,
  PostgresRankingLikeLogRepository,
  PostgresRankingLocationRepository,
  PostgresRankingPostScoreRepository,
  PostgresRankingRateBucketRepository,
  PostgresRankingRequestRepository,
  PostgresRankingRunRepository,
  PostgresRankingScoreRepository,
  RANKING_MODELS,
  RankingLikeLogService,
  RankingMentionService,
  RankingPurgeService,
  RankingRequestService,
  RankingWishService,
} from '@volontariapp/domain-ranking';
import { RankingJobWriter } from './ranking-job-writer.js';

const services = [
  RankingLikeLogService,
  RankingMentionService,
  RankingPurgeService,
  RankingRequestService,
  RankingWishService,
  RankingJobWriter,
];

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ...RANKING_MODELS,
      EventQueueModel,
      JobsOutboxModel,
    ]),
  ],
  providers: [
    PostgresRankingEventFeedbackRepository,
    PostgresRankingEventMentionRepository,
    PostgresRankingEventWishRepository,
    PostgresRankingLikeLogRepository,
    PostgresRankingLocationRepository,
    PostgresRankingPostScoreRepository,
    PostgresRankingRateBucketRepository,
    PostgresRankingRequestRepository,
    PostgresRankingRunRepository,
    PostgresRankingScoreRepository,
    ...services,
  ],
  exports: [TypeOrmModule, ...services],
})
export class DomainRankingModule {}
