import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { loadConfig } from '@volontariapp/config';
import { CustomConfig } from '../config/custom-config.js';
import { resolveConfigDirectory } from '../config/resolve-config-directory.js';
import { BadgeCounterBackfill } from '../core/services/badge-counter-backfill.service.js';
import { BackfillModule } from './backfill.module.js';
import { parseBackfillArgs } from './parse-backfill-args.js';

/**
 * Rattrapage ponctuel des compteurs de likes et de souhaits (voir BadgeCounterBackfill).
 * Lancé dans un pod existant : `kubectl exec deploy/post-processor-user -- node dist/scripts/backfill-badge-counters.js --dry-run`
 */
async function main(): Promise<number> {
  const options = parseBackfillArgs(process.argv.slice(2));
  const config = loadConfig(resolveConfigDirectory(), CustomConfig);

  const app = await NestFactory.createApplicationContext(
    BackfillModule.register(config),
  );
  try {
    const backfill = app.get(BadgeCounterBackfill);
    const summary = await backfill.run(options);
    return summary.failedUsers.length > 0 ? 1 : 0;
  } finally {
    await app.close();
  }
}

main()
  .then((code) => {
    process.exit(code);
  })
  .catch((err: unknown) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  });
