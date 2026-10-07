import type { BadgeModel } from '@volontariapp/domain-user';
import type { IBadgePayload } from '@volontariapp/messaging';

export function createBadgeModel(overrides: Partial<BadgeModel> = {}): BadgeModel {
  return {
    id: 'badge-uuid-1',
    name: 'Bâtisseur·se',
    slug: 'EVENT_HOST_COUNT_1',
    description: 'Créer 1 événement',
    iconPath: '/icons/builder.svg',
    userBadges: [],
    ...overrides,
  };
}

export function createBadgePayload(overrides: Partial<IBadgePayload> = {}): IBadgePayload {
  return {
    id: 'badge-uuid-1',
    name: 'Bâtisseur·se',
    slug: 'EVENT_HOST_COUNT_1',
    description: 'Créer 1 événement',
    iconPath: '/icons/builder.svg',
    ...overrides,
  };
}
