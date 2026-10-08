import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { SocialInteractionClient } from '../../core/clients/social-interaction.client.js';
import type { ClientGrpc } from '@nestjs/microservices';
import type { JwtService } from '@volontariapp/auth';
import { UserRoles } from '@volontariapp/shared';
import { of } from 'rxjs';
import {
  INTERACTION_QUERY_SERVICE_NAME,
  PARTICIPATION_QUERY_SERVICE_NAME,
} from '@volontariapp/contracts-nest';
import type { Metadata } from '@grpc/grpc-js';
import { createMock } from '@volontariapp/testing';

describe('SocialInteractionClient', () => {
  let client: SocialInteractionClient;
  let mockClientGrpc: jest.Mocked<ClientGrpc>;
  let mockQueryService: { adminGetUserLikes: jest.Mock };
  let mockParticipationQueryService: {
    adminGetUserWishEvent: jest.Mock;
    getEventParticipants: jest.Mock;
  };
  let mockJwtService: jest.Mocked<JwtService>;

  beforeEach(() => {
    mockQueryService = {
      adminGetUserLikes: jest.fn(),
    };
    mockParticipationQueryService = {
      adminGetUserWishEvent: jest.fn(),
      getEventParticipants: jest.fn(),
    };

    mockClientGrpc = createMock<ClientGrpc>();
    mockClientGrpc.getService
      .mockReturnValueOnce(mockQueryService)
      .mockReturnValueOnce(mockParticipationQueryService);

    mockJwtService = createMock<JwtService>();
    mockJwtService.signInternal.mockResolvedValue('mock-jwt-token');

    client = new SocialInteractionClient(mockClientGrpc, mockJwtService);

    const mockLogger = {
      log: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
    Object.defineProperty(client, 'logger', { value: mockLogger });

    client.onModuleInit();
  });

  it('should initialize query services on module init', () => {
    expect(mockClientGrpc.getService).toHaveBeenCalledWith(
      INTERACTION_QUERY_SERVICE_NAME,
    );
    expect(mockClientGrpc.getService).toHaveBeenCalledWith(
      PARTICIPATION_QUERY_SERVICE_NAME,
    );
  });

  it('should sign internal token and query adminGetUserLikes with pagination 1, 1', async () => {
    mockQueryService.adminGetUserLikes.mockReturnValue(
      of({
        ids: ['post-1'],
        pagination: {
          total: 12,
          page: 1,
          limit: 1,
          totalPages: 12,
        },
      }),
    );

    const total = await client.getUserLikesCount('user-123');

    expect(total).toBe(12);
    expect(mockJwtService.signInternal).toHaveBeenCalledWith({
      id: 'pp-user',
      role: UserRoles.ADMIN,
    });
    expect(mockQueryService.adminGetUserLikes).toHaveBeenCalledWith(
      {
        userId: 'user-123',
        pagination: { page: 1, limit: 1 },
      },
      expect.any(Object),
    );

    const calledMetadata = mockQueryService.adminGetUserLikes.mock
      .calls[0][1] as Metadata;
    expect(calledMetadata.get('x-internal-token')).toEqual(['mock-jwt-token']);
  });

  it('should return 0 when pagination or total is missing in response for likes', async () => {
    mockQueryService.adminGetUserLikes.mockReturnValue(
      of({
        ids: [],
        pagination: undefined,
      }),
    );

    const total = await client.getUserLikesCount('user-123');

    expect(total).toBe(0);
  });

  it('should sign internal token and query adminGetUserWishEvent with pagination 1, 1', async () => {
    mockParticipationQueryService.adminGetUserWishEvent.mockReturnValue(
      of({
        ids: ['event-1'],
        pagination: {
          total: 10,
          page: 1,
          limit: 1,
          totalPages: 10,
        },
      }),
    );

    const total = await client.getUserWishEventsCount('user-123');

    expect(total).toBe(10);
    expect(mockJwtService.signInternal).toHaveBeenCalledWith({
      id: 'pp-user',
      role: UserRoles.ADMIN,
    });
    expect(
      mockParticipationQueryService.adminGetUserWishEvent,
    ).toHaveBeenCalledWith(
      {
        userId: 'user-123',
        pagination: { page: 1, limit: 1 },
      },
      expect.any(Object),
    );

    const calledMetadata = mockParticipationQueryService.adminGetUserWishEvent
      .mock.calls[0][1] as Metadata;
    expect(calledMetadata.get('x-internal-token')).toEqual(['mock-jwt-token']);
  });

  it('should return 0 when pagination or total is missing in response for wishes', async () => {
    mockParticipationQueryService.adminGetUserWishEvent.mockReturnValue(
      of({
        ids: [],
        pagination: undefined,
      }),
    );

    const total = await client.getUserWishEventsCount('user-123');

    expect(total).toBe(0);
  });

  it('should reuse cached token across consecutive calls', async () => {
    mockQueryService.adminGetUserLikes.mockReturnValue(
      of({
        ids: [],
        pagination: { total: 5 },
      }),
    );

    await client.getUserLikesCount('user-1');
    await client.getUserLikesCount('user-2');

    expect(mockJwtService.signInternal).toHaveBeenCalledTimes(1);
    expect(mockQueryService.adminGetUserLikes).toHaveBeenCalledTimes(2);
  });

  describe('getAllEventParticipantIds', () => {
    it('should paginate through all pages and collect unique participant IDs', async () => {
      mockParticipationQueryService.getEventParticipants
        .mockReturnValueOnce(
          of({
            ids: ['user-1', 'user-2'],
            pagination: { page: 1, limit: 50, total: 3, totalPages: 2 },
          }),
        )
        .mockReturnValueOnce(
          of({
            ids: ['user-3', 'user-2'], // includes duplicate user-2
            pagination: { page: 2, limit: 50, total: 3, totalPages: 2 },
          }),
        );

      const participantIds =
        await client.getAllEventParticipantIds('event-abc');

      expect(participantIds).toEqual(['user-1', 'user-2', 'user-3']);
      expect(
        mockParticipationQueryService.getEventParticipants,
      ).toHaveBeenCalledTimes(2);
      expect(
        mockParticipationQueryService.getEventParticipants,
      ).toHaveBeenNthCalledWith(
        1,
        {
          eventId: 'event-abc',
          pagination: { page: 1, limit: 50 },
        },
        expect.any(Object),
      );
      expect(
        mockParticipationQueryService.getEventParticipants,
      ).toHaveBeenNthCalledWith(
        2,
        {
          eventId: 'event-abc',
          pagination: { page: 2, limit: 50 },
        },
        expect.any(Object),
      );
    });

    it('should return empty array if no participants found', async () => {
      mockParticipationQueryService.getEventParticipants.mockReturnValueOnce(
        of({
          ids: [],
          pagination: { page: 1, limit: 50, total: 0, totalPages: 1 },
        }),
      );

      const participantIds =
        await client.getAllEventParticipantIds('event-xyz');

      expect(participantIds).toEqual([]);
    });
  });
});
