import type { AimControl, PlaceState } from '../shell/place';
import { STARTER_CAT_ID } from '../../content/cats';
import Phaser from 'phaser';
import type { GameSession } from '../../application';
import type { Position } from '../../core';
import { CatArt } from '../art/cat';
import { catPose } from '../art/cat-look';
import type { City } from './panel';
import { drawCityMap } from '../art/city-map';
import { CityAmbience } from '../art/city-ambience';
import { cityLight, shade } from '../art/city-light';
import { CITY_COLOURS, LABEL } from '../art/city-palette';
import { RiverView } from '../art/river';
import { aimAtPoint } from '../art/water-view';
import { measureBarInsets } from './bars';
import {
  boardSize,
  frameMap,
  MAP_VIEW,
  revealShift,
  tileCenter,
} from './geometry';

export class CityScene extends Phaser.Scene {
  private graphics!: Phaser.GameObjects.Graphics;
  private ambience!: CityAmbience;
  private labels: Phaser.GameObjects.Text[] = [];
  private cats = new Map<string, CatArt>();
  private river!: RiverView;
  private riverMode = false;
  private paintedState = '';
  /** Overview focus in world pixels; null centres the board. */
  private pan: { x: number; y: number } | null = null;
  /** The framed focus: the world point in the middle of the open band between the bars. */
  private focus = { x: 0, y: 0 };
  /** World px the camera has moved down to reveal a selection from under the card or hint. */
  private reveal = 0;
  /** The selection and covers last checked for a reveal. */
  private revealChecked = '';
  /** The map frame (#game) in CSS pixels. */
  private frame = { width: 0, height: 0 };
  private tiles = { width: 0, height: 0 };
  private drag: {
    x: number;
    y: number;
    focus: { x: number; y: number };
    moved: boolean;
  } | null = null;
  private frames = 0;
  constructor(
    private readonly session: GameSession,
    private readonly place: PlaceState,
    private readonly onMessage: (message: string) => void,
    private readonly city: City,
    private readonly aim: AimControl,
  ) {
    super('city');
  }

  create() {
    this.graphics = this.add.graphics();
    this.ambience = new CityAmbience(this);
    this.river = new RiverView(this);
    const repaint = () => this.paint();
    const unsubscribePlace = this.place.subscribe(repaint);
    const unsubscribeAim = this.aim.subscribe(repaint);
    // Phaser's parent is the map frame (#game).
    const game = this.scale.parent as HTMLElement;
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
    let overview = this.city.view.get().overview;
    const unsubscribeView = this.city.view.subscribe((view) => {
      // Switching between follow and overview starts from the centre again.
      if (view.overview !== overview) {
        this.pan = null;
        this.reveal = 0;
      }
      overview = view.overview;
      repaint();
    });
    this.events.once('shutdown', () => {
      unsubscribePlace();
      sizeObserver.disconnect();
      unsubscribe();
      unsubscribeView();
      unsubscribeAim();
    });
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.riverMode) {
        this.aimOnWater(pointer);
        return;
      }
      this.drag = {
        x: pointer.x,
        y: pointer.y,
        focus: { ...this.focus },
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
      if (!drag.moved || !this.city.view.get().overview) return;
      const zoom = this.cameras.main.zoom;
      this.pan = { x: drag.focus.x - dx / zoom, y: drag.focus.y - dy / zoom };
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
      this.city.selectCat(cat.id);
      // Letting the cat go says nothing: its selection ring disappears.
      if (this.city.view.get().walker === cat.id)
        this.onMessage(
          `已选中 ${cat.name}：点一块地，在卡片上选「让 ${cat.name} 走到这里」。`,
        );
    } else this.city.selectTile({ x, y });
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

  /** The selected tile or cat in world pixels. */
  private selectedPoint() {
    const selected = this.city.view.get().selection;
    if (!selected) return null;
    if (selected.kind !== 'cat')
      return tileCenter(selected.position.x, selected.position.y);
    const cat = this.cats.get(selected.catId);
    return cat ? { x: cat.x, y: cat.y } : null;
  }

  private followedCat() {
    const selected = this.city.view.get().selection;
    const catId =
      selected?.kind === 'cat'
        ? selected.catId
        : (this.session.selectedEntity ?? STARTER_CAT_ID);
    return this.cats.get(catId) ?? this.cats.get(STARTER_CAT_ID);
  }

