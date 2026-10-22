import { CustomConfig } from '../../config/custom-config.js';
import { Streams } from '@volontariapp/shared';
import { POST_PROCESSOR_EVENT_COVER_REPLACED_OPTIONS } from './constants.js';
import { getEventStreamName } from '@volontariapp/messaging';

export const eventCoverReplacedOptionsProvider = {
  provide: POST_PROCESSOR_EVENT_COVER_REPLACED_OPTIONS,
  useFactory: (customConfig: CustomConfig) => ({
    groupName: 'StorageEventCoverReplacedPostProcessors',
    streamName: getEventStreamName(Streams.EVENT_COVER_REPLACED),
    batchSize: customConfig.postProcessor.batchSize,
    blockTimeout: customConfig.postProcessor.blockTimeout,
    idempotencyTtlSeconds: customConfig.postProcessor.idempotencyTtlSeconds,
    maxRetries: customConfig.postProcessor.maxRetries,
    retryDelayMs: customConfig.postProcessor.retryDelayMs,
  }),
  inject: [CustomConfig],
};
