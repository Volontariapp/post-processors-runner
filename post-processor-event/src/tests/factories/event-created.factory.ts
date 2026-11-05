import {
  EventEventMessagingType,
  type IEventCreatedPayload,
  type StreamEvent,
} from '@volontariapp/messaging';
import type { BatchEventItem } from '@volontariapp/post-processors';
import { randomUUID } from 'crypto';
import { SOURCE_TRACEPARENT } from './trace.factory.js';

export class EventCreatedFactory {
  static buildPayload(
    overrides?: Partial<IEventCreatedPayload>,
  ): IEventCreatedPayload {
    return {
      eventId: randomUUID(),
      userId: randomUUID(),
      localisationName: 'Lyon, France',
      ...overrides,
    };
  }

  static buildBatchEventItem(
    overrides?: Partial<IEventCreatedPayload>,
  ): BatchEventItem<EventEventMessagingType.EVENT_CREATED> {
    const payload = this.buildPayload(overrides);
    const event: StreamEvent<IEventCreatedPayload> = {
      id: randomUUID(),
      version: 1,
      type: EventEventMessagingType.EVENT_CREATED,
      emitter: 'ms-event',
      emitterId: payload.userId,
      traceId: randomUUID(),
      correlationId: randomUUID(),
      traceparent: SOURCE_TRACEPARENT,
      createdAt: new Date().toISOString(),
      payload: { before: undefined, after: payload },
    };
    return {
      messageId: `1700000000000-${String(Math.floor(Math.random() * 1000))}`,
      event,
    };
  }
}
