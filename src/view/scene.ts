import Phaser from 'phaser';
import type { GameSession } from '../application/session';
import { MAP_VIEW, tileCenter } from './geometry';

export class CityScene extends Phaser.Scene {
  private graphics!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  constructor(
    private readonly session: GameSession,
    private readonly onMessage: (message: string) => void,
  ) {
    super('city');
  }

  create() {
    this.graphics = this.add.graphics();
    this.paint();
    const unsubscribe = this.session.subscribe(() => this.paint());
    this.events.once('shutdown', unsubscribe);
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const x = Math.floor((pointer.x - MAP_VIEW.origin) / MAP_VIEW.tile);
      const y = Math.floor((pointer.y - MAP_VIEW.origin) / MAP_VIEW.tile);
      if (x < 0 || x >= 10 || y < 0 || y >= 10) return;
      const world = this.session.getSnapshot();
      const cat = world.cats.find(
        (item) => item.position.x === x && item.position.y === y,
      );
      if (cat) {
        this.session.select(cat.id);
        this.onMessage('Mochi 抬起了头，正等你打招呼。');
        return;
      }
      if (world.buildings.length) {
        this.onMessage('猫咖正在营业。点击 Mochi，认识你的第一位居民。');
        return;
      }
      const result = this.session.execute({
        type: 'BUILD_CAFE',
        position: { x, y },
      });
      this.onMessage(
        result.ok
          ? '小小的猫咖开张了，每游戏小时收入 10 金币。'
          : `这里暂时不能建造：${result.error}`,
      );
    });
    const canvas = this.game.canvas;
    canvas.setAttribute(
      'aria-label',
      '猫咪城市地图，点击空地建造猫咖，点击猫咪进行互动',
    );
    canvas.setAttribute('role', 'img');
  }

  private label(
    x: number,
    y: number,
    text: string,
    size = 12,
    color = '#53674f',
  ) {
    this.labels.push(
      this.add
        .text(x, y, text, { fontFamily: 'system-ui', fontSize: size, color })
        .setOrigin(0.5),
    );
  }

  private paint() {
    const g = this.graphics;
    g.clear();
    for (const label of this.labels) label.destroy();
    this.labels = [];
    g.fillStyle(0xe9e7d8).fillRoundedRect(25, 30, 590, 590, 26);
    g.fillStyle(0xf9f7ef).fillRoundedRect(25, 24, 590, 590, 26);
    g.fillStyle(0xc1cca7).fillRoundedRect(54, 54, 532, 532, 14);
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        const left = MAP_VIEW.origin + x * MAP_VIEW.tile;
        const top = MAP_VIEW.origin + y * MAP_VIEW.tile;
        g.fillStyle((x + y) % 2 ? 0xd5dfbc : 0xdce4c6).fillRoundedRect(
          left + 1,
          top + 1,
          50,
          50,
          5,
        );
        if ((x * 7 + y * 3) % 9 === 0) {
          g.lineStyle(1.5, 0xafbf91, 0.6)
            .lineBetween(left + 12, top + 37, left + 10, top + 33)
            .lineBetween(left + 12, top + 37, left + 15, top + 31);
          g.fillStyle(0xf8f2c7).fillCircle(left + 40, top + 15, 2);
        }
      }
    }
    for (let i = 0; i < 10; i++) {
      this.label(60 + i * 52 + 26, 43, String(i + 1), 10, '#98a28b');
      this.label(
        42,
        60 + i * 52 + 26,
        String.fromCharCode(65 + i),
        10,
        '#98a28b',
      );
    }
    const world = this.session.getSnapshot();
    for (const building of world.buildings) {
      const { x, y } = tileCenter(building.position.x, building.position.y);
      g.fillStyle(0x84966e, 0.2).fillEllipse(x + 2, y + 21, 48, 13);
      g.fillStyle(0xf8ebcd).fillRoundedRect(x - 22, y - 13, 44, 35, 4);
      g.fillStyle(0xa96647).fillTriangle(
        x - 27,
        y - 13,
        x,
        y - 31,
        x + 27,
        y - 13,
      );
      g.fillStyle(0x6f8c72).fillRoundedRect(x - 16, y, 13, 15, 2);
      g.fillStyle(0x8c694c).fillRoundedRect(x + 4, y - 1, 11, 23, 2);
      for (let i = 0; i < 6; i++)
        g.fillStyle(i % 2 ? 0xf9edd5 : 0xd68a68).fillRect(
          x - 24 + i * 8,
          y - 9,
          8,
          9,
        );
      this.label(x, y + 32, 'CAT CAFÉ', 9, '#655342');
    }
    for (const cat of world.cats) {
      const { x, y } = tileCenter(cat.position.x, cat.position.y);
      if (this.session.selectedEntity === cat.id)
        g.lineStyle(2, 0x72906a).strokeRoundedRect(x - 23, y - 25, 46, 49, 10);
      g.fillStyle(0x738763, 0.2).fillEllipse(x, y + 16, 32, 10);
      g.lineStyle(6, 0xd8b991)
        .beginPath()
        .arc(x + 13, y + 8, 8, -1, 1.8)
        .strokePath();
      g.fillStyle(0xf5e3c2).fillEllipse(x, y + 5, 25, 26);
      g.fillStyle(0xf5e3c2)
        .fillTriangle(x - 14, y - 5, x - 12, y - 21, x - 2, y - 11)
        .fillTriangle(x + 2, y - 11, x + 12, y - 21, x + 14, y - 5);
      g.fillStyle(0xe6b9a6)
        .fillTriangle(x - 11, y - 9, x - 11, y - 17, x - 5, y - 10)
        .fillTriangle(x + 5, y - 10, x + 11, y - 17, x + 11, y - 9);
      g.fillStyle(0xf8e9ce).fillEllipse(x, y - 5, 29, 23);
      g.fillStyle(0x554e42)
        .fillEllipse(x - 6, y - 6, 3, 4)
        .fillEllipse(x + 6, y - 6, 3, 4);
      g.fillStyle(0xd29589).fillTriangle(x - 2, y - 2, x + 2, y - 2, x, y + 1);
      this.label(x, y + 31, cat.name, 11, '#485b42');
    }
    this.label(320, 602, '一块小小的空地，也能成为温暖的家。', 11, '#89927d');
  }
}
