import { getEventStreamName } from '@volontariapp/messaging';
import { CustomConfig } from '../../config/custom-config.js';
import { POST_PROCESSORS_EVENT_CREATED_OPTIONS } from './constants.js';
import { Streams } from '@volontariapp/shared';

export const postProcessorsEventCreatedOptionsProvider = {
  provide: POST_PROCESSORS_EVENT_CREATED_OPTIONS,
  useFactory: (customConfig: CustomConfig) => ({
    groupName: customConfig.postProcessor.groupName,
    streamName: getEventStreamName(Streams.EVENT_CREATED),
    batchSize: customConfig.postProcessor.batchSize,
    blockTimeout: customConfig.postProcessor.blockTimeout,
    idempotencyTtlSeconds: customConfig.postProcessor.idempotencyTtlSeconds,
    maxRetries: customConfig.postProcessor.maxRetries,
    retryDelayMs: customConfig.postProcessor.retryDelayMs,
  }),
  inject: [CustomConfig],
};
