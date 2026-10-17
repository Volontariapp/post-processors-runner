import { EventEventMessagingType } from '@volontariapp/messaging';
import { EventType } from '@volontariapp/contracts-nest';
import type { BatchEventItem } from '@volontariapp/post-processors';
import { SOURCE_TRACEPARENT } from './trace.factory.js';

export function createEventFinishedBatchItem(
  options: {
    messageId?: string;
    eventId?: string;
    eventType?: EventType;
    awardedImpactScore?: number;
    correlationId?: string;
    traceId?: string;
  } = {},
): BatchEventItem<EventEventMessagingType.EVENT_FINISHED> {
  return {
    messageId: options.messageId ?? 'msg-1',
    event: {
      id: 'queue-event-1',
      type: EventEventMessagingType.EVENT_FINISHED,
      emitter: 'ms-event',
      emitterId: 'organizer-1',
      correlationId: options.correlationId ?? 'corr-finished-1',
      traceparent: SOURCE_TRACEPARENT,
      traceId: options.traceId,
      version: 1,
      createdAt: new Date().toISOString(),
      payload: {
        after: {
          eventId: options.eventId ?? 'event-123',
          eventType: options.eventType ?? EventType.EVENT_TYPE_ECOLOGY,
          awardedImpactScore: options.awardedImpactScore ?? 40,
        },
      },
    },
  };
}
