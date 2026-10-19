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
} from '@volontariapp/domain-ranking';
import { rankingDomainServices } from './constants/ranking-domain-services.constants.js';

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
    ...rankingDomainServices,
  ],
  exports: [TypeOrmModule, ...rankingDomainServices],
})
export class DomainRankingModule {}
