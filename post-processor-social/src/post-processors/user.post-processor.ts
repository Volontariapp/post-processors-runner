import { Injectable, Inject } from '@nestjs/common';
import { SinglePostProcessor } from '@volontariapp/post-processors';
import { EventMessagingType, IJobAuditPayload, type StreamEvent } from '@volontariapp/messaging';
import { RedisProvider } from '@volontariapp/bridge';
import type { PostProcessorOptions } from '@volontariapp/post-processors';

@Injectable()
export class UserPostProcessor extends SinglePostProcessor<
  typeof EventMessagingType.JOB_OUTBOX_SUCCESS
> {
  constructor(
    @Inject(RedisProvider) redisProvider: RedisProvider,
    @Inject('POST_PROCESSOR_OPTIONS') options: PostProcessorOptions,
  ) {
    super(redisProvider.getDriver(), options);
  }

  /**
   * Whitelist: only process EVENT_CHANGED messages, skip all others.
   */
  protected override shouldProcess(
    eventType: typeof EventMessagingType.JOB_OUTBOX_SUCCESS,
  ): boolean {
    return eventType === EventMessagingType.JOB_OUTBOX_SUCCESS;
  }

  /**
   * Process a single EVENT_CHANGED event for the user/event entity.
   *
   * The payload is typed as IEventPayload (the inner data of EventChangedPayload<IEventPayload>),
   * so `event.payload` gives you { before: IEventPayload | null, after: IEventPayload | null }.
   */
  protected async processEvent(
    event: StreamEvent<IJobAuditPayload>,
    messageId: string,
  ): Promise<void> {
    const { type, payload } = event;

    this.logger.info('Processing JOB_OUTBOX_SUCCESS', {
      type,
      messageId,
      eventId: event.id,
    });

    await this.handleEventChanged(payload.after, messageId);

    this.logger.info('JOB_OUTBOX_SUCCESS processed successfully', {
      type,
      messageId,
    });
  }

  /**
   * Domain logic for EVENT_CHANGED.
   * `payload` is the IEventPayload entity snapshot (the already-extracted inner payload).
   */
  private async handleEventChanged(payload: IJobAuditPayload, messageId: string): Promise<void> {
    this.logger.debug('Handling JOB_OUTBOX_SUCCESS entity data', {
      messageId,
      status: payload.status,
    });

    // TODO: add your business logic here
    // Examples:
    //   - sync the updated event into a read model / projection
    //   - invalidate a cache entry
    //   - trigger a downstream notification
    await Promise.resolve();
  }
}
