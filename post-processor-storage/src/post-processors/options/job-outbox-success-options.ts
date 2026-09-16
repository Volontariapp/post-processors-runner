import { CustomConfig } from '../../config/custom-config.js';
import { JOB_OUTBOX_SUCCESS_POST_PROCESSOR_OPTIONS } from './constants.js';

export const postProcessorsJobOutboxSuccessOptionsProvider = {
  provide: JOB_OUTBOX_SUCCESS_POST_PROCESSOR_OPTIONS,
  useFactory: (customConfig: CustomConfig) => ({
    groupName: customConfig.postProcessor.groupName,
    streamName: 'storage:job:outbox:success',
    batchSize: customConfig.postProcessor.batchSize,
    blockTimeout: customConfig.postProcessor.blockTimeout,
    idempotencyTtlSeconds: customConfig.postProcessor.idempotencyTtlSeconds,
    maxRetries: customConfig.postProcessor.maxRetries,
    retryDelayMs: customConfig.postProcessor.retryDelayMs,
  }),
  inject: [CustomConfig],
};
