import 'reflect-metadata';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import {
  EventEventMessagingType,
  PostEventMessagingType,
  SocialEventMessagingType,
  UserEventMessagingType,
} from '@volontariapp/messaging';
import { RankingListKind } from '@volontariapp/domain-ranking';
import type { RankingJobWriter } from '../../domain/ranking-job-writer.js';
import { EventCreatedPostProcessor } from '../../post-processors/events/event-created.post-processor.js';
import { EventFinishedPostProcessor } from '../../post-processors/events/event-finished.post-processor.js';
import { EventUnwishedPostProcessor } from '../../post-processors/events/event-unwished.post-processor.js';
import { EventWishedPostProcessor } from '../../post-processors/events/event-wished.post-processor.js';
import { PostCreatedPostProcessor } from '../../post-processors/posts/post-created.post-processor.js';
import { PostDeletedPostProcessor } from '../../post-processors/posts/post-deleted.post-processor.js';
import { PostLikedPostProcessor } from '../../post-processors/posts/post-liked.post-processor.js';
import { PostUnlikedPostProcessor } from '../../post-processors/posts/post-unliked.post-processor.js';
import { UserCreatedPostProcessor } from '../../post-processors/users/user-created.post-processor.js';
import { buildBatchItem } from '../factories/event.factory.js';
import {
  createMockJobWriter,
  createMockLikeLogService,
  createMockMentionService,
  createMockOptions,
  createMockRedis,
  createMockWishService,
} from '../mocks/ranking.mock.js';

const USER = '11111111-1111-4111-a111-111111111111';
const EVENT = '22222222-2222-4222-a222-222222222222';
const POST = '33333333-3333-4333-a333-333333333333';

