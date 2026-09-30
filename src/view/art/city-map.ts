import type Phaser from 'phaser';
import { BUILDINGS } from '../../content/city';
import { SPOTS, type SpotId } from '../../content/fishing';
import { shoreTiles, spotAt, tileAt } from '../../core/city';
import type { Position, WorldState } from '../../core';
import { boardSize, MAP_VIEW, tileCenter } from './city-geometry';
import { shade, type CityLight } from './city-light';
import { CITY_COLOURS as C } from './city-palette';

/** What the board highlights: the city screen's selection (city/view-state.ts). */
export type CitySelection =
  | { kind: 'tile'; position: Position }
  | { kind: 'cat'; catId: string }
  | { kind: 'water'; position: Position; spotId: SpotId }
  | null;

type Label = (x: number, y: number, text: string, size?: number) => void;
interface Point {
  x: number;
  y: number;
}

const NEIGHBOURS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;
/** Windows per building, from the tile centre: x, y, width, height. */
const WINDOWS = {
  CAT_CAFE: [[-16, 0, 13, 15]],
  CAT_APARTMENT: [
    [-13, -9, 8, 9],
    [6, -9, 8, 9],
    [-13, 5, 8, 9],
    [6, 5, 8, 9],
  ],
  CAT_LODGE: [
    [-13, -9, 8, 9],
    [6, -9, 8, 9],
    [-13, 5, 8, 9],
    [6, 5, 8, 9],
  ],
} as const;
/** Walls and roof per building: the lodge's roof is sage (spec 041 ui-design 6.2). */
const COLOURS = {
  CAT_CAFE: [C.cafe, C.cafeRoof],
  CAT_APARTMENT: [C.apartment, C.apartmentRoof],
  CAT_LODGE: [C.lodge, C.lodgeRoof],
} as const;

/** Dashes along from→to, `dash` long and `gap` apart; the last is cut at `to`. */
export function dashes(
  from: Point,
  to: Point,
  dash: number,
  gap: number,
): [Point, Point][] {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const at = (distance: number) => ({
    x: from.x + ((to.x - from.x) * distance) / length,
    y: from.y + ((to.y - from.y) * distance) / length,
  });
  const line: [Point, Point][] = [];
  for (let start = 0; start < length; start += dash + gap)
    line.push([at(start), at(Math.min(start + dash, length))]);
  return line;
}

/**
 * The city board in the healing style: big rounded tiles with warm-brown outlines, roads as
 * a hand-drawn line, an apricot café and sakura apartments. Scenery takes the light of
 * the hour; windows glow in the evening. Swaying tufts and fireflies are city-ambience.ts.
 */
