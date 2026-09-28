import { advance } from '../helpers/world';
import { greenZone } from '../../src/minigames/angling';
import { shoreTiles, samePosition } from '../../src/core/city/map';
import { createWorld, World } from '../../src/core/world';
import type { WorldState } from '../../src/core/schema';
import type { GameCommand } from '../../src/core/commands';
import { FISHING, type SpotId } from '../../src/content/fishing';
import type { AnglingRun } from '../../src/minigames/angling';

/** Fishing unit tests isolate rod mechanics with a validated, already-at-shore fixture.
 * City/travel tests separately exercise real command-driven walking from the crossroads. */
export function fishingFixture(seed: number): World {
  return catsAtPond(createWorld(seed));
}
export function catsAtPond(world: World): World {
  const state = world.getSnapshot();
  const shores = shoreTiles(state.map, 'POND').filter(
    (position) =>
      !state.buildings.some((building) =>
        samePosition(position, building.position),
      ),
  );
  for (const [index, cat] of state.cats.entries()) {
    cat.position = shores[index]!;
    cat.fishingSpotId = 'POND';
    cat.walk = null;
  }
  return new World(state);
}
export function finishWalk(world: World): void {
  for (
    let n = 0;
    n < 100 && world.getSnapshot().cats.some((cat) => cat.walk);
    n++
  ) {
    const cat = world.getSnapshot().cats.find((cat) => cat.walk)!;
    if (cat.walk!.nextStepMinute === null)
      throw new Error('Test walk cannot progress');
    const result = advance(
      world,
      cat.walk!.nextStepMinute - world.getSnapshot().minute,
    );
    if (!result.ok) throw new Error(result.error);
  }
  if (world.getSnapshot().cats.some((cat) => cat.walk))
    throw new Error('Test walk did not arrive');
}
export function sessionTravel(
  session: {
    getSnapshot(): WorldState;
    execute(command: GameCommand): { ok: boolean };
  },
  spotId: SpotId = 'POND',
): void {
  const state = session.getSnapshot();
  const cat = state.cats[0]!;
  if (
    !cat.walk &&
    shoreTiles(state.map, spotId).some((position) =>
      samePosition(position, cat.position),
    )
  )
    return;
  if (
    !session.execute({ type: 'TRAVEL_TO_FISHING_SPOT', catId: 'mochi', spotId })
      .ok
  )
    throw new Error('Test travel rejected');
  for (let n = 0; n < 100 && session.getSnapshot().cats[0]!.walk; n++) {
    const state = session.getSnapshot();
    const next = state.cats[0]!.walk!.nextStepMinute;
    if (
      next === null ||
      !session.execute({ type: 'ADVANCE_TIME', minutes: next - state.minute })
        .ok
    )
      throw new Error('Test walking rejected');
  }
}

/** Drives current rod controls to a catch, without supplying a result or mutating snapshots. */
export function finishFishing(game: {
  getSnapshot(): WorldState;
  dispatch(command: GameCommand): { ok: boolean };
}): void {
  const active = game.getSnapshot().fishing.active;
  if (!active) throw new Error('No active test fishing run');
  if (
    active.phase === 'charge' &&
    !game.dispatch({ type: 'FISH_CAST', runId: active.id, power: 70 }).ok
  )
    throw new Error('Test cast rejected');
  for (let tick = 0; tick < 600 && game.getSnapshot().fishing.active; tick++) {
    const run = game.getSnapshot().fishing.active!;
    const zone = greenZone(run);
    const pressed =
      run.phase === 'hook'
        ? run.cursor >= zone.low && run.cursor <= zone.high
        : run.phase === 'fight' && run.tension < (zone.low + zone.high) / 2;
    if (
      !game.dispatch({
        type: 'FISH_CONTROL',
        runId: run.id,
        pressed,
        ticks: ticksFor(run),
      }).ok
    )
      throw new Error('Test fishing input rejected');
  }
  if (
    game.getSnapshot().fishing.active ||
    !game.getSnapshot().fishing.lastResult?.caught
  )
    throw new Error('Test fishing did not catch');
}

/**
 * Constant-input stretches batch up to `input.maxTicks` ticks per command; chunked and
 * single ticks give identical state (tests/simulation/angling). Hook and fight need a
 * decision every tick, so they stay at one.
 */
export function ticksFor(run: AnglingRun, chargeTicks?: number): number {
  const max = FISHING.input.maxTicks;
  if (run.phase === 'waiting') return max;
  if (run.phase === 'charge' && chargeTicks !== undefined)
    return run.tick < chargeTicks ? Math.min(max, chargeTicks - run.tick) : max;
  return 1;
}

/** Holds or releases for `ticks` ticks (or until the run settles), batching commands. */
export function holdTicks(
  game: {
    getSnapshot(): WorldState;
    dispatch(command: GameCommand): { ok: boolean };
  },
  runId: string,
  pressed: boolean,
  ticks: number,
): void {
  for (let left = ticks; left > 0 && game.getSnapshot().fishing.active;) {
    const step = Math.min(FISHING.input.maxTicks, left);
    if (
      !game.dispatch({ type: 'FISH_CONTROL', runId, pressed, ticks: step }).ok
    )
      throw new Error('Test fishing input rejected');
    left -= step;
  }
}
