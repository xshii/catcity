import type Phaser from 'phaser';
import { BUILDINGS } from '../../content/city';
import { SPOTS, type SpotId } from '../../content/fishing';
import { shoreTiles, spotAt } from '../../core/city';
import type { WorldState } from '../../core';
import type { CitySelection } from '../city/actions';
import { MAP_VIEW, tileCenter } from '../city/geometry';

type Label = (
  x: number,
  y: number,
  text: string,
  size?: number,
  color?: string,
) => void;
const terrainColor = {
  GRASS: 0xd5dfbc,
  POND: 0x93c5b9,
  RIVER: 0x7bafbc,
  LAKE: 0xa8b5d1,
  SEA: 0x6da6c0,
} as const;

export function drawCityMap(
  g: Phaser.GameObjects.Graphics,
  world: WorldState,
  selection: CitySelection,
  label: Label,
) {
  g.fillStyle(0xf9f7ef).fillRoundedRect(25, 24, 590, 590, 26);
  const named = new Set<SpotId>();
  for (const tile of world.map.tiles) {
    const { x, y } = tile.position;
    const left = MAP_VIEW.origin + x * MAP_VIEW.tile;
    const top = MAP_VIEW.origin + y * MAP_VIEW.tile;
    g.fillStyle(terrainColor[tile.terrain]).fillRoundedRect(
      left + 1,
      top + 1,
      50,
      50,
      4,
    );
    if (tile.terrain === 'GRASS') {
      if (!tile.owned)
        g.fillStyle(0xf6efd9, 0.45).fillRect(left + 2, top + 2, 48, 48);
      else
        g.lineStyle(1.4, 0xa5b98b).strokeRoundedRect(
          left + 2,
          top + 2,
          48,
          48,
          4,
        );
      if (tile.road) {
        g.fillStyle(tile.road === 'DIRT' ? 0xc7aa7e : 0xadb1a7).fillRoundedRect(
          left + 6,
          top + 6,
          40,
          40,
          6,
        );
        g.lineStyle(1, tile.road === 'DIRT' ? 0xb49369 : 0x8f968d, 0.65);
        for (let offset = 15; offset < 45; offset += 12)
          g.lineBetween(left + 10, top + offset, left + 42, top + offset);
      } else if ((x * 7 + y * 3) % 4 === 0) {
        g.lineStyle(1.5, 0x9fb17f, 0.6)
          .lineBetween(left + 12, top + 37, left + 10, top + 32)
          .lineBetween(left + 12, top + 37, left + 15, top + 31);
      }
    } else {
      g.lineStyle(1.5, 0xe6f3e9, 0.6)
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
          '#365b61',
        );
        named.add(spot);
      }
    }
  }
  if (selection?.kind === 'water') {
    for (const shore of shoreTiles(world.map, selection.spotId)) {
      const point = tileCenter(shore.x, shore.y);
      g.lineStyle(2, 0xf4e8a3).strokeRoundedRect(
        point.x - 23,
        point.y - 23,
        46,
        46,
        5,
      );
    }
  }
  if (selection && selection.kind !== 'cat') {
    const point = tileCenter(selection.position.x, selection.position.y);
    g.lineStyle(3, 0x57774f).strokeRoundedRect(
      point.x - 24,
      point.y - 24,
      48,
      48,
      6,
    );
  }
  for (const cat of world.cats) {
    if (!cat.walk) continue;
    let previous = tileCenter(cat.position.x, cat.position.y);
    g.lineStyle(3, cat.id === 'mochi' ? 0xc38d55 : 0x68758d, 0.75);
    for (const tile of cat.walk.route) {
      const next = tileCenter(tile.x, tile.y);
      g.lineBetween(previous.x, previous.y, next.x, next.y);
      g.fillStyle(0xfff4da).fillCircle(next.x, next.y, 3);
      previous = next;
    }
  }
  for (let i = 0; i < 10; i++) {
    label(86 + i * 52, 43, String(i + 1), 10, '#98a28b');
    label(42, 86 + i * 52, String.fromCharCode(65 + i), 10, '#98a28b');
  }
  for (const building of world.buildings) {
    const { x, y } = tileCenter(building.position.x, building.position.y);
    const apartment = building.type === 'CAT_APARTMENT';
    g.fillStyle(0x84966e, 0.2).fillEllipse(x + 2, y + 21, 48, 13);
    g.fillStyle(apartment ? 0xe7e0c8 : 0xf8ebcd).fillRoundedRect(
      x - 22,
      y - 15,
      44,
      37,
      4,
    );
    g.fillStyle(apartment ? 0x798f88 : 0xa96647).fillTriangle(
      x - 27,
      y - 15,
      x,
      y - 31,
      x + 27,
      y - 15,
    );
    if (apartment) {
      for (const dx of [-13, 6])
        for (const dy of [-9, 5])
          g.fillStyle(0xf9d88b).fillRoundedRect(x + dx, y + dy, 8, 9, 2);
    } else {
      g.fillStyle(0x6f8c72).fillRoundedRect(x - 16, y, 13, 15, 2);
      g.fillStyle(0x8c694c).fillRoundedRect(x + 4, y - 1, 11, 23, 2);
      for (let i = 0; i < 6; i++)
        g.fillStyle(i % 2 ? 0xf9edd5 : 0xd68a68).fillRect(
          x - 24 + i * 8,
          y - 9,
          8,
          9,
        );
    }
    label(x, y + 31, BUILDINGS[building.type].name, 10, '#655342');
  }
}
