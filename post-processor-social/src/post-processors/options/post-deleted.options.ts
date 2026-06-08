import { CustomConfig } from '../../config/custom-config.js';
import { Streams } from '@volontariapp/shared';
import { POST_PROCESSOR_POST_DELETED_OPTIONS } from './constants.js';
import { getEventStreamName } from '@volontariapp/messaging';

export const postDeletedOptionsProvider = {
  provide: POST_PROCESSOR_POST_DELETED_OPTIONS,
  useFactory: (customConfig: CustomConfig) => ({
    groupName: 'PostDeletedSocialPostProcessors',
    streamName: getEventStreamName(Streams.POST_DELETED),
    batchSize: customConfig.postProcessor.batchSize,
    blockTimeout: customConfig.postProcessor.blockTimeout,
    idempotencyTtlSeconds: customConfig.postProcessor.idempotencyTtlSeconds,
    maxRetries: customConfig.postProcessor.maxRetries,
    retryDelayMs: customConfig.postProcessor.retryDelayMs,
  }),
  inject: [CustomConfig],
};
