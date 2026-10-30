import type { EventAttendeeInfo } from '../../core/clients/social-interaction.client.js';

const BASE_REGISTRATION_MS = Date.parse('2026-06-01T10:00:00Z');
const REGISTRATION_STEP_MS = 5 * 60 * 1000;

export function createCheckedInAttendees(count: number): EventAttendeeInfo[] {
  return Array.from({ length: count }, (_, index) => ({
    userId: `user-${String(index + 1)}`,
    registeredAt: new Date(BASE_REGISTRATION_MS + index * REGISTRATION_STEP_MS),
    checkedIn: true,
  }));
}
