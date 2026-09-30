import { describe, expect, it } from 'vitest';
import { BOND_LEVELS } from '../../src/content/care';
import { createWorld } from '../../src/core/world';
import type { CatEntity, WorldState } from '../../src/core';
import { rosterScreen } from '../../src/view/cats/screen';
import { fullCity, invite } from '../helpers/world';

// Spec 041 T-12 (ui-design 5.1): the cats panel's roster.

const city = fullCity().getSnapshot();
const pair = (() => {
  const world = createWorld(42);
  invite(world);
  return world.getSnapshot();
})();
const [mochi, pepper] = pair.cats as [CatEntity, CatEntity];
const change = (world: WorldState, id: string, fields: Partial<CatEntity>) => ({
  ...world,
  cats: world.cats.map((cat) => (cat.id === id ? { ...cat, ...fields } : cat)),
});

describe('the roster (ui-design 5.1)', () => {
  it('has a row per cat in the order they came, up to the ten companions', () => {
    const rows = rosterScreen(city, null, false);
    expect(rows.map((row) => row.id)).toEqual(city.cats.map((cat) => cat.id));
    expect(rows).toHaveLength(10);
  });

  it('shows each cat’s name, sex, generation, mood, bond and energy', () => {
    const [row] = rosterScreen(pair, mochi.id, false);
    expect(row).toMatchObject({
      name: 'Mochi',
      sex: { mark: '♀', label: '母' },
      generation: '一代目',
      energy: `体力 ${mochi.needs.energy}`,
      energyValue: mochi.needs.energy,
      mood: { text: '😺 平静', label: '心情：平静' },
      bond: {
        text: '♡♡♡♡ 初识',
        label: `关系：初识，距「${BOND_LEVELS[1].name}」还差 ${BOND_LEVELS[1].bond}`,
      },
    });
    expect(rosterScreen(pair, mochi.id, false)[1]!.sex).toEqual({
      mark: '♂',
      label: '公',
    });
  });

  it('names the generation as R-34 writes it', () => {
    const later = change(pair, mochi.id, { generation: 2 });
    expect(rosterScreen(later, null, false)[0]!.generation).toBe('二代目');
    const fifth = change(pair, mochi.id, { generation: 5 });
    expect(rosterScreen(fifth, null, false)[0]!.generation).toBe('五代目');
  });

  it('marks the selected cat, the one on the rod during a run, else the first', () => {
    const marked = (world: WorldState, selected: string | null) =>
      rosterScreen(world, selected, false)
        .filter((row) => row.pressed)
        .map((row) => row.id);
    expect(marked(pair, pepper.id)).toEqual([pepper.id]);
    expect(marked(pair, null)).toEqual([mochi.id]);
    expect(marked(pair, 'gone')).toEqual([mochi.id]);
    const fishing = createWorld(42);
    invite(fishing);
    const begun = fishing.dispatch({
      type: 'FISH_BEGIN',
      catId: 'mochi',
      spotId: 'POND',
      baitId: 'BREAD',
      direction: 0,
      aimDepth: 50,
    });
    expect(begun.ok).toBe(true);
    const run = fishing.getSnapshot();
    expect(marked(run, pepper.id)).toEqual([mochi.id]);
    // A run holds the companion: no row picks another cat meanwhile.
    expect(
      rosterScreen(run, pepper.id, false).every((row) => row.disabled),
    ).toBe(true);
    expect(rosterScreen(pair, null, false).some((row) => row.disabled)).toBe(
      false,
    );
  });
});
