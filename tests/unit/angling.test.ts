import { advance, invite } from '../helpers/world';
import {
  fishingFixture as createWorld,
  finishWalk,
  holdTicks,
  ticksFor,
} from './fishing-fixture';
import { describe, expect, it } from 'vitest';
import { loadWorld } from '../../src/core/world';
import { FISHING, fishById, skillXp, SPOTS } from '../../src/content/fishing';
import {
  castAngling,
  greenZone,
  initialAngling,
  stepAngling,
} from '../../src/minigames/angling';

function play(world: ReturnType<typeof createWorld>, chargeTicks = 23) {
  const run = world.getSnapshot().fishing.active!;
  for (let i = 0; i < 600 && world.getSnapshot().fishing.active; i++) {
    const now = world.getSnapshot().fishing.active!;
    const zone = greenZone(now);
    const pressed =
      now.phase === 'charge'
        ? now.tick < chargeTicks
        : now.phase === 'hook'
          ? now.cursor >= zone.low && now.cursor <= zone.high
          : now.phase === 'fight'
            ? now.tension < (zone.low + zone.high) / 2
            : false;
    expect(
      world.dispatch({
        type: 'FISH_CONTROL',
        runId: run.id,
        pressed,
        ticks: ticksFor(now, chargeTicks),
      }).ok,
    ).toBe(true);
  }
}

