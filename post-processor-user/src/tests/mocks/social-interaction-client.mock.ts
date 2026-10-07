import { jest } from '@jest/globals';
import type { ISocialInteractionClient } from '../../core/clients/social-interaction.client.js';

export function createMockSocialInteractionClient(): jest.Mocked<ISocialInteractionClient> {
  return {
    getUserLikesCount: jest.fn<() => Promise<number>>(),
  };
}
