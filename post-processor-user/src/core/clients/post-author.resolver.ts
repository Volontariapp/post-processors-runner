import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { status, type Metadata } from '@grpc/grpc-js';
import { firstValueFrom, type Observable } from 'rxjs';
import {
  POST_SERVICE_NAME,
  type PostServiceClient,
  type GetPostQuery,
  type GetPostResponse,
} from '@volontariapp/contracts-nest';
import { JwtService } from '@volontariapp/auth';
import { Logger } from '@volontariapp/logger';
import type { Redis } from 'ioredis';
import { POST_PACKAGE } from '../../infrastructure/grpc/constants.js';
import { InternalMetadataProvider } from './internal-metadata.provider.js';

export const POST_AUTHOR_CACHE_PREFIX = 'post:author:';
/** L'auteur d'un post ne change jamais : un long TTL suffit, il borne seulement la mémoire. */
export const POST_AUTHOR_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface IPostAuthorResolver {
  /**
   * Auteur du post, `undefined` si le post n'existe plus.
   * Lève en cas d'indisponibilité de ms-post : le message est alors rejoué par le post-processor.
   */
  getPostAuthorId(postId: string): Promise<string | undefined>;
}

interface PostServiceClientWithMetadata extends PostServiceClient {
  getPost(
    request: GetPostQuery,
    metadata?: Metadata,
  ): Observable<GetPostResponse>;
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === status.NOT_FOUND
  );
}

@Injectable()
export class PostQueryClient implements OnModuleInit, IPostAuthorResolver {
  private readonly logger = new Logger({
    context: 'PostQueryClient',
    format: 'json',
  });
  private postService!: PostServiceClientWithMetadata;
  private readonly metadataProvider: InternalMetadataProvider;

  constructor(
    @Inject(POST_PACKAGE) private readonly client: ClientGrpc,
    jwtService: JwtService,
  ) {
    this.metadataProvider = new InternalMetadataProvider(jwtService);
  }

  onModuleInit(): void {
    this.postService = this.client.getService<PostServiceClient>(
      POST_SERVICE_NAME,
    ) as PostServiceClientWithMetadata;
    this.logger.log('PostQueryClient initialized');
  }

  async getPostAuthorId(postId: string): Promise<string | undefined> {
    const metadata = await this.metadataProvider.getMetadata();
    try {
      const response = await firstValueFrom(
        this.postService.getPost({ id: postId }, metadata),
      );
      const authorId = response.post?.authorId;
      return authorId !== undefined && authorId !== '' ? authorId : undefined;
    } catch (error: unknown) {
      if (isNotFound(error)) {
        return undefined;
      }
      throw error;
    }
  }
}

/** Ajoute un cache Redis devant un résolveur d'auteur. Seuls les auteurs trouvés sont mis en cache. */
export class CachedPostAuthorResolver implements IPostAuthorResolver {
  private readonly logger = new Logger({
    context: 'CachedPostAuthorResolver',
    format: 'json',
  });

  constructor(
    private readonly inner: IPostAuthorResolver,
    private readonly redis: Redis,
  ) {}

  async getPostAuthorId(postId: string): Promise<string | undefined> {
    const key = `${POST_AUTHOR_CACHE_PREFIX}${postId}`;
    try {
      const cached = await this.redis.get(key);
      if (cached !== null) {
        return cached;
      }
    } catch (error: unknown) {
      this.logger.warn(
        `Redis read failed for ${key}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const authorId = await this.inner.getPostAuthorId(postId);
    if (authorId !== undefined) {
      try {
        await this.redis.set(
          key,
          authorId,
          'EX',
          POST_AUTHOR_CACHE_TTL_SECONDS,
        );
      } catch (error: unknown) {
        this.logger.warn(
          `Redis write failed for ${key}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return authorId;
  }
}
