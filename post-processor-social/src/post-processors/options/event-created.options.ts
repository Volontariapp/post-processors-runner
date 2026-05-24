import { CustomConfig } from '../../config/custom-config.js';
import { Streams } from '@volontariapp/shared';
import { POST_PROCESSOR_EVENT_CREATED_OPTIONS } from './constants.js';
import { getEventStreamName } from '@volontariapp/messaging';

export const eventCreatedOptionsProvider = {
  provide: POST_PROCESSOR_EVENT_CREATED_OPTIONS,
  useFactory: (customConfig: CustomConfig) => ({
    groupName: 'PostProcessorSocialGroup',
    streamName: getEventStreamName(Streams.SOCIAL_INTERACTIONS),
    batchSize: customConfig.postProcessor.batchSize,
    blockTimeout: customConfig.postProcessor.blockTimeout,
    idempotencyTtlSeconds: customConfig.postProcessor.idempotencyTtlSeconds,
    maxRetries: customConfig.postProcessor.maxRetries,
    retryDelayMs: customConfig.postProcessor.retryDelayMs,
  }),
  inject: [CustomConfig],
};
