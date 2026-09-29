import { CARE } from '../../src/content/care';
import { CITY_START } from '../../src/content/city';
import { advance, buildCafe } from '../helpers/world';
import { fishingFixture as createWorld, finishWalk } from './fishing-fixture';
import { walkingMinutes } from '../../src/core/city/path';
import { expect, it } from 'vitest';
import {
  FISH,
  SPOT_IDS,
  SPOTS,
  fishById,
  skillXp,
  spotUnlocked,
} from '../../src/content/fishing';
import { loadWorld, type World } from '../../src/core/world';
import {
  greenZone,
  initialAngling,
  stepAngling,
} from '../../src/minigames/angling';

function unlocked() {
  const world = createWorld(42);
  buildCafe(world, { x: 4, y: 4 });
  world.dispatch({ type: 'INVITE_PEPPER' });
  const fixture = JSON.parse(world.save());
  fixture.world.fishing.xp = skillXp(SPOTS.MOON.level);
  fixture.world.cats[1].needs.energy = 50;
  for (const id of ['SILVER', 'CRUCIAN', 'PERCH', 'CATFISH'] as const) {
    const fish = fishById(id);
    fixture.world.fishing.atlas[id] = {
      count: 1,
      bestWeight: fish.minWeight,
      bestLengthMm: fish.minLengthMm,
    };
  }
  return loadWorld(JSON.stringify(fixture));
}

function play(world: World) {
  for (let tick = 0; tick < 600 && world.getSnapshot().fishing.active; tick++) {
    const run = world.getSnapshot().fishing.active!;
    const zone = greenZone(run);
    const pressed =
      run.phase === 'charge'
        ? run.tick < 23
        : run.phase === 'hook'
          ? run.cursor >= zone.low && run.cursor <= zone.high
          : run.phase === 'fight' && run.tension < (zone.low + zone.high) / 2;
    expect(
      world.dispatch({ type: 'FISH_CONTROL', runId: run.id, pressed, ticks: 1 })
        .ok,
    ).toBe(true);
  }
  expect(world.getSnapshot().fishing.lastResult!.caught).toBe(true);
}

it('queues real shore travel, advancing income and idle cats recovery only on the shared clock', () => {
  const world = unlocked();
  advance(world, 20);
  expect(
    world.dispatch({
      type: 'TRAVEL_TO_FISHING_SPOT',
      catId: 'mochi',
      spotId: 'COAST',
    }),
  ).toMatchObject({
    ok: true,
    events: [
      {
        type: 'WalkStarted',
        minute: CITY_START.minute + 20,
        entityId: 'mochi',
      },
    ],
  });
  expect(world.getSnapshot().minute).toBe(CITY_START.minute + 20);
  const queued = world.getSnapshot();
  const route = queued.cats[0]!.walk!.route;
  const duration = route.reduce(
    (sum, position) => sum + walkingMinutes(queued, position),
    0,
  );
  finishWalk(world);
  const state = world.getSnapshot();
  expect(state.minute).toBe(CITY_START.minute + 20 + duration);
  // The game starts on a full hour: income and recovery count from there.
  const elapsed = state.minute - CITY_START.minute;
  expect(state.coins).toBe(700 + 10 * Math.floor(elapsed / 60));
  expect(state.cats.map((cat) => cat.needs.energy)).toEqual([
    // Walking costs a tile each; idle Pepper recovers every tick from the start.
    100 - route.length,
    Math.min(100, 50 + CARE.recovery.idle * Math.floor(elapsed / 10)),
  ]);
  expect(state.cats[0]!.fishingSpotId).toBe('COAST');
  expect(state.cats[1]!.fishingSpotId).toBeNull();
  const loaded = loadWorld(world.save());
  for (const game of [world, loaded]) {
    for (let n = 0; n < 2; n++) {
      expect(
        game.dispatch({
          aimDepth: 50,

          type: 'FISH_BEGIN',
          catId: 'mochi',
          spotId: 'COAST',
          baitId: 'WORM',
          direction: -30,
        }).ok,
      ).toBe(true);
      play(game);
    }
    expect(game.getSnapshot().minute).toBe(state.minute);
  }
  expect(loaded.save()).toBe(world.save());
  expect(world.getSnapshot().fishing.atlas.MACKEREL.count).toBe(2);
  expect(world.getSnapshot().cats[0]!.fishingMemory?.spotId).toBe('COAST');
  expect(
    world.dispatch({
      type: 'TRAVEL_TO_FISHING_SPOT',
      catId: 'mochi',
      spotId: 'REEDS',
    }).ok,
  ).toBe(true);
  expect(world.getSnapshot().minute).toBe(state.minute);
  finishWalk(world);
  expect(world.getSnapshot().minute).toBeGreaterThan(state.minute);
});

