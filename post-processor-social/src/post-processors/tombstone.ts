import type { Redis } from 'ioredis';

/** Longer than any realistic gap between a creation and the deletion that follows it. */
export const TOMBSTONE_TTL_SECONDS = 7 * 24 * 60 * 60;

export type TombstoneKind = 'user' | 'post' | 'event';

export const tombstoneKey = (kind: TombstoneKind, id: string): string =>
  `post-processor-social:${kind}-tombstone:${id}`;

/**
 * Deletion markers of post-processor-social (gaps G3 and G4). The creation and the deletion of a
 * node are read by two consumer groups that run in parallel (users: one stream, posts and events:
 * two streams), so a deletion can be applied before the creation of the same node. The deletion
 * sets the marker BEFORE removing the node; the creation checks it AFTER creating the node and
 * removes it again if it is set. Whatever the interleaving, the node does not survive the deletion.
 */
export async function markDeleted(
  redis: Redis,
  kind: TombstoneKind,
  ids: readonly string[],
): Promise<void> {
  await Promise.all(
    ids.map((id) =>
      redis.set(tombstoneKey(kind, id), '1', 'EX', TOMBSTONE_TTL_SECONDS),
    ),
  );
}

/** The ids among `ids` that carry a deletion marker. */
export async function findDeleted(
  redis: Redis,
  kind: TombstoneKind,
  ids: readonly string[],
): Promise<Set<string>> {
  const marked = await Promise.all(
    ids.map(async (id) => (await redis.exists(tombstoneKey(kind, id))) > 0),
  );
  return new Set(ids.filter((_, index) => marked[index]));
}
