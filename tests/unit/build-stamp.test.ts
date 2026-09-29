import { expect, it } from 'vitest';
import { buildStamp } from '../../harness/runner/build-stamp';

it('stamps a build with its local date and time, sortable as text', () => {
  expect(buildStamp(new Date(2026, 8, 29, 8, 5))).toBe('20260929-0805');
  expect(buildStamp(new Date(2026, 11, 31, 23, 59))).toBe('20261231-2359');
});
