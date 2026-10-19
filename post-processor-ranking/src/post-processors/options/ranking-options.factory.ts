import type { Streams } from '@volontariapp/shared';
import { getEventStreamName } from '@volontariapp/messaging';
import { CustomConfig } from '../../config/custom-config.js';

/** Un groupe de consommateurs propre a ranking par flux, jamais partage avec un autre service. */
export const rankingOptionsProvider = (
  token: string,
  groupName: string,
  stream: Streams,
) => ({
  provide: token,
  useFactory: (customConfig: CustomConfig) => ({
    groupName,
    streamName: getEventStreamName(stream),
    batchSize: customConfig.postProcessor.batchSize,
    blockTimeout: customConfig.postProcessor.blockTimeout,
    idempotencyTtlSeconds: customConfig.postProcessor.idempotencyTtlSeconds,
    maxRetries: customConfig.postProcessor.maxRetries,
    retryDelayMs: customConfig.postProcessor.retryDelayMs,
  }),
  inject: [CustomConfig],
});
