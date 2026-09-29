import { describe, expect, it } from 'vitest';
import { BUILDINGS, CITY_TIME, WALK_MINUTES } from '../../src/content/city';
import { travelMinutes } from '../../src/core';
import type { GameCommand, WorldState } from '../../src/core';
import { walkMinutes } from '../../src/core/city';
import { createWorld, type World } from '../../src/core/world';
import { cityScreen, selectedNotice } from '../../src/view/city/screen';
import {
  initialCityView,
  reduceCityView,
  type CityView,
  type CityViewEvent,
} from '../../src/view/city/view-state';
import { ERROR_MESSAGES } from '../../src/view/shell/errors';
import { advance, buildCafe } from '../helpers/world';

const view = (...events: CityViewEvent[]) =>
  events.reduce(reduceCityView, initialCityView());
const tile = (x: number, y: number): CityViewEvent => ({
  type: 'select',
  selection: { kind: 'tile', position: { x, y } },
});
const water = (spotId: 'POND' | 'REEDS', x: number, y: number) =>
  ({
    type: 'select',
    selection: { kind: 'water', position: { x, y }, spotId },
  }) as const;
/** The screen with Core's real verdicts. */
const screenOf = (world: World, state: CityView) =>
  cityScreen(world.getSnapshot(), state, {
    selectedCat: 'mochi',
    blocked: (command: GameCommand) => {
      const result = world.check(command);
      return result.ok ? null : ERROR_MESSAGES[result.error];
    },
  });
const ids = (world: World, state: CityView) =>
  screenOf(world, state).card?.buttons.map((button) => button.id);

