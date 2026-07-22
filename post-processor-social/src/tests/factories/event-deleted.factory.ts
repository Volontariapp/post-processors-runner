import {
  EventEventMessagingType,
  type IEventDeletedPayload,
  type StreamEvent,
} from '@volontariapp/messaging';
import type { BatchEventItem } from '@volontariapp/post-processors';
import { randomUUID } from 'crypto';

export class EventDeletedFactory {
  static buildEventDeletedPayload(
    overrides?: Partial<IEventDeletedPayload>,
  ): IEventDeletedPayload {
    return {
      eventId: randomUUID(),
      userId: randomUUID(),
      ...overrides,
    };
  }

  static buildBatchEventItem(
    overrides?: Partial<IEventDeletedPayload>,
    messageIdOverride?: string,
  ): BatchEventItem<EventEventMessagingType.EVENT_DELETED> {
    const payload = this.buildEventDeletedPayload(overrides);
    const event: StreamEvent<IEventDeletedPayload> = {
      id: randomUUID(),
      version: 1,
      type: EventEventMessagingType.EVENT_DELETED,
      emitter: 'ms-event',
      emitterId: randomUUID(),
      traceId: randomUUID(),
      correlationId: randomUUID(),
      createdAt: new Date().toISOString(),
      payload: {
        before: payload,
        after: payload,
      },
    };

    return {
      messageId:
        messageIdOverride ??
        `1700000000000-${String(Math.floor(Math.random() * 1000))}`,
      event,
    };
  }

  static buildInvalidBatchEventItem(
    messageIdOverride?: string,
  ): BatchEventItem<EventEventMessagingType.EVENT_DELETED> {
    const payload: IEventDeletedPayload = {
      eventId: '',
    };

    const event: StreamEvent<IEventDeletedPayload> = {
      id: randomUUID(),
      version: 1,
      type: EventEventMessagingType.EVENT_DELETED,
      emitter: 'ms-event',
      emitterId: randomUUID(),
      traceId: randomUUID(),
      correlationId: randomUUID(),
      createdAt: new Date().toISOString(),
      payload: {
        before: payload,
        after: payload,
      },
    };

    return {
      messageId:
        messageIdOverride ??
        `1700000000000-${String(Math.floor(Math.random() * 1000))}`,
      event,
    };
  }
}
