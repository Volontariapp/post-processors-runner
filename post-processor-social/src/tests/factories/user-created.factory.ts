import {
  UserEventMessagingType,
  type IUserCreatedPayload,
  type StreamEvent,
} from '@volontariapp/messaging';
import type { BatchEventItem } from '@volontariapp/post-processors';
import { UserRoles } from '@volontariapp/shared';
import { randomUUID } from 'crypto';
import { SOURCE_TRACEPARENT } from './trace.factory.js';

export class UserCreatedFactory {
  static buildUserCreatedPayload(
    overrides?: Partial<IUserCreatedPayload>,
  ): IUserCreatedPayload {
    return {
      id: randomUUID(),
      role: UserRoles.VOLUNTEER,
      ...overrides,
    };
  }

  static buildBatchEventItem(
    overrides?: Partial<IUserCreatedPayload>,
  ): BatchEventItem<UserEventMessagingType.USER_CREATED> {
    const payload = this.buildUserCreatedPayload(overrides);
    const event: StreamEvent<IUserCreatedPayload> = {
      id: randomUUID(),
      version: 1,
      type: UserEventMessagingType.USER_CREATED,
      emitter: 'ms-user',
      emitterId: payload.id,
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
      messageId: `1700000000000-${String(Math.floor(Math.random() * 1000))}`,
      event,
    };
  }
}