// The starter map: Mochi stands on the pond shore at (7,3); (4,4) is owned grass next to
// the dirt road at (5,4); (2,2) is for sale; the reeds at (0,0) are locked.
describe('city screen', () => {
  it('shows no card without a selection or away from the city', () => {
    const world = createWorld(42);
    expect(screenOf(world, view()).card).toBeNull();
    // Even a stale state never shows the card on the river.
    const river: CityView = {
      ...view(tile(4, 4)),
      place: 'river',
    };
    expect(screenOf(world, river).card).toBeNull();
    // A tile off the map or a missing cat shows nothing.
    expect(screenOf(world, view(tile(40, 4))).card).toBeNull();
    expect(
      screenOf(world, view({ type: 'cat', catId: 'ghost' })).card,
    ).toBeNull();
  });

  it('offers land for sale, building on owned grass and road work, with Core as the judge', () => {
    const world = createWorld(42);
    expect(screenOf(world, view(tile(2, 2))).card).toMatchObject({
      title: '待购买土地',
      buttons: [{ id: 'buy-land', reason: null }],
    });
    const grass = screenOf(world, view(tile(4, 4))).card!;
    expect(grass.title).toBe('已拥有空地');
    expect(grass.buttons.map(({ id, buildType }) => [id, buildType])).toEqual([
      ['build-cat_cafe', 'CAT_CAFE'],
      ['build-cat_apartment', 'CAT_APARTMENT'],
      ['place-road', undefined],
    ]);
    expect(ids(world, view(tile(5, 4)))).toEqual([
      'upgrade-road',
      'remove-road',
    ]);
    // A reason disables the button and is listed once under the card.
    world.dispatch({ type: 'BUY_LAND', position: { x: 2, y: 3 } });
    const unconnected = screenOf(world, view(tile(2, 3))).card!;
    const build = unconnected.buttons.find(
      ({ id }) => id === 'build-cat_cafe',
    )!;
    expect(build.reason).toBe(ERROR_MESSAGES.ROAD_NOT_CONNECTED);
    expect(unconnected.reasons).toEqual([ERROR_MESSAGES.ROAD_NOT_CONNECTED]);
  });

  it('lists each distinct reason once, in button order', () => {
    const world = createWorld(42).getSnapshot();
    const card = cityScreen(world, view(tile(4, 4)), {
      selectedCat: 'mochi',
      blocked: (command) => (command.type === 'PLACE_ROAD' ? 'b' : 'a'),
    }).card!;
    expect(card.buttons.every((button) => button.reason)).toBe(true);
    expect(card.reasons).toEqual(['a', 'b']);
  });

  it('shows building actions only on buildings, and a waiting card while one moves', () => {
    const world = createWorld(42);
    buildCafe(world, { x: 4, y: 4 });
    world.dispatch({
      type: 'BUILD_BUILDING',
      buildingType: 'CAT_APARTMENT',
      position: { x: 4, y: 3 },
    });
    const [cafe, apartment] = world.getSnapshot().buildings;
    expect(screenOf(world, view(tile(4, 4))).card).toMatchObject({
      title: BUILDINGS.CAT_CAFE.name,
      buttons: [
        {
          id: 'move-building',
          intent: { kind: 'move', buildingId: cafe!.id },
        },
      ],
    });
    // A picked cat is offered a home, not a walk onto the building.
    expect(
      ids(world, view({ type: 'cat', catId: 'mochi' }, tile(4, 3))),
    ).toEqual(['move-building', 'assign-home-mochi']);
    const moving = view(tile(4, 3), {
      type: 'move',
      buildingId: apartment!.id,
    });
    expect(screenOf(world, moving).card).toMatchObject({
      title: '选择搬迁位置',
      buttons: [],
      reasons: [],
    });
  });

  it('offers a picked cat a walk to the tile with its minutes, which then selects the cat', () => {
    const world = createWorld(42);
    const minutes = walkMinutes(world.getSnapshot(), 'mochi', { x: 4, y: 4 });
    expect(minutes).toBeGreaterThan(0);
    const walk = screenOf(
      world,
      view({ type: 'cat', catId: 'mochi' }, tile(4, 4)),
    ).card!.buttons.at(-1)!;
    expect(walk).toMatchObject({
      id: 'walk-here',
      text: `让 Mochi 走到这里 · 约 ${minutes} 分钟`,
      reason: null,
      intent: {
        kind: 'command',
        command: {
          type: 'WALK_CAT',
          catId: 'mochi',
          destination: { x: 4, y: 4 },
        },
        then: { type: 'select', selection: { kind: 'cat', catId: 'mochi' } },
      },
    });
    expect(ids(world, view(tile(4, 4)))).not.toContain('walk-here');
    // The walk takes what the button said.
    world.dispatch({
      type: 'WALK_CAT',
      catId: 'mochi',
      destination: { x: 4, y: 4 },
    });
    advance(world, minutes! - 1);
    expect(world.getSnapshot().cats[0]!.walk).not.toBeNull();
    advance(world, 1);
    expect(world.getSnapshot().cats[0]!.walk).toBeNull();
  });

  it('names no minutes on a walk Core would refuse', () => {
    const world = createWorld(42);
    const { x, y } = world.getSnapshot().cats[0]!.position;
    const stay = screenOf(
      world,
      view({ type: 'cat', catId: 'mochi' }, tile(x, y)),
    ).card!.buttons.at(-1)!;
    expect(stay).toMatchObject({
      id: 'walk-here',
      text: '让 Mochi 走到这里',
      reason: ERROR_MESSAGES.ALREADY_AT_DESTINATION,
    });
  });

  it('names the three walking speeds once, on the card of a cat that can be sent', () => {
    const world = createWorld(42);
    const picked = view({ type: 'cat', catId: 'mochi' });
    const pace = `草地 ${WALK_MINUTES.GRASS} 分钟/格 · 土路 ${WALK_MINUTES.DIRT} · 石路 ${WALK_MINUTES.STONE}`;
    expect(pace).toBe('草地 6 分钟/格 · 土路 3 · 石路 2');
    expect(screenOf(world, picked).card!.detail).toContain(pace);
    world.dispatch({
      type: 'WALK_CAT',
      catId: 'mochi',
      destination: { x: 4, y: 4 },
    });
    expect(screenOf(world, picked).card!.detail).not.toContain('分钟/格');
  });

  it('shows the cat card with chat, and waiting only while it walks', () => {
    const world = createWorld(42);
    const picked = view({ type: 'cat', catId: 'mochi' });
    expect(screenOf(world, picked).card).toMatchObject({
      title: 'Mochi · 体力 100/100',
      buttons: [{ id: 'city-cat-chat', intent: { kind: 'talk' } }],
    });
    world.dispatch({
      type: 'WALK_CAT',
      catId: 'mochi',
      destination: { x: 4, y: 4 },
    });
    const walking = screenOf(world, picked).card!;
    expect(walking.detail).toContain('正在走路');
    expect(walking.buttons.map(({ id }) => id)).toEqual([
      'city-cat-chat',
      'city-wait',
    ]);
    expect(walking.buttons[1]!.intent).toMatchObject({
      command: { type: 'ADVANCE_TIME', minutes: CITY_TIME.waitMinutes },
    });
  });

  it('enters a waterway from its shore, sends the cat otherwise, and says why a locked one is closed', () => {
    const world = createWorld(42);
    expect(screenOf(world, view(water('POND', 7, 4))).card).toMatchObject({
      buttons: [
        {
          id: 'begin-fishing',
          text: '进入钓点',
          intent: { kind: 'enter', spotId: 'POND', catId: 'mochi' },
        },
      ],
    });
    const locked = screenOf(world, view(water('REEDS', 0, 0))).card!;
    expect(locked.buttons).toMatchObject([
      { id: 'walk-to-waterway', text: '让 Mochi 走到岸边' },
    ]);
    expect(locked.buttons[0]!.reason).toMatch(/^需钓技/);
    world.dispatch({
      type: 'WALK_CAT',
      catId: 'mochi',
      destination: { x: 4, y: 4 },
    });
    expect(ids(world, view(water('POND', 7, 4)))).toEqual([
      'walk-to-waterway',
      'city-wait',
    ]);
    // Away from the shore, the way back says how long it takes.
    advance(world, 120);
    const minutes = travelMinutes(world.getSnapshot(), 'mochi', 'POND');
    expect(minutes).toBeGreaterThan(0);
    expect(
      screenOf(world, view(water('POND', 7, 4))).card!.buttons,
    ).toMatchObject([
      {
        id: 'walk-to-waterway',
        text: `让 Mochi 走到岸边 · 约 ${minutes} 分钟`,
        reason: null,
      },
    ]);
  });

  it('tells a player who picked a cat both ways to send it: the card, or lift and drag', () => {
    expect(selectedNotice('Mochi')).toBe(
      '已选中 Mochi：点一块地，在卡片上选「让 Mochi 走到这里」；也可以长按猫咪，拖到想去的地方。',
    );
  });

  it('labels the camera button from the view', () => {
    const world = createWorld(42);
    expect(screenOf(world, view()).overview).toEqual({
      pressed: false,
      label: '总览地图',
    });
    expect(screenOf(world, view({ type: 'overview' })).overview).toEqual({
      pressed: true,
      label: '跟随猫咪',
    });
  });

  it('walks the guide from the first cafe to the first memory', () => {
    const world = createWorld(42);
    const guide = () => screenOf(world, view()).guide;
    expect(guide()).toMatchObject({
      hint: expect.stringContaining('猫咖'),
      speedTarget: false,
      income: null,
      steps: [{ complete: false }, { complete: false }, { complete: false }],
    });
    buildCafe(world, { x: 4, y: 4 });
    expect(guide()).toMatchObject({
      hint: expect.stringContaining('速度'),
      speedTarget: true,
      income: expect.stringContaining('累计赚取 0 金币'),
      steps: [{ complete: true }, { complete: false }, { complete: false }],
    });
    advance(world, BUILDINGS.CAT_CAFE.intervalMinutes);
    expect(guide()).toMatchObject({
      hint: expect.stringContaining('池塘'),
      speedTarget: false,
      steps: [{ complete: true }, { complete: true }, { complete: false }],
    });
    const snapshot = world.getSnapshot();
    const remembered: WorldState = {
      ...snapshot,
      cats: snapshot.cats.map((cat) => ({
        ...cat,
        fishingMemory: {
          runId: 'run-1',
          speciesId: 'CRUCIAN',
          spotId: 'POND',
          minute: 0,
        },
      })),
    };
    const grown = cityScreen(remembered, view(), {
      selectedCat: 'mochi',
      blocked: () => null,
    }).guide;
    expect(grown.action).toBe('和 Mochi 聊聊共同回忆');
    expect(grown.steps.every((step) => step.complete)).toBe(true);
  });
});
