import type { JobsOutboxEntity } from '@volontariapp/database';

export type PersistedJob = Pick<
  JobsOutboxEntity,
  | 'id'
  | 'status'
  | 'attempts'
  | 'type'
  | 'emitter'
  | 'emitterId'
  | 'target'
  | 'scheduledAt'
>;
