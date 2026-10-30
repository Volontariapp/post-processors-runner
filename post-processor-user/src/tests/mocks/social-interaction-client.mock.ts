import { jest } from '@jest/globals';
import type {
  ISocialInteractionClient,
  EventAttendeeInfo,
} from '../../core/clients/social-interaction.client.js';

export function createMockSocialInteractionClient(): jest.Mocked<ISocialInteractionClient> {
  return {
    getUserLikesCount: jest.fn<() => Promise<number>>(),
    getUserWishEventsCount: jest.fn<() => Promise<number>>(),
    getAllEventParticipantIds:
      jest.fn<(eventId: string) => Promise<string[]>>(),
    getAllEventAttendees:
      jest.fn<(eventId: string) => Promise<EventAttendeeInfo[]>>(),
  };
}
