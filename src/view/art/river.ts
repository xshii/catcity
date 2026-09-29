import Phaser from 'phaser';
import type { SpotId } from '../../content/fishing';
import { fishShadows, type FishShadow, type WorldState } from '../../core';
import { catArt } from './cat';
import {
  landingShare,
  shadowPoint,
  WATER_VIEW,
  waterPoint,
} from './water-view';
import { BANK, BANK_STRIP, DOCK, MOON_TINT, SAND, SKY } from './river-palette';

const V = WATER_VIEW;
/** Water colour per spot: pond, reed river, moon lake, coast. */
const WATER_COLOUR: Record<SpotId, number> = {
  POND: 0x9bc8b7,
  REEDS: 0x83b9af,
  MOON: 0x7f9fb5,
  COAST: 0x77b8c2,
};
/** Where the rod leaves the bottom of the view, and the cat beside the player. */
const ROD_BASE = { x: 430, y: V.size };
const ROD_TIP = { x: 372, y: 330 };
const COMPANION = { x: 196, y: 560, scale: 1.7 };
/** Fish shadow body length by size class, at the dock's scale. */
const SHADOW_LENGTH = { small: 46, medium: 64, large: 88 } as const;

/**
 * The fishing scene in first person (spec 030): looking out from the dock over the water
 * toward the far shore. Presentation only; the landing point, float, bite mark and fish
 * shadow follow the run and the aim preview, never the other way round.
 */
export class RiverView {
  readonly root: Phaser.GameObjects.Container;
  private water: Phaser.GameObjects.Graphics;
  private scenery: Record<SpotId, Phaser.GameObjects.Graphics>;
  private marker: Phaser.GameObjects.Graphics;
  private shadowLayer: Phaser.GameObjects.Graphics;
  private shadows: FishShadow[] = [];
  private float: Phaser.GameObjects.Container;
  private fishShadow: Phaser.GameObjects.Graphics;
  private bite: Phaser.GameObjects.Text;
  private rod: Phaser.GameObjects.Graphics;
  private companion: Phaser.GameObjects.Container;
  private coat = 'cream';
  private waterKind: SpotId = 'POND';
  private waterFrame = -1;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    .matches;

  constructor(private readonly scene: Phaser.Scene) {
    this.root = scene.add.container(0, 0).setDepth(20).setVisible(false);
    // The scene runs edge to edge; the page continues it around (riverBackdrop).
    const sky = scene.add
      .graphics()
      .fillStyle(SKY)
      .fillRect(0, 0, V.size, V.size);
    this.water = scene.add.graphics();
    this.scenery = {
      POND: this.drawPond(scene.add.graphics()),
      REEDS: this.drawReeds(scene.add.graphics()),
      MOON: this.drawMoon(scene.add.graphics()),
      COAST: this.drawCoast(scene.add.graphics()),
    };
    const dock = this.drawDock(scene.add.graphics());
    this.shadowLayer = scene.add.graphics();
    this.marker = scene.add.graphics();
    this.fishShadow = scene.add.graphics();
    this.fishShadow
      .fillStyle(0x3a796b, 0.5)
      .fillEllipse(0, 0, 42, 17)
      .fillTriangle(-16, 0, -34, -12, -34, 12);
    const ripple = scene.add.ellipse(0, 0, 44, 16).setStrokeStyle(2, 0xfaf3cf);
    this.float = scene.add.container(0, 0, [
      ripple,
      scene.add.circle(0, -4, 5, 0xd98b6c),
    ]);
    this.bite = scene.add
      .text(0, 0, '!', {
        fontFamily: 'system-ui',
        fontSize: 42,
        color: '#fff4c0',
        stroke: '#d09050',
        strokeThickness: 5,
      })
      .setOrigin(0.5);
    this.rod = scene.add.graphics();
    this.companion = catArt(scene, COMPANION.x, COMPANION.y, COMPANION.scale);
    this.root.add([
      sky,
      this.water,
      ...Object.values(this.scenery),
      this.shadowLayer,
      this.marker,
      this.fishShadow,
      this.float,
      this.bite,
      dock,
      this.companion,
      this.rod,
    ]);
    if (!this.reducedMotion)
      scene.tweens.add({
        targets: ripple,
        scale: 1.2,
        alpha: 0.35,
        duration: 1000,
        yoyo: true,
        repeat: -1,
      });
    const animate = (time: number) => this.animateWater(time);
    scene.events.on('update', animate);
    scene.events.once('shutdown', () => scene.events.off('update', animate));
  }

  /** The water trapezoid from the horizon to the dock, clipped to the canvas. */
  private waterShape(g: Phaser.GameObjects.Graphics) {
    const left = 0;
    const right = V.size;
    return g
      .beginPath()
      .moveTo(V.centerX - V.horizonHalf, V.horizonY)
      .lineTo(V.centerX + V.horizonHalf, V.horizonY)
      .lineTo(right, V.horizonY + (right - V.centerX - V.horizonHalf) * 3)
      .lineTo(right, V.nearY)
      .lineTo(left, V.nearY)
      .lineTo(left, V.horizonY + (V.centerX - V.horizonHalf - left) * 3)
      .closePath();
  }