describe('skill-based angling', () => {
  it('derives a real catch from control inputs, fills the atlas, then sells exactly once', () => {
    const world = createWorld(42);
    expect(
      world.dispatch({
        spotId: 'POND',
        aimDepth: 50,

        type: 'FISH_BEGIN',
        catId: 'mochi',
        baitId: 'BREAD',
        direction: -30,
      }).ok,
    ).toBe(true);
    // Preparing is free; the cast itself costs stamina (owner, 2026-09-29).
    expect(world.getSnapshot().cats[0]!.needs.energy).toBe(100);
    play(world);
    const state = world.getSnapshot();
    expect(state.fishing.active).toBeNull();
    expect(state.fishing.lastResult!.caught).toBe(true);
    expect(state.fishing.inventory).toHaveLength(1);
    const fish = state.fishing.inventory[0]!;
    expect(state.fishing.atlas[fish.speciesId].count).toBe(1);
    expect(state.cats[0]!.fishingMemory!.speciesId).toBe(fish.speciesId);
    expect(world.dispatch({ type: 'SELL_FISH', fishId: fish.id }).ok).toBe(
      true,
    );
    expect(world.getSnapshot().coins).toBe(
      1000 + fishById(fish.speciesId).price,
    );
    const before = world.save();
    expect(world.dispatch({ type: 'SELL_FISH', fishId: fish.id }).ok).toBe(
      false,
    );
    expect(world.save()).toBe(before);
    expect(world.getSnapshot().fishing.atlas[fish.speciesId].count).toBe(1);
  });

  it('charges stamina and bait when the button run is cast, never when preparing or cancelling', () => {
    const world = createWorld(42);
    const begin = () =>
      world.dispatch({
        spotId: 'POND',
        aimDepth: 50,
        type: 'FISH_BEGIN',
        catId: 'mochi',
        baitId: 'WORM',
        direction: -30,
      });
    const worms = world.getSnapshot().fishing.baits.WORM;
    expect(begin().ok).toBe(true);
    const control = (pressed: boolean) =>
      world.dispatch({
        type: 'FISH_CONTROL',
        runId: world.getSnapshot().fishing.active!.id,
        pressed,
        ticks: 1,
      });
    // Holding to charge is still free.
    for (let i = 0; i < 10; i++) expect(control(true).ok).toBe(true);
    expect(world.getSnapshot().cats[0]!.needs.energy).toBe(100);
    expect(world.getSnapshot().fishing.baits.WORM).toBe(worms);
    // Cancelling before the cast costs nothing.
    const runId = world.getSnapshot().fishing.active!.id;
    expect(world.dispatch({ type: 'FISH_CANCEL', runId }).ok).toBe(true);
    expect(world.getSnapshot().cats[0]!.needs.energy).toBe(100);
    // Releasing the charge casts and pays once.
    expect(begin().ok).toBe(true);
    for (let i = 0; i < 10; i++) control(true);
    expect(control(false).ok).toBe(true);
    const cast = world.getSnapshot();
    expect(cast.fishing.active!.phase).not.toBe('charge');
    expect(cast.cats[0]!.needs.energy).toBe(100 - FISHING.cast.staminaCost);
    expect(cast.fishing.baits.WORM).toBe(worms - 1);
    control(false);
    expect(world.getSnapshot().cats[0]!.needs.energy).toBe(
      100 - FISHING.cast.staminaCost,
    );
  });

  it('rejects forged results, missing bait and exhaustion atomically; recovers with simulation time', () => {
    const world = createWorld(1);
    const save = JSON.parse(world.save());
    save.world.cats[0].needs.energy = 7;
    const tired = loadWorld(JSON.stringify(save));
    const before = tired.save();
    expect(
      tired.dispatch({
        spotId: 'POND',
        aimDepth: 50,

        type: 'FISH_BEGIN',
        catId: 'mochi',
        baitId: 'BREAD',
        direction: 0,
      }).ok,
    ).toBe(false);
    expect(tired.save()).toBe(before);
    // An hour idle: the cat recovers by itself.
    advance(tired, 60);
    expect(tired.getSnapshot().cats[0]!.needs.energy).toBe(37);
    expect(
      tired.dispatch({
        spotId: 'POND',
        aimDepth: 50,

        type: 'FISH_BEGIN',
        catId: 'mochi',
        baitId: 'BREAD',
        direction: 0,
      }).ok,
    ).toBe(true);
    const run = tired.getSnapshot().fishing.active!;
    expect(
      tired.dispatch({
        type: 'FISH_CONTROL',
        runId: run.id,
        pressed: true,
        ticks: 999,
        score: 100,
      }).ok,
    ).toBe(false);
    expect(tired.dispatch({ type: 'FISH_CANCEL', runId: run.id }).ok).toBe(
      true,
    );
    expect(tired.getSnapshot().fishing.inventory).toEqual([]);
    save.world.cats[0].needs.energy = 100;
    save.world.fishing.baits.WORM = 0;
    const empty = loadWorld(JSON.stringify(save));
    const emptyBefore = empty.save();
    expect(
      empty.dispatch({
        spotId: 'POND',
        aimDepth: 50,

        type: 'FISH_BEGIN',
        catId: 'mochi',
        baitId: 'WORM',
        direction: 0,
      }).ok,
    ).toBe(false);
    expect(empty.save()).toBe(emptyBefore);
  });

  it('preserves partial control simulation through save/load and deterministic continuation', () => {
    const a = createWorld(42);
    a.dispatch({
      spotId: 'POND',
      aimDepth: 50,

      type: 'FISH_BEGIN',
      catId: 'mochi',
      baitId: 'BREAD',
      direction: -30,
    });
    const run = a.getSnapshot().fishing.active!;
    a.dispatch({
      type: 'FISH_CONTROL',
      runId: run.id,
      pressed: true,
      ticks: 4,
    });
    const b = loadWorld(a.save());
    play(a);
    play(b);
    expect(a.getSnapshot()).toEqual(b.getSnapshot());
  });

  it('lets two cats have different favorite fish and consumes gifted fish once', () => {
    const world = createWorld(42);
    invite(world);
    expect(
      world.dispatch({ type: 'INVITE_CAT', definitionId: 'PEPPER' }).ok,
    ).toBe(false);
    const pepper = world
      .getSnapshot()
      .cats.find((cat) => cat.definitionId === 'PEPPER')!;
    expect(pepper.favoriteFish).not.toEqual(
      world.getSnapshot().cats[0]!.favoriteFish,
    );
    world.dispatch({
      spotId: 'POND',
      aimDepth: 50,

      type: 'FISH_BEGIN',
      catId: 'mochi',
      baitId: 'BREAD',
      direction: -30,
    });
    play(world);
    const fish = world.getSnapshot().fishing.inventory[0]!;
    expect(
      world.dispatch({ type: 'GIFT_FISH', fishId: fish.id, catId: 'mochi' }).ok,
    ).toBe(true);
    expect(world.getSnapshot().cats[0]!.fishGift!.speciesId).toBe(
      fish.speciesId,
    );
    expect(world.getSnapshot().fishing.inventory).toHaveLength(0);
    expect(
      world.dispatch({ type: 'GIFT_FISH', fishId: fish.id, catId: pepper.id })
        .ok,
    ).toBe(false);
  });

  it('makes rare fish harder and records failed hooks without giving a fish', () => {
    const basic = initialAngling({
      happy: false,
      mode: 'buttons',
      catBreed: 'RAGDOLL',
      spotId: 'POND',
      aimDepth: 50,

      id: 'angling-1',
      catId: 'mochi',
      seed: 42,
      baitId: 'BREAD',
      direction: -30,
      skillLevel: 1,
    });
    const hard = {
      ...basic,
      phase: 'fight' as const,
      speciesId: 'MOON_CARP' as const,
    };
    const easy = { ...hard, speciesId: 'SILVER' as const };
    expect(greenZone(hard).high - greenZone(hard).low).toBeLessThan(
      greenZone(easy).high - greenZone(easy).low,
    );
    let run = stepAngling(basic, true, 4);
    run = stepAngling(run, false, 1);
    for (let i = 0; i < 600 && !['caught', 'escaped'].includes(run.phase); i++)
      run = stepAngling(run, false, 1);
    expect(run.phase).toBe('escaped');
    expect(run.reason).toBe('missed-hook');
  });
});

