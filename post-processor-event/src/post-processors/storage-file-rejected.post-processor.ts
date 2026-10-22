import { Injectable } from '@nestjs/common';
import { StorageEventMessagingType } from '@volontariapp/messaging';
import { CoverStatus } from '@volontariapp/contracts';
import type { PostProcessorOptions } from '@volontariapp/post-processors';
import type { PostgresEventRepository } from '@volontariapp/domain-event';
import type { DataSource } from 'typeorm';
import type { Redis } from 'ioredis';
import { BaseStorageCoverPostProcessor } from './base-storage-cover.post-processor.js';

@Injectable()
export class StorageFileRejectedPostProcessor extends BaseStorageCoverPostProcessor<StorageEventMessagingType.FILE_REJECTED> {
  constructor(
    db: DataSource,
    redisDriver: Redis,
    options: PostProcessorOptions,
    eventRepository?: PostgresEventRepository,
  ) {
    super(
      db,
      redisDriver,
      options,
      StorageEventMessagingType.FILE_REJECTED,
      CoverStatus.COVER_STATUS_REJECTED,
      eventRepository,
    );
  }
}

