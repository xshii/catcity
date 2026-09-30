import { describe, expect, it } from 'vitest';
import { CAT_BREED_IDS } from '../../src/content/breeds';
import { APPEARANCE_OPTIONS, CAT_DEFINITIONS } from '../../src/content/cats';
import { BUILDINGS, buildingPrice } from '../../src/content/city';
import {
  ARRIVAL_MINUTES,
  MAX_RESIDENTS,
  RESIDENT_NAMES,
} from '../../src/content/residents';
import {
  createWorld,
  loadWorld,
  residentIdentity,
  World,
  type Position,
} from '../../src/core';
import { advance, invite } from '../helpers/world';

// Residents (spec 041 R-40 – R-42, R-46; design 6): the NPC cats of the lodges.

/** Owned plots of the seed 42 starter district that touch its roads. */
const PLOTS: Position[] = [
  { x: 4, y: 4 },
  { x: 6, y: 4 },
  { x: 4, y: 3 },
  { x: 6, y: 3 },
  { x: 4, y: 6 },
  { x: 6, y: 6 },
];
const rich = () =>
  new World({ ...createWorld(42).getSnapshot(), coins: 100_000 });
function build(
  world: World,
  position: Position,
  buildingType: 'CAT_LODGE' | 'CAT_APARTMENT' | 'CAT_CAFE' = 'CAT_LODGE',
): string {
  expect(
    world.dispatch({ type: 'BUILD_BUILDING', buildingType, position }).ok,
  ).toBe(true);
  return world.getSnapshot().buildings.at(-1)!.id;
}
/** Game minutes until the next day starts. */
const untilDayStart = (world: World) =>
  ARRIVAL_MINUTES - (world.getSnapshot().minute % ARRIVAL_MINUTES);
const residents = (world: World) => world.getSnapshot().residents;
const homes = (world: World) => residents(world).map(({ home }) => home);
const arrivals = (result: ReturnType<typeof advance>) =>
  result.ok
    ? result.events.filter((event) => event.type === 'ResidentArrived')
    : [];

describe('the lodge (R-40)', () => {
  it('houses four residents, no companion, and costs 3000 × 1.6^(n−1)', () => {
    expect(BUILDINGS.CAT_LODGE.residentCapacity).toBe(4);
    expect(BUILDINGS.CAT_LODGE.homeCapacity).toBe(0);
    // 3000 × 1.6^n to the nearest 5 (spec 041 T-31): 12288 → 12290, 19660.8 → 19660,
    // 31457.28 → 31455.
    expect(
      Array.from({ length: 6 }, (_, existing) =>
        buildingPrice('CAT_LODGE', existing),
      ),
    ).toEqual([3000, 4800, 7680, 12290, 19660, 31455]);
  });

  it('takes no companion: not as a home, not as a bed for a newcomer', () => {
    const world = rich();
    const lodge = build(world, PLOTS[0]!);
    const before = world.save();
    expect(
      world.dispatch({
        type: 'ASSIGN_HOME',
        catId: 'mochi',
        buildingId: lodge,
      }),
    ).toEqual({ ok: false, error: 'HOME_NOT_FOUND' });
    expect(
      world.dispatch({ type: 'INVITE_CAT', definitionId: 'PEPPER' }),
    ).toEqual({ ok: false, error: 'NO_BED' });
    expect(world.save()).toBe(before);
  });
});