it('makes every motion cast steady, and a button cast only when released in the band', () => {
  const run = (mode: 'motion' | 'buttons') =>
    initialAngling({
      happy: false,
      mode,
      catBreed: 'RAGDOLL',
      spotId: 'POND',
      aimDepth: 50,
      id: 'angling-1',
      catId: 'mochi',
      seed: 42,
      baitId: 'BREAD',
      direction: 0,
      skillLevel: 1,
    });
  const { min, max } = FISHING.cast.precisionPower;
  for (let power = 0; power <= FISHING.input.maxPower; power++) {
    // Motion casts no longer depend on the power band (spec 033 F5b).
    expect(castAngling(run('motion'), power).precision).toBe(true);
    expect(castAngling(run('buttons'), power).precision).toBe(
      power >= min && power <= max,
    );
  }
});

it('unlocks distinct waterways through skill and discoveries, with real bait/direction conditions', () => {
  let world = createWorld(42);
  const before = world.save();
  expect(
    world.dispatch({
      aimDepth: 50,

      type: 'FISH_BEGIN',
      catId: 'mochi',
      baitId: 'BREAD',
      direction: 0,
      spotId: 'REEDS',
    }),
  ).toEqual({ ok: false, error: 'SPOT_LOCKED' });
  expect(world.save()).toBe(before);
  const catchAt = (
    spotId: 'POND' | 'REEDS' | 'MOON',
    baitId: 'BREAD' | 'WORM' | 'SHRIMP',
    direction: number,
  ) => {
    advance(world, 60);
    if (world.getSnapshot().cats[0]!.fishingSpotId !== spotId)
      expect(
        world.dispatch({
          type: 'TRAVEL_TO_FISHING_SPOT',
          catId: 'mochi',
          spotId,
        }).ok,
      ).toBe(true);
    finishWalk(world);
    expect(
      world.dispatch({
        aimDepth: 50,

        type: 'FISH_BEGIN',
        catId: 'mochi',
        baitId,
        direction,
        spotId,
      }).ok,
    ).toBe(true);
    play(world);
    expect(world.getSnapshot().fishing.lastResult!.caught).toBe(true);
    return world.getSnapshot().fishing.lastResult!.speciesId;
  };
  const travel = (spotId: 'REEDS' | 'MOON') =>
    world.dispatch({ type: 'TRAVEL_TO_FISHING_SPOT', catId: 'mochi', spotId });
  expect(catchAt('POND', 'BREAD', -30)).toBe('SILVER');
  expect(catchAt('POND', 'BREAD', 30)).toBe('CRUCIAN');
  catchAt('POND', 'BREAD', 0);
  // Two species are not enough: the reeds also take the skill of a fourth catch.
  expect(travel('REEDS')).toEqual({ ok: false, error: 'SPOT_LOCKED' });
  catchAt('POND', 'BREAD', 0);
  expect(catchAt('REEDS', 'WORM', 0)).toBe('PERCH');
  expect(catchAt('REEDS', 'SHRIMP', 30)).toBe('CATFISH');
  // Four species are not enough for the moon lake: its skill takes many more catches
  // (tests/simulation/pacing). This save is one catch short of it.
  expect(travel('MOON')).toEqual({ ok: false, error: 'SPOT_LOCKED' });
  const practised = JSON.parse(world.save());
  practised.world.fishing.xp = skillXp(SPOTS.MOON.level) - 1;
  world = loadWorld(JSON.stringify(practised));
  expect(travel('MOON')).toEqual({ ok: false, error: 'SPOT_LOCKED' });
  catchAt('REEDS', 'WORM', 0);
  expect(catchAt('MOON', 'WORM', -30)).toBe('KOI');
  expect(world.getSnapshot().fishing.atlas.KOI.count).toBe(1);
  const restored = loadWorld(world.save());
  expect(restored.getSnapshot()).toEqual(world.getSnapshot());
});

