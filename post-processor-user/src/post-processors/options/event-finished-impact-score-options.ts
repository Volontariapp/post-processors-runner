import { Streams } from '@volontariapp/shared';
import { getEventStreamName } from '@volontariapp/messaging';
import { CustomConfig } from '../../config/custom-config.js';
import { EVENT_FINISHED_IMPACT_SCORE_POST_PROCESSOR_OPTIONS } from './constants.js';

export const IMPACT_SCORE_GROUP_SUFFIX = '-impact-score';

export const eventFinishedImpactScoreOptionsProvider = {
  provide: EVENT_FINISHED_IMPACT_SCORE_POST_PROCESSOR_OPTIONS,
  useFactory: (customConfig: CustomConfig) => ({
    // Meme stream que les badges mais groupe distinct : sinon les deux processors
    // se partageraient les messages au lieu de lire chacun le flux complet.
    groupName: `${customConfig.postProcessor.groupName}${IMPACT_SCORE_GROUP_SUFFIX}`,
    streamName: getEventStreamName(Streams.EVENT_FINISHED),
    batchSize: customConfig.postProcessor.batchSize,
    blockTimeout: customConfig.postProcessor.blockTimeout,
    idempotencyTtlSeconds: customConfig.postProcessor.idempotencyTtlSeconds,
    maxRetries: customConfig.postProcessor.maxRetries,
    retryDelayMs: customConfig.postProcessor.retryDelayMs,
  }),
  inject: [CustomConfig],
};
