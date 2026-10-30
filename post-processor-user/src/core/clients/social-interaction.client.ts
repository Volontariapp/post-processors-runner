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
  type GetEventParticipantsQuery,
  type GetEventParticipantsResponse,
  type GetEventAttendeesQuery,
  type GetEventAttendeesResponse,
  GrpcDateMapper,
} from '@volontariapp/contracts-nest';
import { JwtService, INTERNAL_TOKEN_METADATA_KEY } from '@volontariapp/auth';
import { UserRoles } from '@volontariapp/shared';
import { Logger } from '@volontariapp/logger';
import { SOCIAL_PACKAGE } from '../../infrastructure/grpc/constants.js';

/**
 * Sentinel used when an attendee has no registration date: the latest representable date,
 * so such attendees rank after all dated ones (ties broken by userId in the calculator).
 * Constant on purpose: a time-dependent fallback would change ranks between replays.
 */
export const MISSING_REGISTERED_AT_MS = 8_640_000_000_000_000;

export interface EventAttendeeInfo {
  userId: string;
  registeredAt: Date;
  checkedIn: boolean;
}

export interface ISocialInteractionClient {
  getUserLikesCount(userId: string): Promise<number>;
  getUserWishEventsCount(userId: string): Promise<number>;
  getAllEventParticipantIds(eventId: string): Promise<string[]>;
  getAllEventAttendees(eventId: string): Promise<EventAttendeeInfo[]>;
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
  getEventParticipants(
    request: GetEventParticipantsQuery,
    metadata?: Metadata,
  ): Observable<GetEventParticipantsResponse>;
  getEventAttendees(
    request: GetEventAttendeesQuery,
    metadata?: Metadata,
  ): Observable<GetEventAttendeesResponse>;
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

  async getAllEventParticipantIds(eventId: string): Promise<string[]> {
    const allIds: string[] = [];
    let page = 1;
    const limit = 50;
    let totalPages = 1;

    do {
      const metadata = await this.getInternalMetadata();
      const response = await firstValueFrom(
        this.participationQueryService.getEventParticipants(
          {
            eventId,
            pagination: { page, limit },
          },
          metadata,
        ),
      );

      if (response.ids.length > 0) {
        allIds.push(...response.ids);
      }

      totalPages = response.pagination?.totalPages ?? 1;
      page++;
    } while (page <= totalPages);

    return Array.from(new Set(allIds));
  }

  async getAllEventAttendees(eventId: string): Promise<EventAttendeeInfo[]> {
    const allAttendees: EventAttendeeInfo[] = [];
    let page = 1;
    const limit = 50;
    let totalPages = 1;

    do {
      const metadata = await this.getInternalMetadata();
      const response = await firstValueFrom(
        this.participationQueryService.getEventAttendees(
          {
            eventId,
            pagination: { page, limit },
          },
          metadata,
        ),
      );

      if (response.attendees.length > 0) {
        for (const attendee of response.attendees) {
          const parsedRegisteredAt = GrpcDateMapper.toDate(
            attendee.registeredAt,
          );
          if (parsedRegisteredAt === undefined) {
            this.logger.warn(
              `Attendee ${attendee.userId} of event ${eventId} has no registeredAt, ranking last by userId`,
              { eventId, userId: attendee.userId },
            );
          }
          const registeredAt =
            parsedRegisteredAt ?? new Date(MISSING_REGISTERED_AT_MS);
          const checkedIn = attendee.checkedInAt !== undefined;
          allAttendees.push({
            userId: attendee.userId,
            registeredAt,
            checkedIn,
          });
        }
      }

      totalPages = response.pagination?.totalPages ?? 1;
      page++;
    } while (page <= totalPages);

    return allAttendees;
  }
}
