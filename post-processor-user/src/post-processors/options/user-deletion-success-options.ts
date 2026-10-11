import { Streams } from '@volontariapp/shared';
import { getEventStreamName } from '@volontariapp/messaging';
import { CustomConfig } from '../../config/custom-config.js';
import { USER_DELETION_SUCCESS_POST_PROCESSOR_OPTIONS } from './constants.js';

export const userDeletionSuccessOptionsProvider = {
  provide: USER_DELETION_SUCCESS_POST_PROCESSOR_OPTIONS,
  useFactory: (customConfig: CustomConfig) => ({
    groupName: customConfig.postProcessor.groupName,
    streamName: getEventStreamName(Streams.USER_DELETION_SUCCESS),
    batchSize: customConfig.postProcessor.batchSize,
    blockTimeout: customConfig.postProcessor.blockTimeout,
    idempotencyTtlSeconds: customConfig.postProcessor.idempotencyTtlSeconds,
    maxRetries: customConfig.postProcessor.maxRetries,
    retryDelayMs: customConfig.postProcessor.retryDelayMs,
  }),
  inject: [CustomConfig],
};
