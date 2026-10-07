import { SocialEventMessagingType } from '@volontariapp/messaging';
import type { BatchEventItem } from '@volontariapp/post-processors';

export function createEventSocialWishedBatchItem(
  options: {
    messageId?: string;
    userId?: string;
    eventId?: string;
    emitterId?: string;
    correlationId?: string;
    traceId?: string;
  } = {},
): BatchEventItem<SocialEventMessagingType.EVENT_SOCIAL_WISHED> {
  const wisherId = options.userId ?? 'user-wisher-1';
  return {
    messageId: options.messageId ?? 'msg-1',
    event: {
      id: 'event-wish-1',
      type: SocialEventMessagingType.EVENT_SOCIAL_WISHED,
      emitter: 'ms-social',
      emitterId: options.emitterId ?? wisherId,
      correlationId: options.correlationId ?? 'corr-wish-1',
      traceId: options.traceId,
      version: 1,
      createdAt: new Date().toISOString(),
      payload: {
        after: {
          eventId: options.eventId ?? 'event-123',
          ...(options.userId !== undefined
            ? { userId: options.userId }
            : { userId: wisherId }),
        },
      },
    },
  };
}
