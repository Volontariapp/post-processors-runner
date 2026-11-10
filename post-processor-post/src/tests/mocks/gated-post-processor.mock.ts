import { BasePostProcessor } from '@volontariapp/post-processors';
import type { PostProcessorOptions } from '@volontariapp/post-processors';
import type { EventMessagingType } from '@volontariapp/messaging';
import type { Redis } from 'ioredis';

/** Lets a test hold a batch in the middle of its processing, then release it. */
export class BatchGate {
  private releaseBatch: (() => void) | null = null;
  private readonly opened = new Promise<void>((resolve) => {
    this.releaseBatch = resolve;
  });

  wait(): Promise<void> {
    return this.opened;
  }

  release(): void {
    this.releaseBatch?.();
  }
}

/**
 * Post-processor whose batch blocks on a gate before being acknowledged, and records each
 * step in a shared journal so a test can check the shutdown order.
 */
export class GatedPostProcessorMock extends BasePostProcessor<EventMessagingType> {
  constructor(
    redis: Redis,
    options: PostProcessorOptions,
    private readonly gate: BatchGate,
    private readonly journal: string[],
  ) {
    super(redis, options);
  }

  protected async processEntries(entries: { id: string }[]): Promise<void> {
    this.journal.push('batch-started');
    await this.gate.wait();
    await this.acknowledgeMany(entries.map((entry) => entry.id));
  }
}
