import { Streams } from '@volontariapp/shared';
import { CustomConfig } from '../../config/custom-config.js';
import { POST_PROCESSORS_JOB_OUTBOX_SUCCESS_OPTIONS } from './constants.js';

export const postProcessorsJobOutboxSuccessOptionsProvider = {
  provide: POST_PROCESSORS_JOB_OUTBOX_SUCCESS_OPTIONS,
  useFactory: (customConfig: CustomConfig) => ({
    groupName: customConfig.postProcessor.groupName,
    streamName: Streams.EVENT_JOB_OUTBOX_SUCCESS,
    batchSize: customConfig.postProcessor.batchSize,
    blockTimeout: customConfig.postProcessor.blockTimeout,
    idempotencyTtlSeconds: customConfig.postProcessor.idempotencyTtlSeconds,
    maxRetries: customConfig.postProcessor.maxRetries,
    retryDelayMs: customConfig.postProcessor.retryDelayMs,
  }),
  inject: [CustomConfig],
};
