import { CustomConfig } from '../../../config/custom-config.js';
import { Streams } from '@volontariapp/shared';
import { POST_PROCESSOR_POST_CREATED_OPTIONS } from '../../options/constants.js';
import { getEventStreamName } from '@volontariapp/messaging';

export const postCreatedOptionsProvider = {
  provide: POST_PROCESSOR_POST_CREATED_OPTIONS,
  useFactory: (customConfig: CustomConfig) => ({
    groupName: 'PostCreatedSocialPostProcessors',
    streamName: getEventStreamName(Streams.POST_CREATED),
    batchSize: customConfig.postProcessor.batchSize,
    blockTimeout: customConfig.postProcessor.blockTimeout,
    idempotencyTtlSeconds: customConfig.postProcessor.idempotencyTtlSeconds,
    maxRetries: customConfig.postProcessor.maxRetries,
    retryDelayMs: customConfig.postProcessor.retryDelayMs,
  }),
  inject: [CustomConfig],
};
