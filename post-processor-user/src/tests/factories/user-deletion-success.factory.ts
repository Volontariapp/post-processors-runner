import {
  UserEventMessagingType,
  type IUserDeletionSuccessfullPayload,
  type StreamEvent,
} from '@volontariapp/messaging';
import type { BatchEventItem } from '@volontariapp/post-processors';
import { randomUUID } from 'crypto';

export class UserDeletionSuccessFactory {
  static buildPayload(
    overrides?: Partial<IUserDeletionSuccessfullPayload>,
  ): IUserDeletionSuccessfullPayload {
    return {
      userId: randomUUID(),
      ...overrides,
    };
  }

  static buildBatchEventItem(
    overrides?: Partial<IUserDeletionSuccessfullPayload>,
    messageIdOverride?: string,
  ): BatchEventItem<UserEventMessagingType.USER_DELETION_SUCCESSFULL> {
    const payload = this.buildPayload(overrides);
    const event: StreamEvent<IUserDeletionSuccessfullPayload> = {
      id: randomUUID(),
      version: 1,
      type: UserEventMessagingType.USER_DELETION_SUCCESSFULL,
      emitter: 'ws-service',
      emitterId: payload.userId ?? randomUUID(),
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