  /** Far bank with round trees along the horizon (pond, reeds, lake). */
  private farShore(g: Phaser.GameObjects.Graphics, spot: SpotId) {
    g.fillStyle(BANK[spot]!).fillRect(
      0,
      BANK_STRIP.top,
      V.size,
      BANK_STRIP.bottom - BANK_STRIP.top,
    );
    for (const [x, size] of [
      [70, 24],
      [128, 30],
      [230, 20],
      [410, 26],
      [505, 32],
      [575, 22],
    ]) {
      g.fillStyle(0x91ac7e).fillCircle(x!, V.horizonY - 30, size!);
      g.fillStyle(0xb7c999).fillCircle(
        x! - size! * 0.2,
        V.horizonY - 30 - size! * 0.2,
        size! * 0.7,
      );
    }
    return g;
  }

  private drawPond(g: Phaser.GameObjects.Graphics) {
    this.farShore(g, 'POND');
    // Lily pads shrink with distance.
    for (const [direction, share] of [
      [-38, 0.2],
      [-30, 0.55],
      [34, 0.35],
      [40, 0.7],
    ]) {
      const { x, y, scale } = waterPoint(direction!, share!);
      g.fillStyle(0x7fa77b, 0.8).fillEllipse(x, y, 46 * scale, 16 * scale);
    }
    return g;
  }

  private drawReeds(g: Phaser.GameObjects.Graphics) {
    this.farShore(g, 'REEDS');
    for (let i = 0; i < 16; i++) {
      const side = i % 2 ? 1 : -1;
      const x = V.centerX + side * (250 + (i % 4) * 14);
      const y = V.nearY - 20 - (i % 5) * 42;
      const height = 34 + (i % 3) * 14;
      g.lineStyle(3, 0x6b8e6a)
        .lineBetween(x, y, x - 6 * side, y - height)
        .lineBetween(x, y, x + 4 * side, y - height * 0.7);
    }
    return g;
  }

  private drawMoon(g: Phaser.GameObjects.Graphics) {
    this.farShore(g, 'MOON');
    g.fillStyle(0xf5ecc9).fillCircle(470, 78, 26);
    g.fillStyle(MOON_TINT.colour, MOON_TINT.alpha).fillRect(
      0,
      0,
      V.size,
      V.size,
    );
    return g;
  }

  private drawCoast(g: Phaser.GameObjects.Graphics) {
    // Open sea: a flat horizon, no far bank.
    g.lineStyle(2, 0x5f9aa6).lineBetween(0, V.horizonY, V.size, V.horizonY);
    g.fillStyle(SAND.colour).fillRect(0, SAND.top, V.size, V.nearY - SAND.top);
    return g;
  }

  private drawDock(g: Phaser.GameObjects.Graphics) {
    const top = V.nearY;
    const bottom = V.size;
    g.fillStyle(DOCK).fillRect(0, top, V.size, bottom - top);
    for (let x = 34; x < V.size; x += 58)
      g.lineStyle(2, 0x967e5c, 0.5).lineBetween(x, top, x - 10, bottom);
    g.lineStyle(3, 0x967e5c).lineBetween(0, top, V.size, top);
    return g;
  }

  private animateWater(time: number) {
    if (!this.root.visible) return;
    const frame = this.reducedMotion ? 0 : Math.floor(time / 50);
    if (frame === this.waterFrame) return;
    this.waterFrame = frame;
    const t = frame / 20;
    const kind = this.waterKind;
    const g = this.water.clear();
    g.fillStyle(WATER_COLOUR[kind]);
    this.waterShape(g).fillPath();
    // Ripples drift toward the dock; at sea they roll in as wave fronts.
    const flow = kind === 'REEDS' ? 0.12 : kind === 'COAST' ? 0.08 : 0.02;
    for (let i = 0; i < 16; i++) {
      const share = (((i * 0.137 + t * flow) % 1) + 1) % 1;
      const direction = ((i * 29) % 90) - 45 + Math.sin(t + i) * 3;
      const { x, y, scale } = waterPoint(direction, 1 - share);
      const length = (kind === 'COAST' ? 40 : 22) * scale;
      g.lineStyle(
        Math.max(1, 2 * scale),
        0xe0f2df,
        0.2 + (Math.sin(t + i) + 1) * 0.12,
      );
      g.lineBetween(x - length / 2, y, x + length / 2, y);
    }
    this.drawShadows(t);
    if (kind === 'MOON')
      for (let i = 0; i < 6; i++)
        g.fillStyle(0xf1e9ce, 0.16).fillEllipse(
          470 + Math.sin(t + i) * 4,
          V.horizonY + 14 + i * 16,
          60 - i * 7,
          4,
        );
  }