it('rejects locked, same-place, unknown-cat and forged-duration travel without mutations', () => {
  const world = createWorld(42);
  const before = world.save();
  for (const [command, error] of [
    [
      { type: 'TRAVEL_TO_FISHING_SPOT', catId: 'mochi', spotId: 'REEDS' },
      'SPOT_LOCKED',
    ],
    [
      { type: 'TRAVEL_TO_FISHING_SPOT', catId: 'mochi', spotId: 'POND' },
      'ALREADY_AT_SPOT',
    ],
    [
      { type: 'TRAVEL_TO_FISHING_SPOT', catId: 'ghost', spotId: 'POND' },
      'CAT_NOT_FOUND',
    ],
    [
      {
        type: 'TRAVEL_TO_FISHING_SPOT',
        catId: 'mochi',
        spotId: 'COAST',
        minutes: 0,
      },
      'INVALID_COMMAND',
    ],
  ] as const) {
    expect(world.dispatch(command)).toEqual({ ok: false, error });
    expect(world.save()).toBe(before);
  }
  const ready = unlocked();
  const unchanged = ready.save();
  expect(
    ready.dispatch({
      aimDepth: 50,

      type: 'FISH_BEGIN',
      catId: 'mochi',
      spotId: 'COAST',
      baitId: 'SHRIMP',
      direction: 30,
    }),
  ).toEqual({ ok: false, error: 'TRAVEL_REQUIRED' });
  expect(ready.save()).toBe(unchanged);
});

it('rejects travel during an active fishing run and rejects clock overflow atomically', () => {
  const world = unlocked();
  const pepper = world.getSnapshot().cats[1]!;
  world.dispatch({
    aimDepth: 50,

    type: 'FISH_BEGIN',
    catId: 'mochi',
    spotId: 'POND',
    baitId: 'BREAD',
    direction: 0,
  });
  const fishing = world.save();
  expect(
    world.dispatch({
      type: 'TRAVEL_TO_FISHING_SPOT',
      catId: 'mochi',
      spotId: 'COAST',
    }),
  ).toEqual({ ok: false, error: 'ALREADY_FISHING' });
  expect(world.save()).toBe(fishing);
  advance(world, 60);
  // Only the fishing cat is busy; like WALK_CAT, other cats may still head out.
  expect(
    world.dispatch({
      type: 'TRAVEL_TO_FISHING_SPOT',
      catId: pepper.id,
      spotId: 'COAST',
    }).ok,
  ).toBe(true);
  const probe = unlocked();
  probe.dispatch({
    type: 'TRAVEL_TO_FISHING_SPOT',
    catId: 'mochi',
    spotId: 'COAST',
  });
  const routeState = probe.getSnapshot();
  const duration = routeState.cats[0]!.walk!.route.reduce(
    (sum, position) => sum + walkingMinutes(routeState, position),
    0,
  );
  const fixture = JSON.parse(unlocked().save());
  fixture.world.minute = 1_000_000_000 - duration + 1;
  const limit = loadWorld(JSON.stringify(fixture));
  const before = limit.save();
  expect(
    limit.dispatch({
      type: 'TRAVEL_TO_FISHING_SPOT',
      catId: 'mochi',
      spotId: 'COAST',
    }),
  ).toEqual({ ok: false, error: 'TIME_LIMIT' });
  expect(limit.save()).toBe(before);
  fixture.world.minute--;
  const boundary = loadWorld(JSON.stringify(fixture));
  expect(
    boundary.dispatch({
      type: 'TRAVEL_TO_FISHING_SPOT',
      catId: 'mochi',
      spotId: 'COAST',
    }).ok,
  ).toBe(true);
  finishWalk(boundary);
  expect(boundary.getSnapshot().minute).toBe(1_000_000_000);
  const richFixture = JSON.parse(unlocked().save());
  richFixture.world.coins = 1_000_000_000;
  // One minute before the next full hour, when income is paid.
  richFixture.world.minute += 59;
  const rich = loadWorld(JSON.stringify(richFixture));
  const richBefore = rich.save();
  expect(
    rich.dispatch({
      type: 'TRAVEL_TO_FISHING_SPOT',
      catId: 'mochi',
      spotId: 'COAST',
    }).ok,
  ).toBe(true);
  expect(rich.getSnapshot().coins).toBe(1_000_000_000);
  expect(rich.save()).not.toBe(richBefore);
  // Income stops at the coin limit; the clock and the queued walk keep going.
  expect(advance(rich, 1).ok).toBe(true);
  expect(rich.getSnapshot()).toMatchObject({
    minute: richFixture.world.minute + 1,
    coins: 1_000_000_000,
  });
});

