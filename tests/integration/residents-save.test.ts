import { expect, it } from 'vitest';
import { ARRIVAL_MINUTES } from '../../src/content/residents';
import { createWorld, loadWorld, World } from '../../src/core';
import type { WorldState } from '../../src/core';
import { advance } from '../helpers/world';

// Residents are saved as the least there is to know (spec 041 R-42, design 6.1): who they
// are follows from the seed; a save cannot make one up or put one where none could be.

/** A lodge of four, one of two and an apartment on seed 42; it is day 7. */
function lodgedCity() {
  const world = new World({
    ...createWorld(42).getSnapshot(),
    coins: 100_000,
  });
  for (const [buildingType, position] of [
    ['CAT_LODGE', { x: 4, y: 4 }],
    ['CAT_LODGE', { x: 6, y: 4 }],
    ['CAT_APARTMENT', { x: 4, y: 3 }],
  ] as const)
    expect(
      world.dispatch({ type: 'BUILD_BUILDING', buildingType, position }).ok,
    ).toBe(true);
  expect(advance(world, 6 * ARRIVAL_MINUTES).ok).toBe(true);
  return world;
}

it('saves each resident as its id, home and arrival, and restores them exactly', () => {
  const world = lodgedCity();
  const save = JSON.parse(world.save());
  expect(save.world.residents).toHaveLength(6);
  for (const resident of save.world.residents)
    expect(Object.keys(resident).sort()).toEqual([
      'arrivedMinute',
      'home',
      'id',
    ]);
  const loaded = loadWorld(world.save());
  expect(loaded.save()).toBe(world.save());
  // A reload carries on as if nothing happened.
  advance(world, 3 * ARRIVAL_MINUTES);
  advance(loaded, 3 * ARRIVAL_MINUTES);
  expect(loaded.save()).toBe(world.save());
  expect(world.getSnapshot().residents).toHaveLength(8);
});

it('rejects every resident a save makes up', () => {
  const world = lodgedCity();
  const base = JSON.parse(world.save());
  const [lodge, second, apartment] = base.world.buildings.map(
    ({ id }: { id: string }) => id,
  );
  expect(() => loadWorld(JSON.stringify(base))).not.toThrow();
  const tamper = (change: (world: WorldState) => void) => {
    const copy = structuredClone(base);
    change(copy.world);
    return () => loadWorld(JSON.stringify(copy));
  };
  const last = (state: WorldState) => state.residents.at(-1)!;
  /** One more resident, come as the next day started; the clock is a day on. */
  const another = (state: WorldState, home: string) => {
    state.residents.push({
      id: `resident-${state.residents.length + 1}`,
      home,
      arrivedMinute: last(state).arrivedMinute + ARRIVAL_MINUTES,
    });
    state.minute += ARRIVAL_MINUTES;
  };
  // The lodge of two takes one more: each change below breaks one rule only.
  expect(tamper((state) => another(state, second))).not.toThrow();
  for (const change of [
    // A home that is not there, or is not a lodge.
    (state: WorldState) => (last(state).home = 'building-99'),
    (state: WorldState) => (last(state).home = apartment),
    // A fifth in a lodge of four.
    (state: WorldState) => another(state, lodge),
    // Arriving later than now: the next day has not started.
    (state: WorldState) => (last(state).arrivedMinute += ARRIVAL_MINUTES),
    // Arriving but at the start of a day, or two on one day.
    (state: WorldState) => (last(state).arrivedMinute -= 1),
    (state: WorldState) =>
      (last(state).arrivedMinute = state.residents.at(-2)!.arrivedMinute),
    // Out of the order of arrival, or numbered otherwise.
    (state: WorldState) => state.residents.reverse(),
    (state: WorldState) => (last(state).id = 'resident-9'),
    (state: WorldState) => (last(state).id = 'cat-1'),
    // Anything more than its three facts.
    (state: WorldState) =>
      Object.assign(last(state), { name: '年年', breedId: 'RAGDOLL' }),
    (state: WorldState) => Reflect.deleteProperty(last(state), 'arrivedMinute'),
    (state: WorldState) => Reflect.deleteProperty(state, 'residents'),
  ])
    expect(tamper(change)).toThrow();
});

it('holds at most sixteen residents (R-46)', () => {
  const save = JSON.parse(createWorld(42).save());
  const lodges = Array.from({ length: 5 }, (_, index) => ({
    id: `building-${index + 1}`,
    type: 'CAT_LODGE',
    position: [
      { x: 4, y: 4 },
      { x: 6, y: 4 },
      { x: 4, y: 3 },
      { x: 6, y: 3 },
      { x: 4, y: 6 },
    ][index]!,
    builtAtMinute: 0,
  }));
  save.world.buildings = lodges;
  save.world.nextId = 6;
  save.world.minute = 30 * ARRIVAL_MINUTES;
  const residents = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      id: `resident-${index + 1}`,
      home: lodges[Math.floor(index / 4)]!.id,
      arrivedMinute: (index + 1) * ARRIVAL_MINUTES,
    }));
  save.world.residents = residents(16);
  expect(() => loadWorld(JSON.stringify(save))).not.toThrow();
  save.world.residents = residents(17);
  expect(() => loadWorld(JSON.stringify(save))).toThrow();
});
