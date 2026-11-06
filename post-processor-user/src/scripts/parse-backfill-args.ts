import { DEFAULT_BACKFILL_BATCH_SIZE } from '../core/services/badge-counter-backfill.service.js';
import type { BackfillOptions } from '../core/services/badge-counter-backfill.service.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const BACKFILL_USAGE =
  'Usage: node dist/scripts/backfill-badge-counters.js [--dry-run] [--user=<uuid>] [--batch-size=<n>]';

/** Lève une erreur sur toute option inconnue ou invalide : un backfill ne doit jamais partir de travers. */
export function parseBackfillArgs(argv: readonly string[]): BackfillOptions {
  let dryRun = false;
  let userId: string | undefined;
  let batchSize = DEFAULT_BACKFILL_BATCH_SIZE;

  for (const arg of argv) {
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg.startsWith('--user=')) {
      userId = arg.slice('--user='.length);
      if (!UUID_PATTERN.test(userId)) {
        throw new Error(`Invalid --user value "${userId}": expected a UUID`);
      }
    } else if (arg.startsWith('--batch-size=')) {
      batchSize = Number(arg.slice('--batch-size='.length));
      if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) {
        throw new Error(
          'Invalid --batch-size: expected an integer from 1 to 1000',
        );
      }
    } else {
      throw new Error(`Unknown option "${arg}". ${BACKFILL_USAGE}`);
    }
  }

  return { dryRun, ...(userId !== undefined ? { userId } : {}), batchSize };
}