  /**
   * Core's fish shadows for this spot and hour (spec 033): dark silhouettes by size that
   * drift gently around their place, well inside the radius a cast must land within.
   */
  private drawShadows(t: number) {
    const g = this.shadowLayer.clear();
    for (const [i, shadow] of this.shadows.entries()) {
      const sway = Math.sin(t / 3 + i * 2.1);
      const { x, y, scale } = shadowPoint(
        shadow.direction + sway * 3,
        shadow.reach + Math.cos(t / 4 + i) * 2,
      );
      const length = SHADOW_LENGTH[shadow.size] * scale;
      // The tail trails the way it swims.
      const tail = Math.cos(t / 3 + i * 2.1) >= 0 ? -1 : 1;
      g.fillStyle(0x1d3440, 0.36)
        .fillEllipse(x, y, length, length * 0.36)
        .fillTriangle(
          x + tail * length * 0.4,
          y,
          x + tail * length * 0.72,
          y - length * 0.2,
          x + tail * length * 0.72,
          y + length * 0.2,
        );
    }
  }

  render(
    world: WorldState,
    preview: {
      catId: string;
      direction: number;
      aimDepth: number;
      power: number;
      spotId: SpotId;
    },
  ) {
    const active = world.fishing.active;
    const spotId = active?.spotId ?? preview.spotId;
    if (this.waterKind !== spotId) {
      this.waterKind = spotId;
      this.waterFrame = -1;
    }
    for (const [id, layer] of Object.entries(this.scenery))
      layer.setVisible(id === spotId);
    // Shadows show while aiming and hide once the line is in the water.
    const shadows =
      active && active.phase !== 'charge' ? [] : fishShadows(world, spotId);
    if (JSON.stringify(shadows) !== JSON.stringify(this.shadows)) {
      this.shadows = shadows;
      this.waterFrame = -1;
    }
    this.animateWater(this.scene.time.now);
    const cat =
      world.cats.find((cat) => cat.id === (active?.catId ?? preview.catId)) ??
      world.cats[0]!;
    if (cat.appearance.coat !== this.coat) {
      this.companion.destroy();
      this.coat = cat.appearance.coat;
      this.companion = catArt(
        this.scene,
        COMPANION.x,
        COMPANION.y,
        COMPANION.scale,
        cat.appearance.coat,
      );
      this.root.addAt(this.companion, this.root.getIndex(this.rod));
    }
    const cast = !!active && active.phase !== 'charge';
    const land = waterPoint(
      active?.direction ?? preview.direction,
      landingShare(
        active?.aimDepth ?? preview.aimDepth,
        // A charging button run previews its live power.
        active?.power ?? preview.power,
      ),
    );
    // Aiming: a flattened ring where the cast would land.
    this.marker.clear().setVisible(!cast);
    if (!cast)
      this.marker
        .lineStyle(3, 0xfff4c0, 0.9)
        .strokeEllipse(land.x, land.y, 56 * land.scale, 20 * land.scale)
        .lineStyle(2, 0xfff4c0, 0.9)
        .lineBetween(
          land.x,
          land.y - 8 * land.scale,
          land.x,
          land.y + 8 * land.scale,
        );
    const flight =
      active?.phase === 'waiting' ? Math.min(1, active.phaseTick / 10) : 1;
    const bob =
      active?.phase === 'hook'
        ? Math.sin(active.phaseTick / 2) * 5
        : active?.phase === 'waiting'
          ? Math.sin(active.phaseTick / 5) * 2
          : 0;
    this.float
      .setVisible(cast)
      .setPosition(
        ROD_TIP.x + (land.x - ROD_TIP.x) * flight,
        ROD_TIP.y +
          (land.y - ROD_TIP.y) * flight -
          Math.sin(flight * Math.PI) * 60 +
          bob,
      )
      .setScale(land.scale * (active?.phase === 'hook' ? 1.5 : 1));
    this.bite
      .setVisible(active?.phase === 'hook')
      .setPosition(land.x, land.y - 45 * land.scale);
    this.fishShadow
      // Only the hooked fish: aiming shows Core's real shadows instead.
      .setVisible(active?.phase === 'fight')
      .setPosition(
        land.x - 20 * land.scale + Math.sin((active?.tick ?? 0) / 10) * 16,
        land.y + 24 * land.scale,
      )
      .setScale(
        land.scale *
          (active?.phase === 'fight' ? 1 + active.progress / 100 : 1),
      );
    this.rod
      .clear()
      .lineStyle(5, 0x886c4d)
      .lineBetween(ROD_BASE.x, ROD_BASE.y, ROD_TIP.x, ROD_TIP.y);
    if (cast)
      this.rod
        .lineStyle(
          active.phase === 'fight' ? 2 : 1,
          // Only the button flow has line tension to warn about.
          active.mode === 'buttons' &&
            (active.tension > 85 || active.tension < 15)
            ? 0xcc7454
            : 0xf6f0d9,
          0.9,
        )
        .lineBetween(ROD_TIP.x, ROD_TIP.y, this.float.x, this.float.y - 4);
  }
}
