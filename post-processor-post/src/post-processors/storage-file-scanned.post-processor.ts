import { Injectable } from '@nestjs/common';
import { StorageEventMessagingType } from '@volontariapp/messaging';
import { PostMediaScanStatus } from '@volontariapp/domain-post';
import type { PostProcessorOptions } from '@volontariapp/post-processors';
import type { PostgresPostRepository } from '@volontariapp/domain-post';
import type { DataSource } from 'typeorm';
import type { Redis } from 'ioredis';
import { BaseStorageMediaPostProcessor } from './base-storage-media.post-processor.js';

@Injectable()
export class StorageFileScannedPostProcessor extends BaseStorageMediaPostProcessor<StorageEventMessagingType.FILE_SCANNED> {
  constructor(
    db: DataSource,
    redisDriver: Redis,
    options: PostProcessorOptions,
    postRepository?: PostgresPostRepository,
  ) {
    super(
      db,
      redisDriver,
      options,
      StorageEventMessagingType.FILE_SCANNED,
      PostMediaScanStatus.CLEAN,
      postRepository,
    );
  }
}
