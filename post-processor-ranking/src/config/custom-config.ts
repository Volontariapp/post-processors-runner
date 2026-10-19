import {
  IsDefined,
  IsInt,
  IsNumber,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BaseConfig, PostgresConfig, RedisConfig } from '@volontariapp/config';

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

export class RankingConfig {
  /** Duree apres laquelle une demande sans resultat est reemise (RANKING_REQUEST_TTL_SECONDS). */
  @IsDefined()
  @IsInt()
  @Min(1)
  requestTtlSeconds!: number;

  /** Delai de planification des demandes de fond, pour laisser la coalescence agir. */
  @IsDefined()
  @IsInt()
  @Min(0)
  debounceSeconds!: number;
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
  @Type(() => RankingConfig)
  ranking!: RankingConfig;
}
