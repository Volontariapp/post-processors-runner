import { getEventStreamName } from '@volontariapp/messaging';
import { CustomConfig } from '../../config/custom-config.js';
import { POST_PROCESSORS_STORAGE_FILE_SCANNED_OPTIONS } from './constants.js';
import { Streams } from '@volontariapp/shared';

export const postProcessorsStorageFileScannedOptionsProvider = {
  provide: POST_PROCESSORS_STORAGE_FILE_SCANNED_OPTIONS,
  useFactory: (customConfig: CustomConfig) => ({
    groupName: 'EventStorageCoverPostProcessors',
    streamName: getEventStreamName(Streams.STORAGE_FILE_SCANNED),
    batchSize: customConfig.postProcessor.batchSize,
    blockTimeout: customConfig.postProcessor.blockTimeout,
    idempotencyTtlSeconds: customConfig.postProcessor.idempotencyTtlSeconds,
    maxRetries: customConfig.postProcessor.maxRetries,
    retryDelayMs: customConfig.postProcessor.retryDelayMs,
  }),
  inject: [CustomConfig],
};

