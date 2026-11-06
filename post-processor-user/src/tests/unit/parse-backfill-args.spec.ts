import { describe, it, expect } from '@jest/globals';
import { parseBackfillArgs } from '../../scripts/parse-backfill-args.js';
import { DEFAULT_BACKFILL_BATCH_SIZE } from '../../core/services/badge-counter-backfill.service.js';

const USER_ID = '123e4567-e89b-42d3-a456-426614174000';

describe('parseBackfillArgs', () => {
  it('should default to a real run over all users', () => {
    expect(parseBackfillArgs([])).toEqual({
      dryRun: false,
      batchSize: DEFAULT_BACKFILL_BATCH_SIZE,
    });
  });

  it('should parse every option', () => {
    expect(
      parseBackfillArgs(['--dry-run', `--user=${USER_ID}`, '--batch-size=50']),
    ).toEqual({ dryRun: true, userId: USER_ID, batchSize: 50 });
  });

  it('should reject an unknown option', () => {
    expect(() => parseBackfillArgs(['--force'])).toThrow(
      'Unknown option "--force"',
    );
  });

  it('should reject a user that is not a UUID', () => {
    expect(() => parseBackfillArgs(['--user=abc'])).toThrow('expected a UUID');
  });

  it.each(['0', '-1', '1001', 'abc', '1.5'])(
    'should reject batch size %s',
    (value) => {
      expect(() => parseBackfillArgs([`--batch-size=${value}`])).toThrow(
        'Invalid --batch-size',
      );
    },
  );
});