it('does not award fish for timeout, extreme tension, cancellation or replayed final input', () => {
  const world = createWorld(9);
  world.dispatch({
    spotId: 'POND',
    aimDepth: 50,

    type: 'FISH_BEGIN',
    catId: 'mochi',
    baitId: 'WORM',
    direction: 0,
  });
  const id = world.getSnapshot().fishing.active!.id;
  world.dispatch({ type: 'FISH_CONTROL', runId: id, pressed: true, ticks: 4 });
  for (let i = 0; i < 180; i++)
    world.dispatch({
      type: 'FISH_CONTROL',
      runId: id,
      pressed: false,
      ticks: 1,
    });
  expect(world.getSnapshot().fishing.lastResult!.caught).toBe(false);
  expect(world.getSnapshot().fishing.inventory).toEqual([]);
  expect(world.getSnapshot().fishing.baits.WORM).toBe(5);
  const before = world.save();
  expect(
    world.dispatch({ type: 'FISH_CONTROL', runId: id, pressed: true, ticks: 1 })
      .ok,
  ).toBe(false);
  expect(world.save()).toBe(before);
  let run = initialAngling({
    happy: false,
    mode: 'buttons',
    catBreed: 'RAGDOLL',
    spotId: 'POND',
    aimDepth: 50,

    id: 'angling-1',
    catId: 'mochi',
    seed: 1,
    baitId: 'BREAD',
    direction: 0,
    skillLevel: 1,
  });
  run = {
    ...run,
    phase: 'fight',
    speciesId: 'SILVER',
    hasHeld: true,
    weight: 100,
  };
  for (let i = 0; i < 100; i++) run = stepAngling(run, true, 1);
  expect(run.reason).toBe('line-break');
});

