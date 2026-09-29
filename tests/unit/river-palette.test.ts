import { expect, it } from 'vitest';
import { riverBackdrop } from '../../src/view/art/river-palette';
import { WATER_VIEW } from '../../src/view/art/water-view';

const at = (y: number) =>
  `calc(var(--river-top) + var(--river-side) * ${y / WATER_VIEW.size})`;

it('continues the art around it: sky, the far bank at its strip, then the dock', () => {
  const pond = riverBackdrop('POND');
  expect(pond).toContain(`#c9d8b5 ${at(WATER_VIEW.horizonY - 26)}`);
  expect(pond).toContain(`#bfa47c ${at(WATER_VIEW.nearY)}`);
  // The coast has no far bank but sand in front of the dock.
  const coast = riverBackdrop('COAST');
  expect(coast).not.toContain('#c9d8b5');
  expect(coast).toContain(`#e9d5ac ${at(WATER_VIEW.nearY - 18)}`);
});

it('tints the moon lake like the art, except the dock', () => {
  const moon = riverBackdrop('MOON');
  expect(moon).not.toContain('#eaf0de');
  expect(moon).toMatch(/#bfa47c calc/);
});
