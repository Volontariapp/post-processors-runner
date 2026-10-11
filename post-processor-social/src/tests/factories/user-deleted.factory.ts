import {
  UserEventMessagingType,
  type IUserDeleledPayload,
  type StreamEvent,
} from '@volontariapp/messaging';
import type { BatchEventItem } from '@volontariapp/post-processors';
import { UserRoles } from '@volontariapp/shared';
import { randomUUID } from 'crypto';

export class UserDeletedFactory {
  static buildUserDeletedPayload(
    overrides?: Partial<IUserDeleledPayload>,
  ): IUserDeleledPayload {
    return {
      id: randomUUID(),
      role: UserRoles.VOLUNTEER,
      ...overrides,
    };
  }

  static buildBatchEventItem(
    overrides?: Partial<IUserDeleledPayload>,
    messageIdOverride?: string,
  ): BatchEventItem<UserEventMessagingType.USER_DELETED> {
    const payload = this.buildUserDeletedPayload(overrides);
    const event: StreamEvent<IUserDeleledPayload> = {
      id: randomUUID(),
      version: 1,
      type: UserEventMessagingType.USER_DELETED,
      emitter: 'ms-user',
      emitterId: payload.id,
      traceId: randomUUID(),
      correlationId: randomUUID(),
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
