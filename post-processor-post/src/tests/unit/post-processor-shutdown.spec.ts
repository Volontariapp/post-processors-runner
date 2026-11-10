import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Global, Module, type INestApplicationContext } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants.js';
import { NestFactory } from '@nestjs/core';
import { NestRedisProvider } from '@volontariapp/bridge-nest';
import type { PostProcessorOptions } from '@volontariapp/post-processors';
import { PostProcessorRegistry } from '../../post-processors/post-processor-registry.service.js';
import { PostProcessorsModule } from '../../post-processors/post-processors.module.js';
import {
  BatchGate,
  GatedPostProcessorMock,
} from '../mocks/gated-post-processor.mock.js';
import { RecordingRedisProviderMock } from '../mocks/recording-redis-provider.mock.js';

const PROBE_OPTIONS: PostProcessorOptions = {
  streamName: 'stream:shutdown-probe',
  groupName: 'post-processor',
  consumerName: 'shutdown-probe',
  blockMs: 10,
  claimIntervalMs: 60000,
  idempotencyTtlSeconds: 0,
};

const waitUntil = async (condition: () => boolean): Promise<void> => {
  for (let attempt = 0; attempt < 200 && !condition(); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  expect(condition()).toBe(true);
};

/**
 * Same layout as the application: Redis comes from a global module (RedisBridgeModule) and
 * the registry lives in the post-processors module.
 */
const createProbe = async (
  journal: string[],
  gate: BatchGate,
): Promise<INestApplicationContext> => {
  const redis = new RecordingRedisProviderMock(journal);

  @Global()
  @Module({
    providers: [{ provide: NestRedisProvider, useValue: redis }],
    exports: [NestRedisProvider],
  })
  class GlobalRedisProbeModule {}

  @Module({
    providers: [
      PostProcessorRegistry,
      {
        provide: GatedPostProcessorMock,
        useFactory: async (
          redisProvider: RecordingRedisProviderMock,
          registry: PostProcessorRegistry,
        ) => {
          await redisProvider.connect();
          return registry.launch(
            PROBE_OPTIONS,
            (options) =>
              new GatedPostProcessorMock(
                redisProvider.getDriver(),
                options,
                gate,
                journal,
              ),
          );
        },
        inject: [NestRedisProvider, PostProcessorRegistry],
      },
    ],
  })
  class PostProcessorsProbeModule {}

  @Module({ imports: [GlobalRedisProbeModule, PostProcessorsProbeModule] })
  class AppProbeModule {}

  return NestFactory.createApplicationContext(AppProbeModule, {
    logger: false,
  });
};

describe('Post-processors shutdown', () => {
  let app: INestApplicationContext | null = null;

  afterEach(async () => {
    await app?.close();
    app = null;
    jest.restoreAllMocks();
  });

  it('acknowledges the batch in flight before Redis disconnects', async () => {
    const journal: string[] = [];
    const gate = new BatchGate();
    app = await createProbe(journal, gate);
    await waitUntil(() => journal.includes('batch-started'));

    const closing = app.close();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(journal).not.toContain('redis-disconnect');

    gate.release();
    await closing;
    app = null;

    expect(journal).toEqual(['batch-started', 'XACK', 'redis-disconnect']);
  });

  it('builds the post-processors without per-instance signal listeners', async () => {
    const sigtermBefore = process.listenerCount('SIGTERM');
    const sigintBefore = process.listenerCount('SIGINT');
    const journal: string[] = [];
    const gate = new BatchGate();
    gate.release();

    app = await createProbe(journal, gate);
    await waitUntil(() => journal.includes('batch-started'));

    expect(app.get(PostProcessorRegistry).count()).toBe(1);
    expect(process.listenerCount('SIGTERM')).toBe(sigtermBefore);
    expect(process.listenerCount('SIGINT')).toBe(sigintBefore);
  });

  it('provides the registry in PostProcessorsModule', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      PostProcessorsModule,
    ) as unknown[];

    expect(providers).toContain(PostProcessorRegistry);
  });
});
