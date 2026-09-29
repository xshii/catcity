import { describe, expect, it } from 'vitest';
import {
  BAIT_IDS,
  FISHING,
  fishById,
  SPOT_IDS,
  SPOTS,
  type BaitId,
  type FishId,
  type SpotId,
} from '../../src/content/fishing';
import { fishShadows, loadWorld, type FishShadow } from '../../src/core';
import { shadowAt } from '../../src/core/fishing/shadows';
import {
  castAngling,
  initialAngling,
  stepAngling,
  type AnglingRun,
} from '../../src/minigames/angling';
import {
  fishPath,
  motionBounds,
  motionSchedule,
  ringRadius,
  stepMotionRun,
} from '../../src/minigames/angling-motion';
import { fishingFixture } from './fishing-fixture';

const S = FISHING.shadows;
const at = (seed: number, minute: number) => ({ seed, minute });

describe('fish shadows', () => {
  it('derive a few shadows per spot from the seed and the game hour', () => {
    for (let seed = 1; seed <= 30; seed++)
      for (const spotId of SPOT_IDS) {
        const shadows = fishShadows(at(seed, 125), spotId);
        expect(shadows).toHaveLength(S.count);
        expect(new Set(shadows.map((s) => s.id)).size).toBe(S.count);
        for (const shadow of shadows) {
          expect(SPOTS[spotId].fish).toContain(shadow.speciesId);
          expect(Math.abs(shadow.direction)).toBeLessThanOrEqual(
            S.maxDirection,
          );
          expect(Number.isInteger(shadow.direction)).toBe(true);
          expect(shadow.reach).toBeGreaterThanOrEqual(S.reach.min);
          expect(shadow.reach).toBeLessThanOrEqual(S.reach.max);
          const [low, high] = S.sizes[shadow.size];
          const stars = fishById(shadow.speciesId).stars;
          expect(stars).toBeGreaterThanOrEqual(low);
          expect(stars).toBeLessThanOrEqual(high);
        }
        // The same hour always shows the same shadows.
        expect(fishShadows(at(seed, 120), spotId)).toEqual(shadows);
        expect(fishShadows(at(seed, 179), spotId)).toEqual(shadows);
      }
  });

  it('refresh each game hour and differ between spots and worlds', () => {
    const key = (shadows: FishShadow[]) =>
      JSON.stringify(shadows.map((s) => [s.direction, s.reach, s.speciesId]));
    let sameHour = 0;
    let sameSpot = 0;
    let sameWorld = 0;
    for (let hour = 0; hour < 40; hour++) {
      const now = key(fishShadows(at(7, hour * 60), 'MOON'));
      if (now === key(fishShadows(at(7, hour * 60 + 60), 'MOON'))) sameHour++;
      if (now === key(fishShadows(at(7, hour * 60), 'REEDS'))) sameSpot++;
      if (now === key(fishShadows(at(8, hour * 60), 'MOON'))) sameWorld++;
    }
    expect([sameHour, sameSpot, sameWorld]).toEqual([0, 0, 0]);
  });

  it('come in every size the spot holds, only small ones at the pond', () => {
    const sizes = (spotId: SpotId) =>
      new Set(
        Array.from({ length: 50 }, (_, hour) =>
          fishShadows(at(3, hour * 60), spotId).map((s) => s.size),
        ).flat(),
      );
    expect(sizes('POND')).toEqual(new Set(['small']));
    expect(sizes('COAST')).toEqual(new Set(['medium']));
    expect(sizes('MOON')).toEqual(new Set(['small', 'medium', 'large']));
  });

  it('are read from the world without changing it', () => {
    const world = fishingFixture(42);
    const save = world.save();
    const state = world.getSnapshot();
    expect(fishShadows(state, 'POND')).toEqual(fishShadows(state, 'POND'));
    expect(world.save()).toBe(save);
    expect(JSON.parse(save).world.fishing).not.toHaveProperty('shadows');
  });
});

