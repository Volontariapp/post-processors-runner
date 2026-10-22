import { getEventStreamName } from '@volontariapp/messaging';
import { CustomConfig } from '../../config/custom-config.js';
import { POST_PROCESSORS_STORAGE_ATTACHMENT_REJECTED_OPTIONS } from './constants.js';
import { Streams } from '@volontariapp/shared';

export const postProcessorsStorageAttachmentRejectedOptionsProvider = {
  provide: POST_PROCESSORS_STORAGE_ATTACHMENT_REJECTED_OPTIONS,
  useFactory: (customConfig: CustomConfig) => ({
    groupName: 'PostStorageMediaPostProcessors',
    streamName: getEventStreamName(Streams.STORAGE_ATTACHMENT_REJECTED),
    batchSize: customConfig.postProcessor.batchSize,
    blockTimeout: customConfig.postProcessor.blockTimeout,
    idempotencyTtlSeconds: customConfig.postProcessor.idempotencyTtlSeconds,
    maxRetries: customConfig.postProcessor.maxRetries,
    retryDelayMs: customConfig.postProcessor.retryDelayMs,
  }),
  inject: [CustomConfig],
};
