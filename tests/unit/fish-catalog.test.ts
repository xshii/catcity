import { fishingFixture as createWorld } from './fishing-fixture';
import { expect, it } from 'vitest';
import { CAT_BREED_IDS } from '../../src/content/breeds';
import {
  BAIT_IDS,
  FISH,
  SPOT_IDS,
  SPOTS,
  fishById,
  fishHabitats,
  type FishId,
} from '../../src/content/fishing';
import {
  initialAngling,
  greenZone,
  stepAngling,
} from '../../src/minigames/angling';

it('reports distinct freshwater and sea habitats without exposing mutable distribution data', () => {
  expect(fishHabitats('SILVER')).toEqual(['POND', 'REEDS']);
  expect(fishHabitats('CRUCIAN')).toEqual(['POND', 'REEDS', 'MOON']);
  expect(fishHabitats('PERCH')).toEqual(['REEDS', 'MOON']);
  expect(fishHabitats('CATFISH')).toEqual(['REEDS']);
  expect(fishHabitats('KOI')).toEqual(['MOON']);
  expect(fishHabitats('MOON_CARP')).toEqual(['MOON']);
  expect(fishHabitats('MACKEREL')).toEqual(['COAST']);
  expect(fishHabitats('SEA_BREAM')).toEqual(['COAST']);
  const habitats = fishHabitats('SILVER');
  habitats.pop();
  expect(fishHabitats('SILVER')).toEqual(['POND', 'REEDS']);
});

it.each(SPOT_IDS)(
  '%s encounters match its declared fish pool and species lengths across inputs',
  (spotId) => {
    const observed = new Set<FishId>();
    for (const seed of [1, 42, 20260927, 0xffffffff])
      for (const catBreed of CAT_BREED_IDS)
        for (const baitId of BAIT_IDS)
          for (let direction = -45; direction <= 45; direction++)
            for (const chargeTicks of [1, 18, 32]) {
              let run = initialAngling({
                aimDepth: 50,

                id: 'angling-1',
                catId: 'cat-1',
                seed,
                catBreed,
                baitId,
                direction,
                spotId,
                skillLevel: 4,
              });
              for (let tick = 0; tick < chargeTicks; tick++)
                run = stepAngling(run, true, 1);
              run = stepAngling(run, false, 1);
              if (run.catchKind !== 'fish') {
                expect(run.speciesId).toBeNull();
                expect(run.lengthMm).toBe(0);
                continue;
              }
              expect(run.speciesId).not.toBeNull();
              const species = run.speciesId!;
              observed.add(species);
              expect(SPOTS[spotId].fish).toContain(species);
              expect(fishHabitats(species)).toContain(spotId);
              const fish = fishById(species);
              expect(Number.isInteger(run.lengthMm)).toBe(true);
              expect(run.lengthMm).toBeGreaterThanOrEqual(fish.minLengthMm);
              expect(run.lengthMm).toBeLessThanOrEqual(fish.maxLengthMm);
            }
    expect([...observed].sort()).toEqual([...SPOTS[spotId].fish].sort());
  },
);

it('covers every tier from zero through five, with tighter controls at higher tiers', () => {
  expect([...new Set(FISH.map((fish) => fish.stars))].sort()).toEqual([
    0, 1, 2, 3, 4, 5,
  ]);
  const widths = new Map<number, number>();
  for (const fish of FISH) {
    const run = {
      ...initialAngling({
        catBreed: 'RAGDOLL',
        spotId: 'POND',
        aimDepth: 50,

        id: 'angling-1',
        catId: 'cat-1',
        seed: 42,
        baitId: 'BREAD',
        direction: 0,
        skillLevel: 1,
      }),
      phase: 'fight' as const,
      speciesId: fish.id,
    };
    const zone = greenZone(run);
    const width = zone.high - zone.low;
    if (widths.has(fish.stars)) expect(width).toBe(widths.get(fish.stars));
    widths.set(fish.stars, width);
    for (const skillLevel of [1, 5, 10])
      for (let phaseTick = 0; phaseTick < 200; phaseTick++) {
        const z = greenZone({ ...run, skillLevel, phaseTick });
        expect(z.low).toBeGreaterThanOrEqual(0);
        expect(z.high).toBeLessThanOrEqual(100);
      }
  }
  for (let stars = 1; stars <= 5; stars++)
    expect(widths.get(stars)!).toBeLessThan(widths.get(stars - 1)!);
});

it('restricts exclusive encounters by breed and generates reproducible fish lengths', () => {
  const catches = new Map<string, Set<string>>();
  for (const catBreed of ['RAGDOLL', 'BRITISH_SHORTHAIR'] as const) {
    const species = new Set<string>();
    catches.set(catBreed, species);
    for (const seed of Array.from({ length: 40 }, (_, i) => i + 1)) {
      for (const baitId of ['WORM', 'SHRIMP'] as const) {
        let run = initialAngling({
          aimDepth: 50,

          id: 'angling-1',
          catId: 'cat-1',
          seed,
          baitId,
          direction: baitId === 'WORM' ? -30 : 30,
          skillLevel: 4,
          spotId: 'MOON',
          catBreed,
        });
        for (let i = 0; i < 24; i++) run = stepAngling(run, true, 1);
        run = stepAngling(run, false, 1);
        species.add(run.speciesId!);
        const def = fishById(run.speciesId!);
        expect(run.lengthMm).toBeGreaterThanOrEqual(def.minLengthMm);
        expect(run.lengthMm).toBeLessThanOrEqual(def.maxLengthMm);
      }
    }
  }
  expect(catches.get('RAGDOLL')!.has('KOI')).toBe(true);
  expect(catches.get('RAGDOLL')!.has('MOON_CARP')).toBe(false);
  expect(catches.get('BRITISH_SHORTHAIR')!.has('MOON_CARP')).toBe(true);
  expect(catches.get('BRITISH_SHORTHAIR')!.has('KOI')).toBe(false);
});

it('takes the breed from the persistent cat and rejects forged breed context', async () => {
  const { loadWorld } = await import('../../src/core/world');
  const world = createWorld(42);
  const before = world.save();
  expect(
    world.dispatch({
      spotId: 'POND',
      aimDepth: 50,

      type: 'FISH_BEGIN',
      catId: 'mochi',
      baitId: 'BREAD',
      direction: 0,
      catBreed: 'BRITISH_SHORTHAIR',
    }).ok,
  ).toBe(false);
  expect(world.save()).toBe(before);
  world.dispatch({
    spotId: 'POND',
    aimDepth: 50,

    type: 'FISH_BEGIN',
    catId: 'mochi',
    baitId: 'BREAD',
    direction: 0,
  });
  expect(world.getSnapshot().fishing.active!.catBreed).toBe('RAGDOLL');
  const corrupt = JSON.parse(world.save());
  corrupt.world.fishing.active.catBreed = 'BRITISH_SHORTHAIR';
  expect(() => loadWorld(JSON.stringify(corrupt))).toThrow();
});
