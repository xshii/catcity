import { CITY_START } from '../../src/content/city';
import { isWalkable } from '../../src/core/city/path';
import { expect, it } from 'vitest';
import { createWorld, loadWorld } from '../../src/core/world';
import {
  generateCityMap,
  shoreTiles,
  spotAt,
  tileAt,
} from '../../src/core/city/map';

it('generates reproducible terrain using a separate seeded stream', () => {
  expect(generateCityMap(42)).toEqual(generateCityMap(42));
  const worlds = new Set(
    Array.from({ length: 24 }, (_, seed) =>
      JSON.stringify(generateCityMap(seed)),
    ),
  );
  expect(worlds.size).toBeGreaterThan(12);
});

it('keeps every starter plot dry and all waterways reachable for representative seeds', () => {
  for (let seed = 0; seed < 128; seed++) {
    const map = generateCityMap(seed);
    expect(map.tiles).toHaveLength(100);
    expect(map.tiles.filter((tile) => tile.owned)).toHaveLength(16);
    expect(map.tiles.filter((tile) => tile.road)).toHaveLength(7);
    const visited = new Set(['5,5']);
    const queue = [{ x: 5, y: 5 }];
    while (queue.length) {
      const { x, y } = queue.shift()!;
      for (const p of [
        { x, y: y - 1 },
        { x: x + 1, y },
        { x, y: y + 1 },
        { x: x - 1, y },
      ]) {
        const key = `${p.x},${p.y}`;
        if (!visited.has(key) && tileAt(map, p)?.terrain === 'GRASS') {
          visited.add(key);
          queue.push(p);
        }
      }
    }
    for (const tile of map.tiles) {
      if (tile.terrain === 'GRASS')
        expect(visited.has(`${tile.position.x},${tile.position.y}`)).toBe(true);
      else {
        expect(tile.owned).toBe(false);
        expect(tile.road).toBeNull();
      }
    }
    for (const spot of ['POND', 'REEDS', 'MOON', 'COAST'] as const) {
      const shores = shoreTiles(map, spot);
      expect(shores.length).toBeGreaterThanOrEqual(2);
      expect(shores.every((p) => visited.has(`${p.x},${p.y}`))).toBe(true);
      expect(map.tiles.some((t) => spotAt(map, t.position) === spot)).toBe(
        true,
      );
    }
    // The river really crosses the map; the pond is a multi-cell body of water.
    for (let y = 0; y < 10; y++) expect(spotAt(map, { x: 0, y })).toBe('REEDS');
    const pond = map.tiles.filter((tile) => tile.terrain === 'POND');
    expect(pond.length).toBeGreaterThanOrEqual(4);
    expect(pond.length).toBeLessThanOrEqual(6);
  }
});

it('rejects invalid tile coordinates without aliasing another row', () => {
  const map = generateCityMap(42);
  for (const position of [
    { x: -1, y: 1 },
    { x: 10, y: 0 },
    { x: 0, y: 10 },
    { x: 1.5, y: 2 },
  ])
    expect(tileAt(map, position)).toBeUndefined();
});

it('starts Mochi on an unowned pond shore with immediate fishing access for every map shape', () => {
  for (let seed = 0; seed < 128; seed++) {
    const world = createWorld(seed);
    const state = world.getSnapshot();
    const cat = state.cats[0]!;
    expect(shoreTiles(state.map, 'POND')).toContainEqual(cat.position);
    expect(tileAt(state.map, cat.position)).toMatchObject({
      terrain: 'GRASS',
      owned: false,
    });
    expect(cat.walk).toBeNull();
    expect(cat.fishingSpotId).toBe('POND');
    expect(loadWorld(world.save()).save()).toBe(world.save());
    expect(
      world.dispatch({
        type: 'FISH_BEGIN',
        catId: cat.id,
        spotId: 'POND',
        baitId: 'BREAD',
        direction: 0,
        aimDepth: 50,
      }).ok,
    ).toBe(true);
  }
});

it('invites Pepper on the free walkable tile nearest the starter crossroads', () => {
  const { crossroads } = CITY_START;
  const distance = (position: { x: number; y: number }) =>
    Math.abs(position.x - crossroads.x) + Math.abs(position.y - crossroads.y);
  for (const seed of [0, 1, 42, 99]) {
    const world = createWorld(seed);
    expect(world.dispatch({ type: 'INVITE_PEPPER' }).ok).toBe(true);
    const state = world.getSnapshot();
    const pepper = state.cats.find((cat) => cat.definitionId === 'PEPPER')!;
    const closer = state.map.tiles.filter(
      (tile) =>
        isWalkable(state, tile.position) &&
        distance(tile.position) < distance(pepper.position),
    );
    expect(closer).toEqual([]);
  }
});