describe('landing on a shadow', () => {
  const shadow = (
    direction: number,
    reach: number,
    speciesId: FishId = 'SILVER',
  ): FishShadow => ({
    id: 'shadow-0-0',
    direction,
    reach,
    size: 'small',
    speciesId,
  });

  it('meets the nearest shadow within the radius of the landing point', () => {
    const near = shadow(20, 50);
    const nearer = shadow(24, 50, 'CRUCIAN');
    // The landing reach is the mean of the aimed depth and the power.
    const cast = { direction: 25, aimDepth: 40, power: 60 };
    expect(shadowAt([near, nearer], cast)).toBe(nearer);
    expect(shadowAt([near], cast)).toBe(near);
    expect(
      shadowAt([shadow(25, 50 + S.radius)], cast),
      'on the radius',
    ).not.toBeNull();
    expect(shadowAt([shadow(25, 51 + S.radius)], cast)).toBeNull();
    expect(shadowAt([shadow(25 - S.radius - 1, 50)], cast)).toBeNull();
    expect(shadowAt([], cast)).toBeNull();
  });
});

function run(
  input: Partial<Parameters<typeof initialAngling>[0]> = {},
): AnglingRun {
  return initialAngling({
    happy: false,
    id: 'angling-1',
    catId: 'mochi',
    seed: 11,
    baitId: 'WORM',
    direction: 30,
    aimDepth: 50,
    skillLevel: 1,
    spotId: 'POND',
    catBreed: 'RAGDOLL',
    mode: 'motion',
    ...input,
  });
}
const waitTicks = (cast: AnglingRun) => {
  let next = cast;
  while (next.phase === 'waiting') next = stepAngling(next, false, 1);
  return next.tick - cast.tick;
};

