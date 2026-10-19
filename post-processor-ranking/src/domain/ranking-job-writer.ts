import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { JobsOutboxEntity, JobsOutboxModel } from '@volontariapp/database';
import { RankingRequestService } from '@volontariapp/domain-ranking';
import {
  JobMessagingType,
  RankingQueue,
  type IFanoutRankingPayload,
} from '@volontariapp/messaging';
import { JobsOutboxRepository } from '@volontariapp/outbox';
import { Logger } from '@volontariapp/logger';
import { CustomConfig } from '../config/custom-config.js';
import {
  BACKGROUND_QUEUE,
  COMPUTE_JOB_TYPE,
  JOB_EMITTER,
} from './constants/ranking-job.constants.js';
import type { ComputeRequest } from './interfaces/compute-request.interface.js';
import type { FanoutRequest } from './interfaces/fanout-request.interface.js';
import type { PersistedJob } from './types/persisted-job.type.js';

/**
 * Ecrit les demandes de calcul et les jobs de fan-out dans jobs_outbox. Aucun appel Redis direct :
 * l'outbox pousse ensuite le job dans BullMQ.
 */
@Injectable()
export class RankingJobWriter {
  private readonly logger = new Logger({ context: RankingJobWriter.name });

  constructor(
    private readonly dataSource: DataSource,
    private readonly requestService: RankingRequestService,
    private readonly customConfig: CustomConfig,
  ) {}

  /**
   * Une demande de fond par liste, toutes dans la meme transaction. Un job n'est ecrit que si la
   * demande en a besoin (un job recent couvre deja les autres).
   */
  async requestCompute(requests: readonly ComputeRequest[]): Promise<void> {
    const { requestTtlSeconds, debounceSeconds } = this.customConfig.ranking;
    await this.dataSource.transaction(async (manager) => {
      for (const { userId, listKind, reason } of requests) {
        const { requestedAt, needsJob } =
          await this.requestService.requestCompute(
            {
              userId,
              listKind,
              reason,
              force: false,
              ttlSeconds: requestTtlSeconds,
            },
            manager,
          );
        if (!needsJob) {
          continue;
        }
        const job = JobsOutboxEntity.createJob({
          type: COMPUTE_JOB_TYPE[listKind],
          emitter: JOB_EMITTER,
          emitterId: userId,
          scheduledAt: new Date(Date.now() + debounceSeconds * 1000),
          target: BACKGROUND_QUEUE[listKind],
          payload: { userId, reason, requestedAt },
        });
        await this.persist(manager, job, { userId, reason, requestedAt });
        this.logger.info(
          `Compute job ${job.id} queued for user ${userId} (${listKind}, ${reason})`,
        );
      }
    });
  }

  /** Un job de fan-out, execute par le worker : il demande un calcul par utilisateur concerne. */
  async enqueueFanout(request: FanoutRequest): Promise<void> {
    const requestedAt = await this.requestService.databaseClock();
    const payload: IFanoutRankingPayload = {
      trigger: request.trigger,
      requestedAt,
      ...(request.eventId ? { eventId: request.eventId } : {}),
      ...(request.postId ? { postId: request.postId } : {}),
      ...(request.authorId ? { authorId: request.authorId } : {}),
    };
    const job = JobsOutboxEntity.createJob({
      type: JobMessagingType.FANOUT_RANKING,
      emitter: JOB_EMITTER,
      emitterId: request.subjectId,
      scheduledAt: new Date(),
      target:
        request.trigger === 'POST_CREATED'
          ? RankingQueue.FEED
          : RankingQueue.RANKING,
      payload,
    });
    await this.dataSource.transaction((manager) =>
      this.persist(manager, job, {
        trigger: payload.trigger,
        requestedAt,
        ...(payload.eventId ? { eventId: payload.eventId } : {}),
        ...(payload.postId ? { postId: payload.postId } : {}),
        ...(payload.authorId ? { authorId: payload.authorId } : {}),
      }),
    );
    this.logger.info(
      `Fan-out job ${job.id} queued for ${request.trigger} ${request.subjectId}`,
    );
  }

  /** Les interfaces de payload de messaging n'ont pas de signature d'index, le depot attend un JSON. */
  private async persist(
    manager: EntityManager,
    job: PersistedJob,
    payload: Record<string, string>,
  ): Promise<void> {
    const outbox = new JobsOutboxRepository(
      manager.getRepository(JobsOutboxModel),
    );
    await outbox.create({
      id: job.id,
      status: job.status,
      attempts: job.attempts,
      type: job.type,
      emitter: job.emitter,
      emitterId: job.emitterId,
      target: job.target,
      scheduledAt: job.scheduledAt,
      payload,
    });
  }
}
