import type Phaser from 'phaser';
import type { WorldState } from '../../core';
import { boardSize, MAP_VIEW } from './city-geometry';
import { shade, type CityLight } from './city-light';
import { CITY_COLOURS } from './city-palette';

interface Point {
  x: number;
  y: number;
}

/** Roots of the grass tufts: a sparse pattern on grass without a road or a building. */
export function tuftRoots(world: WorldState): Point[] {
  const built = new Set(
    world.buildings.map(({ position }) => `${position.x},${position.y}`),
  );
  return world.map.tiles
    .filter(
      ({ terrain, road, position: { x, y } }) =>
        terrain === 'GRASS' &&
        !road &&
        (x * 7 + y * 3) % 4 === 0 &&
        !built.has(`${x},${y}`),
    )
    .map(({ position: { x, y } }) => ({
      x: MAP_VIEW.padding + x * MAP_VIEW.tile + 12,
      y: MAP_VIEW.padding + y * MAP_VIEW.tile + 37,
    }));
}

/** Where fireflies hover: spread over the tiles by golden-ratio steps. */
export function fireflyAnchors(
  tiles: { width: number; height: number },
  count: number,
): Point[] {
  const board = boardSize(tiles);
  const span = {
    x: board.width - 2 * MAP_VIEW.padding,
    y: board.height - 2 * MAP_VIEW.padding,
  };
  return Array.from({ length: count }, (_, i) => ({
    x: MAP_VIEW.padding + span.x * ((0.3 + i * 0.618034) % 1),
    y: MAP_VIEW.padding + span.y * ((0.55 + i * 0.381966) % 1),
  }));
}

/** A tuft's lean in degrees at `time` ms: slow, out of step with its neighbours. */
export const sway = (time: number, index: number) =>
  6 * Math.sin(time / 850 + index * 1.9);

/** A firefly's drift from its anchor and its glow at `time` ms. */
export function drift(time: number, index: number) {
  const t = time / 1000 + index * 2.4;
  return {
    x: 14 * Math.sin(t * 0.6),
    y: 9 * Math.sin(t * 0.9 + 1.3),
    alpha: 0.6 + 0.4 * Math.sin(t * 1.7),
  };
}

/**
 * The map's small moving life: swaying grass tufts and, at night, fireflies. They are
 * separate small objects, so the map itself redraws only when it changes. Under
 * `prefers-reduced-motion: reduce` they rest where they are drawn.
 */
export class CityAmbience {
  private readonly layer: Phaser.GameObjects.Container;
  private tufts: Phaser.GameObjects.Graphics[] = [];
  private flies: { sprite: Phaser.GameObjects.Graphics; at: Point }[] = [];
  private drawn = '';
  private still: boolean;

  constructor(private readonly scene: Phaser.Scene) {
    this.layer = scene.add.container();
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.still = motion.matches;
    const change = () => {
      this.still = motion.matches;
      if (this.still) this.rest();
    };
    motion.addEventListener('change', change);
    scene.events.once('shutdown', () =>
      motion.removeEventListener('change', change),
    );
  }

  /** Redraws only when the tufts or the light change. */
  render(world: WorldState, light: CityLight, visible: boolean) {
    this.layer.setVisible(visible);
    const roots = tuftRoots(world);
    const key = JSON.stringify([
      roots,
      light.daypart,
      world.map.width,
      world.map.height,
    ]);
    if (key === this.drawn) return;
    this.drawn = key;
    this.layer.removeAll(true);
    const blade = shade(CITY_COLOURS.tuft, light);
    this.tufts = roots.map((root) =>
      this.scene.add
        .graphics(root)
        .lineStyle(1.8, blade)
        .strokePoints([
          { x: -6, y: 0 },
          { x: -3, y: -6 },
          { x: 0, y: 0 },
          { x: 3, y: -8 },
          { x: 6, y: 0 },
        ]),
    );
    this.flies = fireflyAnchors(world.map, light.fireflies).map((at) => ({
      at,
      sprite: this.scene.add
        .graphics(at)
        .fillStyle(CITY_COLOURS.firefly, 0.3)
        .fillCircle(0, 0, 8)
        .fillStyle(CITY_COLOURS.firefly)
        .fillCircle(0, 0, 3),
    }));
    this.layer.add([...this.tufts, ...this.flies.map(({ sprite }) => sprite)]);
  }

  /** A light per-frame step of the few small objects; nothing moves when still. */
  update(time: number) {
    if (this.still || !this.layer.visible) return;
    this.tufts.forEach((tuft, i) => tuft.setAngle(sway(time, i)));
    this.flies.forEach(({ sprite, at }, i) => {
      const { x, y, alpha } = drift(time, i);
      sprite.setPosition(at.x + x, at.y + y).setAlpha(alpha);
    });
  }

  private rest() {
    this.tufts.forEach((tuft) => tuft.setAngle(0));
    this.flies.forEach(({ sprite, at }) =>
      sprite.setPosition(at.x, at.y).setAlpha(1),
    );
  }
}
