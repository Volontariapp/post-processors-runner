import {
  EventEventMessagingType,
  PostEventMessagingType,
  type IEventCreatedPayload,
  type IPostCreatedPayload,
  type IPostDeletedPayload,
  type StreamEvent,
} from '@volontariapp/messaging';
import type { BatchEventItem } from '@volontariapp/post-processors';
import { randomUUID } from 'crypto';
import { SOURCE_TRACEPARENT } from './trace.factory.js';

function streamEvent<TPayload>(
  type: string,
  emitter: string,
  emitterId: string,
  payload: TPayload,
): StreamEvent<TPayload> {
  return {
    id: randomUUID(),
    version: 1,
    type,
    emitter,
    emitterId,
    traceId: randomUUID(),
    correlationId: randomUUID(),
    traceparent: SOURCE_TRACEPARENT,
    createdAt: new Date().toISOString(),
    payload: { before: undefined, after: payload },
  };
}

const messageId = (): string =>
  `1700000000000-${String(Math.floor(Math.random() * 1000))}`;

export class CreationEventsFactory {
  static eventCreated(
    overrides?: Partial<IEventCreatedPayload>,
  ): BatchEventItem<EventEventMessagingType.EVENT_CREATED> {
    const payload: IEventCreatedPayload = {
      eventId: randomUUID(),
      userId: randomUUID(),
      localisationName: 'Paris',
      ...overrides,
    };
    return {
      messageId: messageId(),
      event: streamEvent(
        EventEventMessagingType.EVENT_CREATED,
        'ms-event',
        payload.userId,
        payload,
      ),
    };
  }

  static postCreated(
    overrides?: Partial<IPostCreatedPayload>,
  ): BatchEventItem<PostEventMessagingType.POST_CREATED> {
    const payload: IPostCreatedPayload = {
      postId: randomUUID(),
      userId: randomUUID(),
      fileIds: [],
      ...overrides,
    };
    return {
      messageId: messageId(),
      event: streamEvent(
        PostEventMessagingType.POST_CREATED,
        'ms-post',
        payload.userId,
        payload,
      ),
    };
  }

  static postDeleted(
    overrides?: Partial<IPostDeletedPayload>,
  ): BatchEventItem<PostEventMessagingType.POST_DELETED> {
    const payload: IPostDeletedPayload = { postId: randomUUID(), ...overrides };
    return {
      messageId: messageId(),
      event: streamEvent(
        PostEventMessagingType.POST_DELETED,
        'ms-post',
        randomUUID(),
        payload,
      ),
    };
  }
}
