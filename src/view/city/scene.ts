import Phaser from 'phaser';
import type { GameSession } from '../../application';
import type { SpotId } from '../../content/fishing';
import type { Position } from '../../core';
import { catArt } from '../companion/art';
import type { CityActions } from './actions';
import { drawCityMap } from './map-art';
import { RiverView } from '../fishing/river';
import { MAP_VIEW, tileCenter } from './geometry';

export class CityScene extends Phaser.Scene {
  private graphics!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private cats = new Map<string, Phaser.GameObjects.Container>();
  private river!: RiverView;
  private riverMode = false;
  private paintedState = '';
  private overview = false;
  private cameraMode = '';
  constructor(
    private readonly session: GameSession,
    private readonly onMessage: (message: string) => void,
    private readonly cityActions: CityActions,
  ) {
    super('city');
  }

  create() {
    this.graphics = this.add.graphics();
    this.river = new RiverView(this);
    const stage = document.getElementById('fishing-stage')!;
    const repaint = () => this.paint();
    const stageObserver = new MutationObserver(repaint);
    stageObserver.observe(stage, {
      attributes: true,
      attributeFilter: ['class'],
    });
    const overview = document.getElementById('city-overview')!;
    const toggleOverview = () => {
      this.overview = !this.overview;
      this.updateCamera();
    };
    overview.addEventListener('click', toggleOverview);
    for (const id of ['fish-location', 'fish-direction', 'fish-depth']) {
      document.getElementById(id)!.addEventListener('input', repaint);
      document.getElementById(id)!.addEventListener('change', repaint);
    }
    const sizeObserver = new ResizeObserver(([entry]) => {
      if (entry)
        this.scale.setParentSize(
          entry.contentRect.width,
          entry.contentRect.height,
        );
    });
    sizeObserver.observe(document.getElementById('game')!);
    const unsubscribe = this.session.subscribe(repaint);
    const unsubscribeSelection = this.cityActions.subscribe(repaint);
    this.events.once('shutdown', () => {
      stageObserver.disconnect();
      sizeObserver.disconnect();
      unsubscribe();
      unsubscribeSelection();
      overview.removeEventListener('click', toggleOverview);
      for (const id of ['fish-location', 'fish-direction', 'fish-depth']) {
        document.getElementById(id)?.removeEventListener('input', repaint);
        document.getElementById(id)?.removeEventListener('change', repaint);
      }
    });
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.riverMode) {
        this.aimOnWater(pointer);
        return;
      }
      const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const x = Math.floor((point.x - MAP_VIEW.origin) / MAP_VIEW.tile);
      const y = Math.floor((point.y - MAP_VIEW.origin) / MAP_VIEW.tile);
      if (x < 0 || x >= 10 || y < 0 || y >= 10) return;
      const cat = this.session
        .getSnapshot()
        .cats.find((item) => item.position.x === x && item.position.y === y);
      if (cat) {
        this.cityActions.selectCat(cat.id);
        this.onMessage(
          this.cityActions.isSelected(cat.id)
            ? `已选中 ${cat.name}，点击目标地块让它走过去。`
            : '已取消猫咪选择，可以选地建设。',
        );
      } else this.cityActions.selectTile({ x, y });
    });
    this.game.canvas.setAttribute(
      'aria-label',
      '猫咪城市地图：点击土地购买或建设；点击猫再点目的地步行；点击水域前往岸边',
    );
    this.game.canvas.setAttribute('role', 'img');
    this.paint();
  }

  /** Read-only view observation for real pointer input in the dev/test bridge. */
  getTileScreenPosition(position: Position): { x: number; y: number } {
    const point = tileCenter(position.x, position.y);
    const camera = this.cameras.main;
    const origin = camera.getWorldPoint(0, 0);
    const horizontal = camera.getWorldPoint(1, 0).subtract(origin);
    const vertical = camera.getWorldPoint(0, 1).subtract(origin);
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    const determinant = horizontal.x * vertical.y - horizontal.y * vertical.x;
    const screen = {
      x: (dx * vertical.y - dy * vertical.x) / determinant,
      y: (horizontal.x * dy - horizontal.y * dx) / determinant,
    };
    const rect = this.game.canvas.getBoundingClientRect();
    return {
      x: rect.left + (screen.x * rect.width) / this.scale.width,
      y: rect.top + (screen.y * rect.height) / this.scale.height,
    };
  }

  private aimOnWater(pointer: Phaser.Input.Pointer) {
    if (
      this.session.getSnapshot().fishing.active ||
      pointer.x < 270 ||
      pointer.y < 150 ||
      pointer.y >= 470
    )
      return;
    const direction = document.getElementById(
      'fish-direction',
    ) as HTMLInputElement;
    direction.value = String(
      Math.max(-45, Math.min(45, Math.round((pointer.x - 430) / 10) * 5)),
    );
    direction.dispatchEvent(new Event('input'));
    const depth = document.getElementById('fish-depth') as HTMLInputElement;
    depth.value = String(
      Math.max(0, Math.min(100, Math.round((432 - pointer.y) / 10) * 5)),
    );
    depth.dispatchEvent(new Event('input'));
  }

  private updateCamera() {
    const selected = this.cityActions.getSelection();
    const catId =
      selected?.kind === 'cat'
        ? selected.catId
        : (this.session.selectedEntity ?? 'mochi');
    const nextMode = this.riverMode
      ? 'river'
      : this.overview
        ? 'overview'
        : catId;
    if (nextMode === this.cameraMode) return;
    this.cameraMode = nextMode;
    const camera = this.cameras.main;
    camera.stopFollow();
    camera.setBounds(0, 0, MAP_VIEW.size, MAP_VIEW.size);
    if (this.riverMode || this.overview) camera.setZoom(1).centerOn(320, 320);
    else {
      camera.setZoom(1.5);
      const cat = this.cats.get(catId) ?? this.cats.get('mochi');
      if (cat) camera.startFollow(cat, true, 0.12, 0.12);
    }
    const button = document.getElementById('city-overview')!;
    button.setAttribute('aria-pressed', String(this.overview));
    button.textContent = this.overview ? '跟随猫咪' : '总览地图';
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
        .text(x, y, text, {
          fontFamily: 'system-ui',
          resolution: 2,
          fontSize: size,
          color,
        })
        .setOrigin(0.5),
    );
  }

  private paint() {
    const world = this.session.getSnapshot();
    this.riverMode = document
      .getElementById('fishing-stage')!
      .classList.contains('is-river');
    this.river.root.setVisible(this.riverMode);
    document
      .querySelector('.map-card')!
      .classList.toggle('river-mode', this.riverMode);
    this.river.render(world, {
      catId: this.session.selectedEntity ?? 'mochi',
      direction: Number(
        (document.getElementById('fish-direction') as HTMLInputElement).value,
      ),
      aimDepth: Number(
        (document.getElementById('fish-depth') as HTMLInputElement).value,
      ),
      spotId: ((document.getElementById('fish-location') as HTMLSelectElement)
        .value || 'POND') as SpotId,
    });
    document
      .getElementById('visit-city')
      ?.setAttribute('aria-pressed', String(!this.riverMode));
    document
      .getElementById('visit-river')
      ?.setAttribute('aria-pressed', String(this.riverMode));
    const selection = this.cityActions.getSelection();
    const signature = JSON.stringify([
      world.map,
      world.buildings,
      world.cats.map((cat) => [cat.id, cat.position, cat.walk, cat.appearance]),
      selection,
      this.session.selectedEntity,
      this.riverMode,
    ]);
    if (signature === this.paintedState) return;
    this.paintedState = signature;
    this.graphics.clear().setVisible(!this.riverMode);
    this.labels.forEach((label) => label.destroy());
    this.labels = [];
    if (!this.riverMode)
      drawCityMap(this.graphics, world, selection, (x, y, text, size, color) =>
        this.label(x, y, text, size, color),
      );
    for (const cat of world.cats) {
      const { x, y } = tileCenter(cat.position.x, cat.position.y);
      let sprite = this.cats.get(cat.id);
      if (!sprite) {
        sprite = catArt(this, x, y, 1, cat.appearance.coat).setDepth(5);
        this.cats.set(cat.id, sprite);
      } else if (sprite.x !== x || sprite.y !== y) {
        this.tweens.killTweensOf(sprite);
        this.tweens.add({
          targets: sprite,
          x,
          y,
          duration: 400,
          ease: 'Sine.easeInOut',
        });
      }
      sprite.setVisible(!this.riverMode);
      if (!this.riverMode) {
        if (this.cityActions.isSelected(cat.id))
          this.graphics
            .lineStyle(2.5, 0x55764b)
            .strokeRoundedRect(x - 23, y - 25, 46, 49, 10);
        this.label(x, y + 31, cat.name, 11, '#485b42');
      }
    }
    for (const [id, sprite] of this.cats)
      if (!world.cats.some((cat) => cat.id === id)) {
        sprite.destroy();
        this.cats.delete(id);
      }
    this.updateCamera();
  }
}
