import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { loadConfig } from '@volontariapp/config';
import { AppModule, logger } from './app.module.js';
import { CustomConfig } from './config/custom-config.js';
import { resolveConfigDirectory } from './config/resolve-config-directory.js';

async function bootstrap() {
  logger.info('Bootstrapping NestJS standalone application context...');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger,
  });

  logger.info('NestJS Application Context successfully initialized and running.');

  const configDir = resolveConfigDirectory();
  const config = loadConfig(configDir, CustomConfig);
  logger.info('Post-processor-user is now listening to user events', {
    streamName: config.postProcessor.streamName,
    groupName: config.postProcessor.groupName,
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, closing NestJS context...`);
    await app.close();
    logger.info('Shutdown complete.');
    process.exit(0);
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
}

void bootstrap().catch((err: unknown) => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
