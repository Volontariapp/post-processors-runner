import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { Metadata } from '@grpc/grpc-js';
import { firstValueFrom, type Observable } from 'rxjs';
import {
  INTERACTION_QUERY_SERVICE_NAME,
  PARTICIPATION_QUERY_SERVICE_NAME,
  type InteractionQueryServiceClient,
  type ParticipationQueryServiceClient,
  type AdminGetUserLikesQuery,
  type AdminGetUserLikesResponse,
  type AdminGetUserWishEventQuery,
  type AdminGetUserWishEventResponse,
} from '@volontariapp/contracts-nest';
import { JwtService, INTERNAL_TOKEN_METADATA_KEY } from '@volontariapp/auth';
import { UserRoles } from '@volontariapp/shared';
import { Logger } from '@volontariapp/logger';
import { SOCIAL_PACKAGE } from '../../infrastructure/grpc/constants.js';

export interface ISocialInteractionClient {
  getUserLikesCount(userId: string): Promise<number>;
  getUserWishEventsCount(userId: string): Promise<number>;
}

interface InteractionQueryServiceClientWithMetadata extends InteractionQueryServiceClient {
  adminGetUserLikes(
    request: AdminGetUserLikesQuery,
    metadata?: Metadata,
  ): Observable<AdminGetUserLikesResponse>;
}

interface ParticipationQueryServiceClientWithMetadata extends ParticipationQueryServiceClient {
  adminGetUserWishEvent(
    request: AdminGetUserWishEventQuery,
    metadata?: Metadata,
  ): Observable<AdminGetUserWishEventResponse>;
}

@Injectable()
export class SocialInteractionClient
  implements OnModuleInit, ISocialInteractionClient
{
  private readonly logger = new Logger({
    context: 'SocialInteractionClient',
    format: 'json',
  });
  private queryService!: InteractionQueryServiceClientWithMetadata;
  private participationQueryService!: ParticipationQueryServiceClientWithMetadata;
  private cachedToken?: { token: string; expiresAt: number };

  constructor(
    @Inject(SOCIAL_PACKAGE) private readonly client: ClientGrpc,
    private readonly jwtService: JwtService,
  ) {}

  onModuleInit(): void {
    this.queryService = this.client.getService<InteractionQueryServiceClient>(
      INTERACTION_QUERY_SERVICE_NAME,
    ) as InteractionQueryServiceClientWithMetadata;
    this.participationQueryService =
      this.client.getService<ParticipationQueryServiceClient>(
        PARTICIPATION_QUERY_SERVICE_NAME,
      ) as ParticipationQueryServiceClientWithMetadata;
    this.logger.log('SocialInteractionClient initialized');
  }

  private async getInternalMetadata(): Promise<Metadata> {
    const now = Date.now();
    if (!this.cachedToken || this.cachedToken.expiresAt <= now) {
      const token = await this.jwtService.signInternal({
        id: 'pp-user',
        role: UserRoles.ADMIN,
      });
      // Cache token for 4 minutes
      this.cachedToken = { token, expiresAt: now + 4 * 60 * 1000 };
    }
    const metadata = new Metadata();
    metadata.set(INTERNAL_TOKEN_METADATA_KEY, this.cachedToken.token);
    return metadata;
  }

  async getUserLikesCount(userId: string): Promise<number> {
    const metadata = await this.getInternalMetadata();
    const response = await firstValueFrom(
      this.queryService.adminGetUserLikes(
        {
          userId,
          pagination: { page: 1, limit: 1 },
        },
        metadata,
      ),
    );

    return response.pagination?.total ?? 0;
  }

  async getUserWishEventsCount(userId: string): Promise<number> {
    const metadata = await this.getInternalMetadata();
    const response = await firstValueFrom(
      this.participationQueryService.adminGetUserWishEvent(
        {
          userId,
          pagination: { page: 1, limit: 1 },
        },
        metadata,
      ),
    );

    return response.pagination?.total ?? 0;
  }
}
