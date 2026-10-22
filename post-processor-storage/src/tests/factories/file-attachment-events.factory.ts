import { randomUUID } from 'crypto';
import {
  PostEventMessagingType,
  EventEventMessagingType,
  UserEventMessagingType,
  type IPostCreatedPayload,
  type IEventCreatedPayload,
  type IEventCoverReplacedPayload,
  type IUserAvatarReplacedPayload,
  type StreamEvent,
} from '@volontariapp/messaging';
import type { BatchEventItem } from '@volontariapp/post-processors';
import { SOURCE_TRACEPARENT } from './trace.factory.js';

export class FileAttachmentEventsFactory {
  static buildPostCreatedBatchItem(
    overrides?: Partial<IPostCreatedPayload>,
    messageIdOverride?: string,
  ): BatchEventItem<PostEventMessagingType.POST_CREATED> {
    const payload: IPostCreatedPayload = {
      postId: randomUUID(),
      userId: randomUUID(),
      fileIds: [randomUUID(), randomUUID()],
      ...overrides,
    };

    const event: StreamEvent<IPostCreatedPayload> = {
      id: randomUUID(),
      version: 1,
      type: PostEventMessagingType.POST_CREATED,
      emitter: 'ms-post',
      emitterId: payload.postId,
      traceId: randomUUID(),
      correlationId: randomUUID(),
      traceparent: SOURCE_TRACEPARENT,
      createdAt: new Date().toISOString(),
      payload: {
        before: undefined,
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

  static buildEventCreatedBatchItem(
    overrides?: Partial<IEventCreatedPayload>,
    messageIdOverride?: string,
  ): BatchEventItem<EventEventMessagingType.EVENT_CREATED> {
    const payload: IEventCreatedPayload = {
      eventId: randomUUID(),
      userId: randomUUID(),
      localisationName: 'Paris',
      coverFileId: randomUUID(),
      ...overrides,
    };

    const event: StreamEvent<IEventCreatedPayload> = {
      id: randomUUID(),
      version: 1,
      type: EventEventMessagingType.EVENT_CREATED,
      emitter: 'ms-event',
      emitterId: payload.eventId,
      traceId: randomUUID(),
      correlationId: randomUUID(),
      traceparent: SOURCE_TRACEPARENT,
      createdAt: new Date().toISOString(),
      payload: {
        before: undefined,
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

  static buildEventCoverReplacedBatchItem(
    overrides?: Partial<IEventCoverReplacedPayload>,
    messageIdOverride?: string,
  ): BatchEventItem<EventEventMessagingType.EVENT_COVER_REPLACED> {
    const payload: IEventCoverReplacedPayload = {
      eventId: randomUUID(),
      userId: randomUUID(),
      newFileId: randomUUID(),
      oldFileId: randomUUID(),
      ...overrides,
    };

    const event: StreamEvent<IEventCoverReplacedPayload> = {
      id: randomUUID(),
      version: 1,
      type: EventEventMessagingType.EVENT_COVER_REPLACED,
      emitter: 'ms-event',
      emitterId: payload.eventId,
      traceId: randomUUID(),
      correlationId: randomUUID(),
      traceparent: SOURCE_TRACEPARENT,
      createdAt: new Date().toISOString(),
      payload: {
        before: undefined,
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

  static buildUserAvatarReplacedBatchItem(
    overrides?: Partial<IUserAvatarReplacedPayload>,
    messageIdOverride?: string,
  ): BatchEventItem<UserEventMessagingType.USER_AVATAR_REPLACED> {
    const payload: IUserAvatarReplacedPayload = {
      userId: randomUUID(),
      newFileId: randomUUID(),
      oldFileId: randomUUID(),
      ...overrides,
    };

    const event: StreamEvent<IUserAvatarReplacedPayload> = {
      id: randomUUID(),
      version: 1,
      type: UserEventMessagingType.USER_AVATAR_REPLACED,
      emitter: 'ms-user',
      emitterId: payload.userId,
      traceId: randomUUID(),
      correlationId: randomUUID(),
      traceparent: SOURCE_TRACEPARENT,
      createdAt: new Date().toISOString(),
      payload: {
        before: undefined,
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
