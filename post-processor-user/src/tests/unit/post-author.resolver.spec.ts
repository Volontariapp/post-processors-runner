import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { of, throwError } from 'rxjs';
import { status } from '@grpc/grpc-js';
import type { ClientGrpc } from '@nestjs/microservices';
import type { JwtService } from '@volontariapp/auth';
import { POST_SERVICE_NAME } from '@volontariapp/contracts-nest';
import { createMock } from '@volontariapp/testing';
import type { Redis } from 'ioredis';
import {
  CachedPostAuthorResolver,
  PostQueryClient,
  POST_AUTHOR_CACHE_TTL_SECONDS,
} from '../../core/clients/post-author.resolver.js';
import { createMockPostAuthorResolver } from '../mocks/post-author-resolver.mock.js';

describe('PostQueryClient', () => {
  let client: PostQueryClient;
  let mockPostService: { getPost: jest.Mock };
  let mockClientGrpc: jest.Mocked<ClientGrpc>;
  let mockJwtService: jest.Mocked<JwtService>;

  beforeEach(() => {
    mockPostService = { getPost: jest.fn() };
    mockClientGrpc = createMock<ClientGrpc>();
    mockClientGrpc.getService.mockReturnValue(mockPostService);
    mockJwtService = createMock<JwtService>();
    mockJwtService.signInternal.mockResolvedValue('mock-jwt-token');

    client = new PostQueryClient(mockClientGrpc, mockJwtService);
    client.onModuleInit();
  });

  it('should initialize the PostService client on module init', () => {
    expect(mockClientGrpc.getService).toHaveBeenCalledWith(POST_SERVICE_NAME);
  });

  it('should return the author of the post and send the internal token', async () => {
    mockPostService.getPost.mockReturnValue(
      of({ post: { id: 'post-1', authorId: 'author-1' } }),
    );

    const result = await client.getPostAuthorId('post-1');

    expect(result).toBe('author-1');
    expect(mockJwtService.signInternal).toHaveBeenCalledTimes(1);
    expect(mockPostService.getPost).toHaveBeenCalledWith(
      { id: 'post-1' },
      expect.anything(),
    );
  });

  it('should return undefined when the response has no post', async () => {
    mockPostService.getPost.mockReturnValue(of({ post: undefined }));

    expect(await client.getPostAuthorId('post-1')).toBeUndefined();
  });

  it('should return undefined when ms-post answers NOT_FOUND', async () => {
    mockPostService.getPost.mockReturnValue(
      throwError(() => ({ code: status.NOT_FOUND, message: 'post not found' })),
    );

    expect(await client.getPostAuthorId('post-1')).toBeUndefined();
  });

  it('should rethrow any other gRPC error so the message is retried', async () => {
    mockPostService.getPost.mockReturnValue(
      throwError(() => ({ code: status.UNAVAILABLE, message: 'down' })),
    );

    await expect(client.getPostAuthorId('post-1')).rejects.toMatchObject({
      code: status.UNAVAILABLE,
    });
  });

  it('should reuse the cached internal token between calls', async () => {
    mockPostService.getPost.mockReturnValue(
      of({ post: { id: 'post-1', authorId: 'author-1' } }),
    );

    await client.getPostAuthorId('post-1');
    await client.getPostAuthorId('post-2');

    expect(mockJwtService.signInternal).toHaveBeenCalledTimes(1);
  });
});

describe('CachedPostAuthorResolver', () => {
  let inner: ReturnType<typeof createMockPostAuthorResolver>;
  let mockRedis: jest.Mocked<Redis>;
  let resolver: CachedPostAuthorResolver;

  beforeEach(() => {
    inner = createMockPostAuthorResolver();
    mockRedis = createMock<Redis>();
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue('OK');
    resolver = new CachedPostAuthorResolver(inner, mockRedis);
    Object.defineProperty(resolver, 'logger', {
      value: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
    });
  });

  it('should return the cached author without calling the inner resolver', async () => {
    mockRedis.get.mockResolvedValue('author-cached');

    expect(await resolver.getPostAuthorId('post-1')).toBe('author-cached');
    expect(mockRedis.get).toHaveBeenCalledWith('post:author:post-1');
    expect(inner.getPostAuthorId).not.toHaveBeenCalled();
  });

  it('should resolve and cache the author on a miss', async () => {
    inner.getPostAuthorId.mockResolvedValue('author-1');

    expect(await resolver.getPostAuthorId('post-1')).toBe('author-1');
    expect(mockRedis.set.mock.calls[0]).toEqual([
      'post:author:post-1',
      'author-1',
      'EX',
      POST_AUTHOR_CACHE_TTL_SECONDS,
    ]);
  });

  it('should not cache a post that was not found', async () => {
    inner.getPostAuthorId.mockResolvedValue(undefined);

    expect(await resolver.getPostAuthorId('post-1')).toBeUndefined();
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it('should fall back to the inner resolver when Redis is unavailable', async () => {
    mockRedis.get.mockRejectedValue(new Error('redis down'));
    mockRedis.set.mockRejectedValue(new Error('redis down'));
    inner.getPostAuthorId.mockResolvedValue('author-1');

    expect(await resolver.getPostAuthorId('post-1')).toBe('author-1');
  });

  it('should propagate an inner failure and cache nothing', async () => {
    inner.getPostAuthorId.mockRejectedValue(new Error('ms-post unavailable'));

    await expect(resolver.getPostAuthorId('post-1')).rejects.toThrow(
      'ms-post unavailable',
    );
    expect(mockRedis.set).not.toHaveBeenCalled();
  });
});