describe('a shadow at the landing point', () => {
  it('hooks its fish sooner when the bait and the cat allow it', () => {
    for (let seed = 1; seed <= 20; seed++) {
      // Casting left at the pond would hook silver; the shadow is crucian.
      const plain = castAngling(run({ seed, direction: -30 }), 60, null);
      const taken = castAngling(run({ seed, direction: -30 }), 60, 'CRUCIAN');
      expect(plain.speciesId).toBe('SILVER');
      expect(taken).toMatchObject({ shadow: 'CRUCIAN', speciesId: 'CRUCIAN' });
      // The same fish, arriving without the shadow, bites later.
      const unshaded = (cast: AnglingRun) => ({ ...cast, shadow: null });
      expect(motionSchedule(taken).bite).toBeLessThan(
        motionSchedule(unshaded(taken)).bite,
      );
      const buttons = castAngling(
        run({ seed, direction: -30, mode: 'buttons' }),
        60,
        'CRUCIAN',
      );
      expect(waitTicks(buttons)).toBeLessThan(waitTicks(unshaded(buttons)));
    }
  });

  it('only makes a catch better: a smaller fish than the rules pick is ignored', () => {
    // Casting right at the pond hooks crucian; a silver shadow there changes nothing.
    for (let seed = 1; seed <= 20; seed++)
      for (const mode of ['motion', 'buttons'] as const) {
        const plain = castAngling(run({ seed, mode }), 60, null);
        expect(castAngling(run({ seed, mode }), 60, 'SILVER')).toEqual({
          ...plain,
          shadow: 'SILVER',
        });
      }
    // No cast anywhere hooks fewer stars, or supplies instead of a fish, on a shadow.
    const stars = (cast: AnglingRun) => fishById(cast.speciesId!).stars;
    for (const spotId of SPOT_IDS)
      for (const baitId of BAIT_IDS)
        for (const catBreed of ['RAGDOLL', 'BRITISH_SHORTHAIR'] as const)
          for (const direction of [-30, 0, 30])
            for (const power of [20, 60, 75])
              for (let seed = 1; seed <= 12; seed++) {
                const aim = { spotId, baitId, catBreed, direction, seed };
                const plain = castAngling(run(aim), power, null);
                if (plain.catchKind !== 'fish') continue;
                for (const shadow of SPOTS[spotId].fish) {
                  const shaded = castAngling(run(aim), power, shadow);
                  expect(shaded.catchKind).toBe('fish');
                  expect(stars(shaded)).toBeGreaterThanOrEqual(stars(plain));
                }
              }
  });

  it('sniffs a wrong bait and leaves: the usual fish, later', () => {
    // Koi only take worms; the shrimp keeps the rule's fish at the moon lake.
    const moon = { spotId: 'MOON' as const, baitId: 'SHRIMP' as const };
    for (let seed = 1; seed <= 20; seed++) {
      const plain = castAngling(run({ ...moon, seed }), 60, null);
      const sniffed = castAngling(run({ ...moon, seed }), 60, 'KOI');
      expect(sniffed).toEqual({ ...plain, shadow: 'KOI' });
      expect(motionSchedule(sniffed).bite).toBe(
        motionSchedule(plain).bite + S.sniffTicks,
      );
      const buttons = { ...moon, seed, mode: 'buttons' as const };
      expect(waitTicks(castAngling(run(buttons), 60, 'KOI'))).toBe(
        waitTicks(castAngling(run(buttons), 60, null)) + S.sniffTicks,
      );
    }
  });

  it('keeps the usual rules when the cat cannot catch that fish', () => {
    const moon = { spotId: 'MOON', baitId: 'SHRIMP', seed: 5 } as const;
    // A ragdoll cannot land a moon carp.
    const plain = castAngling(run(moon), 60, null);
    const shadowed = castAngling(run(moon), 60, 'MOON_CARP');
    expect(shadowed).toEqual({ ...plain, shadow: 'MOON_CARP' });
    expect(motionSchedule(shadowed)).toEqual(motionSchedule(plain));
    const shorthair = castAngling(
      run({ ...moon, catBreed: 'BRITISH_SHORTHAIR', direction: -30 }),
      60,
      'MOON_CARP',
    );
    expect(shorthair.speciesId).toBe('MOON_CARP');
  });

  it('brings a fish, not supplies, to a light bread cast', () => {
    const bread = { baitId: 'BREAD' as const };
    const found = Array.from({ length: 40 }, (_, seed) =>
      castAngling(run({ ...bread, seed }), 10, null),
    ).filter((cast) => cast.catchKind !== 'fish');
    expect(found.length).toBeGreaterThan(0);
    for (const cast of found)
      expect(
        castAngling(run({ ...bread, seed: cast.seed }), 10, 'CRUCIAN'),
      ).toMatchObject({ catchKind: 'fish', speciesId: 'CRUCIAN' });
  });

  it('lists the baits each fish takes', () => {
    for (const bait of BAIT_IDS) {
      const takers = (['SILVER', 'CRUCIAN', 'MACKEREL'] as FishId[]).filter(
        (id) => (fishById(id).baits as readonly BaitId[]).includes(bait),
      );
      expect(takers).toHaveLength(3);
    }
    expect(fishById('KOI').baits).toEqual(['WORM']);
    expect(fishById('MOON_CARP').baits).toEqual(['SHRIMP']);
  });

  it('leaves the fight of the same fish unchanged', () => {
    const moon = {
      spotId: 'MOON',
      baitId: 'SHRIMP',
      catBreed: 'BRITISH_SHORTHAIR',
      direction: 30,
    } as const;
    for (let seed = 1; seed <= 40; seed++) {
      const plain = castAngling(run({ ...moon, seed }), 75, null);
      if (plain.speciesId !== 'MOON_CARP') continue;
      const aimed = castAngling(run({ ...moon, seed }), 75, 'MOON_CARP');
      const fight = (cast: AnglingRun) => ({
        ...cast,
        phase: 'fight' as const,
        phaseTick: 50,
        strike: 'good' as const,
      });
      // Everything but the bite: the strike window, hold and time limit.
      const bounds = (cast: AnglingRun) => {
        const b = motionBounds(fight(cast));
        return [b.strikeWindow, b.holdTarget, b.fightLimit, b.startHold];
      };
      expect(bounds(aimed)).toEqual(bounds(plain));
      expect(ringRadius(fight(aimed))).toBe(ringRadius(fight(plain)));
      expect(fishPath(aimed, 330)).toEqual(fishPath(plain, 330));
      expect(aimed.weight).toBe(plain.weight);
    }
  });

  it('advances the same in one step or in chunks', () => {
    const cast = castAngling(run({ seed: 3, direction: -30 }), 60, 'CRUCIAN');
    let one = cast;
    let chunked = cast;
    for (let i = 0; i < 12; i++) {
      one = stepMotionRun(one, null, 4);
      for (let n = 0; n < 4; n++) chunked = stepMotionRun(chunked, null, 1);
      expect(chunked).toEqual(one);
    }
  });
});

