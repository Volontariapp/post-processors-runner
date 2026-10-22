import { Injectable } from '@nestjs/common';
import { StorageEventMessagingType } from '@volontariapp/messaging';
import { PostMediaScanStatus } from '@volontariapp/domain-post';
import type { PostProcessorOptions } from '@volontariapp/post-processors';
import type { PostgresPostRepository } from '@volontariapp/domain-post';
import type { DataSource } from 'typeorm';
import type { Redis } from 'ioredis';
import { BaseStorageMediaPostProcessor } from './base-storage-media.post-processor.js';

@Injectable()
export class StorageAttachmentRejectedPostProcessor extends BaseStorageMediaPostProcessor<StorageEventMessagingType.ATTACHMENT_REJECTED> {
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
      StorageEventMessagingType.ATTACHMENT_REJECTED,
      PostMediaScanStatus.REJECTED,
      postRepository,
    );
  }
}
