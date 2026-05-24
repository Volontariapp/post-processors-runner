import { Streams } from '@volontariapp/shared';
import { CustomConfig } from '../../config/custom-config.js';
import { POST_PROCESSORS_JOB_OUTBOX_FAILURE_OPTIONS } from './constants.js';
import { getEventStreamName } from '@volontariapp/messaging';

export const postProcessorsJobOutboxFailureOptionsProvider = {
  provide: POST_PROCESSORS_JOB_OUTBOX_FAILURE_OPTIONS,
  useFactory: (customConfig: CustomConfig) => ({
    groupName: customConfig.postProcessor.groupName,
    streamName: getEventStreamName(Streams.SOCIAL_JOB_OUTBOX_FAILURE),
    batchSize: customConfig.postProcessor.batchSize,
    blockTimeout: customConfig.postProcessor.blockTimeout,
    idempotencyTtlSeconds: customConfig.postProcessor.idempotencyTtlSeconds,
    maxRetries: customConfig.postProcessor.maxRetries,
    retryDelayMs: customConfig.postProcessor.retryDelayMs,
  }),
  inject: [CustomConfig],
};
