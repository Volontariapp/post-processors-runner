import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FileModel } from '@volontariapp/domain-storage/models';
import { PostgresFileRepository } from '@volontariapp/domain-storage/repositories';

@Module({
  imports: [TypeOrmModule.forFeature([FileModel])],
  providers: [PostgresFileRepository],
  exports: [PostgresFileRepository],
})
export class DomainStorageModule {}
