import Phaser from 'phaser';
import type { SpotId } from '../../content/fishing';
import { fishShadows, type FishShadow, type WorldState } from '../../core';
import { CatArt } from './cat';
import {
  catLook,
  catPose,
  COAT_APPEARANCE,
  lookOf,
  type CatLook,
  type CatMotion,
} from './cat-look';
import { rodPose, rodShape, rodStance, type RodStance } from './rod-pose';
import {
  castPreview,
  flightPoint,
  hookedFish,
  planePoint,
  shadowPoint,
  showsShadows,
  WATER_VIEW,
  waterPoint,
} from './water-view';
import {
  AIM,
  BANK_STRIP,
  BITE,
  DOCK,
  FIREFLY,
  FLOAT,
  GLINT,
  LINE,
  LOTUS,
  REFLECTION_ALPHA,
  riverLook,
  ROD,
  SAND,
  SHADOW,
  skyBottom,
  type RiverLook,
} from './river-palette';
import { mix } from './city-palette';

const V = WATER_VIEW;
/** Where the rod leaves the bottom of the view, and the cat beside the player. */
const ROD_BASE = { x: 430, y: V.size };
const ROD_TIP = { x: 372, y: 330 };
const COMPANION = V.companion;
/** Fish shadow body length by size class, at the dock's scale. */
const SHADOW_LENGTH = { small: 46, medium: 64, large: 88 } as const;
/** Bands the sky and water gradients are drawn in. */
const BANDS = 16;
/** Round trees on the far bank: x and radius. */
const TREES = [
  [70, 24],
  [128, 30],
  [230, 20],
  [410, 26],
  [505, 32],
  [575, 22],
] as const;
/** Lotus leaves (aim direction, share out) per spot; the first holds a flower. */
const LOTUS_LEAVES: Partial<Record<SpotId, readonly [number, number][]>> = {
  POND: [
    [-38, 0.2],
    [-30, 0.55],
    [34, 0.35],
    [40, 0.7],
  ],
  MOON: [
    [-40, 0.3],
    [38, 0.55],
  ],
};
/** Slow glints on every water (aim direction, share out). */
const GLINTS = [
  [-20, 0.45],
  [12, 0.62],
  [28, 0.28],
  [-34, 0.74],
  [4, 0.16],
] as const;
/** Fireflies at night over the far bank and the water's edges. */
const FIREFLIES = [
  [150, 132],
  [205, 104],
  [262, 150],
  [360, 118],
  [430, 142],
  [488, 110],
  [160, 250],
  [480, 270],
] as const;
/** Stars in the night sky. */
const STARS = [
  [60, 40],
  [140, 72],
  [250, 30],
  [330, 60],
  [420, 34],
  [540, 58],
  [600, 26],
] as const;

/**
 * The fishing scene in first person (spec 030): looking out from the dock over the water
 * toward the far shore. Presentation only; the landing point, float, bite mark and fish
 * shadow follow the run and the aim preview, never the other way round.
 */
export class RiverView {
  readonly root: Phaser.GameObjects.Container;
  /** Sky, shore and water: redrawn when the spot or the light changes. */
  private backdrop: Phaser.GameObjects.Graphics;
  /** Ripples (and the moon's path on the lake), redrawn as they drift. */
  private water: Phaser.GameObjects.Graphics;
  /** The far bank, sun or moon, reeds and sand over the water's far edge. */
  private scenery: Phaser.GameObjects.Graphics;
  private leaves: Phaser.GameObjects.Container;
  private fireflies: Phaser.GameObjects.Container;
  private marker: Phaser.GameObjects.Graphics;
  private shadowLayer: Phaser.GameObjects.Graphics;
  private shadows: FishShadow[] = [];
  private float: Phaser.GameObjects.Container;
  private fishShadow: Phaser.GameObjects.Graphics;
  private bite: Phaser.GameObjects.Text;
  private rod: Phaser.GameObjects.Graphics;
  /** The rod's lifting motion (spec 033 F6): its stance, since when, from what lift. */
  private lift = { stance: 'rest' as RodStance, since: 0, from: 0, pull: 0 };
  /** The run last seen active: only its catch is landed. */
  private watched: string | null = null;
  /** The fishing line from the rod tip to the float, while one is cast. */
  private line: { width: number; colour: number } | null = null;
  private companion: CatArt;
  /** The companion's look; redrawn when the cat by the water looks different. */
  private companionLook: CatLook = catLook('RAGDOLL', COAT_APPEARANCE.cream);
  private waterKind: SpotId = 'POND';
  private waterFrame = -1;
  /** The spot and light last painted, as `spot/light`. */
  private painted = '';
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    .matches;

