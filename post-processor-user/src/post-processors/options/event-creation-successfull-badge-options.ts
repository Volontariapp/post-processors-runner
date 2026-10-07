import { Streams } from '@volontariapp/shared';
import { CustomConfig } from '../../config/custom-config.js';
import { EVENT_CREATION_SUCCESSFULL_BADGE_POST_PROCESSOR_OPTIONS } from './constants.js';

export const eventCreationSuccessfullBadgeOptionsProvider = {
  provide: EVENT_CREATION_SUCCESSFULL_BADGE_POST_PROCESSOR_OPTIONS,
  useFactory: (customConfig: CustomConfig) => ({
    groupName: customConfig.postProcessor.groupName,
    streamName: Streams.EVENT_SUCCESSFULLY_CREATED,
    batchSize: customConfig.postProcessor.batchSize,
    blockTimeout: customConfig.postProcessor.blockTimeout,
    idempotencyTtlSeconds: customConfig.postProcessor.idempotencyTtlSeconds,
    maxRetries: customConfig.postProcessor.maxRetries,
    retryDelayMs: customConfig.postProcessor.retryDelayMs,
  }),
  inject: [CustomConfig],
};
