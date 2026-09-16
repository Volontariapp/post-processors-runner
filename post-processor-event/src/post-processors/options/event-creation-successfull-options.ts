import { getEventStreamName } from '@volontariapp/messaging';
import { CustomConfig } from '../../config/custom-config.js';
import { POST_PROCESSORS_EVENT_CREATION_SUCCESSFULL_OPTIONS } from './constants.js';
import { Streams } from '@volontariapp/shared';

export const postProcessorsEventCreationSuccessfullOptionsProvider = {
  provide: POST_PROCESSORS_EVENT_CREATION_SUCCESSFULL_OPTIONS,
  useFactory: (customConfig: CustomConfig) => ({
    groupName: customConfig.postProcessor.groupName,
    streamName: getEventStreamName(Streams.EVENT_SUCCESSFULLY_CREATED),
    batchSize: customConfig.postProcessor.batchSize,
    blockTimeout: customConfig.postProcessor.blockTimeout,
    idempotencyTtlSeconds: customConfig.postProcessor.idempotencyTtlSeconds,
    maxRetries: customConfig.postProcessor.maxRetries,
    retryDelayMs: customConfig.postProcessor.retryDelayMs,
  }),
  inject: [CustomConfig],
};
