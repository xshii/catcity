import { expect, it } from 'vitest';
import { CITY_TIME } from '../../src/content/city';
import {
  nextClockSpeed,
  readClockSpeed,
} from '../../src/view/shell/clock-speed';

const storage = (value: string | null) => () => ({ getItem: () => value });

it('cycles the city clock 1× → 2× → 4× → 1× on each tap', () => {
  expect(CITY_TIME.speeds).toEqual([1, 2, 4]);
  expect(nextClockSpeed(1)).toBe(2);
  expect(nextClockSpeed(2)).toBe(4);
  expect(nextClockSpeed(4)).toBe(1);
});

it('reads a remembered speed only when it is one of the offered speeds', () => {
  expect(readClockSpeed(storage('4'))).toBe(4);
  expect(readClockSpeed(storage('2'))).toBe(2);
  for (const stored of [null, '', '3', '0', 'fast', '4.0x', '-1'])
    expect(readClockSpeed(storage(stored))).toBe(1);
  expect(
    readClockSpeed(() => ({
      getItem: () => {
        throw new Error('blocked');
      },
    })),
  ).toBe(1);
  // With site data blocked, merely touching `localStorage` throws a SecurityError.
  expect(
    readClockSpeed(() => {
      throw new DOMException('blocked', 'SecurityError');
    }),
  ).toBe(1);
});
