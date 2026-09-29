import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createWorld } from '../../src/core/world';
import { cityLight, shade } from '../../src/view/art/city-light';
import { CITY_COLOURS, mix, TOKENS } from '../../src/view/art/city-palette';
import { dashes } from '../../src/view/art/city-map';
import {
  drift,
  fireflyAnchors,
  sway,
  tuftRoots,
} from '../../src/view/art/city-ambience';
import { boardSize, MAP_VIEW } from '../../src/view/city/geometry';
import { buildCafe } from '../helpers/world';

const at = (hour: number, minute = 0, day = 0) =>
  cityLight(day * 1440 + hour * 60 + minute);

describe('the light of the hour', () => {
  it('is soft in the morning, plain by day, orange in the evening and dim at night', () => {
    expect(at(7).daypart).toBe('morning');
    expect(at(12)).toMatchObject({ daypart: 'day', alpha: 0 });
    expect(at(18, 30).daypart).toBe('evening');
    expect(at(21, 30).daypart).toBe('night');
    // A new world starts at midnight.
    expect(cityLight(0).daypart).toBe('night');
    for (const hour of [7, 18, 21]) expect(at(hour).alpha).toBeGreaterThan(0);
  });

  it('changes at 5, 9, 17 and 20 o’clock, on every day alike', () => {
    expect(
      [4, 5, 8, 9, 16, 17, 19, 20].map((hour) => at(hour, 0).daypart),
    ).toEqual([
      'night',
      'morning',
      'morning',
      'day',
      'day',
      'evening',
      'evening',
      'night',
    ]);
    expect(at(4, 59).daypart).toBe('night');
    expect(at(7, 0, 3)).toEqual(at(7));
    expect(at(21, 0, 12)).toEqual(at(21));
  });

  it('lights the windows in the evening and at night, with fireflies only at night', () => {
    expect([7, 12, 18, 22].map((hour) => at(hour).windowsLit)).toEqual([
      false,
      false,
      true,
      true,
    ]);
    expect(at(22).fireflies).toBeGreaterThan(0);
    for (const hour of [7, 12, 18]) expect(at(hour).fireflies).toBe(0);
  });

  it('stays a subtle tint, so the map and its labels still read', () => {
    for (let hour = 0; hour < 24; hour++)
      expect(at(hour).alpha).toBeLessThanOrEqual(0.35);
    expect(shade(TOKENS.sage, at(12))).toBe(TOKENS.sage);
    expect(shade(TOKENS.sage, at(22))).not.toBe(TOKENS.sage);
  });

  it('keeps night calm rather than grey: grass still green, water still blue', () => {
    const night = at(0);
    expect(night.alpha).toBeLessThanOrEqual(0.22);
    const rgb = (colour: number) => [16, 8, 0].map((s) => (colour >> s) & 0xff);
    const [r, g, b] = rgb(shade(CITY_COLOURS.grass, night));
    expect(g).toBeGreaterThan(Math.max(r!, b!));
    for (const water of Object.values(CITY_COLOURS.water)) {
      const [red, , blue] = rgb(shade(water, night));
      expect(blue).toBeGreaterThan(red!);
    }
  });
});

describe('the city palette', () => {
  it('mirrors the values of the CSS tokens of the same name', () => {
    const css = readFileSync('src/view/styles/tokens.css', 'utf8');
    for (const [name, colour] of Object.entries(TOKENS)) {
      const token = name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
      expect(css).toContain(
        `--${token}: #${colour.toString(16).padStart(6, '0')};`,
      );
    }
  });

  it('mixes colours channel by channel', () => {
    expect(mix(0x102030, 0x304050, 0)).toBe(0x102030);
    expect(mix(0x102030, 0x304050, 1)).toBe(0x304050);
    expect(mix(0x000000, 0xff8040, 0.5)).toBe(0x804020);
  });
});

describe('the hand-drawn road line', () => {
  it('dashes from the start and cuts the last dash at the end', () => {
    const line = dashes({ x: 0, y: 0 }, { x: 26, y: 0 }, 6, 5);
    expect(line.map(([a, b]) => [a.x, b.x])).toEqual([
      [0, 6],
      [11, 17],
      [22, 26],
    ]);
    expect(line.every(([a, b]) => a.y === 0 && b.y === 0)).toBe(true);
    expect(dashes({ x: 5, y: 5 }, { x: 5, y: 5 }, 6, 5)).toEqual([]);
  });
});

describe('the ambient life', () => {
  it('grows tufts only on grass without a road or a building', () => {
    const world = createWorld(42);
    const bare = tuftRoots(world.getSnapshot());
    expect(bare.length).toBeGreaterThan(5);
    const tileOf = (root: { x: number; y: number }) => {
      const x = Math.floor((root.x - MAP_VIEW.padding) / MAP_VIEW.tile);
      const y = Math.floor((root.y - MAP_VIEW.padding) / MAP_VIEW.tile);
      return world
        .getSnapshot()
        .map.tiles.find(
          (tile) => tile.position.x === x && tile.position.y === y,
        )!;
    };
    for (const root of bare) {
      const tile = tileOf(root);
      expect(tile.terrain).toBe('GRASS');
      expect(tile.road).toBeNull();
    }
    const site = bare
      .map(tileOf)
      .find((tile) => tile.owned && buildCafe(world, tile.position).ok);
    expect(site).toBeDefined();
    const built = tuftRoots(world.getSnapshot());
    expect(built).toHaveLength(bare.length - 1);
    expect(built.map(tileOf)).not.toContainEqual(site);
  });

  it('spreads fireflies over the board, the same way every time', () => {
    const tiles = { width: 10, height: 10 };
    const board = boardSize(tiles);
    const flies = fireflyAnchors(tiles, 6);
    expect(flies).toHaveLength(6);
    expect(fireflyAnchors(tiles, 6)).toEqual(flies);
    expect(fireflyAnchors(tiles, 0)).toEqual([]);
    for (const fly of flies) {
      // Room for the drift inside the board.
      expect(fly.x).toBeGreaterThanOrEqual(MAP_VIEW.padding);
      expect(fly.x).toBeLessThanOrEqual(board.width - MAP_VIEW.padding);
      expect(fly.y).toBeGreaterThanOrEqual(MAP_VIEW.padding);
      expect(fly.y).toBeLessThanOrEqual(board.height - MAP_VIEW.padding);
    }
    // Not bunched in one tile.
    expect(new Set(flies.map((fly) => Math.round(fly.x / 52))).size).toBe(6);
  });

  it('sways gently and drifts a little, out of step with the neighbours', () => {
    for (let time = 0; time < 20_000; time += 137)
      for (let index = 0; index < 8; index++) {
        expect(Math.abs(sway(time, index))).toBeLessThanOrEqual(8);
        const { x, y, alpha } = drift(time, index);
        expect(Math.abs(x)).toBeLessThanOrEqual(MAP_VIEW.padding);
        expect(Math.abs(y)).toBeLessThanOrEqual(MAP_VIEW.padding);
        expect(alpha).toBeGreaterThan(0);
        expect(alpha).toBeLessThanOrEqual(1);
      }
    expect(sway(1000, 0)).not.toBe(sway(1000, 1));
  });
});
