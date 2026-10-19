import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { BatchPostProcessor } from '@volontariapp/post-processors';
import type {
  BatchEventItem,
  ParseResult,
  PostProcessorOptions,
} from '@volontariapp/post-processors';
import {
  RankingEventMessagingType,
  UserEventMessagingType,
  type IUserDeleledPayload,
  type IUserRankingDeletedPayload,
  type IUserRankingDeletionFailedPayload,
  type StreamEvent,
} from '@volontariapp/messaging';
import {
  databaseMapper,
  EventQueueEntity,
  EventQueueModel,
  type Repository,
} from '@volontariapp/database';
import { EventQueueRepository, EventQueueWriter } from '@volontariapp/outbox';
import { RankingPurgeService } from '@volontariapp/domain-ranking';
import { Streams } from '@volontariapp/shared';
import type { Redis } from 'ioredis';

databaseMapper.registerBidirectional(EventQueueModel, EventQueueEntity);

/**
 * Purge toutes les donnees ranking_* du compte, puis acquitte aupres du gather de ws-service.
 * La purge est idempotente : rejouer le message ne laisse aucune ligne et n'en double aucune.
 */
@Injectable()
export class UserDeletedPostProcessor extends BatchPostProcessor<UserEventMessagingType.USER_DELETED> {
  constructor(
    redisClient: Redis,
    options: PostProcessorOptions,
    private readonly purgeService: RankingPurgeService,
    @InjectRepository(EventQueueModel)
    private readonly typeormRepository: Repository<EventQueueModel>,
  ) {
    super(redisClient, options);
  }

  protected async processEvents(
    events: BatchEventItem<UserEventMessagingType.USER_DELETED>[],
  ): Promise<void> {
    const queueEntities: EventQueueEntity<RankingEventMessagingType.USER_RANKING_DELETED>[] =
      [];

    for (const { event, messageId } of events) {
      const payload: IUserDeleledPayload = event.payload.after;
      if (!payload.id) {
        this.logger.error('Invalid payload for USER_DELETED: missing id', {
          messageId,
        });
        continue;
      }

      const report = await this.purgeService.purgeUser(payload.id);
      this.logger.info(`Purged the ranking data of user ${payload.id}`, {
        messageId,
        report,
      });

      const deleted: IUserRankingDeletedPayload = { userId: payload.id };
      queueEntities.push(
        EventQueueEntity.createFollowUp<RankingEventMessagingType.USER_RANKING_DELETED>(
          event,
          {
            type: RankingEventMessagingType.USER_RANKING_DELETED,
            emitter: event.emitter,
            emitterId: event.emitterId,
            payload: deleted,
            targetServices: [Streams.WS_USER_DELETED_FEEDBACK],
          },
        ),
      );
    }

    if (queueEntities.length > 0) {
      const writer =
        new EventQueueWriter<RankingEventMessagingType.USER_RANKING_DELETED>(
          this.logger,
          new EventQueueRepository<RankingEventMessagingType.USER_RANKING_DELETED>(
            this.typeormRepository,
          ),
        );
      await writer.createMany(queueEntities);
    }
  }

  protected override async sendMessageToDlq(
    messageId: string,
    originalPayload: ParseResult,
    error: string,
  ): Promise<void> {
    await super.sendMessageToDlq(messageId, originalPayload, error);

    if (!originalPayload.success) {
      this.logger.warn(
        'Original payload failed to parse, cannot send WS feedback',
        { messageId },
      );
      return;
    }

    try {
      const event = JSON.parse(
        originalPayload.payload,
      ) as StreamEvent<IUserDeleledPayload>;
      const failed: IUserRankingDeletionFailedPayload = {
        userId: event.payload.after.id,
        errorReason: error,
      };
      const queueEntity =
        EventQueueEntity.createFollowUp<RankingEventMessagingType.USER_RANKING_DELETION_FAILED>(
          event,
          {
            type: RankingEventMessagingType.USER_RANKING_DELETION_FAILED,
            emitter: event.emitter,
            emitterId: event.emitterId,
            payload: failed,
            targetServices: [Streams.WS_USER_DELETED_FEEDBACK],
          },
        );
      await new EventQueueWriter(
        this.logger,
        new EventQueueRepository<RankingEventMessagingType.USER_RANKING_DELETION_FAILED>(
          this.typeormRepository,
        ),
      ).createMany([queueEntity]);
      this.logger.info('Inserted WS failure feedback event into event_queue', {
        messageId,
      });
    } catch (parseError) {
      this.logger.error(
        'Failed to build the WS failure feedback for the original payload',
        parseError,
        { messageId },
      );
    }
  }

  protected override shouldProcess(
    eventType: UserEventMessagingType | string,
  ): boolean {
    return eventType === UserEventMessagingType.USER_DELETED.toString();
  }
}
