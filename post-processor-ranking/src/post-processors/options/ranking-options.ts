import { Streams } from '@volontariapp/shared';
import {
  EVENT_CREATED_OPTIONS,
  EVENT_FINISHED_OPTIONS,
  EVENT_UNWISHED_OPTIONS,
  EVENT_WISHED_OPTIONS,
  POST_CREATED_OPTIONS,
  POST_DELETED_OPTIONS,
  POST_LIKED_OPTIONS,
  POST_UNLIKED_OPTIONS,
  USER_CREATED_OPTIONS,
  USER_DELETED_OPTIONS,
} from './constants.js';
import { rankingOptionsProvider } from './ranking-options.factory.js';

export const rankingOptionsProviders = [
  rankingOptionsProvider(
    USER_CREATED_OPTIONS,
    'RankingUserCreatedPostProcessors',
    Streams.SOCIAL_USER,
  ),
  rankingOptionsProvider(
    USER_DELETED_OPTIONS,
    'RankingUserDeletedPostProcessors',
    Streams.USER_DELETED_RANKING,
  ),
  rankingOptionsProvider(
    EVENT_WISHED_OPTIONS,
    'RankingEventWishedPostProcessors',
    Streams.EVENT_SOCIAL_WISHED,
  ),
  rankingOptionsProvider(
    EVENT_UNWISHED_OPTIONS,
    'RankingEventUnwishedPostProcessors',
    Streams.EVENT_SOCIAL_UNWISHED,
  ),
  rankingOptionsProvider(
    EVENT_CREATED_OPTIONS,
    'RankingEventCreatedPostProcessors',
    Streams.EVENT_CREATED,
  ),
  rankingOptionsProvider(
    EVENT_FINISHED_OPTIONS,
    'RankingEventFinishedPostProcessors',
    Streams.EVENT_FINISHED,
  ),
  rankingOptionsProvider(
    POST_CREATED_OPTIONS,
    'RankingPostCreatedPostProcessors',
    Streams.POST_CREATED,
  ),
  rankingOptionsProvider(
    POST_LIKED_OPTIONS,
    'RankingPostLikedPostProcessors',
    Streams.POST_LIKED,
  ),
  rankingOptionsProvider(
    POST_UNLIKED_OPTIONS,
    'RankingPostUnlikedPostProcessors',
    Streams.POST_UNLIKED,
  ),
  rankingOptionsProvider(
    POST_DELETED_OPTIONS,
    'RankingPostDeletedPostProcessors',
    Streams.POST_DELETED,
  ),
];
