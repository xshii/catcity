import { describe, expect, it } from 'vitest';
import {
  CAT_NAMES,
  NAME_MAX_LENGTH,
  SUGGESTED_NAMES,
} from '../../src/content/names';

// Spec 041 R-16 (design 5.2.1): names, suggested names and renaming.

describe('the names table', () => {
  it('holds about sixty different short names, two or three characters each', () => {
    expect(CAT_NAMES).toHaveLength(60);
    expect(new Set(CAT_NAMES).size).toBe(CAT_NAMES.length);
    for (const name of CAT_NAMES)
      expect([2, 3], name).toContain(Array.from(name).length);
    expect(NAME_MAX_LENGTH).toBe(12);
    expect(SUGGESTED_NAMES).toBe(6);
  });
});