describe('residents move in by themselves (R-41)', () => {
  it('one at the start of each game day, the first the day after the lodge', () => {
    const world = rich();
    const lodge = build(world, PLOTS[0]!);
    expect(residents(world)).toEqual([]);
    expect(arrivals(advance(world, untilDayStart(world) - 1))).toEqual([]);
    expect(residents(world)).toEqual([]);
    expect(arrivals(advance(world, 1))).toEqual([
      { type: 'ResidentArrived', minute: 1440, entityId: 'resident-1' },
    ]);
    expect(residents(world)).toEqual([
      { id: 'resident-1', home: lodge, arrivedMinute: 1440 },
    ]);
    // Nobody else that day; the next comes as the next day starts.
    advance(world, ARRIVAL_MINUTES - 1);
    expect(residents(world)).toHaveLength(1);
    advance(world, 1);
    expect(
      residents(world).map(({ id, arrivedMinute }) => [id, arrivedMinute]),
    ).toEqual([
      ['resident-1', 1440],
      ['resident-2', 2880],
    ]);
  });

  it('stops coming once the lodges are full, and never leaves', () => {
    const world = rich();
    const lodge = build(world, PLOTS[0]!);
    advance(world, untilDayStart(world) + 3 * ARRIVAL_MINUTES);
    expect(homes(world)).toEqual([lodge, lodge, lodge, lodge]);
    const full = residents(world);
    const later = advance(world, 5 * ARRIVAL_MINUTES);
    expect(arrivals(later)).toEqual([]);
    expect(residents(world)).toEqual(full);
    // A second lodge takes the next one.
    const second = build(world, PLOTS[1]!);
    advance(world, untilDayStart(world));
    expect(homes(world)).toEqual([lodge, lodge, lodge, lodge, second]);
  });

  it('fills the oldest lodge with room first, one a day across the city', () => {
    const world = rich();
    const [first, second] = [build(world, PLOTS[0]!), build(world, PLOTS[1]!)];
    advance(world, untilDayStart(world) + 5 * ARRIVAL_MINUTES);
    expect(homes(world)).toEqual([first, first, first, first, second, second]);
  });

  it('brings at most sixteen to the city, however many lodges have room (R-46)', () => {
    expect(MAX_RESIDENTS).toBe(16);
    const world = rich();
    const lodges = PLOTS.slice(0, 5).map((plot) => build(world, plot));
    advance(world, untilDayStart(world) + 20 * ARRIVAL_MINUTES);
    expect(residents(world).map(({ id }) => id)).toEqual(
      Array.from({ length: 16 }, (_, index) => `resident-${index + 1}`),
    );
    expect(homes(world).filter((home) => home === lodges[4])).toEqual([]);
    expect(arrivals(advance(world, 3 * ARRIVAL_MINUTES))).toEqual([]);
  });

  it('arrive the same whether time passes at once or in pieces, around each day start', () => {
    const world = rich();
    build(world, PLOTS[0]!);
    build(world, PLOTS[1]!);
    const start = world.save();
    const whole = loadWorld(start);
    const pieces = loadWorld(start);
    // From 07:00: to 23:59, onto midnight, a day less a minute, past midnight, and on.
    const steps = [1019, 1, 1439, 2, 7, 1431, 60, 3000, 1, 1];
    for (const minutes of steps) expect(advance(pieces, minutes).ok).toBe(true);
    const total = steps.reduce((sum, minutes) => sum + minutes, 0);
    expect(advance(whole, total).ok).toBe(true);
    expect(residents(whole)).toHaveLength(5);
    expect(pieces.save()).toBe(whole.save());
  });

  it('follow their lodge when it moves', () => {
    const world = rich();
    const lodge = build(world, PLOTS[0]!);
    advance(world, untilDayStart(world) + ARRIVAL_MINUTES);
    const before = residents(world);
    expect(before).toHaveLength(2);
    expect(
      world.dispatch({
        type: 'MOVE_BUILDING',
        buildingId: lodge,
        position: PLOTS[1]!,
      }).ok,
    ).toBe(true);
    expect(residents(world)).toEqual(before);
    expect(
      world.getSnapshot().buildings.find(({ id }) => id === lodge)!.position,
    ).toEqual(PLOTS[1]);
    advance(world, untilDayStart(world));
    expect(homes(world)).toEqual([lodge, lodge, lodge]);
    expect(loadWorld(world.save()).save()).toBe(world.save());
  });
});

