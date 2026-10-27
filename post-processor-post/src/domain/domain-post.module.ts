import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  PostModel,
  CommentModel,
  PostMediaModel,
  PostService,
  CommentService,
  PostgresPostRepository,
  PostgresCommentRepository,
} from '@volontariapp/domain-post';

@Module({
  imports: [TypeOrmModule.forFeature([PostModel, CommentModel, PostMediaModel])],
  providers: [
    PostgresPostRepository,
    PostgresCommentRepository,
    PostService,
    CommentService,
  ],
  exports: [PostService, CommentService],
})
export class DomainPostModule {}
