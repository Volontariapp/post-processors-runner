import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { EventMessagingType } from '@volontariapp/messaging';
import type {
  BasePostProcessor,
  PostProcessorOptions,
} from '@volontariapp/post-processors';

/**
 * Single place where the post-processors are built and started. The host process owns the
 * shutdown (NestJS `enableShutdownHooks`), so every instance is built with
 * `handleSignals: false` and awaited here when the module is destroyed, before the global
 * Redis and Postgres modules (destroyed last by NestJS) close their connections.
 */
@Injectable()
export class PostProcessorRegistry implements OnModuleDestroy {
  private readonly processors: BasePostProcessor<EventMessagingType>[] = [];

  launch<TProcessor extends BasePostProcessor<EventMessagingType>>(
    options: PostProcessorOptions,
    build: (options: PostProcessorOptions) => TProcessor,
  ): TProcessor {
    const processor = build({ ...options, handleSignals: false });
    this.processors.push(processor);
    void processor.start();
    return processor;
  }

  count(): number {
    return this.processors.length;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(this.processors.map((processor) => processor.stop()));
  }
}
