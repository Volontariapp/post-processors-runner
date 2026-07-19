import { CustomConfig } from '../../../config/custom-config.js';
import { Streams } from '@volontariapp/shared';
import { POST_PROCESSOR_EVENT_DELETED_OPTIONS } from '../../options/constants.js';
import { getEventStreamName } from '@volontariapp/messaging';

export const eventDeletedOptionsProvider = {
  provide: POST_PROCESSOR_EVENT_DELETED_OPTIONS,
  useFactory: (customConfig: CustomConfig) => ({
    groupName: 'EventDeletedPostPostProcessors',
    streamName: getEventStreamName(Streams.EVENT_DELETED),
    batchSize: customConfig.postProcessor.batchSize,
    blockTimeout: customConfig.postProcessor.blockTimeout,
    idempotencyTtlSeconds: customConfig.postProcessor.idempotencyTtlSeconds,
    maxRetries: customConfig.postProcessor.maxRetries,
    retryDelayMs: customConfig.postProcessor.retryDelayMs,
  }),
  inject: [CustomConfig],
};
