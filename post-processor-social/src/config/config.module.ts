import { Module, Global } from '@nestjs/common';
import { configureLogger, loadConfig } from '@volontariapp/config';
import { Logger } from '@volontariapp/logger';
import { CustomConfig } from './custom-config.js';
import { resolveConfigDirectory } from './resolve-config-directory.js';

const configDir = resolveConfigDirectory();
export const config = loadConfig(configDir, CustomConfig);
configureLogger(config.logger);
export const logger = new Logger({
  context: 'POST-PROCESSOR-SOCIAL',
  format: config.logger.format,
});

@Global()
@Module({
  providers: [
    {
      provide: CustomConfig,
      useValue: config,
    },
    {
      provide: Logger,
      useValue: logger,
    },
  ],
  exports: [CustomConfig, Logger],
})
export class ConfigModule {}
