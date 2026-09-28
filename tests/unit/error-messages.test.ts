import { expect, it } from 'vitest';
import { ERROR_MESSAGES } from '../../src/view/shell/errors';

it('gives every Core error a Chinese player message, never the raw code', () => {
  const entries = Object.entries(ERROR_MESSAGES);
  expect(entries.length).toBeGreaterThan(30);
  for (const [code, message] of entries) {
    expect(message, code).toMatch(/[一-鿿]/);
    expect(message, code).not.toMatch(/[A-Z]{2,}_[A-Z_]+/);
  }
});