describe('casting in Core', () => {
  /** A pond world with a crucian shadow left of the centre line, where silver bites. */
  function pondWithShadow() {
    for (let seed = 1; ; seed++) {
      const world = fishingFixture(seed);
      const target = fishShadows(world.getSnapshot(), 'POND').find(
        (shadow) =>
          shadow.speciesId === 'CRUCIAN' &&
          shadow.direction < -FISHING.encounter.sideDegrees &&
          shadow.reach >= 30 &&
          shadow.reach <= 75,
      );
      if (target) return { world, target };
    }
  }
  const begin = (
    world: ReturnType<typeof fishingFixture>,
    aim: { direction: number; aimDepth: number },
    mode: 'motion' | 'buttons' = 'motion',
  ) => {
    const result = world.dispatch({
      type: 'FISH_BEGIN',
      catId: 'mochi',
      baitId: 'BREAD',
      spotId: 'POND',
      mode,
      ...aim,
    });
    expect(result.ok).toBe(true);
    return world.getSnapshot().fishing.active!.id;
  };

  it('records the shadow a motion cast lands on and hooks its fish', () => {
    const { world, target } = pondWithShadow();
    const aim = {
      direction: target.direction,
      aimDepth: 2 * target.reach - 60,
    };
    const runId = begin(world, aim);
    expect(world.dispatch({ type: 'FISH_CAST', runId, power: 60 }).ok).toBe(
      true,
    );
    const active = world.getSnapshot().fishing.active!;
    expect(active).toMatchObject({ shadow: 'CRUCIAN', speciesId: 'CRUCIAN' });
    const save = world.save();
    expect(loadWorld(save).save()).toBe(save);
  });

  it('records the shadow when a held button charge is released on it', () => {
    const { world, target } = pondWithShadow();
    const aimDepth = 2 * target.reach - 50;
    const runId = begin(
      world,
      { direction: target.direction, aimDepth },
      'buttons',
    );
    // Holding 16 ticks sweeps the power up to 50; release there.
    for (let i = 0; i < 16; i++)
      world.dispatch({ type: 'FISH_CONTROL', runId, pressed: true, ticks: 1 });
    expect(world.getSnapshot().fishing.active!.power).toBe(50);
    world.dispatch({ type: 'FISH_CONTROL', runId, pressed: false, ticks: 1 });
    expect(world.getSnapshot().fishing.active).toMatchObject({
      phase: 'waiting',
      shadow: 'CRUCIAN',
      speciesId: 'CRUCIAN',
    });
  });

  it('records no shadow far from every shadow', () => {
    const { world } = pondWithShadow();
    const shadows = fishShadows(world.getSnapshot(), 'POND');
    const aim = [-45, -30, -15, 0, 15, 30, 45]
      .flatMap((direction) =>
        [0, 50, 100].map((aimDepth) => ({ direction, aimDepth, power: 50 })),
      )
      .find((cast) => shadowAt(shadows, cast) === null)!;
    const runId = begin(world, {
      direction: aim.direction,
      aimDepth: aim.aimDepth,
    });
    world.dispatch({ type: 'FISH_CAST', runId, power: aim.power });
    expect(world.getSnapshot().fishing.active!.shadow).toBeNull();
  });

  it('rejects a save whose shadow does not fit its run', () => {
    const { world, target } = pondWithShadow();
    const runId = begin(world, {
      direction: target.direction,
      aimDepth: 2 * target.reach - 60,
    });
    const charging = JSON.parse(world.save());
    world.dispatch({ type: 'FISH_CAST', runId, power: 60 });
    const cast = JSON.parse(world.save());
    const corrupt = (
      edit: (active: Record<string, unknown>) => void,
      save = cast,
    ) => {
      const copy = structuredClone(save);
      edit(copy.world.fishing.active);
      return JSON.stringify(copy);
    };
    // Charging runs have not landed; shadows must live at the spot; the fish follows it.
    expect(() =>
      loadWorld(corrupt((a) => (a.shadow = 'SILVER'), charging)),
    ).toThrow();
    expect(() => loadWorld(corrupt((a) => (a.shadow = 'MACKEREL')))).toThrow();
    expect(() => loadWorld(corrupt((a) => (a.shadow = null)))).toThrow();
    expect(() => loadWorld(corrupt((a) => delete a.shadow))).toThrow();
  });
});