export function drawCityMap(
  g: Phaser.GameObjects.Graphics,
  world: WorldState,
  selection: CitySelection,
  light: CityLight,
  label: Label,
) {
  const c = (colour: number) => shade(colour, light);
  const board = boardSize(world.map);
  g.fillStyle(c(C.board)).fillRoundedRect(0, 0, board.width, board.height, 26);
  const named = new Set<SpotId>();
  for (const tile of world.map.tiles) {
    const { x, y } = tile.position;
    const left = MAP_VIEW.padding + x * MAP_VIEW.tile;
    const top = MAP_VIEW.padding + y * MAP_VIEW.tile;
    const fill =
      tile.terrain !== 'GRASS'
        ? C.water[tile.terrain]
        : tile.road === 'DIRT'
          ? C.dirt
          : tile.road === 'STONE'
            ? C.stone
            : tile.owned
              ? C.grass
              : C.wild;
    g.fillStyle(c(fill)).fillRoundedRect(left + 1, top + 1, 50, 50, 10);
    g.lineStyle(1.5, c(C.line), tile.owned ? 0.55 : 0.22).strokeRoundedRect(
      left + 1,
      top + 1,
      50,
      50,
      10,
    );
    if (tile.road) {
      // A dashed dirt track or stone slabs from the centre toward each road next door.
      const centre = tileCenter(x, y);
      const ends = NEIGHBOURS.filter(
        ([dx, dy]) => tileAt(world.map, { x: x + dx, y: y + dy })?.road,
      ).map(([dx, dy]) => ({
        x: centre.x + (dx * MAP_VIEW.tile) / 2,
        y: centre.y + (dy * MAP_VIEW.tile) / 2,
      }));
      const dirt = tile.road === 'DIRT';
      g.lineStyle(dirt ? 2.4 : 4, c(dirt ? C.dirtLine : C.stoneLine));
      for (const end of ends)
        for (const [a, b] of dashes(centre, end, dirt ? 6 : 5, dirt ? 5 : 3))
          g.lineBetween(a.x, a.y, b.x, b.y);
      if (!ends.length)
        g.fillStyle(c(dirt ? C.dirtLine : C.stoneLine)).fillCircle(
          centre.x,
          centre.y,
          3,
        );
    } else if (tile.terrain !== 'GRASS') {
      g.lineStyle(2, c(C.glint), 0.7)
        .lineBetween(left + 10, top + 18, left + 30, top + 18)
        .lineBetween(left + 24, top + 35, left + 43, top + 35);
      const spot = spotAt(world.map, tile.position);
      if (spot && !named.has(spot)) {
        label(
          left + 26,
          top + 27,
          SPOTS[spot].name
            .replace('家门口', '')
            .replace('芦苇', '')
            .replace('潮汐', ''),
          10,
        );
        named.add(spot);
      }
    }
  }
  if (selection?.kind === 'water') {
    for (const shore of shoreTiles(world.map, selection.spotId)) {
      const point = tileCenter(shore.x, shore.y);
      g.lineStyle(2, C.shore).strokeRoundedRect(
        point.x - 23,
        point.y - 23,
        46,
        46,
        9,
      );
    }
  }
  if (selection && selection.kind !== 'cat') {
    const point = tileCenter(selection.position.x, selection.position.y);
    g.lineStyle(3, C.selected).strokeRoundedRect(
      point.x - 24,
      point.y - 24,
      48,
      48,
      10,
    );
  }
  for (const cat of world.cats) {
    if (!cat.walk) continue;
    let previous = tileCenter(cat.position.x, cat.position.y);
    g.lineStyle(3, C.route[cat.appearance.colour], 0.75);
    for (const tile of cat.walk.route) {
      const next = tileCenter(tile.x, tile.y);
      g.lineBetween(previous.x, previous.y, next.x, next.y);
      g.fillStyle(C.routeDot).fillCircle(next.x, next.y, 3);
      previous = next;
    }
  }
  for (const building of world.buildings) {
    const { x, y } = tileCenter(building.position.x, building.position.y);
    const [walls, roof] = COLOURS[building.type];
    g.fillStyle(c(C.line), 0.16).fillEllipse(x + 2, y + 21, 48, 13);
    g.lineStyle(1.5, c(C.line));
    g.fillStyle(c(walls))
      .fillRoundedRect(x - 22, y - 15, 44, 37, 5)
      .strokeRoundedRect(x - 22, y - 15, 44, 37, 5);
    g.fillStyle(c(roof))
      .fillTriangle(x - 27, y - 15, x, y - 31, x + 27, y - 15)
      .strokeTriangle(x - 27, y - 15, x, y - 31, x + 27, y - 15);
    if (building.type === 'CAT_CAFE') {
      // The café's awning and door.
      for (let i = 0; i < 6; i++)
        g.fillStyle(c(i % 2 ? C.board : C.cafeRoof)).fillRect(
          x - 24 + i * 8,
          y - 9,
          8,
          9,
        );
      g.strokeRect(x - 24, y - 9, 48, 9);
      g.fillStyle(c(C.door))
        .fillRoundedRect(x + 4, y - 1, 11, 23, 2)
        .strokeRoundedRect(x + 4, y - 1, 11, 23, 2);
    }
    for (const [dx, dy, width, height] of WINDOWS[building.type]) {
      if (light.windowsLit)
        g.fillStyle(C.glow, 0.45).fillCircle(
          x + dx + width / 2,
          y + dy + height / 2,
          Math.max(width, height) * 0.8,
        );
      g.fillStyle(light.windowsLit ? C.lit : c(C.window))
        .fillRoundedRect(x + dx, y + dy, width, height, 2)
        .lineStyle(1, c(C.line), 0.8)
        .strokeRoundedRect(x + dx, y + dy, width, height, 2);
    }
    label(x, y + 31, BUILDINGS[building.type].name, 10);
  }
}