  /** Frame the camera every frame, so a walking cat and a resized frame stay centred. */
  update(time: number) {
    // Frames drawn so far, so real-input tests can wait for the camera to catch up
    // instead of guessing a delay (harness settle()).
    this.game.canvas.dataset.frame = String(++this.frames);
    const camera = this.cameras.main;
    // Idle motion only for cats in last frame's view (a tile of margin).
    const view = camera.worldView;
    const margin = MAP_VIEW.tile;
    for (const sprite of this.cats.values())
      sprite.animate(
        sprite.visible &&
          sprite.x > view.left - margin &&
          sprite.x < view.right + margin &&
          sprite.y > view.top - margin &&
          sprite.y < view.bottom + margin,
      );
    if (this.riverMode) {
      camera.setZoom(1).centerOn(MAP_VIEW.size / 2, MAP_VIEW.size / 2);
      return;
    }
    this.ambience.update(time);
    if (!this.frame.width || !this.frame.height || !this.tiles.width) return;
    const board = boardSize(this.tiles);
    const cat = this.followedCat();
    const { overview } = this.city.view.get();
    const focus = overview
      ? (this.pan ?? { x: board.width / 2, y: board.height / 2 })
      : cat
        ? { x: cat.x, y: cat.y }
        : { x: board.width / 2, y: board.height / 2 };
    // Framed between the persistent bars only: the card and the hint float over the map.
    const { bars, covers } = measureBarInsets();
    const framed = frameMap(this.frame, this.tiles, !overview, focus, bars);
    const { scale } = framed;
    this.focus = framed.focus;
    if (overview && this.pan) this.pan = framed.focus;
    // A new selection, or a card that changed size, may cover the selected tile: move just
    // enough to show it, and stay there when the card closes.
    const selected = this.selectedPoint();
    const check = JSON.stringify([this.city.view.get().selection, covers]);
    if (selected && check !== this.revealChecked)
      this.reveal += revealShift(
        this.frame,
        {
          scale,
          center: { ...framed.center, y: framed.center.y + this.reveal },
        },
        selected,
        bars,
        covers,
      );
    this.revealChecked = check;
    camera
      .setZoom(scale * this.logicalPerCss())
      .centerOn(framed.center.x, framed.center.y + this.reveal);
  }

  private label(x: number, y: number, text: string, size = 12) {
    this.labels.push(
      this.add
        .text(x, y, text, {
          fontFamily: LABEL.font,
          resolution: 2,
          fontSize: size,
          color: LABEL.color,
          stroke: LABEL.halo,
          strokeThickness: 3,
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
    const aim = this.aim.get();
    this.river.render(world, {
      catId: this.session.selectedEntity ?? STARTER_CAT_ID,
      direction: aim.direction,
      aimDepth: aim.depth,
      power: aim.power,
      live: aim.live,
      spotId: aim.spotId,
      ringCentre: this.aim.ringCentre(),
    });
    const { selection, walker } = this.city.view.get();
    const light = cityLight(world.minute);
    const signature = JSON.stringify([
      world.map,
      world.buildings,
      world.cats.map((cat) => [
        cat.id,
        cat.position,
        cat.walk,
        cat.appearance,
        catPose(world, cat),
      ]),
      selection,
      this.session.selectedEntity,
      this.riverMode,
      light.daypart,
    ]);
    if (signature === this.paintedState) return;
    this.paintedState = signature;
    this.graphics.clear().setVisible(!this.riverMode);
    this.labels.forEach((label) => label.destroy());
    this.labels = [];
    this.ambience.render(world, light, !this.riverMode);
    // The ground around the board takes the light too; the river's page shows through.
    this.cameras.main.setBackgroundColor(
      this.riverMode ? 'rgba(0,0,0,0)' : shade(CITY_COLOURS.ground, light),
    );
    if (!this.riverMode)
      drawCityMap(this.graphics, world, selection, light, (x, y, text, size) =>
        this.label(x, y, text, size),
      );
    for (const cat of world.cats) {
      const { x, y } = tileCenter(cat.position.x, cat.position.y);
      let sprite = this.cats.get(cat.id);
      if (!sprite) {
        sprite = new CatArt(this, x, y, 1, cat.appearance.coat).setDepth(5);
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
      sprite.setPose(catPose(world, cat)).setVisible(!this.riverMode);
      if (!this.riverMode) {
        if (walker === cat.id)
          this.graphics
            .lineStyle(2.5, CITY_COLOURS.selected)
            .strokeRoundedRect(x - 23, y - 25, 46, 49, 10);
        this.label(x, y + 31, cat.name, 11);
      }
    }
    for (const [id, sprite] of this.cats)
      if (!world.cats.some((cat) => cat.id === id)) {
        sprite.destroy();
        this.cats.delete(id);
      }
  }
}
