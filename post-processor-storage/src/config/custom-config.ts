import { IsDefined, IsNumber, IsString, ValidateNested } from 'class-validator';
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
}
