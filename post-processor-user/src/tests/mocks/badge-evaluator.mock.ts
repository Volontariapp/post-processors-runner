import { jest } from '@jest/globals';
import type { BadgeEvaluator } from '../../core/services/badge-evaluator.service.js';

export function createMockBadgeEvaluator(): jest.Mocked<BadgeEvaluator> {
  return {
    evaluateEventHostBadge: jest.fn(),
  } as unknown as jest.Mocked<BadgeEvaluator>;
}
