import { PostgresProvider } from '@volontariapp/bridge';
import type { PostgresConfig, IPostgresConfig } from '@volontariapp/config';
import type { Logger } from '@volontariapp/logger';
import { PostgresBridgeHealthProvider } from '@volontariapp/health-check';
import { instanceToPlain } from 'class-transformer';
import { JobsOutboxModel } from '@volontariapp/database';

export async function initDatabase(
  config: PostgresConfig,
  logger: Logger,
): Promise<PostgresProvider> {
  const dbProvider = new PostgresProvider({
    ...(instanceToPlain(config) as IPostgresConfig),
    entities: [JobsOutboxModel],
    synchronize: false,
  });

  try {
    await dbProvider.connect();
    const healthProvider = new PostgresBridgeHealthProvider(dbProvider);
    const health = await healthProvider.health();
    if (health.status !== 'up') {
      throw new Error(`Database health check failed: ${health.message}`);
    }
    logger.info('Database connection verified and ready via health-check');
    return dbProvider;
  } catch (err: unknown) {
    logger.error('Failed to initialize database connection', { err });
    throw err;
  }
}
