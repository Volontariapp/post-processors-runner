import { Streams } from '@volontariapp/shared';
import { getEventStreamName } from '@volontariapp/messaging';
import { CustomConfig } from '../../config/custom-config.js';
import { POST_CREATION_SUCCESSFULL_BADGE_POST_PROCESSOR_OPTIONS } from './constants.js';

export const postCreationSuccessfullBadgeOptionsProvider = {
  provide: POST_CREATION_SUCCESSFULL_BADGE_POST_PROCESSOR_OPTIONS,
  useFactory: (customConfig: CustomConfig) => ({
    groupName: customConfig.postProcessor.groupName,
    streamName: getEventStreamName(Streams.POST_SUCCESSFULLY_CREATED),
    batchSize: customConfig.postProcessor.batchSize,
    blockTimeout: customConfig.postProcessor.blockTimeout,
    idempotencyTtlSeconds: customConfig.postProcessor.idempotencyTtlSeconds,
    maxRetries: customConfig.postProcessor.maxRetries,
    retryDelayMs: customConfig.postProcessor.retryDelayMs,
  }),
  inject: [CustomConfig],
};
