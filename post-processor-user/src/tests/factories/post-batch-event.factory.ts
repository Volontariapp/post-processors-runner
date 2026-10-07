import { PostEventMessagingType } from '@volontariapp/messaging';
import type { BatchEventItem } from '@volontariapp/post-processors';

export function createPostCreationSuccessfullBatchItem(
  options: {
    messageId?: string;
    userId?: string;
    postId?: string;
    correlationId?: string;
    traceId?: string;
  } = {},
): BatchEventItem<PostEventMessagingType.POST_CREATION_SUCCESSFULL> {
  return {
    messageId: options.messageId ?? 'msg-1',
    event: {
      id: 'event-1',
      type: PostEventMessagingType.POST_CREATION_SUCCESSFULL,
      emitter: 'ws-service',
      emitterId: options.userId ?? 'emitter-1',
      correlationId: options.correlationId ?? 'corr-1',
      traceId: options.traceId,
      version: 1,
      createdAt: new Date().toISOString(),
      payload: {
        after: {
          postId: options.postId ?? 'post-123',
          ...(options.userId !== undefined ? { userId: options.userId } : {}),
        },
      },
    },
  };
}

export function createPostLikedBatchItem(
  options: {
    messageId?: string;
    userId?: string;
    postId?: string;
    authorId?: string;
    emitterId?: string;
    correlationId?: string;
    traceId?: string;
  } = {},
): BatchEventItem<PostEventMessagingType.POST_LIKED> {
  const likerId = options.userId ?? 'user-liker-1';
  return {
    messageId: options.messageId ?? 'msg-1',
    event: {
      id: 'event-like-1',
      type: PostEventMessagingType.POST_LIKED,
      emitter: 'ms-social',
      emitterId: options.emitterId ?? likerId,
      correlationId: options.correlationId ?? 'corr-like-1',
      traceId: options.traceId,
      version: 1,
      createdAt: new Date().toISOString(),
      payload: {
        after: {
          postId: options.postId ?? 'post-123',
          authorId: options.authorId ?? likerId,
          ...(options.userId !== undefined ? { userId: options.userId } : {}),
        },
      },
    },
  };
}
