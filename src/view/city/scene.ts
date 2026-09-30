import type { AimControl, CatMoves, PlaceState } from '../common/place';
import { STARTER_CAT_ID } from '../../content/cats';
import Phaser from 'phaser';
import type { GameSession } from '../../application';
import type { Position } from '../../core';
import { walkingMinutes } from '../../core/city';
import { CatArt } from '../art/cat';
import { catPose, lookOf } from '../art/cat-look';
import type { City } from './panel';
import { drawCityMap } from '../art/city-map';
import { CityAmbience } from '../art/city-ambience';
import { cityLight, shade } from '../art/city-light';
import { CITY_COLOURS, LABEL } from '../art/city-palette';
import { RiverView } from '../art/river';
import { aimAtPoint } from '../art/water-view';
import { measureBarInsets } from './bars';
import {
  reduceMapGesture,
  type MapGesture,
  type MapPointerEvent,
} from './cat-drag';
import { boardSize, MAP_VIEW, tileCenter } from '../art/city-geometry';
import { frameMap, revealShift } from './geometry';
import { selectedNotice } from './screen';
import { catchUp, leadMinutes, walkerAt } from './walk-glide';

/** How a lifted cat looks (world px): raised over the finger, a little larger. */
const LIFT = { rise: 40, scale: 1.15, riseMs: 140, left: 0.4 } as const;

