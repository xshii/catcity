import { expect, it } from 'vitest';
import { testPorts } from '../../harness/runner/test-ports';

it('gives each checkout its own three ports, clear of the device preview', () => {
  const a = testPorts('/work/catcity-wt1', {});
  const b = testPorts('/work/catcity-wt2', {});
  expect(testPorts('/work/catcity-wt1', {})).toEqual(a);
  expect(a).not.toEqual(b);
  for (const ports of [a, b]) {
    expect(ports.production).toBe(ports.test + 1);
    expect(ports.acceptance).toBe(ports.test + 2);
    expect(ports.test).toBeGreaterThan(4178);
  }
});

it('takes an explicit first port from CAT_CITY_TEST_PORT', () => {
  expect(testPorts('/any', { CAT_CITY_TEST_PORT: '5100' })).toEqual({
    test: 5100,
    production: 5101,
    acceptance: 5102,
  });
});
