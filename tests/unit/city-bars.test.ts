import { expect, it } from 'vitest';
import { barInsets } from '../../src/view/city/bars';

it('measures how far the floating bars reach over the map frame', () => {
  const frame = { top: 0, bottom: 844 };
  expect(
    barInsets(
      frame,
      [
        { top: 8, bottom: 52 },
        { top: 60, bottom: 94 },
      ],
      [{ top: 780, bottom: 834 }],
    ),
  ).toEqual({ top: 94, bottom: 64 });
  // No bars shown: nothing is covered.
  expect(barInsets(frame, [], [])).toEqual({ top: 0, bottom: 0 });
});
