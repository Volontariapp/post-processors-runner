import { describe, it, expect } from '@jest/globals';
import { booleanFlag } from '../../config/helpers/boolean-flag.helpers.js';

describe('booleanFlag', () => {
  const read = (value: unknown): boolean =>
    booleanFlag('enabled')({ obj: { enabled: value } });

  it('reads the text of an environment variable, not its truthiness', () => {
    expect(read('false')).toBe(false);
    expect(read('true')).toBe(true);
  });

  it('keeps a boolean from a JSON config file', () => {
    expect(read(true)).toBe(true);
    expect(read(false)).toBe(false);
  });
});
