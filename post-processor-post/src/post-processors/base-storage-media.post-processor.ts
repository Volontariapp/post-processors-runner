import {
  type PostProcessorOptions,
  BaseStorageEntityResultPostProcessor,
  type StorageResultEventType,
} from '@volontariapp/post-processors';
import {
  StorageEntityType,
  type IStorageFileEntityPayload,
} from '@volontariapp/messaging';
import {
  PostModel,
  PostgresPostRepository,
  type PostMediaScanStatus,
} from '@volontariapp/domain-post';
import type { DataSource } from 'typeorm';
import type { Redis } from 'ioredis';

export abstract class BaseStorageMediaPostProcessor<
  T extends StorageResultEventType = StorageResultEventType,
> extends BaseStorageEntityResultPostProcessor<T, PostMediaScanStatus> {
  protected readonly postRepository: PostgresPostRepository;

  constructor(
    protected readonly db: DataSource,
    redisDriver: Redis,
    options: PostProcessorOptions,
    expectedEventType: T,
    targetStatus: PostMediaScanStatus,
    postRepository?: PostgresPostRepository,
  ) {
    super(
      redisDriver,
      options,
      expectedEventType,
      StorageEntityType.POST,
      targetStatus,
    );

    this.postRepository =
      postRepository ??
      new PostgresPostRepository(this.db.getRepository(PostModel));
  }

  protected override async applyResult(
    entityId: string,
    fileId: string,
    status: PostMediaScanStatus,
    _payload: IStorageFileEntityPayload,
  ): Promise<boolean | null> {
    const updated = await this.postRepository.updateMediaScanStatus(
      entityId,
      fileId,
      status,
    );
    return updated ? true : null;
  }
}
