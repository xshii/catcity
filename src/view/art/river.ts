import Phaser from 'phaser';
import type { SpotId } from '../../content/fishing';
import type { WorldState } from '../../core';
import { catArt } from './cat';

export class RiverView {
  readonly root: Phaser.GameObjects.Container;
  private rod: Phaser.GameObjects.Graphics;
  private float!: Phaser.GameObjects.Container;
  private moon!: Phaser.GameObjects.Rectangle;
  private reeds!: Phaser.GameObjects.Graphics;
  private companion!: Phaser.GameObjects.Container;
  private coat = 'cream';
  private fishShadow!: Phaser.GameObjects.Graphics;
  private bite!: Phaser.GameObjects.Text;
  private water!: Phaser.GameObjects.Graphics;
  private shore!: Phaser.GameObjects.Graphics;
  private waterKind = 'POND';
  private waterFrame = -1;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    .matches;

  constructor(private readonly scene: Phaser.Scene) {
    this.root = scene.add.container(0, 0).setDepth(20).setVisible(false);
    let g = scene.add.graphics();
    this.root.add(g);
    g.fillStyle(0xdce6cd).fillRoundedRect(18, 18, 604, 604, 28);
    g.fillStyle(0xeaf0de).fillRoundedRect(30, 30, 580, 580, 22);
    // The curved river is a drawn scene, not the authoritative city tile map.
    g.fillStyle(0x98c5bb)
      .beginPath()
      .moveTo(210, 154)
      .lineTo(609, 134)
      .lineTo(609, 558)
      .lineTo(292, 549)
      .lineTo(338, 442)
      .lineTo(228, 365)
      .lineTo(277, 250)
      .closePath()
      .fillPath();
    g.lineStyle(8, 0xd1ddbb)
      .beginPath()
      .moveTo(211, 154)
      .lineTo(277, 250)
      .lineTo(228, 365)
      .lineTo(338, 442)
      .lineTo(292, 549)
      .strokePath();
    this.water = scene.add.graphics();
    this.root.add(this.water);
    this.shore = scene.add.graphics();
    this.shore
      .fillStyle(0xe9d5ac)
      .beginPath()
      .moveTo(195, 154)
      .lineTo(254, 250)
      .lineTo(210, 365)
      .lineTo(317, 442)
      .lineTo(272, 549)
      .lineTo(292, 549)
      .lineTo(338, 442)
      .lineTo(228, 365)
      .lineTo(277, 250)
      .lineTo(210, 154)
      .closePath()
      .fillPath();
    this.root.add(this.shore);
    // Shore decorations remain above water effects and never affect collision state.
    g = scene.add.graphics();
    this.root.add(g);
    for (const [x, y, size] of [
      [87, 186, 38],
      [150, 223, 28],
      [76, 293, 39],
      [546, 90, 35],
      [470, 102, 26],
    ]) {
      g.fillStyle(0x789d75, 0.2).fillEllipse(x!, y! + size!, size! * 1.5, 18);
      g.fillStyle(0xa0b68a).fillRoundedRect(x! - 5, y!, 10, size! + 8, 3);
      g.fillStyle(0x91ac7e).fillCircle(x!, y!, size!);
      g.fillStyle(0xb7c999).fillCircle(
        x! - size! * 0.2,
        y! - size! * 0.2,
        size! * 0.75,
      );
    }
    for (let i = 0; i < 34; i++) {
      const x = 57 + ((i * 37) % 146),
        y = 226 + ((i * 71) % 300);
      g.lineStyle(2, 0xa7ba8a)
        .lineBetween(x, y, x - 2, y - 5)
        .lineBetween(x, y, x + 3, y - 7);
      if (i % 4 === 0) g.fillStyle(0xe8bc97).fillCircle(x, y - 8, 3);
    }
    // A small wooden jetty, picnic basket, and a place beside Mochi.
    g.fillStyle(0x719d8e, 0.22).fillRoundedRect(121, 360, 199, 31, 9);
    g.fillStyle(0xbfa47c).fillRoundedRect(117, 339, 199, 31, 6);
    for (let i = 0; i < 8; i++)
      g.lineStyle(1, 0x967e5c, 0.5).lineBetween(
        124 + i * 25,
        341,
        124 + i * 25,
        367,
      );
    g.fillStyle(0xe3be7f).fillRoundedRect(77, 357, 33, 28, 6);
    g.lineStyle(3, 0xc6a16e).strokeEllipse(93, 359, 23, 20);
    g.fillStyle(0xf2e5c4).fillRoundedRect(218, 335, 49, 9, 4);
    this.moon = scene.add
      .rectangle(320, 320, 604, 604, 0x7778b0, 0.22)
      .setVisible(false);
    this.root.add(this.moon);
    this.reeds = scene.add.graphics();
    for (let i = 0; i < 12; i++) {
      const x = 280 + i * 22;
      const y = 500 + (i % 3) * 8;
      this.reeds
        .lineStyle(3, 0x6b8e6a)
        .lineBetween(x, y, x - 8, y - 40)
        .lineBetween(x, y, x + 5, y - 28);
    }
    this.root.add(this.reeds);
    this.companion = catArt(scene, 164, 383, 2.4);
    this.root.add(this.companion);
    const ripple = scene.add.ellipse(0, 0, 44, 18).setStrokeStyle(2, 0xfaf3cf);
    this.float = scene.add.container(420, 340, [
      ripple,
      scene.add.circle(0, -4, 5, 0xd98b6c),
    ]);
    this.root.add(this.float);
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      scene.tweens.add({
        targets: ripple,
        scale: 1.2,
        alpha: 0.35,
        duration: 1000,
        yoyo: true,
        repeat: -1,
      });
    this.rod = scene.add.graphics();
    this.root.add(this.rod);
    this.fishShadow = scene.add.graphics();
    this.fishShadow
      .fillStyle(0x3a796b, 0.5)
      .fillEllipse(0, 0, 42, 17)
      .fillTriangle(-16, 0, -34, -12, -34, 12);
    this.root.add(this.fishShadow);
    this.bite = scene.add
      .text(0, 0, '!', {
        fontFamily: 'system-ui',
        fontSize: 42,
        color: '#fff4c0',
        stroke: '#d09050',
        strokeThickness: 5,
      })
      .setOrigin(0.5);
    this.root.add(this.bite);
    for (let i = 0; i < 4; i++) {
      const leaf = scene.add
        .ellipse(360 + i * 55, 195 + i * 80, 14, 5, 0x779e8d, 0.45)
        .setAngle(-20);
      this.root.add(leaf);
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches)
        scene.tweens.add({
          targets: leaf,
          x: leaf.x + 24,
          y: leaf.y + 10,
          duration: 3300 + i * 300,
          yoyo: true,
          repeat: -1,
        });
    }
    const animate = (time: number) => this.animateWater(time);
    scene.events.on('update', animate);
    scene.events.once('shutdown', () => scene.events.off('update', animate));
  }

  private animateWater(time: number) {
    if (!this.root.visible) return;
    const frame = this.reducedMotion ? 0 : Math.floor(time / 50);
    if (frame === this.waterFrame) return;
    this.waterFrame = frame;
    const t = frame / 20;
    const kind = this.waterKind;
    const coast = kind === 'COAST';
    const river = kind === 'REEDS';
    const lake = kind === 'MOON';
    const g = this.water.clear();
    g.fillStyle(
      coast ? 0x77b8c2 : river ? 0x83b9af : lake ? 0x7f9fb5 : 0x9bc8b7,
    )
      .beginPath()
      .moveTo(210, 154)
      .lineTo(609, 134)
      .lineTo(609, 558)
      .lineTo(292, 549)
      .lineTo(338, 442)
      .lineTo(228, 365)
      .lineTo(277, 250)
      .closePath()
      .fillPath();
    // Ripples drift slowly in still water, downstream in rivers, and form wave fronts at sea.
    for (let i = 0; i < 18; i++) {
      const x =
        355 + ((i * 43) % 215) + Math.sin(t * 0.8 + i) * (lake ? 12 : 5);
      const y = 174 + ((i * 61 + (river ? t * 19 : coast ? t * 7 : 0)) % 340);
      const length = coast ? 26 : lake ? 30 : 14;
      g.lineStyle(
        coast ? 2 : 1.5,
        0xe0f2df,
        0.2 + (Math.sin(t + i) + 1) * 0.12,
      );
      g.beginPath()
        .moveTo(x, y)
        .lineTo(x + length / 2, y - Math.sin(t + i) * 2)
        .lineTo(x + length, y)
        .strokePath();
    }
    if (coast) {
      for (let row = 0; row < 4; row++) {
        const shift = (t * 13 + row * 36) % 144;
        const x = 380 + shift;
        g.lineStyle(3, 0xf6f7df, 0.28 * (1 - shift / 180));
        g.beginPath()
          .moveTo(x, 170)
          .lineTo(x - 13, 235)
          .lineTo(x + 3, 300)
          .lineTo(x - 8, 365)
          .lineTo(x + 6, 430)
          .lineTo(x - 8, 520)
          .strokePath();
      }
    } else if (lake) {
      for (let i = 0; i < 7; i++)
        g.fillStyle(0xf1e9ce, 0.13).fillEllipse(
          490 + Math.sin(t + i) * 4,
          200 + i * 11,
          75 - i * 7,
          4,
        );
    } else if (!river) {
      for (let i = 0; i < 3; i++) {
        const phase = (t * 0.35 + i / 3) % 1;
        g.lineStyle(1.5, 0xe9f4d9, (1 - phase) * 0.4).strokeEllipse(
          380 + i * 73,
          220 + i * 90,
          18 + phase * 30,
          5 + phase * 10,
        );
      }
    }
    const count = coast ? 8 : lake ? 3 : river ? 6 : 4;
    for (let i = 0; i < count; i++) {
      const x =
        374 + ((i * 47) % 190) + Math.sin(t * (river ? 1.1 : 0.5) + i) * 12;
      const y =
        190 +
        ((i * 53 + (river ? t * 15 : coast ? t * 5 : 0)) % 285) +
        Math.cos(t * 0.6 + i) * 4;
      const size = lake ? 1.1 : coast ? 0.75 : 0.6;
      g.fillStyle(lake ? 0x454f77 : 0x3b8274, 0.24)
        .fillEllipse(x, y, 21 * size, 8 * size)
        .fillTriangle(
          x - 8 * size,
          y,
          x - 17 * size,
          y - 6 * size,
          x - 17 * size,
          y + 6 * size,
        );
    }
  }

  render(
    world: WorldState,
    preview: {
      catId: string;
      direction: number;
      aimDepth: number;
      spotId: SpotId;
    },
  ) {
    const active = world.fishing.active;
    const recent = world.fishing.lastResult;
    const spotId = active?.spotId ?? preview.spotId;
    if (this.waterKind !== spotId) {
      this.waterKind = spotId;
      this.waterFrame = -1;
    }
    this.shore.setVisible(this.waterKind === 'COAST');
    this.animateWater(this.scene.time.now);
    this.moon.setVisible(spotId === 'MOON');
    this.reeds.setVisible(spotId === 'REEDS');
    const cat =
      world.cats.find((cat) => cat.id === (active?.catId ?? preview.catId)) ??
      world.cats[0]!;
    if (cat.appearance.coat !== this.coat) {
      this.companion.destroy();
      this.coat = cat.appearance.coat;
      this.companion = catArt(this.scene, 164, 383, 2.4, cat.appearance.coat);
      this.root.add(this.companion);
    }
    this.bite.setVisible(active?.phase === 'hook');
    this.fishShadow.setVisible(
      active?.phase === 'fight' || (!active && !recent),
    );
    const x = 430 + (active?.direction ?? preview.direction) * 2;
    const y =
      480 -
      (active?.aimDepth ?? preview.aimDepth) * 2 -
      (active?.power ?? 60) * 0.8;
    const flight =
      active?.phase === 'waiting' ? Math.min(1, active.phaseTick / 10) : 1;
    const bob =
      active?.phase === 'hook'
        ? Math.sin(active.phaseTick / 2) * 5
        : active?.phase === 'waiting'
          ? Math.sin(active.phaseTick / 5) * 2
          : 0;
    this.float.setPosition(
      237 + (x - 237) * flight,
      244 + (y - 244) * flight - Math.sin(flight * Math.PI) * 60 + bob,
    );
    this.float.setScale(active?.phase === 'hook' ? 1.5 : 1);
    this.bite.setPosition(x, y - 45);
    this.fishShadow.setPosition(
      x - 20 + Math.sin((active?.tick ?? 0) / 10) * 16,
      y + 30,
    );
    this.fishShadow.setScale(
      active?.phase === 'fight' ? 1 + active.progress / 100 : 1,
    );
    this.companion.setPosition(164, 310);
    this.rod
      .clear()
      .lineStyle(3, 0x886c4d)
      .lineBetween(190, 330, 237, 244)
      .lineStyle(
        active?.phase === 'fight' ? 2 : 1,
        active && (active.tension > 85 || active.tension < 15)
          ? 0xcc7454
          : 0xf6f0d9,
        0.9,
      )
      .lineBetween(237, 244, this.float.x, this.float.y - 4);
  }
}
