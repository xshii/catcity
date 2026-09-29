import Phaser from 'phaser';
import {
  CAT_ART,
  colourOf,
  type CatCoat,
  type CatPose,
  type CatShape,
} from './cat-look';

/** The portrait space's feet (bottom centre of the head) and eye line. */
const FEET = { x: 36, y: 58 } as const;
const EYE_LINE = 38;
/** Portrait units to sprite pixels; the feet sit where the old sprite's paws did. */
const SIZE = 0.85;
const FEET_Y = 19;

/** Points along one subpath of the art's own absolute M/L/Q/C/Z paths. */
function pathPoints(d: string, origin: { x: number; y: number }) {
  const [start, ...rest] = d.match(/[MLQCZ][^MLQCZ]*/g)!;
  const numbers = (part: string) =>
    part
      .slice(1)
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((value, i) => Number(value) - (i % 2 ? origin.y : origin.x));
  const [x, y] = numbers(start);
  const path = new Phaser.Curves.Path(x, y);
  for (const part of rest) {
    const [a, b, c, d, e, f] = numbers(part);
    if (part[0] === 'L') path.lineTo(a!, b);
    else if (part[0] === 'Q') path.quadraticBezierTo(c!, d, a, b);
    else if (part[0] === 'C') path.cubicBezierTo(e!, f!, a!, b, c, d);
    else path.closePath();
  }
  return path.getPoints(8);
}

function draw(
  g: Phaser.GameObjects.Graphics,
  shapes: readonly CatShape[],
  coat: CatCoat,
  origin: { x: number; y: number },
) {
  const hex = (shape: CatShape, key: 'fill' | 'stroke') =>
    Phaser.Display.Color.HexStringToColor(colourOf(shape[key]!, coat)).color;
  for (const shape of shapes) {
    if (shape.ellipse) {
      const [cx, cy, rx, ry] = shape.ellipse;
      g.fillStyle(hex(shape, 'fill')).fillEllipse(
        cx - origin.x,
        cy - origin.y,
        rx * 2,
        ry * 2,
      );
      continue;
    }
    const points = pathPoints(shape.d!, origin);
    if (shape.fill) g.fillStyle(hex(shape, 'fill')).fillPoints(points, true);
    if (shape.stroke)
      g.lineStyle(shape.width ?? 2, hex(shape, 'stroke')).strokePoints(
        points,
        shape.d!.endsWith('Z'),
      );
  }
  return g;
}

/**
 * A cat on the map or the dock (style board 猫咪表情), drawn from the same shapes as
 * the card portrait. `setPose` redraws only what changed; idle motion (slow breathing,
 * an occasional blink, a tail swish) runs on its own parts, is off under
 * `prefers-reduced-motion: reduce`, and pauses with `animate(false)`. Presentation only.
 */
export class CatArt extends Phaser.GameObjects.Container {
  private readonly figure: Phaser.GameObjects.Container;
  private readonly awake: Phaser.GameObjects.Container;
  private readonly ears: Phaser.GameObjects.Graphics;
  private readonly eyes: Phaser.GameObjects.Graphics;
  private readonly face: Phaser.GameObjects.Graphics;
  private readonly curled: Phaser.GameObjects.Graphics;
  private readonly idle: Phaser.Tweens.Tween[] = [];
  private pose = '';
  private moving = true;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    scale = 1,
    private readonly coat: CatCoat = 'cream',
  ) {
    super(scene, x, y);
    scene.add.existing(this);
    this.setScale(scale);
    const tailRoot = { x: 58, y: 50 };
    const tail = draw(scene.add.graphics(), CAT_ART.tail, coat, tailRoot);
    tail.setPosition(tailRoot.x - FEET.x, tailRoot.y - FEET.y);
    this.ears = scene.add.graphics();
    this.eyes = scene.add.graphics().setPosition(0, EYE_LINE - FEET.y);
    this.face = scene.add.graphics();
    this.awake = scene.add.container(0, 0, [
      tail,
      draw(scene.add.graphics(), CAT_ART.head, coat, FEET),
      this.ears,
      this.eyes,
      this.face,
    ]);
    this.curled = draw(scene.add.graphics(), CAT_ART.curled, coat, FEET);
    this.figure = scene.add
      .container(0, FEET_Y, [this.awake, this.curled])
      .setScale(SIZE);
    this.add([scene.add.ellipse(0, 19, 38, 11, 0x3b6354, 0.16), this.figure]);
    this.setPose({ face: 'calm', ears: 'up', curled: false });
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const loop = { yoyo: true, repeat: -1, ease: 'Sine.easeInOut' };
    tail.setAngle(-8);
    this.idle.push(
      scene.tweens.add({
        targets: this.figure,
        scaleY: SIZE * 1.04,
        scaleX: SIZE * 1.015,
        duration: 1900,
        ...loop,
      }),
      scene.tweens.add({
        targets: tail,
        angle: 10,
        duration: 1300,
        repeatDelay: 700,
        ...loop,
      }),
      scene.tweens.add({
        targets: this.eyes,
        scaleY: 0.1,
        duration: 90,
        yoyo: true,
        repeat: -1,
        delay: Phaser.Math.Between(400, 3000),
        repeatDelay: 3600,
      }),
    );
    // Looping tweens outlive their targets unless stopped with them.
    this.once(Phaser.GameObjects.Events.DESTROY, () =>
      this.idle.forEach((tween) => tween.remove()),
    );
  }

  setPose(pose: CatPose) {
    const key = JSON.stringify(pose);
    if (key === this.pose) return this;
    this.pose = key;
    this.awake.setVisible(!pose.curled);
    this.curled.setVisible(pose.curled);
    draw(this.ears.clear(), CAT_ART.ears[pose.ears], this.coat, FEET);
    draw(this.eyes.clear(), CAT_ART.eyes[pose.face], this.coat, {
      x: FEET.x,
      y: EYE_LINE,
    });
    draw(this.face.clear(), CAT_ART.face[pose.face], this.coat, FEET);
    return this;
  }

  /** Idle motion only for a cat on screen. */
  animate(on: boolean) {
    if (on === this.moving) return this;
    this.moving = on;
    for (const tween of this.idle) {
      if (on) tween.resume();
      else tween.pause();
    }
    return this;
  }
}
