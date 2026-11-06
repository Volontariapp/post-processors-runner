import type { DataSource, EntityManager } from 'typeorm';
import { BadgeProgressDedupModel } from '@volontariapp/domain-user';
import { BADGE_METRICS } from '@volontariapp/shared';
import { Logger } from '@volontariapp/logger';
import type { IUserSocialActivityClient } from '../clients/social-interaction.client.js';
import type { IPostAuthorResolver } from '../clients/post-author.resolver.js';

const FIRST_UUID = '00000000-0000-0000-0000-000000000000';
export const DEFAULT_BACKFILL_BATCH_SIZE = 200;

export interface BackfillOptions {
  /** Ne traite que cet utilisateur. */
  readonly userId?: string;
  /** Calcule et rapporte sans rien écrire. */
  readonly dryRun?: boolean;
  readonly batchSize?: number;
}

export interface BackfillUserResult {
  readonly userId: string;
  /** Likes retenus : posts d'autrui encore existants. */
  readonly likes: number;
  readonly selfLikesSkipped: number;
  readonly missingPostsSkipped: number;
  readonly wishes: number;
}

export interface BackfillSummary {
  readonly dryRun: boolean;
  readonly users: number;
  readonly failedUsers: readonly string[];
  readonly likes: number;
  readonly selfLikesSkipped: number;
  readonly missingPostsSkipped: number;
  readonly wishes: number;
}

/**
 * Rattrape les compteurs de progression `SOCIAL_LIKES_GIVEN` et `SOCIAL_WISHES` des utilisateurs
 * existants à partir de leur activité dans ms-social.
 *
 * - Chaque like (post d'autrui) et chaque souhait devient une ligne de `badge_progress_dedup`,
 *   la même clé que celle du traitement en direct : un like déjà rattrapé ne sera pas recompté.
 * - La valeur du compteur est le nombre de lignes de dédup (jamais inférieure à la valeur existante).
 * - N'attribue AUCUN badge et ne crédite AUCUN point : pas de rétroactivité (voir docs/badges/11, B7).
 *   Un badge dont le seuil est déjà atteint sera attribué au prochain événement en direct.
 * - Idempotent : relançable sans risque.
 */
export class BadgeCounterBackfill {
  private readonly logger = new Logger({
    context: 'BadgeCounterBackfill',
    format: 'json',
  });

  constructor(
    private readonly db: DataSource,
    private readonly socialClient: IUserSocialActivityClient,
    private readonly postAuthorResolver: IPostAuthorResolver,
  ) {}

  async run(options: BackfillOptions = {}): Promise<BackfillSummary> {
    const dryRun = options.dryRun ?? false;
    const batchSize = options.batchSize ?? DEFAULT_BACKFILL_BATCH_SIZE;

    const totals = {
      users: 0,
      likes: 0,
      selfLikesSkipped: 0,
      missingPostsSkipped: 0,
      wishes: 0,
    };
    const failedUsers: string[] = [];

    const processUser = async (userId: string): Promise<void> => {
      try {
        const result = await this.backfillUser(userId, dryRun);
        totals.users += 1;
        totals.likes += result.likes;
        totals.selfLikesSkipped += result.selfLikesSkipped;
        totals.missingPostsSkipped += result.missingPostsSkipped;
        totals.wishes += result.wishes;
      } catch (error: unknown) {
        failedUsers.push(userId);
        this.logger.error(
          `Backfill failed for user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    };

    if (options.userId !== undefined) {
      await processUser(options.userId);
    } else {
      let lastId = FIRST_UUID;
      for (;;) {
        const rows = await this.db.query<Array<{ id: string }>>(
          'SELECT "id" FROM "users" WHERE "id" > $1 ORDER BY "id" ASC LIMIT $2',
          [lastId, batchSize],
        );
        if (rows.length === 0) break;

        // Séquentiel volontaire : pas de rafale sur ms-social, ms-post et la base.
        for (const row of rows) {
          await processUser(row.id);
        }

        lastId = rows[rows.length - 1].id;
        this.logger.info(
          `Backfill progress: ${String(totals.users)} users done, ${String(failedUsers.length)} failed`,
        );
      }
    }

    const summary: BackfillSummary = { dryRun, failedUsers, ...totals };
    this.logger.info(`Backfill finished: ${JSON.stringify(summary)}`);
    return summary;
  }

  async backfillUser(
    userId: string,
    dryRun: boolean,
  ): Promise<BackfillUserResult> {
    const likedPostIds = await this.socialClient.getAllUserLikedPostIds(userId);

    const countedPostIds: string[] = [];
    let selfLikesSkipped = 0;
    let missingPostsSkipped = 0;
    for (const postId of likedPostIds) {
      const authorId = await this.postAuthorResolver.getPostAuthorId(postId);
      if (authorId === undefined) {
        missingPostsSkipped += 1;
      } else if (authorId === userId) {
        selfLikesSkipped += 1;
      } else {
        countedPostIds.push(postId);
      }
    }

    const wishedEventIds =
      await this.socialClient.getAllUserWishedEventIds(userId);

    if (!dryRun) {
      await this.db.transaction(async (manager) => {
        await this.syncMetric(
          manager,
          userId,
          BADGE_METRICS.SOCIAL_LIKES_GIVEN,
          countedPostIds,
        );
        await this.syncMetric(
          manager,
          userId,
          BADGE_METRICS.SOCIAL_WISHES,
          wishedEventIds,
        );
      });
    }

    return {
      userId,
      likes: countedPostIds.length,
      selfLikesSkipped,
      missingPostsSkipped,
      wishes: wishedEventIds.length,
    };
  }

  private async syncMetric(
    manager: EntityManager,
    userId: string,
    metric: string,
    refIds: readonly string[],
  ): Promise<void> {
    if (refIds.length > 0) {
      await manager
        .createQueryBuilder()
        .insert()
        .into(BadgeProgressDedupModel)
        .values(refIds.map((refId) => ({ userId, metric, refId })))
        .orIgnore()
        .execute();
    }

    const value = await manager.count(BadgeProgressDedupModel, {
      where: { userId, metric },
    });
    if (value === 0) return;

    await manager.query(
      `INSERT INTO "badge_progress" ("user_id", "metric", "value")
       VALUES ($1, $2, $3)
       ON CONFLICT ("user_id", "metric")
       DO UPDATE SET "value" = GREATEST("badge_progress"."value", EXCLUDED."value"), "updated_at" = now()`,
      [userId, metric, value],
    );
  }
}