describe('a resident is no companion', () => {
  it('neither fishes, is petted, chats nor walks, and takes no companion place', () => {
    const world = rich();
    build(world, PLOTS[0]!);
    advance(world, untilDayStart(world));
    const before = world.save();
    const catId = residents(world)[0]!.id;
    for (const command of [
      {
        type: 'FISH_BEGIN',
        catId,
        baitId: 'BREAD',
        direction: 0,
        aimDepth: 50,
        spotId: 'POND',
      },
      { type: 'PET_CAT', catId, strokes: [{ tick: 0, spot: 'HEAD' }] },
      { type: 'INTERACT', catId, message: '你好', reply: '喵' },
      { type: 'WALK_CAT', catId, destination: { x: 4, y: 7 } },
    ])
      expect(world.dispatch(command)).toEqual({
        ok: false,
        error: 'CAT_NOT_FOUND',
      });
    expect(world.save()).toBe(before);
    expect(world.getSnapshot().cats.map(({ id }) => id)).toEqual(['mochi']);
    // Companions still come by invitation beside them.
    expect(invite(world).definitionId).toBe('PEPPER');
  });
});

describe('who a resident is comes from the seed (R-42)', () => {
  const SEEDS = Array.from({ length: 200 }, (_, seed) => seed * 7919);
  const IDS = Array.from(
    { length: MAX_RESIDENTS },
    (_, index) => `resident-${index + 1}`,
  );

  it('is the same every time for the same seed and id', () => {
    for (const id of IDS)
      expect(residentIdentity(42, id)).toEqual(residentIdentity(42, id));
    expect(
      new Set(
        SEEDS.slice(0, 10).map((seed) => residentIdentity(seed, IDS[0]!).name),
      ).size,
    ).toBeGreaterThan(1);
  });

  it('is only ever made of legal choices, and every choice turns up', () => {
    const seen = {
      breed: new Set<string>(),
      sex: new Set<string>(),
      ...Object.fromEntries(
        Object.keys(APPEARANCE_OPTIONS).map((item) => [
          item,
          new Set<string>(),
        ]),
      ),
    } as Record<string, Set<string>>;
    const items = Object.keys(APPEARANCE_OPTIONS).sort().join();
    // Every resident that breaks a rule, listed once at the end: one check, not thousands.
    const illegal: unknown[] = [];
    for (const seed of SEEDS)
      for (const id of IDS) {
        const identity = residentIdentity(seed, id);
        const { name, breed, sex, appearance } = identity;
        if (
          !(RESIDENT_NAMES as readonly string[]).includes(name) ||
          !(CAT_BREED_IDS as readonly string[]).includes(breed) ||
          !['F', 'M'].includes(sex) ||
          Object.keys(appearance).sort().join() !== items ||
          Object.entries(appearance).some(
            ([item, choice]) =>
              !(
                APPEARANCE_OPTIONS[
                  item as keyof typeof APPEARANCE_OPTIONS
                ] as readonly string[]
              ).includes(choice),
          )
        )
          illegal.push({ seed, id, identity });
        for (const [item, choice] of Object.entries(appearance))
          seen[item]!.add(choice);
        seen.breed!.add(breed);
        seen.sex!.add(sex);
      }
    expect(illegal).toEqual([]);
    expect([...seen.breed!].sort()).toEqual([...CAT_BREED_IDS].sort());
    expect([...seen.sex!].sort()).toEqual(['F', 'M']);
    for (const [item, options] of Object.entries(APPEARANCE_OPTIONS))
      expect([...seen[item]!].sort()).toEqual([...options].sort());
  });

  it('gives the residents of one city sixteen different names, none a companion’s', () => {
    const companions = Object.values(CAT_DEFINITIONS).map(({ name }) => name);
    expect(new Set(RESIDENT_NAMES).size).toBe(RESIDENT_NAMES.length);
    expect(RESIDENT_NAMES.length).toBeGreaterThanOrEqual(MAX_RESIDENTS);
    for (const name of RESIDENT_NAMES) {
      expect(name.length).toBeGreaterThanOrEqual(1);
      expect(name.length).toBeLessThanOrEqual(12);
      expect(companions).not.toContain(name);
    }
    for (const seed of SEEDS) {
      const names = IDS.map((id) => residentIdentity(seed, id).name);
      expect(new Set(names).size).toBe(MAX_RESIDENTS);
    }
  });
});