export class CityScene extends Phaser.Scene {
  private graphics!: Phaser.GameObjects.Graphics;
  private ambience!: CityAmbience;
  private labels: Phaser.GameObjects.Text[] = [];
  private cats = new Map<string, CatArt>();
  /** Each cat's name and the picked cat's ring move with its sprite. */
  private names = new Map<string, Phaser.GameObjects.Text>();
  private ring!: Phaser.GameObjects.Graphics;
  /** Game minutes the walking cats are drawn ahead of `glidedFrom`, the last tick seen. */
  private lead = 0;
  private glidedFrom = -1;
  private readonly still = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  );
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
  /** The press on the map now (spec 035): a tap, a pan or a lifted cat. */
  private gesture: MapGesture = { phase: 'idle' };
  /** The focus when the press began; a pan moves from it. */
  private panFrom = { x: 0, y: 0 };
  /** A lifted cat's ghost and the marks under it. */
  private lift: {
    catId: string;
    ghost: CatArt;
    marks: Phaser.GameObjects.Graphics;
    since: number;
    /** The tile and world last judged, and whether the cat may be sent there. */
    judged: { tile: string; world: unknown } | null;
    open: boolean;
  } | null = null;
  private frames = 0;
  constructor(
    private readonly session: GameSession,
    private readonly place: PlaceState,
    private readonly onMessage: (message: string) => void,
    private readonly city: City,
    private readonly aim: AimControl,
    /** Game minutes per real second chosen at the city clock. */
    private readonly clockSpeed: () => number,
    /** The river cat's answers to taps, played on the river art (R-03). */
    private readonly catMoves: CatMoves,
  ) {
    super('city');
  }

  create() {
    this.graphics = this.add.graphics();
    this.ring = this.add
      .graphics()
      .lineStyle(2.5, CITY_COLOURS.selected)
      .strokeRoundedRect(-23, -25, 46, 49, 10);
    this.ambience = new CityAmbience(this);
    this.river = new RiverView(this);
    const repaint = () => this.paint();
    const unsubscribePlace = this.place.subscribe(repaint);
    const unsubscribeAim = this.aim.subscribe(repaint);
    const unsubscribeMoves = this.catMoves.subscribe((motion) =>
      this.river.react(motion),
    );
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
      unsubscribeMoves();
    });
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.riverMode) {
        this.aimOnWater(pointer);
        return;
      }
      this.panFrom = { ...this.focus };
      const tile = this.tileUnder(pointer);
      this.press({
        type: 'down',
        time: performance.now(),
        point: this.cssPoint(pointer),
        catId: (tile && this.catAt(tile)?.id) ?? null,
      });
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown) this.press(this.moved(pointer));
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) =>
      this.press(
        pointer.wasCanceled
          ? { type: 'cancel' }
          : { ...this.moved(pointer), type: 'up' },
      ),
    );
    // Released over the bars or the card: nothing on the map was chosen.
    this.input.on('pointerupoutside', () => this.press({ type: 'cancel' }));
    this.game.canvas.setAttribute(
      'aria-label',
      '猫咪城市地图：点击土地购买或建设；点击猫后在地块卡片上让它走过去，或长按猫提起、拖到地块上放开；点击水域前往岸边；总览时拖动平移',
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

  /** Pointer coordinates are logical pixels; gestures are measured in CSS pixels. */
  private cssPoint(pointer: { x: number; y: number }) {
    const ratio = this.logicalPerCss();
    return { x: pointer.x / ratio, y: pointer.y / ratio };
  }

  /** The tile under a pointer; null off the board. */
  private tileUnder(pointer: { x: number; y: number }): Position | null {
    const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const x = Math.floor((point.x - MAP_VIEW.padding) / MAP_VIEW.tile);
    const y = Math.floor((point.y - MAP_VIEW.padding) / MAP_VIEW.tile);
    return x < 0 || x >= this.tiles.width || y < 0 || y >= this.tiles.height
      ? null
      : { x, y };
  }

  private catAt({ x, y }: Position) {
    return this.session
      .getSnapshot()
      .cats.find((item) => item.position.x === x && item.position.y === y);
  }

  private moved(pointer: { x: number; y: number }) {
    return {
      type: 'move',
      time: performance.now(),
      point: this.cssPoint(pointer),
      tile: this.tileUnder(pointer),
    } as const;
  }

  /** Every pointer event goes through the pure gesture; the scene only acts on its phase. */
  private press(event: MapPointerEvent) {
    const gesture = reduceMapGesture(this.gesture, event);
    this.gesture = gesture;
    if (gesture.phase === 'lifted') {
      this.drawLift(gesture);
      return;
    }
    this.endLift();
    if (gesture.phase === 'panning' && this.city.view.get().overview) {
      const perCss = this.logicalPerCss() / this.cameras.main.zoom;
      this.pan = {
        x: this.panFrom.x - (gesture.point.x - gesture.start.x) * perCss,
        y: this.panFrom.y - (gesture.point.y - gesture.start.y) * perCss,
      };
    }
    if (gesture.phase !== 'tapped' && gesture.phase !== 'dropped') return;
    this.gesture = { phase: 'idle' };
    if (this.riverMode) return;
    if (gesture.phase === 'dropped')
      this.city.dropCat(gesture.catId, gesture.tile);
    else if (gesture.tile) this.tapMap(gesture.tile);
  }

  /**
   * The lifted cat's ghost rides above the finger; the tile under the finger is outlined
   * green when the cat may be sent there and grey when not. The cat itself stays put.
   */
  private drawLift(gesture: Extract<MapGesture, { phase: 'lifted' }>) {
    const { catId, tile } = gesture;
    const cat = this.session.getSnapshot().cats.find(({ id }) => id === catId);
    if (!cat || this.riverMode) return this.press({ type: 'cancel' });
    if (!this.lift) {
      this.lift = {
        catId,
        ghost: new CatArt(this, 0, 0, 1, lookOf(cat))
          .setPose(catPose(this.session.getSnapshot(), cat))
          .setDepth(8),
        marks: this.add.graphics().setDepth(7),
        since: performance.now(),
        judged: null,
        open: false,
      };
      this.cats.get(catId)?.setAlpha(LIFT.left);
      this.game.canvas.dataset.lifted = catId;
    }
    const lift = this.lift;
    const world = this.session.getSnapshot();
    const under = JSON.stringify(tile);
    if (lift.judged?.tile !== under || lift.judged.world !== world) {
      lift.judged = { tile: under, world };
      const drop = this.city.dropOf(catId, tile).kind;
      lift.open = drop !== 'none';
      this.game.canvas.dataset.drop = drop;
    }
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const risen = still
      ? 1
      : Math.min(1, (performance.now() - lift.since) / LIFT.riseMs);
    const ratio = this.logicalPerCss();
    const at = this.cameras.main.getWorldPoint(
      gesture.point.x * ratio,
      gesture.point.y * ratio,
    );
    lift.ghost
      .setPosition(at.x, at.y - LIFT.rise * risen)
      .setScale(1 + (LIFT.scale - 1) * risen);
    lift.marks.clear();
    if (tile) {
      const centre = tileCenter(tile.x, tile.y);
      const colour = lift.open ? CITY_COLOURS.selected : CITY_COLOURS.blocked;
      const side = MAP_VIEW.tile - 4;
      lift.marks
        .fillStyle(colour, 0.22)
        .fillRoundedRect(
          centre.x - side / 2,
          centre.y - side / 2,
          side,
          side,
          10,
        )
        .lineStyle(3, colour)
        .strokeRoundedRect(
          centre.x - side / 2,
          centre.y - side / 2,
          side,
          side,
          10,
        );
    }
    // The shadow the lifted cat casts on the ground under the finger.
    lift.marks
      .fillStyle(CITY_COLOURS.line, 0.25)
      .fillEllipse(at.x, at.y + 19, 30, 9);
  }

  private endLift() {
    if (!this.lift) return;
    this.lift.ghost.destroy();
    this.lift.marks.destroy();
    this.cats.get(this.lift.catId)?.setAlpha(1);
    this.lift = null;
    delete this.game.canvas.dataset.lifted;
    delete this.game.canvas.dataset.drop;
  }

  private tapMap({ x, y }: Position) {
    const cat = this.catAt({ x, y });
    if (cat) {
      this.city.selectCat(cat.id);
      // Letting the cat go says nothing: its selection ring disappears.
      if (this.city.view.get().walker === cat.id)
        this.onMessage(selectedNotice(cat.name));
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
  update(time: number, delta: number) {
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
    this.glide(delta);
    if (!this.frame.width || !this.frame.height || !this.tiles.width) return;
    // Time passes under a still finger; a lifted cat stays under it while the camera follows.
    if (this.gesture.phase === 'pressing')
      this.press({ type: 'frame', time: performance.now() });
    else if (this.gesture.phase === 'lifted')
      this.press(
        this.input.activePointer.isDown
          ? this.moved(this.input.activePointer)
          : { type: 'cancel' },
      );
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

  /**
   * Walking cats glide along the route Core scheduled, for as long as each step takes at
   * the chosen clock speed (walk-glide.ts); a standing cat is on its tile. With reduced
   * motion cats move tile by tile as Core moves them.
   */
  private glide(realMs: number) {
    const world = this.session.getSnapshot();
    const speed = this.clockSpeed();
    this.lead =
      world.minute === this.glidedFrom
        ? leadMinutes(this.lead, realMs, speed)
        : 0;
    this.glidedFrom = world.minute;
    const still = this.still.matches;
    const { walker } = this.city.view.get();
    this.ring.setVisible(false);
    for (const cat of world.cats) {
      const sprite = this.cats.get(cat.id);
      if (!sprite) continue;
      const tile = still
        ? cat.position
        : walkerAt(
            cat,
            world.minute + this.lead,
            (position) => walkingMinutes(world, position),
            speed,
          );
      const target = tileCenter(tile.x, tile.y);
      const { x, y } = still
        ? target
        : catchUp(sprite, target, realMs, MAP_VIEW.tile);
      sprite.setPosition(x, y);
      this.names.get(cat.id)?.setPosition(x, y + 31);
      if (walker === cat.id) this.ring.setPosition(x, y).setVisible(true);
    }
  }

  private text(x: number, y: number, text: string, size: number) {
    return this.add
      .text(x, y, text, {
        fontFamily: LABEL.font,
        resolution: 2,
        fontSize: size,
        color: LABEL.color,
        stroke: LABEL.halo,
        strokeThickness: 3,
      })
      .setOrigin(0.5);
  }

  private label(x: number, y: number, text: string, size = 12) {
    this.labels.push(this.text(x, y, text, size));
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
    const { selection } = this.city.view.get();
    const light = cityLight(world.minute);
    const signature = JSON.stringify([
      world.map,
      world.buildings,
      world.cats.map((cat) => [
        cat.id,
        cat.position,
        cat.walk,
        cat.appearance,
        cat.name,
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
      if (sprite && sprite.look !== lookOf(cat)) {
        // Restyled at the salon (spec 041 T-15): drawn again where it stands.
        const at = { x: sprite.x, y: sprite.y };
        sprite.destroy();
        sprite = new CatArt(this, at.x, at.y, 1, lookOf(cat)).setDepth(5);
        this.cats.set(cat.id, sprite);
      }
      if (!sprite) {
        // `glide` moves the sprite, its name and the ring from here on.
        sprite = new CatArt(this, x, y, 1, lookOf(cat)).setDepth(5);
        this.cats.set(cat.id, sprite);
        this.names.set(cat.id, this.text(x, y + 31, cat.name, 11).setDepth(1));
      }
      sprite.setPose(catPose(world, cat)).setVisible(!this.riverMode);
      // A renamed cat (R-16): the label is text, never markup.
      this.names.get(cat.id)!.setText(cat.name).setVisible(!this.riverMode);
    }
    if (this.riverMode) this.ring.setVisible(false);
    for (const [id, sprite] of this.cats)
      if (!world.cats.some((cat) => cat.id === id)) {
        sprite.destroy();
        this.cats.delete(id);
        this.names.get(id)!.destroy();
        this.names.delete(id);
      }
  }
}
