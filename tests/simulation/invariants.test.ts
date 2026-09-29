import { describe, expect, it } from 'vitest';
import {
  BUILDING_IDS,
  BUILDINGS,
  CITY_COSTS,
  ROAD_PRICE,
} from '../../src/content/city';
import { BOND } from '../../src/content/care';
import { MOOD } from '../../src/content/mood';
import { BAITS, FISHING, fishById, SPOT_IDS } from '../../src/content/fishing';
import { createWorld, loadWorld } from '../../src/core';
import type { CommandResult, GameCommand, WorldState } from '../../src/core';
import { RandomService } from '../../src/core/random';

/**
 * Core invariants under random command sequences (spec 015 step 2). Random but seeded:
 * every failure reproduces from its seed. Commands are drawn from the whole command set,
 * mostly aimed at things that exist so play goes deep, sometimes at nothing at all.
 */
const SEEDS = 12;
const STEPS = 400;
/** Round-trip the save this often; parsing a save is the slow part. */
const ROUND_TRIP_EVERY = 20;

function commandFor(world: WorldState, rng: RandomService): GameCommand {
  const pick = <T>(items: readonly T[]): T => items[rng.nextInt(items.length)]!;
  const chance = (percent: number) => rng.nextInt(100) < percent;
  const size = world.map.width;
  const position = () =>
    chance(95)
      ? { x: rng.nextInt(size), y: rng.nextInt(size) }
      : { x: size + rng.nextInt(3), y: -1 };
  const catId = () => (chance(90) ? pick(world.cats).id : 'ghost');
  const run = world.fishing.active;
  const runId = () => (run && chance(95) ? run.id : 'ghost');
  const fishId = () =>
    world.fishing.inventory.length && chance(90)
      ? pick(world.fishing.inventory).id
      : 'ghost';
  const buildingId = () =>
    world.buildings.length && chance(90) ? pick(world.buildings).id : 'ghost';
  // While a run is live, mostly play it and rarely give up, so some runs reach their end;
  // otherwise do city things and start runs.
  if (run && chance(70)) {
    if (chance(5)) return { type: 'FISH_CANCEL', runId: runId() };
    return pick<() => GameCommand>([
      () => ({ type: 'FISH_CAST', runId: runId(), power: rng.nextInt(101) }),
      () => ({
        type: 'FISH_CONTROL',
        runId: runId(),
        pressed: chance(50),
        ticks: 1 + rng.nextInt(FISHING.input.maxTicks),
      }),
      () => ({
        type: 'FISH_MOTION_CONTROL',
        runId: runId(),
        x: rng.nextInt(101),
        y: rng.nextInt(101),
        ticks: 1 + rng.nextInt(FISHING.input.maxTicks),
      }),
      () => ({ type: 'FISH_STRIKE', runId: runId() }),
    ])();
  }
  return pick<() => GameCommand>([
    () => ({ type: 'BUY_LAND', position: position() }),
    () => ({ type: 'PLACE_ROAD', position: position() }),
    () => ({ type: 'UPGRADE_ROAD', position: position() }),
    () => ({ type: 'REMOVE_ROAD', position: position() }),
    () => ({
      type: 'BUILD_BUILDING',
      buildingType: pick(BUILDING_IDS),
      position: position(),
    }),
    () => ({
      type: 'MOVE_BUILDING',
      buildingId: buildingId(),
      position: position(),
    }),
    () => ({ type: 'ASSIGN_HOME', catId: catId(), buildingId: buildingId() }),
    () => ({ type: 'WALK_CAT', catId: catId(), destination: position() }),
    () => ({
      type: 'TRAVEL_TO_FISHING_SPOT',
      catId: catId(),
      spotId: pick(SPOT_IDS),
    }),
    () => ({ type: 'USE_CAN', catId: catId() }),
    () => ({ type: 'RECYCLE_TRASH' }),
    () => ({
      type: 'FISH_BEGIN',
      catId: catId(),
      baitId: pick(['BREAD', 'WORM', 'SHRIMP'] as const),
      direction: rng.nextInt(91) - 45,
      aimDepth: rng.nextInt(101),
      spotId: chance(70) ? 'POND' : pick(SPOT_IDS),
      mode: pick(['buttons', 'motion'] as const),
    }),
    () => ({ type: 'SELL_FISH', fishId: fishId() }),
    () => ({ type: 'GIFT_FISH', fishId: fishId(), catId: catId() }),
    () => ({ type: 'BUY_BAIT', baitId: pick(['WORM', 'SHRIMP'] as const) }),
    () => ({ type: 'INVITE_PEPPER' }),
    () => ({
      type: 'ADVANCE_TIME',
      minutes: chance(90) ? rng.nextInt(90) : 600,
    }),
    () => ({ type: 'INTERACT', catId: catId(), message: '你好', reply: '喵' }),
  ])();
}

