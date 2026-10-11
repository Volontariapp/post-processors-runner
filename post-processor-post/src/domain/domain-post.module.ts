import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  PostModel,
  CommentModel,
  PostService,
  CommentService,
  PostgresPostRepository,
  PostgresCommentRepository,
} from '@volontariapp/domain-post';

@Module({
  imports: [TypeOrmModule.forFeature([PostModel, CommentModel])],
  providers: [
    PostgresPostRepository,
    PostgresCommentRepository,
    PostService,
    CommentService,
  ],
  exports: [PostService, CommentService],
})
export class DomainPostModule {}