it('validates destination unlocks and persisted location, including active-run agreement', () => {
  for (const spotId of ['COAST', 'MOON'] as const) {
    const { level, species } = SPOTS[spotId];
    expect(spotUnlocked(spotId, skillXp(level) - 1, species)).toBe(false);
    expect(spotUnlocked(spotId, skillXp(level), species - 1)).toBe(false);
    expect(spotUnlocked(spotId, skillXp(level), species)).toBe(true);
  }
  const locked = JSON.parse(createWorld(42).save());
  locked.world.cats[0].fishingSpotId = 'COAST';
  expect(() => loadWorld(JSON.stringify(locked))).toThrow(
    'Invalid cat fishing location',
  );
  const world = unlocked();
  world.dispatch({
    type: 'TRAVEL_TO_FISHING_SPOT',
    catId: 'mochi',
    spotId: 'COAST',
  });
  finishWalk(world);
  world.dispatch({
    aimDepth: 50,

    type: 'FISH_BEGIN',
    catId: 'mochi',
    spotId: 'COAST',
    baitId: 'WORM',
    direction: -30,
  });
  const moved = JSON.parse(world.save());
  moved.world.cats[0].fishingSpotId = null;
  expect(() => loadWorld(JSON.stringify(moved))).toThrow(
    'Invalid active fishing',
  );
  const missing = JSON.parse(createWorld(42).save());
  delete missing.world.cats[0].fishingSpotId;
  expect(() => loadWorld(JSON.stringify(missing))).toThrow();
});

it('uses distinct freshwater and sea pools with seeded lengths and earns sea catches through inputs', () => {
  expect(FISH).toHaveLength(8);
  for (const spotId of SPOT_IDS) {
    for (const baitId of ['BREAD', 'WORM', 'SHRIMP'] as const) {
      for (const direction of [-30, 30]) {
        const encounter = () => {
          let run = initialAngling({
            happy: false,
            mode: 'buttons',
            aimDepth: 50,

            id: 'angling-1',
            catId: 'mochi',
            catBreed: 'RAGDOLL',
            spotId,
            baitId,
            direction,
            skillLevel: 4,
            seed: 42,
          });
          for (let n = 0; n < 23; n++) run = stepAngling(run, true, 1);
          return stepAngling(run, false, 1);
        };
        const run = encounter();
        expect(encounter()).toEqual(run);
        expect(['MACKEREL', 'SEA_BREAM'].includes(run.speciesId!)).toBe(
          spotId === 'COAST',
        );
      }
    }
  }
  const world = unlocked();
  world.dispatch({
    type: 'TRAVEL_TO_FISHING_SPOT',
    catId: 'mochi',
    spotId: 'COAST',
  });
  finishWalk(world);
  for (const [baitId, direction, species] of [
    ['WORM', -30, 'MACKEREL'],
    ['SHRIMP', 30, 'SEA_BREAM'],
  ] as const) {
    expect(
      world.dispatch({
        aimDepth: 50,

        type: 'FISH_BEGIN',
        catId: 'mochi',
        spotId: 'COAST',
        baitId,
        direction,
      }).ok,
    ).toBe(true);
    play(world);
    expect(world.getSnapshot().fishing.lastResult!.speciesId).toBe(species);
    const fish = world.getSnapshot().fishing.inventory.at(-1)!;
    expect(fish.lengthMm).toBeLessThanOrEqual(fishById(species).maxLengthMm);
    const coins = world.getSnapshot().coins;
    expect(world.dispatch({ type: 'SELL_FISH', fishId: fish.id }).ok).toBe(
      true,
    );
    expect(world.getSnapshot().coins).toBe(coins + fishById(species).price);
  }
});
