import { Streams } from '@volontariapp/shared';
import { getEventStreamName } from '@volontariapp/messaging';
import { CustomConfig } from '../../config/custom-config.js';
import { EVENT_FINISHED_BADGE_POST_PROCESSOR_OPTIONS } from './constants.js';

export const eventFinishedBadgeOptionsProvider = {
  provide: EVENT_FINISHED_BADGE_POST_PROCESSOR_OPTIONS,
  useFactory: (customConfig: CustomConfig) => ({
    groupName: customConfig.postProcessor.groupName,
    streamName: getEventStreamName(Streams.EVENT_FINISHED),
    batchSize: customConfig.postProcessor.batchSize,
    blockTimeout: customConfig.postProcessor.blockTimeout,
    idempotencyTtlSeconds: customConfig.postProcessor.idempotencyTtlSeconds,
    maxRetries: customConfig.postProcessor.maxRetries,
    retryDelayMs: customConfig.postProcessor.retryDelayMs,
  }),
  inject: [CustomConfig],
};