/** Every coin a command may move, from the rules in content. */
function coinChange(
  before: WorldState,
  after: WorldState,
  command: GameCommand,
  result: CommandResult,
): number {
  if (!result.ok) return 0;
  switch (command.type) {
    case 'BUY_LAND':
      return -CITY_COSTS.buyLand;
    case 'PLACE_ROAD':
      return -CITY_COSTS.placeRoad;
    case 'UPGRADE_ROAD':
      return -CITY_COSTS.upgradeRoad;
    case 'REMOVE_ROAD': {
      const tile = before.map.tiles.find(
        (item) =>
          item.position.x === command.position.x &&
          item.position.y === command.position.y,
      )!;
      return ROAD_PRICE[tile.road!];
    }
    case 'BUILD_BUILDING':
      return -BUILDINGS[command.buildingType].cost;
    case 'BUY_BAIT':
      return -BAITS[command.baitId].price;
    case 'RECYCLE_TRASH':
      return FISHING.supplies.trashCoins;
    case 'SELL_FISH': {
      const fish = before.fishing.inventory.find(
        (item) => item.id === command.fishId,
      )!;
      return fishById(fish.speciesId).price;
    }
    case 'ADVANCE_TIME':
      return result.events.reduce(
        (sum, event) =>
          sum + (event.type === 'IncomeGenerated' ? event.amount : 0),
        0,
      );
    case 'FISH_CONTROL':
    case 'FISH_MOTION_CONTROL':
    case 'FISH_STRIKE':
      // A landed coin bag pays its loot, once.
      return after.fishing.supplies.coinBags > before.fishing.supplies.coinBags
        ? after.fishing.lastResult!.lootAmount
        : 0;
    // A new command must say here whether it moves coins.
    case 'WALK_CAT':
    case 'MOVE_BUILDING':
    case 'ASSIGN_HOME':
    case 'TRAVEL_TO_FISHING_SPOT':
    case 'USE_CAN':
    case 'FISH_BEGIN':
    case 'FISH_CAST':
    case 'FISH_CANCEL':
    case 'GIFT_FISH':
    case 'INVITE_PEPPER':
    case 'INTERACT':
    case 'DEBUG_SPAWN_CAT':
      return 0;
  }
}

/** Whether a command may move a cat's mood (spec 032); every other command must not. */
function moodMayChange(command: GameCommand): boolean {
  switch (command.type) {
    // Hourly drift, exhaustion while walking, chat, a run's end, a gift.
    case 'ADVANCE_TIME':
    case 'INTERACT':
    case 'FISH_CONTROL':
    case 'FISH_MOTION_CONTROL':
    case 'GIFT_FISH':
      return true;
    // A new command must say here whether it moves mood.
    case 'WALK_CAT':
    case 'BUY_LAND':
    case 'BUILD_BUILDING':
    case 'MOVE_BUILDING':
    case 'PLACE_ROAD':
    case 'UPGRADE_ROAD':
    case 'REMOVE_ROAD':
    case 'ASSIGN_HOME':
    case 'TRAVEL_TO_FISHING_SPOT':
    case 'USE_CAN':
    case 'RECYCLE_TRASH':
    case 'FISH_BEGIN':
    case 'FISH_CAST':
    case 'FISH_STRIKE':
    case 'FISH_CANCEL':
    case 'SELL_FISH':
    case 'BUY_BAIT':
    case 'INVITE_PEPPER':
    case 'DEBUG_SPAWN_CAT':
      return false;
  }
}

function checkBounds(world: WorldState) {
  expect(Number.isInteger(world.coins)).toBe(true);
  expect(world.coins).toBeGreaterThanOrEqual(0);
  for (const cat of world.cats) {
    expect(cat.needs.energy).toBeGreaterThanOrEqual(0);
    expect(cat.needs.energy).toBeLessThanOrEqual(100);
    expect(cat.mood).toBeGreaterThanOrEqual(0);
    expect(cat.mood).toBeLessThanOrEqual(100);
  }
  for (const count of Object.values(world.fishing.baits)) {
    expect(count).toBeGreaterThanOrEqual(0);
    expect(count).toBeLessThanOrEqual(FISHING.bait.max);
  }
  expect(world.fishing.inventory.length).toBeLessThanOrEqual(
    FISHING.bag.capacity,
  );
}

/** Even seeds start with tired cats, so walks run out of energy and resume after recovery. */
function startWorld(seed: number) {
  if (seed % 2) return createWorld(seed);
  const save = JSON.parse(createWorld(seed).save());
  for (const cat of save.world.cats) cat.needs.energy = 3;
  return loadWorld(JSON.stringify(save));
}

