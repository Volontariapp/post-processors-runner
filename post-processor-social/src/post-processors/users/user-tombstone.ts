import type { Redis } from 'ioredis';

/** Longer than any realistic gap between a user.created and the user.deleted that follows it. */
export const USER_TOMBSTONE_TTL_SECONDS = 7 * 24 * 60 * 60;

const tombstoneKey = (userId: string): string =>
  `post-processor-social:user-tombstone:${userId}`;

/**
 * Marks a user as deleted for post-processor-social. user.created and user.deleted are read from
 * social:user by two consumer groups that run in parallel, so a deletion can be applied before the
 * creation of the same user (gap G3). The deletion sets the marker BEFORE purging; the creation
 * checks it AFTER creating the node and purges again if it is set. Whatever the interleaving, the
 * node does not survive the deletion.
 */
export async function markUserDeleted(
  redis: Redis,
  userId: string,
): Promise<void> {
  await redis.set(tombstoneKey(userId), '1', 'EX', USER_TOMBSTONE_TTL_SECONDS);
}

export async function isUserDeleted(
  redis: Redis,
  userId: string,
): Promise<boolean> {
  return (await redis.exists(tombstoneKey(userId))) > 0;
}
