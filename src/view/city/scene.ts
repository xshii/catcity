import type { AimControl, PlaceState } from '../shell/place';
import { STARTER_CAT_ID } from '../../content/cats';
import Phaser from 'phaser';
import type { GameSession } from '../../application';
import type { Position } from '../../core';
import { catArt } from '../art/cat';
import type { CityActions } from './actions';
import { drawCityMap } from '../art/city-map';
import { RiverView } from '../art/river';
import { aimAtPoint } from '../art/water-view';
import { boardSize, frameMap, MAP_VIEW, tileCenter } from './geometry';

export class CityScene extends Phaser.Scene {
  private graphics!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private cats = new Map<string, Phaser.GameObjects.Container>();
  private river!: RiverView;
  private riverMode = false;
  private paintedState = '';
  private overview = false;
  /** Overview focus in world pixels; null centres the board. */
  private pan: { x: number; y: number } | null = null;
  /** The map frame (#game) in CSS pixels. */
  private frame = { width: 0, height: 0 };
  private tiles = { width: 0, height: 0 };
  private drag: {
    x: number;
    y: number;
    center: { x: number; y: number };
    moved: boolean;
  } | null = null;
  constructor(
    private readonly session: GameSession,
    private readonly place: PlaceState,
    private readonly onMessage: (message: string) => void,
    private readonly cityActions: CityActions,
    private readonly aim: AimControl,
  ) {
    super('city');
  }

  create() {
    this.graphics = this.add.graphics();
    this.river = new RiverView(this);
    const repaint = () => this.paint();
    const unsubscribePlace = this.place.subscribe(repaint);
    const overview = document.getElementById('city-overview')!;
    const toggleOverview = () => {
      this.overview = !this.overview;
      this.pan = null;
      this.syncOverviewButton();
    };
    overview.addEventListener('click', toggleOverview);
    const unsubscribeAim = this.aim.subscribe(repaint);
    const game = document.getElementById('game')!;
    this.frame = { width: game.clientWidth, height: game.clientHeight };
    const sizeObserver = new ResizeObserver(([entry]) => {
      if (!entry) return;
      this.frame = {
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      };
      this.scale.setParentSize(this.frame.width, this.frame.height);
      this.fitCanvas();
    });
    sizeObserver.observe(game);
    const unsubscribe = this.session.subscribe(repaint);
    const unsubscribeSelection = this.cityActions.subscribe(repaint);
    this.events.once('shutdown', () => {
      unsubscribePlace();
      sizeObserver.disconnect();
      unsubscribe();
      unsubscribeSelection();
      overview.removeEventListener('click', toggleOverview);
      unsubscribeAim();
    });
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.riverMode) {
        this.aimOnWater(pointer);
        return;
      }
      const { x, y } = this.cameras.main.midPoint;
      this.drag = {
        x: pointer.x,
        y: pointer.y,
        center: { x, y },
        moved: false,
      };
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      const drag = this.drag;
      if (!drag || !pointer.isDown) return;
      const dx = pointer.x - drag.x;
      const dy = pointer.y - drag.y;
      // Pointer coordinates are logical pixels; the threshold is in CSS pixels.
      if (Math.hypot(dx, dy) / this.logicalPerCss() > MAP_VIEW.dragPx)
        drag.moved = true;
      if (!drag.moved || !this.overview) return;
      const zoom = this.cameras.main.zoom;
      this.pan = { x: drag.center.x - dx / zoom, y: drag.center.y - dy / zoom };
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      const tap = this.drag && !this.drag.moved;
      this.drag = null;
      if (tap && !this.riverMode) this.tapMap(pointer);
    });
    this.game.canvas.setAttribute(
      'aria-label',
      '猫咪城市地图：点击土地购买或建设；点击猫后在地块卡片上让它走过去；点击水域前往岸边；总览时拖动平移',
    );
    this.game.canvas.setAttribute('role', 'img');
    this.fitCanvas();
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
    if (this.session.getSnapshot().fishing.active) return;
    const aim = aimAtPoint(pointer.x, pointer.y, this.aim.get().power);
    if (aim) this.aim.set(aim);
  }

  private tapMap(pointer: Phaser.Input.Pointer) {
    const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const x = Math.floor((point.x - MAP_VIEW.padding) / MAP_VIEW.tile);
    const y = Math.floor((point.y - MAP_VIEW.padding) / MAP_VIEW.tile);
    if (x < 0 || x >= this.tiles.width || y < 0 || y >= this.tiles.height)
      return;
    const cat = this.session
      .getSnapshot()
      .cats.find((item) => item.position.x === x && item.position.y === y);
    if (cat) {
      this.cityActions.selectCat(cat.id);
      this.onMessage(
        this.cityActions.isSelected(cat.id)
          ? `已选中 ${cat.name}：点一块地，在卡片上选「让 ${cat.name} 走到这里」。`
          : '已取消猫咪选择。',
      );
    } else this.cityActions.selectTile({ x, y });
  }

  private logicalPerCss() {
    return this.frame.width ? this.scale.width / this.frame.width : 1;
  }

  /**
   * The city canvas fills the frame with its short side at `MAP_VIEW.size` logical pixels;
   * the river keeps the square its art and the motion overlay are drawn for.
   */
  private fitCanvas() {
    const { width, height } = this.frame;
    if (!width || !height) return;
    const ratio = MAP_VIEW.size / Math.min(width, height);
    const next = this.riverMode
      ? { width: MAP_VIEW.size, height: MAP_VIEW.size }
      : {
          width: Math.round(width * ratio),
          height: Math.round(height * ratio),
        };
    if (next.width !== this.scale.width || next.height !== this.scale.height)
      this.scale.setGameSize(next.width, next.height);
  }

  private followedCat() {
    const selected = this.cityActions.getSelection();
    const catId =
      selected?.kind === 'cat'
        ? selected.catId
        : (this.session.selectedEntity ?? STARTER_CAT_ID);
    return this.cats.get(catId) ?? this.cats.get(STARTER_CAT_ID);
  }

  /** Frame the camera every frame, so a walking cat and a resized frame stay centred. */
  update() {
    const camera = this.cameras.main;
    if (this.riverMode) {
      camera.setZoom(1).centerOn(MAP_VIEW.size / 2, MAP_VIEW.size / 2);
      return;
    }
    if (!this.frame.width || !this.frame.height || !this.tiles.width) return;
    const board = boardSize(this.tiles);
    const cat = this.followedCat();
    const focus = this.overview
      ? (this.pan ?? { x: board.width / 2, y: board.height / 2 })
      : cat
        ? { x: cat.x, y: cat.y }
        : { x: board.width / 2, y: board.height / 2 };
    const { scale, center } = frameMap(
      this.frame,
      this.tiles,
      !this.overview,
      focus,
    );
    if (this.overview && this.pan) this.pan = center;
    camera.setZoom(scale * this.logicalPerCss()).centerOn(center.x, center.y);
  }

  private syncOverviewButton() {
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
    const riverMode = this.place.get() === 'river';
    if (riverMode !== this.riverMode) {
      this.riverMode = riverMode;
      this.fitCanvas();
    }
    this.tiles = { width: world.map.width, height: world.map.height };
    this.river.root.setVisible(this.riverMode);
    document
      .querySelector('.map-card')!
      .classList.toggle('river-mode', this.riverMode);
    const aim = this.aim.get();
    this.river.render(world, {
      catId: this.session.selectedEntity ?? STARTER_CAT_ID,
      direction: aim.direction,
      aimDepth: aim.depth,
      power: aim.power,
      spotId: aim.spotId,
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
    this.syncOverviewButton();
  }
}