function play(seed: number) {
  const world = startWorld(seed);
  const rng = new RandomService(seed * 104729);
  const initial = world.save();
  const commands: GameCommand[] = [];
  let accepted = 0;
  let exhaustedWalks = 0;
  /** Which commands moved mood up (+) or down (−). */
  const moodMoves = new Set<string>();
  for (let step = 0; step < STEPS; step++) {
    const before = world.getSnapshot();
    const saved = world.save();
    const command = commandFor(before, rng);
    commands.push(command);
    const result = world.dispatch(command);
    const after = world.getSnapshot();
    const where = `seed ${seed} step ${step} ${JSON.stringify(command)}`;
    if (!result.ok)
      expect(world.save(), `rejected changed the world: ${where}`).toBe(saved);
    else accepted++;
    expect(after.coins - before.coins, `coins: ${where}`).toBe(
      coinChange(before, after, command, result),
    );
    expect(after.minute).toBeGreaterThanOrEqual(before.minute);
    expect(after.nextId).toBeGreaterThanOrEqual(before.nextId);
    checkBounds(after);
    for (const [index, cat] of before.cats.entries()) {
      const change = after.cats[index]!.mood - cat.mood;
      if (!change) continue;
      expect(moodMayChange(command), `mood: ${where}`).toBe(true);
      moodMoves.add(`${command.type}${change > 0 ? '+' : '-'}`);
    }
    // The bond only grows, by its source's points and one more from a happy cat, from
    // chat, a gift or a run's end (specs 036, 038).
    for (const [index, cat] of before.cats.entries()) {
      const grown = after.cats[index]!.playerBond - cat.playerBond;
      if (!grown) continue;
      const points =
        command.type === 'INTERACT'
          ? [BOND.chat]
          : command.type === 'GIFT_FISH'
            ? [BOND.gift, BOND.favoriteGift]
            : ['FISH_CONTROL', 'FISH_MOTION_CONTROL'].includes(command.type)
              ? [BOND.catch]
              : [];
      expect(
        points.map((base) => base + (cat.mood >= MOOD.happy ? BOND.happy : 0)),
        `bond: ${where}`,
      ).toContain(grown);
    }
    // Recovery during a walk only happens once the walk stopped for lack of energy.
    if (result.ok)
      exhaustedWalks += result.events.filter(
        (event) =>
          event.type === 'EnergyRecovered' &&
          before.cats.some((cat) => cat.id === event.entityId && cat.walk),
      ).length;
    if (step % ROUND_TRIP_EVERY === 0) {
      const save = world.save();
      expect(loadWorld(save).save(), `round trip: ${where}`).toBe(save);
    }
  }
  return { world, initial, commands, accepted, exhaustedWalks, moodMoves };
}

describe('Core under random command sequences', () => {
  it.each(Array.from({ length: SEEDS }, (_, i) => i + 1))(
    'seed %i keeps every invariant and replays identically',
    (seed) => {
      const { world, initial, commands, accepted } = play(seed);
      // The generator must reach real play, not only rejections.
      expect(accepted).toBeGreaterThan(STEPS / 5);
      const replay = loadWorld(initial);
      for (const command of commands) replay.dispatch(command);
      expect(replay.save()).toBe(world.save());
    },
  );

  it('reaches walks stopped by exhaustion that go on after recovery', () => {
    // Tired starts must actually exercise the resume path, not just pass by it.
    let stopped = 0;
    for (const seed of [2, 4, 6]) stopped += play(seed).exhaustedWalks;
    expect(stopped).toBeGreaterThan(0);
  });

  it('reaches mood drift both ways, chat and an escape', () => {
    // Random play rarely lands a fish; catch and gift mood are unit-tested (mood.test.ts).
    // Exhaustion while walking shows up as ADVANCE_TIME− alongside drift.
    expect([...play(7).moodMoves].sort()).toEqual([
      'ADVANCE_TIME+',
      'ADVANCE_TIME-',
      'FISH_CONTROL-',
      'INTERACT+',
    ]);
  });

  it('rejects reachable saves once a bounded field is tampered with', () => {
    const { world } = play(99);
    const save = JSON.parse(world.save());
    const tamper = (change: (world: WorldState) => void) => {
      const copy = structuredClone(save);
      change(copy.world);
      return () => loadWorld(JSON.stringify(copy));
    };
    expect(() => loadWorld(JSON.stringify(save))).not.toThrow();
    expect(tamper((state) => (state.coins = -1))).toThrow();
    expect(tamper((state) => (state.cats[0]!.needs.energy = 101))).toThrow();
    expect(tamper((state) => (state.cats[0]!.mood = 101))).toThrow();
    expect(
      tamper((state) => (state.fishing.baits.WORM = FISHING.bait.max + 1)),
    ).toThrow();
    expect(tamper((state) => (state.nextId = 0))).toThrow();
  });
});
