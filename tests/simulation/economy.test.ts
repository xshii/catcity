import { describe, expect, it } from 'vitest';
import { CAFE, CITY_TIME } from '../../src/content/city';
import type { Position } from '../../src/core';
import { createWorld, loadWorld } from '../../src/core/world';
import { advance } from '../helpers/world';

/**
 * The economy of a filled city (spec 040): 16 cats in 8 apartments and 4 cafes on the
 * seed 42 map. The targets are the spec's; changing a number means changing them there.
 */
const FUNDS = 100_000;
/** A plot outside the district carries the road the two plots beside it connect to. */
const ROAD: Position = { x: 5, y: 2 };
const BOUGHT: Position[] = [
  { x: 4, y: 2 },
  { x: 6, y: 2 },
  { x: 5, y: 7 },
  { x: 2, y: 5 },
];
/** Every apartment has one nearest cafe within range, and every cafe two apartments. */
const WELL_PLACED: Position[] = [
  { x: 6, y: 3 },
  { x: 6, y: 6 },
  { x: 4, y: 2 },
  { x: 2, y: 5 },
];
/** The same plots with the cafes side by side in the north. */
const CROWDED: Position[] = [
  { x: 4, y: 2 },
  { x: 6, y: 2 },
  { x: 4, y: 3 },
  { x: 6, y: 3 },
];
const PLOTS: Position[] = [
  { x: 4, y: 3 },
  { x: 6, y: 3 },
  { x: 3, y: 4 },
  { x: 4, y: 4 },
  { x: 6, y: 4 },
  { x: 3, y: 6 },
  { x: 4, y: 6 },
  { x: 6, y: 6 },
  ...BOUGHT,
];
/** Grass away from the city for the cats to stand on; where they stand earns nothing. */
const same = (a: Position, b: Position) => a.x === b.x && a.y === b.y;
const STANDING: Position[] = [2, 3, 4, 5, 6, 7]
  .flatMap((x) => [7, 8, 9].map((y) => ({ x, y })))
  .filter((position) => !PLOTS.some((plot) => same(plot, position)));

function filledCity(cafes: Position[]) {
  const save = JSON.parse(createWorld(42).save());
  save.world.coins = FUNDS;
  const world = loadWorld(JSON.stringify(save));
  const must = (command: unknown) => {
    const result = world.dispatch(command);
    if (!result.ok)
      throw new Error(`${result.error}: ${JSON.stringify(command)}`);
  };
  for (const position of [ROAD, ...BOUGHT])
    must({ type: 'BUY_LAND', position });
  must({ type: 'PLACE_ROAD', position: ROAD });
  for (const position of cafes)
    must({ type: 'BUILD_BUILDING', buildingType: 'CAT_CAFE', position });
  for (const position of PLOTS.filter(
    (plot) => !cafes.some((cafe) => same(cafe, plot)),
  ))
    must({ type: 'BUILD_BUILDING', buildingType: 'CAT_APARTMENT', position });
  // Mochi is already there; 15 more cats make 16.
  for (const position of STANDING.slice(0, 15))
    must({ type: 'DEBUG_SPAWN_CAT', position });
  const { buildings, cats } = world.getSnapshot();
  const homes = buildings.filter(
    (building) => building.type === 'CAT_APARTMENT',
  );
  for (const [index, cat] of cats.entries())
    must({
      type: 'ASSIGN_HOME',
      catId: cat.id,
      buildingId: homes[Math.floor(index / 2)]!.id,
    });
  return { world, spent: FUNDS - world.getSnapshot().coins };
}

/** Coins earned over whole game hours, from the income events. */
function earned(world: ReturnType<typeof createWorld>, hours: number) {
  const before = world.getSnapshot().coins;
  const result = advance(world, hours * 60);
  if (!result.ok) throw new Error(result.error);
  const income = result.events.reduce(
    (sum, event) => sum + (event.type === 'IncomeGenerated' ? event.amount : 0),
    0,
  );
  expect(world.getSnapshot().coins - before).toBe(income);
  return income;
}

describe('a filled city: 16 cats, 8 apartments, 4 cafes', () => {
  it('earns 32 coins per game hour when the cafes are placed well', () => {
    const { world } = filledCity(WELL_PLACED);
    const state = world.getSnapshot();
    expect(state.cats).toHaveLength(16);
    expect(state.cats.every((cat) => cat.home)).toBe(true);
    expect(state.buildings.map((building) => building.type).sort()).toEqual([
      ...Array<string>(8).fill('CAT_APARTMENT'),
      ...Array<string>(4).fill('CAT_CAFE'),
    ]);
    expect(earned(world, 1)).toBe(32);
    expect(earned(world, 1)).toBe(state.cats.length * CAFE.coinsPerCustomer);
    expect(earned(world, 24)).toBe(24 * 32);
    expect(loadWorld(world.save()).save()).toBe(world.save());
  });

  it('earns less when the cafes crowd together', () => {
    const income = earned(filledCity(CROWDED).world, 1);
    expect(income).toBeGreaterThan(0);
    expect(income).toBeLessThan(32);
  });

  it('costs between 11,000 and 12,000 coins to build, land and roads included', () => {
    const { spent } = filledCity(WELL_PLACED);
    expect(spent).toBe(11_310);
    expect(spent).toBeGreaterThanOrEqual(11_000);
    expect(spent).toBeLessThanOrEqual(12_000);
    // Where the cafes stand changes the income, not the bill.
    expect(filledCity(CROWDED).spent).toBe(spent);
  });

  it('idles through a real hour at 4× for at most 1.5 times what fishing pays', () => {
    const FISHING_COINS_PER_REAL_MINUTE = 25;
    const fastest = Math.max(...CITY_TIME.speeds);
    expect(fastest).toBe(4);
    // One real second is `fastest` game minutes: a real hour is that many game hours.
    const gameHours = (60 * 60 * fastest) / 60;
    const idle = earned(filledCity(WELL_PLACED).world, gameHours);
    expect(idle).toBeLessThanOrEqual(1.5 * FISHING_COINS_PER_REAL_MINUTE * 60);
  });
});
