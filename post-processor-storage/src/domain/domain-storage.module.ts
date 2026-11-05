import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobsOutboxModel } from '@volontariapp/database';
import {
  FileModel,
  ReleasedEntityModel,
} from '@volontariapp/domain-storage/models';
import { PostgresFileRepository } from '@volontariapp/domain-storage/repositories';

/**
 * JobsOutboxModel: releaseForOwner (user.deleted), releaseForEntity (*.deleted, *.creation_failed)
 * and releaseFile (*_replaced) write the storage.cleanup_files job in their transaction; without
 * the entity TypeORM throws EntityMetadataNotFoundError and the release rolls back (for
 * user.deleted, the USER_DELETION gather never gets USER_STORAGE_DELETED).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([FileModel, ReleasedEntityModel, JobsOutboxModel]),
  ],
  providers: [PostgresFileRepository],
  exports: [PostgresFileRepository],
})
export class DomainStorageModule {}
