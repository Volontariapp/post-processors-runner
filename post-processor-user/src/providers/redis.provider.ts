import { RedisProvider } from '@volontariapp/bridge';
import type { RedisConfig, IRedisConfig } from '@volontariapp/config';
import type { Logger } from '@volontariapp/logger';
import { instanceToPlain } from 'class-transformer';

export async function initRedis(config: RedisConfig, logger: Logger): Promise<RedisProvider> {
  const redisProvider = new RedisProvider(instanceToPlain(config) as IRedisConfig);

  try {
    await redisProvider.connect();
    logger.info('Redis connection verified and ready');
    return redisProvider;
  } catch (err: unknown) {
    logger.error('Failed to initialize Redis connection', { err });
    throw err;
  }
}
