import { createWorld, type CommandResult, type World } from '../../src/core';
import { FISHING, type BaitId, type SpotId } from '../../src/content/fishing';
import { RandomService, runSeed } from '../../src/core/random';
import { greenZone } from '../../src/minigames/angling';

/**
 * Fishing progress played through Core commands, for view and E2E tests that start
 * further on and play only their own step through the page.
 */

function must(result: CommandResult) {
  if (!result.ok) throw new Error(`Progress fixture rejected: ${result.error}`);
}

/** Holds the charge this many ticks: a medium cast. */
const CHARGE_TICKS = 23;

/**
 * One button-flow cast by Mochi with a steady hand; it must land a catch. Stretches of
 * constant input go in batches of `input.maxTicks`, which give the same state as single
 * ticks (tests/simulation/angling); the bite and the fight decide every tick.
 */
function landFish(
  world: World,
  spotId: SpotId,
  baitId: BaitId,
  direction: number,
) {
  must(
    world.dispatch({
      type: 'FISH_BEGIN',
      catId: 'mochi',
      baitId,
      direction,
      spotId,
      aimDepth: 50,
    }),
  );
  const { maxTicks } = FISHING.input;
  for (let step = 0; step < 600; step++) {
    const run = world.getSnapshot().fishing.active;
    if (!run) break;
    const zone = greenZone(run);
    const charging = run.phase === 'charge' && run.tick < CHARGE_TICKS;
    const pressed =
      run.phase === 'charge'
        ? charging
        : run.phase === 'hook'
          ? run.cursor >= zone.low && run.cursor <= zone.high
          : run.phase === 'fight' && run.tension < (zone.low + zone.high) / 2;
    const ticks =
      run.phase === 'waiting'
        ? maxTicks
        : charging
          ? Math.min(maxTicks, CHARGE_TICKS - run.tick)
          : 1;
    must(
      world.dispatch({ type: 'FISH_CONTROL', runId: run.id, pressed, ticks }),
    );
  }
  if (!world.getSnapshot().fishing.lastResult?.caught)
    throw new Error('Progress fixture cast did not land');
}

/** The pond cast `index` of a new game: left of the pond, then right, and so on. */
export const pondDirection = (index: number) =>
  FISHING.input.maxDirection * (index % 2 ? 1 : -1);

/** Mochi walks to a waterway on the city clock until it arrives. */
function walkTo(world: World, spotId: SpotId) {
  must(
    world.dispatch({ type: 'TRAVEL_TO_FISHING_SPOT', catId: 'mochi', spotId }),
  );
  for (
    let minute = 0;
    minute < 120 && world.getSnapshot().cats[0]!.walk;
    minute++
  )
    must(world.dispatch({ type: 'ADVANCE_TIME', minutes: 1 }));
}

/**
 * One playthrough of a new game (seed 42), saved at each point a test starts from: four
 * pond catches (one short of the reeds), the fifth (reeds open), the walk to the reeds,
 * and a perch caught there on worms.
 */
export function progressSaves() {
  const world = createWorld(42);
  for (let cast = 0; cast < 4; cast++)
    landFish(world, 'POND', 'BREAD', pondDirection(cast));
  const oneCatchShort = world.save();
  landFish(world, 'POND', 'BREAD', pondDirection(4));
  const reedsOpen = world.save();
  walkTo(world, 'REEDS');
  const atReeds = world.save();
  landFish(world, 'REEDS', 'WORM', FISHING.input.maxDirection);
  return { oneCatchShort, reedsOpen, atReeds, perchAtReeds: world.save() };
}

/**
 * The save with its next run numbered so that the catch comes out among the longest
 * (or the shortest) twentieth of its species: at the pond a catch's weight, and so its
 * length, is the run's first draw. Tests check the length the catch came out at.
 */
export function withNextCatch(save: string, longest: boolean) {
  const data = JSON.parse(save);
  const draw = (serial: number) =>
    new RandomService(runSeed(data.world.seed, serial)).nextInt(20);
  let serial = data.world.nextId;
  while (draw(serial) !== (longest ? 19 : 0)) serial++;
  data.world.nextId = serial;
  return JSON.stringify(data);
}