  constructor(private readonly scene: Phaser.Scene) {
    this.root = scene.add.container(0, 0).setDepth(20).setVisible(false);
    // The scene runs edge to edge; the page continues it around (riverBackdrop).
    this.backdrop = scene.add.graphics();
    this.water = scene.add.graphics();
    this.scenery = scene.add.graphics();
    this.leaves = scene.add.container(0, 0);
    const glints = GLINTS.map(([direction, share], i) =>
      this.glint(direction, share, i),
    );
    const dock = this.drawDock(scene.add.graphics());
    this.shadowLayer = scene.add.graphics();
    this.marker = scene.add.graphics();
    this.fishShadow = scene.add.graphics();
    this.fishShadow
      .fillStyle(SHADOW.colour)
      .fillEllipse(0, 0, 42, 17)
      .fillTriangle(-16, 0, -34, -12, -34, 12);
    const ripple = scene.add
      .ellipse(0, 0, 44, 16)
      .setStrokeStyle(2, FLOAT.ripple);
    this.float = scene.add.container(0, 0, [
      ripple,
      scene.add.circle(0, -4, 5, FLOAT.colour),
    ]);
    this.bite = scene.add
      .text(0, 0, '!', {
        fontFamily: 'system-ui',
        fontSize: 42,
        color: BITE.colour,
        stroke: BITE.stroke,
        strokeThickness: 5,
      })
      .setOrigin(0.5);
    this.fireflies = scene.add.container(
      0,
      0,
      FIREFLIES.map(([x, y], i) => this.firefly(x, y, i)),
    );
    this.rod = scene.add.graphics();
    this.companion = new CatArt(
      scene,
      COMPANION.x,
      COMPANION.y,
      COMPANION.scale,
      this.companionLook,
    );
    this.root.add([
      this.backdrop,
      this.water,
      this.scenery,
      this.shadowLayer,
      this.leaves,
      ...glints,
      this.marker,
      this.fishShadow,
      this.float,
      this.bite,
      this.fireflies,
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
    const animate = (time: number) => {
      this.animateWater(time);
      if (this.root.visible) this.drawRod(time);
    };
    scene.events.on('update', animate);
    scene.events.once('shutdown', () => scene.events.off('update', animate));
  }

  /** A slow glint on the water: a short bright stroke that fades in and out. */
  private glint(direction: number, share: number, i: number) {
    const { x, y, scale } = waterPoint(direction, share);
    const width = 26 * scale;
    const glint = this.scene.add
      .graphics({ x, y })
      .fillStyle(GLINT)
      .fillRoundedRect(-width / 2, -1.5, width, 3, 1.5)
      .setAlpha(0.5);
    if (!this.reducedMotion)
      this.scene.tweens.add({
        targets: glint,
        alpha: { from: 0.1, to: 0.75 },
        duration: 2600 + i * 400,
        delay: i * 700,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    return glint;
  }

  /** A firefly: a soft glow that pulses and drifts a little. */
  private firefly(x: number, y: number, i: number) {
    const fly = this.scene.add.container(x, y, [
      this.scene.add.circle(0, 0, 8, FIREFLY, 0.3),
      this.scene.add.circle(0, 0, 2.5, FIREFLY),
    ]);
    if (!this.reducedMotion) {
      this.scene.tweens.add({
        targets: fly,
        alpha: { from: 0.2, to: 1 },
        duration: 1300 + i * 170,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      this.scene.tweens.add({
        targets: fly,
        x: x + (i % 2 ? 9 : -9),
        y: y - 6 - (i % 3) * 2,
        duration: 2800 + i * 350,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
    return fly;
  }

  /** Everything that changes only with the spot or the light (time of day). */
  private paint(spot: SpotId, look: RiverLook) {
    const g = this.backdrop.clear();
    // The sky fades down to the far bank (or the sea's horizon), then shows beside it.
    const sky = skyBottom(look);
    for (let i = 0; i < BANDS; i++)
      g.fillStyle(mix(look.sky.top, look.sky.bottom, i / (BANDS - 1))).fillRect(
        0,
        (sky * i) / BANDS,
        V.size,
        sky / BANDS + 1,
      );
    g.fillStyle(look.sky.bottom).fillRect(0, sky, V.size, V.nearY - sky);
    // Calm water, paler toward the horizon, between the shores that slope to the dock.
    const depth = V.nearY - V.horizonY;
    for (let i = 0; i < BANDS; i++)
      g.fillStyle(
        mix(look.water.far, look.water.near, i / (BANDS - 1)),
      ).fillRect(
        0,
        V.horizonY + (depth * i) / BANDS,
        V.size,
        depth / BANDS + 1,
      );
    const shore = V.centerX - V.horizonHalf;
    g.fillStyle(look.sky.bottom)
      .fillTriangle(0, V.horizonY, shore, V.horizonY, 0, V.horizonY + shore * 3)
      .fillTriangle(
        V.size,
        V.horizonY,
        V.size - shore,
        V.horizonY,
        V.size,
        V.horizonY + shore * 3,
      );
    // The far shore's trees reflected on the water.
    if (look.bank !== null)
      for (const [i, [x, size]] of TREES.entries())
        g.fillStyle(look.trees[i % 2]!, REFLECTION_ALPHA).fillEllipse(
          x,
          BANK_STRIP.bottom + 10,
          size * 2,
          size * 0.4,
        );

    const s = this.scenery.clear();
    if (look.light === 'night')
      for (const [x, y] of STARS) s.fillStyle(GLINT, 0.8).fillCircle(x, y, 1.5);
    if (look.sun)
      s.fillStyle(look.sun.colour, 0.9).fillCircle(
        look.sun.x,
        look.sun.y,
        look.sun.radius,
      );
    if (look.moon)
      s.fillStyle(look.moon.colour, look.moon.alpha).fillCircle(470, 78, 26);
    if (look.bank !== null) {
      s.fillStyle(look.bank).fillRect(
        0,
        BANK_STRIP.top,
        V.size,
        BANK_STRIP.bottom - BANK_STRIP.top,
      );
      for (const [i, [x, size]] of TREES.entries())
        s.fillStyle(look.trees[i % 2]!).fillCircle(x, V.horizonY - 30, size);
    }
    // Reed clumps along both sides, inside what a phone shows of the art.
    if (spot === 'REEDS')
      for (let i = 0; i < 16; i++) {
        const side = i % 2 ? 1 : -1;
        const x = V.centerX + side * (145 + (i % 4) * 14);
        const y = V.nearY - 20 - (i % 5) * 42;
        const height = 34 + (i % 3) * 14;
        s.lineStyle(3, look.reed)
          .lineBetween(x, y, x - 6 * side, y - height)
          .lineBetween(x, y, x + 4 * side, y - height * 0.7);
      }
    if (look.sand !== null) {
      // Open sea: a flat horizon, no far bank.
      s.lineStyle(2, look.water.near).lineBetween(
        0,
        V.horizonY,
        V.size,
        V.horizonY,
      );
      s.fillStyle(look.sand).fillRect(0, SAND.top, V.size, V.nearY - SAND.top);
    }
    this.paintLeaves(spot, look);
    this.fireflies.setVisible(look.fireflies);
  }

  /** Lotus leaves, notched and flattened by the distance, bobbing on the water. */
  private paintLeaves(spot: SpotId, look: RiverLook) {
    for (const leaf of this.leaves.list) this.scene.tweens.killTweensOf(leaf);
    this.leaves.removeAll(true);
    for (const [i, [direction, share]] of (
      LOTUS_LEAVES[spot] ?? []
    ).entries()) {
      const { x, y, scale } = waterPoint(direction, share);
      const radius = 24 * scale;
      const pad = this.scene.add
        .graphics()
        .fillStyle(look.lotus.leaf, LOTUS.alpha)
        .slice(0, 0, radius, 1.2, 0.6 + Math.PI * 2)
        .fillPath()
        .setScale(1, 0.36);
      const leaf = this.scene.add.container(x, y, [pad]);
      if (i === 0)
        leaf.add([
          this.scene.add.circle(
            radius * 0.3,
            -radius * 0.1,
            6 * scale,
            look.lotus.flower,
          ),
          this.scene.add.circle(radius * 0.3, -radius * 0.1, 2 * scale, GLINT),
        ]);
      this.leaves.add(leaf);
      if (!this.reducedMotion)
        this.scene.tweens.add({
          targets: leaf,
          y: y + 2 * scale,
          duration: 1800 + i * 300,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
    }
  }

  private drawDock(g: Phaser.GameObjects.Graphics) {
    const top = V.nearY;
    const bottom = V.size;
    g.fillStyle(DOCK.colour).fillRect(0, top, V.size, bottom - top);
    for (let x = 46; x < V.size; x += 90)
      g.lineStyle(2, DOCK.plank).lineBetween(x, top, x - 10, bottom);
    g.lineStyle(3, DOCK.edge).lineBetween(0, top, V.size, top);
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
    // Ripples drift toward the dock; at sea they roll in as wave fronts.
    const flow = kind === 'REEDS' ? 0.12 : kind === 'COAST' ? 0.08 : 0.02;
    for (let i = 0; i < 16; i++) {
      const share = (((i * 0.137 + t * flow) % 1) + 1) % 1;
      const direction = ((i * 29) % 90) - 45 + Math.sin(t + i) * 3;
      const { x, y, scale } = waterPoint(direction, 1 - share);
      const length = (kind === 'COAST' ? 40 : 22) * scale;
      g.lineStyle(
        Math.max(1, 2 * scale),
        GLINT,
        0.12 + (Math.sin(t + i) + 1) * 0.09,
      );
      g.lineBetween(x - length / 2, y, x + length / 2, y);
    }
    this.drawShadows(t);
    if (kind === 'MOON')
      for (let i = 0; i < 6; i++)
        g.fillStyle(GLINT, 0.16).fillEllipse(
          470 + Math.sin(t + i) * 4,
          V.horizonY + 14 + i * 16,
          60 - i * 7,
          4,
        );
  }

  /**
   * Core's fish shadows for this spot and hour (spec 033): silhouettes by size, darker
   * for bigger fish, that drift gently around their place, well inside the radius a
   * cast must land within.
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
      g.fillStyle(SHADOW.colour, SHADOW.alpha[shadow.size])
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
      /** The rod sets the power now (motion aiming). */
      live: boolean;
      spotId: SpotId;
      /** The motion fight ring's centre on the water plane. */
      ringCentre: { x: number; y: number };
    },
  ) {
    const active = world.fishing.active;
    const spotId = active?.spotId ?? preview.spotId;
    if (this.waterKind !== spotId) {
      this.waterKind = spotId;
      this.waterFrame = -1;
    }
    // The light follows the game hour (the style board's 光线随时间).
    const look = riverLook(spotId, world.minute);
    if (`${spotId}/${look.light}` !== this.painted) {
      this.painted = `${spotId}/${look.light}`;
      this.paint(spotId, look);
    }
    const shadows = showsShadows(active) ? fishShadows(world, spotId) : [];
    if (JSON.stringify(shadows) !== JSON.stringify(this.shadows)) {
      this.shadows = shadows;
      this.waterFrame = -1;
    }
    this.animateWater(this.scene.time.now);
    const cat =
      world.cats.find((cat) => cat.id === (active?.catId ?? preview.catId)) ??
      world.cats[0]!;
    // The same breed and choices give the same look object.
    if (lookOf(cat) !== this.companionLook) {
      this.companion.destroy();
      this.companionLook = lookOf(cat);
      this.companion = new CatArt(
        this.scene,
        COMPANION.x,
        COMPANION.y,
        COMPANION.scale,
        this.companionLook,
      );
      this.root.addAt(this.companion, this.root.getIndex(this.rod));
    }
    this.companion
      .setPose(catPose(world, cat, { atRiver: true }))
      .animate(this.root.visible);
    const cast = !!active && active.phase !== 'charge';
    const aim = castPreview(
      world,
      spotId,
      {
        direction: active?.direction ?? preview.direction,
        aimDepth: active?.aimDepth ?? preview.aimDepth,
        // A charging button run previews its live power.
        power: active?.power ?? preview.power,
      },
      ROD_TIP,
    );
    const land = aim.landing;
    // Aiming: a flattened ring where the cast would land, green when Core says it would
    // land on a fish shadow. While the power is live (motion aiming, a charging button
    // run) the float's flight arcs onto it dashed from the rod tip (spec 033 F5, F5b).
    const live = !active ? preview.live : active.phase === 'charge';
    const colour = aim.shadow ? AIM.onShadow : AIM.ring;
    // Motion aiming at an end of the water: more pitch moves the ring no further.
    const limit = !active && preview.live && aim.limit ? AIM.limit : null;
    this.marker.clear().setVisible(!cast);
    if (!cast) {
      if (live) {
        this.marker.lineStyle(3, colour, AIM.alpha);
        for (let i = 0; i + 1 < aim.arc.length; i += 2)
          this.marker.lineBetween(
            aim.arc[i]!.x,
            aim.arc[i]!.y,
            aim.arc[i + 1]!.x,
            aim.arc[i + 1]!.y,
          );
      }
      this.marker
        .lineStyle(3, colour, limit?.alpha ?? AIM.alpha)
        .strokeEllipse(
          land.x,
          land.y,
          V.ring.width * land.scale,
          V.ring.height * land.scale * (limit?.flatten ?? 1),
        )
        .lineStyle(2, colour, AIM.alpha)
        .lineBetween(
          land.x,
          land.y - 8 * land.scale,
          land.x,
          land.y + 8 * land.scale,
        );
    }
    // A motion fight: the line runs to the ring the player steers.
    const held =
      active?.mode === 'motion' && active.phase === 'fight'
        ? planePoint(preview.ringCentre)
        : null;
    const flight =
      active?.phase === 'waiting' ? Math.min(1, active.phaseTick / 10) : 1;
    const bob =
      active?.phase === 'hook'
        ? Math.sin(active.phaseTick / 2) * 5
        : active?.phase === 'waiting'
          ? Math.sin(active.phaseTick / 5) * 2
          : 0;
    this.float.setVisible(cast);
    if (held) this.float.setPosition(held.x, held.y).setScale(held.scale);
    else {
      // The flight the aiming preview drew.
      const flown = flightPoint(ROD_TIP, land, flight);
      this.float
        .setPosition(flown.x, flown.y + bob)
        .setScale(land.scale * (active?.phase === 'hook' ? 1.5 : 1));
    }
    this.bite
      .setVisible(active?.phase === 'hook')
      .setPosition(land.x, land.y - 45 * land.scale);
    // Only the hooked fish of a button fight: the motion overlay draws its own fish.
    // It comes closer, larger and darker, as the fight's progress fills (spec 033 F1).
    const hooked = active?.phase === 'fight' && !held;
    this.fishShadow.setVisible(hooked);
    if (hooked) {
      const fish = hookedFish(land, active.progress, active.tick);
      const [far, near] = SHADOW.hooked;
      this.fishShadow
        .setPosition(fish.x, fish.y)
        .setScale(fish.scale)
        .setAlpha(far + (near - far) * fish.near);
    }
    const now = this.scene.time.now;
    const stance = rodStance(world.fishing, this.watched);
    if (stance !== this.lift.stance)
      this.lift = {
        ...this.lift,
        stance,
        since: now,
        from: this.rodPose(now).lift,
      };
    if (active) this.watched = active.id;
    // The rod bends with the line tension (a motion fight's dash pull).
    if (active?.phase === 'fight') this.lift.pull = active.tension / 100;
    this.line = cast
      ? {
          width: active.phase === 'fight' ? 2 : 1,
          // Only the button flow has line tension to warn about.
          colour:
            active.mode === 'buttons' &&
            (active.tension > 85 || active.tension < 15)
              ? LINE.tight
              : LINE.colour,
        }
      : null;
    this.drawRod(now);
  }

  /** The cat beside the player answers a tap with a small move (R-03). */
  react(motion: CatMotion) {
    if (this.root.visible) this.companion.react(motion);
  }

  private rodPose(time: number) {
    return rodPose(
      { ...this.lift, ms: time - this.lift.since },
      this.reducedMotion,
    );
  }

  /** The rod in its pose at `time`, and the line from its tip to the float. */
  private drawRod(time: number) {
    const points = rodShape(this.rodPose(time), ROD_BASE, ROD_TIP, this.float);
    this.rod.clear().lineStyle(5, ROD);
    for (let i = 1; i < points.length; i++)
      this.rod.lineBetween(
        points[i - 1]!.x,
        points[i - 1]!.y,
        points[i]!.x,
        points[i]!.y,
      );
    const tip = points.at(-1)!;
    if (this.line)
      this.rod
        .lineStyle(this.line.width, this.line.colour, 0.9)
        .lineBetween(tip.x, tip.y, this.float.x, this.float.y - 4);
  }
}