it('records fish lengths in the bag and atlas, preserving the longest record after selling and reloading', () => {
  const world = createWorld(42);
  const lengths: number[] = [];
  for (let n = 0; n < 4; n++) {
    world.dispatch({
      spotId: 'POND',
      aimDepth: 50,

      type: 'FISH_BEGIN',
      catId: 'mochi',
      baitId: 'BREAD',
      direction: -30,
    });
    play(world);
    const fish = world.getSnapshot().fishing.inventory.at(-1)!;
    lengths.push(fish.lengthMm);
    expect(fish.lengthMm).toBeGreaterThanOrEqual(
      fishById('SILVER').minLengthMm,
    );
    expect(fish.lengthMm).toBeLessThanOrEqual(fishById('SILVER').maxLengthMm);
    world.dispatch({ type: 'SELL_FISH', fishId: fish.id });
  }
  expect(
    loadWorld(world.save()).getSnapshot().fishing.atlas.SILVER.bestLengthMm,
  ).toBe(Math.max(...lengths));
  const corrupt = JSON.parse(world.save());
  corrupt.world.fishing.atlas.SILVER.bestLengthMm = 99999;
  expect(() => loadWorld(JSON.stringify(corrupt))).toThrow();
});

it('hooks canned food and coin bags through real inputs without adding fish records', () => {
  const found = new Set<string>();
  for (let seed = 1; seed <= 40; seed++) {
    const world = createWorld(seed * 1000039);
    world.dispatch({
      spotId: 'POND',
      aimDepth: 50,

      type: 'FISH_BEGIN',
      catId: 'mochi',
      baitId: 'BREAD',
      direction: 0,
    });
    // The catch kind is fixed at the cast; only supply catches need a full run.
    const runId = world.getSnapshot().fishing.active!.id;
    holdTicks(world, runId, true, 6);
    holdTicks(world, runId, false, 1);
    if (world.getSnapshot().fishing.active!.catchKind === 'fish') {
      expect(world.dispatch({ type: 'FISH_CANCEL', runId }).ok).toBe(true);
      continue;
    }
    play(world, 6);
    const result = world.getSnapshot().fishing.lastResult!;
    expect(result.caught).toBe(true);
    if (result.catchKind === 'fish') continue;
    expect(world.getSnapshot().fishing.supplies.trash).toBe(0);
    found.add(result.catchKind);
    expect(world.getSnapshot().fishing.inventory).toEqual([]);
    expect(
      Object.values(world.getSnapshot().fishing.atlas).every(
        (record) => record.count === 0,
      ),
    ).toBe(true);
    expect(world.getSnapshot().cats[0]!.fishingMemory).toBeNull();
    // Supplies are not a shared catch: the bond stays (spec 036).
    expect(world.getSnapshot().cats[0]!.playerBond).toBe(0);
    if (result.catchKind === 'coins') {
      expect(world.getSnapshot().coins).toBe(1000 + result.lootAmount);
      expect(world.getSnapshot().fishing.supplies.coinBags).toBe(1);
    } else {
      const type = 'USE_CAN' as const;
      expect(world.dispatch({ type, catId: 'mochi' }).ok).toBe(true);
      expect(world.getSnapshot().cats[0]!.needs.energy).toBe(
        result.catchKind === 'can' ? 100 : 92,
      );
      expect(world.getSnapshot().coins).toBe(1000);
      const before = world.save();
      expect(world.dispatch({ type, catId: 'mochi' }).ok).toBe(false);
      expect(world.save()).toBe(before);
    }
    const before = world.save();
    expect(
      world.dispatch({
        type: 'FISH_CONTROL',
        runId: result.runId,
        pressed: true,
        ticks: 1,
      }).ok,
    ).toBe(false);
    expect(world.save()).toBe(before);
    expect(loadWorld(world.save()).getSnapshot()).toEqual(world.getSnapshot());
  }
  expect([...found].sort()).toEqual(['can', 'coins']);
});
