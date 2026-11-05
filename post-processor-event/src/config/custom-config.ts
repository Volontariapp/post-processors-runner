import {
  IsBoolean,
  IsDefined,
  IsNumber,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { BaseConfig, PostgresConfig, RedisConfig } from '@volontariapp/config';
import { booleanFlag } from './helpers/boolean-flag.helpers.js';

export class GeocodingConfig {
  /**
   * Geocodage de event.created (GEOCODING_ENABLED), active par defaut. Coupe dans la stack E2E :
   * en NODE_ENV=test le geocodeur renvoie des coordonnees fixes qui ecraseraient celles des events.
   */
  @IsDefined()
  @Transform(booleanFlag('enabled'))
  @IsBoolean()
  enabled!: boolean;
}

export class PostProcessorConfig {
  @IsDefined()
  @IsString()
  groupName!: string;

  @IsDefined()
  @IsString()
  streamName!: string;

  @IsDefined()
  @IsNumber()
  batchSize!: number;

  @IsDefined()
  @IsNumber()
  blockTimeout!: number;

  @IsDefined()
  @IsNumber()
  idempotencyTtlSeconds!: number;

  @IsDefined()
  @IsNumber()
  maxRetries!: number;

  @IsDefined()
  @IsNumber()
  retryDelayMs!: number;
}

export class CustomConfig extends BaseConfig {
  @IsDefined()
  @ValidateNested()
  @Type(() => PostgresConfig)
  db!: PostgresConfig;

  @IsDefined()
  @ValidateNested()
  @Type(() => RedisConfig)
  redis!: RedisConfig;

  @IsDefined()
  @ValidateNested()
  @Type(() => PostProcessorConfig)
  postProcessor!: PostProcessorConfig;

  @IsDefined()
  @ValidateNested()
  @Type(() => GeocodingConfig)
  geocoding!: GeocodingConfig;
}
