import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  PostModel,
  CommentModel,
  PostgresPostRepository,
  PostgresCommentRepository,
  PostService,
  CommentService,
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
