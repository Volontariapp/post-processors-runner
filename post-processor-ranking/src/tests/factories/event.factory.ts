import { randomUUID } from 'crypto';
import type { StreamEvent } from '@volontariapp/messaging';
import type { BatchEventItem } from '@volontariapp/post-processors';
import { SOURCE_TRACEPARENT } from './trace.factory.js';

export const buildBatchItem = <TType extends string, TPayload>(
  type: TType,
  after: TPayload,
  overrides: Partial<StreamEvent<TPayload>> = {},
): BatchEventItem<never> => {
  const event: StreamEvent<TPayload> = {
    id: randomUUID(),
    version: 1,
    type,
    emitter: 'test-emitter',
    emitterId: randomUUID(),
    traceId: randomUUID(),
    correlationId: randomUUID(),
    traceparent: SOURCE_TRACEPARENT,
    createdAt: '2026-10-19T10:00:00.000Z',
    payload: { before: undefined, after },
    ...overrides,
  };
  return {
    messageId: `1700000000000-${String(Math.floor(Math.random() * 1000))}`,
    event,
  } as BatchEventItem<never>;
};