describe('post-processor-ranking triggers (Unit)', () => {
  const jobWriter = createMockJobWriter();
  const wishService = createMockWishService();
  const mentionService = createMockMentionService();
  const likeLogService = createMockLikeLogService();
  const redis = createMockRedis();
  const options = createMockOptions();
  let requestComputeSpy: jest.SpiedFunction<RankingJobWriter['requestCompute']>;
  let enqueueFanoutSpy: jest.SpiedFunction<RankingJobWriter['enqueueFanout']>;

  beforeEach(() => {
    requestComputeSpy = jest
      .spyOn(jobWriter, 'requestCompute')
      .mockResolvedValue(undefined);
    enqueueFanoutSpy = jest
      .spyOn(jobWriter, 'enqueueFanout')
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('asks the two lists of a new account in one call', async () => {
    const processor = new UserCreatedPostProcessor(redis, options, jobWriter);
    const requestSpy = jest.spyOn(jobWriter, 'requestCompute');

    await processor['processEvents']([
      buildBatchItem(UserEventMessagingType.USER_CREATED, { id: USER }),
    ] as never);

    expect(requestSpy).toHaveBeenCalledTimes(1);
    expect(requestSpy.mock.calls[0]?.[0]).toEqual([
      { userId: USER, listKind: RankingListKind.EVENT, reason: 'USER_CREATED' },
      { userId: USER, listKind: RankingListKind.POST, reason: 'USER_CREATED' },
    ]);
    expect(processor['shouldProcess']('user.created')).toBe(true);
    expect(processor['shouldProcess']('user.deleted')).toBe(false);
  });

  it('ignores a created account without id', async () => {
    const processor = new UserCreatedPostProcessor(redis, options, jobWriter);
    const requestSpy = jest.spyOn(jobWriter, 'requestCompute');

    await processor['processEvents']([
      buildBatchItem(UserEventMessagingType.USER_CREATED, { id: '' }),
    ] as never);

    expect(requestSpy).not.toHaveBeenCalled();
  });

  it('records a wish with the user of the payload and requests an event refresh', async () => {
    const processor = new EventWishedPostProcessor(
      redis,
      options,
      wishService,
      jobWriter,
    );
    const addSpy = jest
      .spyOn(wishService, 'addWish')
      .mockResolvedValue(undefined);
    const requestSpy = jest.spyOn(jobWriter, 'requestCompute');

    await processor['processEvents']([
      buildBatchItem(SocialEventMessagingType.EVENT_SOCIAL_WISHED, {
        eventId: EVENT,
        userId: USER,
      }),
    ] as never);

    expect(addSpy).toHaveBeenCalledWith(USER, EVENT);
    expect(requestSpy.mock.calls[0]?.[0]).toEqual([
      { userId: USER, listKind: RankingListKind.EVENT, reason: 'WISH_CHANGED' },
    ]);
  });

  it('falls back to the emitterId of the envelope when the payload has no user', async () => {
    const processor = new EventWishedPostProcessor(
      redis,
      options,
      wishService,
      jobWriter,
    );
    const addSpy = jest
      .spyOn(wishService, 'addWish')
      .mockResolvedValue(undefined);

    await processor['processEvents']([
      buildBatchItem(
        SocialEventMessagingType.EVENT_SOCIAL_WISHED,
        { eventId: EVENT },
        { emitterId: USER },
      ),
    ] as never);

    expect(addSpy).toHaveBeenCalledWith(USER, EVENT);
  });

  it('removes the wish on unwish and requests a refresh once per user in a batch', async () => {
    const processor = new EventUnwishedPostProcessor(
      redis,
      options,
      wishService,
      jobWriter,
    );
    const removeSpy = jest
      .spyOn(wishService, 'removeWish')
      .mockResolvedValue(undefined);
    const requestSpy = jest.spyOn(jobWriter, 'requestCompute');

    await processor['processEvents']([
      buildBatchItem(SocialEventMessagingType.EVENT_SOCIAL_UNWISHED, {
        eventId: EVENT,
        userId: USER,
      }),
      buildBatchItem(SocialEventMessagingType.EVENT_SOCIAL_UNWISHED, {
        eventId: POST,
        userId: USER,
      }),
    ] as never);

    expect(removeSpy).toHaveBeenCalledTimes(2);
    expect(requestSpy).toHaveBeenCalledTimes(1);
    expect(requestSpy.mock.calls[0]?.[0]).toHaveLength(1);
  });

  it('enqueues an EVENT_CREATED fan-out and an EVENT_FINISHED fan-out, never a compute', async () => {
    const created = new EventCreatedPostProcessor(redis, options, jobWriter);
    const finished = new EventFinishedPostProcessor(redis, options, jobWriter);
    const fanoutSpy = jest.spyOn(jobWriter, 'enqueueFanout');

    await created['processEvents']([
      buildBatchItem(EventEventMessagingType.EVENT_CREATED, {
        eventId: EVENT,
        userId: USER,
      }),
    ] as never);
    await finished['processEvents']([
      buildBatchItem(EventEventMessagingType.EVENT_FINISHED, {
        eventId: EVENT,
      }),
    ] as never);

    expect(fanoutSpy.mock.calls.map((call) => call[0])).toEqual([
      { trigger: 'EVENT_CREATED', subjectId: EVENT, eventId: EVENT },
      { trigger: 'EVENT_FINISHED', subjectId: EVENT, eventId: EVENT },
    ]);
    expect(requestComputeSpy).not.toHaveBeenCalled();
  });

  it('notes the mention of a post tied to an event and fans the feed out', async () => {
    const processor = new PostCreatedPostProcessor(
      redis,
      options,
      mentionService,
      jobWriter,
    );
    const mentionSpy = jest
      .spyOn(mentionService, 'addMention')
      .mockResolvedValue(undefined);
    const fanoutSpy = jest.spyOn(jobWriter, 'enqueueFanout');

    await processor['processEvents']([
      buildBatchItem(PostEventMessagingType.POST_CREATED, {
        postId: POST,
        userId: USER,
        eventId: EVENT,
        fileIds: [],
      }),
    ] as never);

    expect(mentionSpy).toHaveBeenCalledWith({
      postId: POST,
      eventId: EVENT,
      authorId: USER,
    });
    expect(fanoutSpy.mock.calls[0]?.[0]).toEqual({
      trigger: 'POST_CREATED',
      subjectId: POST,
      postId: POST,
      authorId: USER,
    });
  });

  it('does not note a mention for a post without event but still fans out', async () => {
    const processor = new PostCreatedPostProcessor(
      redis,
      options,
      mentionService,
      jobWriter,
    );
    const mentionSpy = jest
      .spyOn(mentionService, 'addMention')
      .mockResolvedValue(undefined);

    await processor['processEvents']([
      buildBatchItem(PostEventMessagingType.POST_CREATED, {
        postId: POST,
        userId: USER,
        fileIds: [],
      }),
    ] as never);

    expect(mentionSpy).not.toHaveBeenCalled();
    expect(enqueueFanoutSpy).toHaveBeenCalledTimes(1);
  });

  it('removes the mention of a deleted post', async () => {
    const processor = new PostDeletedPostProcessor(
      redis,
      options,
      mentionService,
    );
    const removeSpy = jest
      .spyOn(mentionService, 'removeMention')
      .mockResolvedValue(undefined);

    await processor['processEvents']([
      buildBatchItem(PostEventMessagingType.POST_DELETED, { postId: POST }),
    ] as never);

    expect(removeSpy).toHaveBeenCalledWith(POST);
  });

  it('writes likes and unlikes in the journal with the date of the event only', async () => {
    const liked = new PostLikedPostProcessor(redis, options, likeLogService);
    const unliked = new PostUnlikedPostProcessor(
      redis,
      options,
      likeLogService,
    );
    const likeSpy = jest
      .spyOn(likeLogService, 'recordLike')
      .mockResolvedValue(undefined);
    const unlikeSpy = jest
      .spyOn(likeLogService, 'recordUnlike')
      .mockResolvedValue(undefined);
    const at = new Date('2026-10-19T10:00:00.000Z');

    await liked['processEvents']([
      buildBatchItem(PostEventMessagingType.POST_LIKED, {
        postId: POST,
        userId: USER,
        authorId: EVENT,
      }),
    ] as never);
    await unliked['processEvents']([
      buildBatchItem(PostEventMessagingType.POST_UNLIKED, {
        postId: POST,
        userId: USER,
        authorId: EVENT,
      }),
    ] as never);

    expect(likeSpy).toHaveBeenCalledWith({
      userId: USER,
      postId: POST,
      occurredAt: at,
    });
    expect(unlikeSpy).toHaveBeenCalledWith({ userId: USER, postId: POST, at });
    expect(requestComputeSpy).not.toHaveBeenCalled();
    expect(enqueueFanoutSpy).not.toHaveBeenCalled();
  });
});
