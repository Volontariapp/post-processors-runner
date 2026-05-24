import { CustomConfig } from '../../config/custom-config.js';
import { POST_PROCESSORS_JOB_OUTBOX_FAILURE_OPTIONS } from './constants.js';
import { Streams } from '@volontariapp/shared';

export const postProcessorsJobOutboxFailureOptionsProvider = {
  provide: POST_PROCESSORS_JOB_OUTBOX_FAILURE_OPTIONS,
  useFactory: (customConfig: CustomConfig) => ({
    groupName: customConfig.postProcessor.groupName,
    streamName: Streams.EVENT_JOB_OUTBOX_FAILURE,
    batchSize: customConfig.postProcessor.batchSize,
    blockTimeout: customConfig.postProcessor.blockTimeout,
    idempotencyTtlSeconds: customConfig.postProcessor.idempotencyTtlSeconds,
    maxRetries: customConfig.postProcessor.maxRetries,
    retryDelayMs: customConfig.postProcessor.retryDelayMs,
  }),
  inject: [CustomConfig],
};
