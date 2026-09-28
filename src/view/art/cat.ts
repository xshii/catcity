import Phaser from 'phaser';

/** Presentation-only shapes and tweens: never used to decide game outcomes. */
export function catArt(
  scene: Phaser.Scene,
  x: number,
  y: number,
  scale = 1,
  coat: 'cream' | 'gray' = 'cream',
) {
  const root = scene.add.container(x, y).setScale(scale);
  const shadow = scene.add.ellipse(0, 19, 38, 11, 0x3b6354, 0.16);
  const tail = scene.add
    .graphics()
    .lineStyle(7, coat === 'gray' ? 0x81918e : 0xd3b88a)
    .beginPath()
    .arc(14, 9, 10, -1.3, 1.8)
    .strokePath();
  const body = scene.add.graphics();
  body
    .fillStyle(coat === 'gray' ? 0x9aa6a5 : 0xf2dfb7)
    .fillEllipse(0, 6, 28, 30);
  body
    .fillStyle(coat === 'gray' ? 0xb4bfbb : 0xf8e9c9)
    .fillTriangle(-15, -7, -13, -27, -2, -13)
    .fillTriangle(2, -13, 13, -27, 15, -7);
  body
    .fillStyle(0xe7b6a3)
    .fillTriangle(-12, -12, -11, -22, -5, -12)
    .fillTriangle(5, -12, 11, -22, 12, -12);
  body
    .fillStyle(coat === 'gray' ? 0xb4bfbb : 0xf8e9c9)
    .fillEllipse(0, -8, 34, 28);
  body.fillStyle(0xfff4dc).fillEllipse(0, 10, 16, 17);
  body
    .fillStyle(0xe8b2a0, 0.55)
    .fillEllipse(-10, -4, 6, 3)
    .fillEllipse(10, -4, 6, 3);
  body.fillStyle(0xbf8c7e).fillTriangle(-2, -5, 2, -5, 0, -2);
  body
    .lineStyle(0.8, 0x8b795e)
    .lineBetween(0, -2, 0, 1)
    .lineBetween(0, 1, -3, 2)
    .lineBetween(0, 1, 3, 2);
  body.fillStyle(0xe5cca2).fillEllipse(-8, 18, 10, 5).fillEllipse(8, 18, 10, 5);
  const eyes = scene.add.container(0, -10, [
    scene.add.ellipse(-7, 0, 3, 5, 0x514d3c),
    scene.add.ellipse(7, 0, 3, 5, 0x514d3c),
  ]);
  root.add([shadow, tail, body, eyes]);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduced) {
    scene.tweens.add({
      targets: tail,
      angle: 12,
      duration: 1600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    scene.tweens.add({
      targets: [body, eyes],
      y: '-=0.8',
      duration: 1800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    scene.tweens.add({
      targets: eyes,
      scaleY: 0.12,
      duration: 110,
      yoyo: true,
      repeat: -1,
      repeatDelay: 3100,
    });
  }
  return root;
}
