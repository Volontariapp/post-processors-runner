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
