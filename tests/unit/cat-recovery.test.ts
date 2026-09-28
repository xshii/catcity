import { advance, buildCafe } from '../helpers/world';
import { fishingFixture as createWorld, catsAtPond } from './fishing-fixture';
import { expect, it } from 'vitest';
import { loadWorld } from '../../src/core/world';
import { CARE } from '../../src/content/care';

const R = CARE.recovery;
const tired = (energy: number, seed = 42) => {
  const fixture = JSON.parse(createWorld(seed).save());
  fixture.world.cats[0].needs.energy = energy;
  return loadWorld(JSON.stringify(fixture));
};
const begin = (world: ReturnType<typeof tired>, catId: string) =>
  world.dispatch({
    type: 'FISH_BEGIN',
    catId,
    spotId: 'POND',
    baitId: 'BREAD',
    direction: 0,
    aimDepth: 50,
  });

it('recovers an idle cat on the shared clock, every tick of the recovery rate', () => {
  const world = tired(60);
  advance(world, R.tickMinutes - 1);
  expect(world.getSnapshot().cats[0]!.needs.energy).toBe(60);
  advance(world, 1);
  expect(world.getSnapshot().cats[0]!.needs.energy).toBe(60 + R.idle);
  // An hour idle outdoors: six ticks.
  advance(world, 50);
  expect(world.getSnapshot().cats[0]!.needs.energy).toBe(60 + 6 * R.idle);
});

// Faster recovery beside the home apartment: city-loop.test.ts.
it('does not recover a cat that is fishing, even before its cast, or walking', () => {
  const world = tired(50);
  world.dispatch({ type: 'INVITE_PEPPER' });
  const game = catsAtPond(world);
  const pepper = game.getSnapshot().cats[1]!;
  expect(begin(game, 'mochi').ok).toBe(true);
  advance(game, 60);
  // Mochi holds a prepared run the whole hour; Pepper stays full.
  expect(game.getSnapshot().cats.map((cat) => cat.needs.energy)).toEqual([
    50,
    pepper.needs.energy,
  ]);
  game.dispatch({
    type: 'FISH_CANCEL',
    runId: game.getSnapshot().fishing.active!.id,
  });
  advance(game, R.tickMinutes);
  expect(game.getSnapshot().cats[0]!.needs.energy).toBe(50 + R.idle);
});

it('lets a tired cat be sent anywhere at once: there is no rest to wait out', () => {
  const world = tired(30);
  advance(world, R.tickMinutes);
  expect(begin(world, 'mochi').ok).toBe(true);
});

it('keeps fishing input ticks off the shared clock', () => {
  const world = tired(20);
  expect(begin(world, 'mochi').ok).toBe(true);
  const runId = world.getSnapshot().fishing.active!.id;
  for (let tick = 0; tick < 40; tick++)
    world.dispatch({ type: 'FISH_CONTROL', runId, pressed: true, ticks: 4 });
  expect(world.getSnapshot().minute).toBe(0);
});

it('reports recovery only when energy rises, and chunked time equals minute steps', () => {
  const world = tired(92);
  buildCafe(world, { x: 4, y: 4 });
  const stepwise = loadWorld(world.save());
  const result = world.dispatch({ type: 'ADVANCE_TIME', minutes: 60 });
  if (!result.ok) throw new Error(result.error);
  // 92 → 97 → 100; later ticks change nothing and stay silent.
  expect(
    result.events.filter((event) => event.type === 'EnergyRecovered'),
  ).toHaveLength(2);
  for (let minute = 0; minute < 60; minute++) advance(stepwise, 1);
  expect(stepwise.getSnapshot()).toEqual(world.getSnapshot());
  expect(loadWorld(world.save()).getSnapshot()).toEqual(world.getSnapshot());
});

it('feeds canned food to the specified cat only, with atomic rejection and no shared stamina pool', () => {
  const fixture = JSON.parse(createWorld(8).save());
  fixture.world.cats[0].needs.energy = 30;
  fixture.world.fishing.supplies.cans = 1;
  let world = loadWorld(JSON.stringify(fixture));
  world.dispatch({ type: 'INVITE_PEPPER' });
  world = catsAtPond(world);
  const before = world.save();
  expect(world.dispatch({ type: 'USE_CAN', catId: 'missing' }).ok).toBe(false);
  expect(world.save()).toBe(before);
  expect(world.dispatch({ type: 'USE_CAN', catId: 'mochi' }).ok).toBe(true);
  expect(world.getSnapshot().cats.map((cat) => cat.needs.energy)).toEqual([
    50, 100,
  ]);
  expect(world.getSnapshot().fishing).not.toHaveProperty('stamina');
  const used = world.save();
  expect(world.dispatch({ type: 'USE_CAN', catId: 'mochi' }).ok).toBe(false);
  expect(world.save()).toBe(used);
});
