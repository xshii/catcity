import { describe, expect, it } from 'vitest';
import {
  BUILDINGS,
  buildingPrice,
  CAFE,
  CITY_TIME,
  landPrice,
  RESTYLE_PRICE,
  WALK_MINUTES,
} from '../../src/content/city';
import { CAT_DEFINITIONS } from '../../src/content/cats';
import { residentIdentity, travelMinutes } from '../../src/core';
import type { GameCommand, WorldState } from '../../src/core';
import { walkMinutes } from '../../src/core/city';
import { createWorld, loadWorld, World } from '../../src/core/world';
import { ARRIVAL_MINUTES, MAX_RESIDENTS } from '../../src/content/residents';
import {
  cityScreen,
  guideProgress,
  selectedNotice,
} from '../../src/view/city/screen';
import {
  initialCityView,
  reduceCityView,
  type CityView,
  type CityViewEvent,
} from '../../src/view/city/view-state';
import { ERROR_MESSAGES } from '../../src/view/common/errors';
import { advance, buildCafe, invite, untilPayout } from '../helpers/world';

const HOURS = BUILDINGS.CAT_CAFE.intervalMinutes / 60;
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
      return result.ok ? null : result.error;
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
      ['build-cat_lodge', 'CAT_LODGE'],
      ['build-cat_salon', 'CAT_SALON'],
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
      blocked: (command) =>
        command.type === 'PLACE_ROAD' ? 'ROAD_EXISTS' : 'BUILDING_LIMIT',
    }).card!;
    expect(card.buttons.every((button) => button.reason)).toBe(true);
    expect(card.reasons).toEqual([
      ERROR_MESSAGES.BUILDING_LIMIT,
      ERROR_MESSAGES.ROAD_EXISTS,
    ]);
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

  it('shows the price of the next building and of this plot', () => {
    const world = createWorld(42);
    const texts = (x: number, y: number) =>
      screenOf(world, view(tile(x, y))).card!.buttons.map(({ text }) => text);
    expect(texts(4, 4).slice(0, 2)).toEqual([
      `猫咖 · ${buildingPrice('CAT_CAFE', 0)}`,
      `猫公寓 · ${buildingPrice('CAT_APARTMENT', 0)}`,
    ]);
    buildCafe(world, { x: 4, y: 4 });
    // One cafe stands: the next one is dearer, the first apartment is not.
    expect(texts(6, 4).slice(0, 2)).toEqual([
      `猫咖 · ${buildingPrice('CAT_CAFE', 1)}`,
      `猫公寓 · ${buildingPrice('CAT_APARTMENT', 0)}`,
    ]);
    expect(texts(4, 2)).toEqual([
      `买下土地 · ${landPrice({ x: 4, y: 2 })} 金币`,
    ]);
    expect(texts(7, 9)).toEqual(['买下土地 · 125 金币']);
  });

  it('says what is needed and what there is when coins are short', () => {
    const save = JSON.parse(createWorld(42).save());
    save.world.coins = 100;
    const world = loadWorld(JSON.stringify(save));
    const grass = screenOf(world, view(tile(4, 4))).card!;
    expect(grass.buttons.map(({ reason }) => reason)).toEqual([
      `金币不足：需要 ${buildingPrice('CAT_CAFE', 0)}，现有 100。`,
      `金币不足：需要 ${buildingPrice('CAT_APARTMENT', 0)}，现有 100。`,
      `金币不足：需要 ${buildingPrice('CAT_LODGE', 0)}，现有 100。`,
      `金币不足：需要 ${buildingPrice('CAT_SALON', 0)}，现有 100。`,
      null,
    ]);
    expect(screenOf(world, view(tile(7, 9))).card!.reasons).toEqual([
      '金币不足：需要 125，现有 100。',
    ]);
    // Near the district the same coins are enough.
    expect(screenOf(world, view(tile(4, 2))).card!.reasons).toEqual([]);
  });

  it('shows a cafe its customers and what they bring each hour', () => {
    const world = createWorld(42);
    buildCafe(world, { x: 4, y: 4 });
    const detail = () => screenOf(world, view(tile(4, 4))).card!.detail;
    expect(detail()).toContain(
      `客人 0/${CAFE.seats} · 每 ${HOURS} 小时 0 金币`,
    );
    expect(detail()).toContain(`${CAFE.range} 格内`);
    world.dispatch({
      type: 'BUILD_BUILDING',
      buildingType: 'CAT_APARTMENT',
      position: { x: 4, y: 3 },
    });
    const home = world.getSnapshot().buildings[1]!.id;
    world.dispatch({ type: 'ASSIGN_HOME', catId: 'mochi', buildingId: home });
    // Pepper moves into the other bed of the same apartment.
    expect(invite(world).home).toBe(home);
    expect(detail()).toBe(
      `客人 2/${CAFE.seats} · 每 ${HOURS} 小时 ${2 * CAFE.coinsPerCustomer} 金币 · Mochi、Pepper`,
    );
  });

  describe('a lodge (spec 041 ui-design 5.7)', () => {
    const LODGES = [
      { x: 4, y: 4 },
      { x: 6, y: 4 },
      { x: 4, y: 3 },
      { x: 6, y: 3 },
      { x: 4, y: 6 },
    ];
    function lodges(count: number) {
      const world = new World({
        ...createWorld(42).getSnapshot(),
        coins: 100_000,
      });
      for (const position of LODGES.slice(0, count))
        world.dispatch({
          type: 'BUILD_BUILDING',
          buildingType: 'CAT_LODGE',
          position,
        });
      return world;
    }
    /** Until `count` residents have come: the first at the start of day 2. */
    const residentsCome = (world: World, count: number) =>
      advance(
        world,
        count * ARRIVAL_MINUTES -
          (world.getSnapshot().minute % ARRIVAL_MINUTES),
      );
    const names = (world: World) =>
      world
        .getSnapshot()
        .residents.map(({ id }) => residentIdentity(42, id).name);
    const card = (world: World, x: number, y: number) =>
      screenOf(world, view(tile(x, y))).card!;

    it('counts and names its residents, and says whether the next comes to it', () => {
      const world = lodges(2);
      expect(card(world, 4, 4)).toMatchObject({
        title: BUILDINGS.CAT_LODGE.name,
        detail: '居民 0/4 · 下一位居民明天搬来',
        buttons: [{ id: 'move-building' }],
      });
      expect(card(world, 6, 4).detail).toBe(
        '居民 0/4 · 前面的居民楼住满后，居民才搬来这里',
      );
      residentsCome(world, 2);
      expect(card(world, 4, 4).detail).toBe(
        `居民 2/4 · ${names(world).join('、')} · 下一位居民明天搬来`,
      );
      residentsCome(world, 2);
      expect(card(world, 4, 4).detail).toBe(
        `居民 4/4 · ${names(world).join('、')}`,
      );
      expect(card(world, 6, 4).detail).toBe('居民 0/4 · 下一位居民明天搬来');
      // No companion moves in, not even a picked one.
      expect(
        ids(world, view({ type: 'cat', catId: 'mochi' }, tile(4, 4))),
      ).toEqual(['move-building']);
    });

    it('says nobody more is coming once the city has sixteen residents', () => {
      const world = lodges(5);
      residentsCome(world, MAX_RESIDENTS);
      expect(card(world, 4, 6).detail).toBe(
        `居民 0/4 · 小城最多住 ${MAX_RESIDENTS} 位居民`,
      );
    });
  });

  it('walks the guide from a home to a cafe with customers and the first memory', () => {
    const world = createWorld(42);
    const guide = () => screenOf(world, view()).guide;
    const progress = () => guideProgress(world.getSnapshot());
    expect(guide()).toMatchObject({
      hint: expect.stringContaining('猫公寓'),
      instruction: expect.stringContaining(
        `${buildingPrice('CAT_APARTMENT', 0)} 金币`,
      ),
      action: '回地图选择空地',
      income: null,
      steps: [{ complete: false }, { complete: false }, { complete: false }],
    });
    expect(progress()).toMatchObject({ stage: 'home', placed: false });
    // The guide points at a plot Core accepts, then at the apartment built there.
    const home = progress().site!;
    expect(
      world.dispatch({
        type: 'BUILD_BUILDING',
        buildingType: 'CAT_APARTMENT',
        position: home,
      }).ok,
    ).toBe(true);
    expect(guide()).toMatchObject({
      hint: expect.stringContaining('入住'),
      action: '回地图找到公寓',
    });
    expect(progress()).toMatchObject({ site: home, placed: true });
    world.dispatch({
      type: 'ASSIGN_HOME',
      catId: 'mochi',
      buildingId: world.getSnapshot().buildings[0]!.id,
    });
    expect(guide()).toMatchObject({
      hint: expect.stringContaining(`${CAFE.range} 格内建一间猫咖`),
      instruction: expect.stringContaining(
        `${buildingPrice('CAT_CAFE', 0)} 金币`,
      ),
      action: '回地图选择空地',
      steps: [{ complete: true }, { complete: false }, { complete: false }],
    });
    // A cafe on the suggested plot has Mochi as its customer.
    expect(buildCafe(world, progress().site!).ok).toBe(true);
    expect(guide()).toMatchObject({
      hint: expect.stringContaining('池塘'),
      instruction: expect.stringContaining(
        `每 ${HOURS} 游戏小时带来 ${CAFE.coinsPerCustomer} 金币`,
      ),
      income: `猫咖 · 客人 1/${CAFE.seats} · 每 ${HOURS} 小时 ${CAFE.coinsPerCustomer} 金币 · 距离下次结算 ${untilPayout(world)} 游戏分钟`,
      steps: [{ complete: true }, { complete: true }, { complete: false }],
    });
    const coins = world.getSnapshot().coins;
    advance(world, untilPayout(world));
    expect(world.getSnapshot().coins).toBe(coins + CAFE.coinsPerCustomer);
    expect(guide().income).toContain(
      `距离下次结算 ${BUILDINGS.CAT_CAFE.intervalMinutes} 游戏分钟`,
    );
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

  it('speaks of the first cat by the name the player gave it (T-25)', () => {
    const world = createWorld(42, {
      breed: 'DOMESTIC',
      appearance: CAT_DEFINITIONS.MOCHI.appearance,
      name: '团子',
    });
    const guide = () => screenOf(world, view()).guide;
    const says = (...words: string[]) => {
      const all = JSON.stringify(guide());
      for (const word of words) expect(all).toContain(word);
      expect(all).not.toContain('Mochi');
    };
    says('先给 团子 安个家', '再让 团子 入住');
    const site = guideProgress(world.getSnapshot()).site!;
    world.dispatch({
      type: 'BUILD_BUILDING',
      buildingType: 'CAT_APARTMENT',
      position: site,
    });
    says('选「团子 入住」', '让 团子 入住');
    world.dispatch({
      type: 'ASSIGN_HOME',
      catId: 'mochi',
      buildingId: world.getSnapshot().buildings[0]!.id,
    });
    expect(buildCafe(world, guideProgress(world.getSnapshot()).site!).ok).toBe(
      true,
    );
    says('和 团子 一起钓一次鱼');
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
    expect(
      cityScreen(remembered, view(), {
        selectedCat: 'mochi',
        blocked: () => null,
      }).guide.action,
    ).toBe('和 团子 聊聊共同回忆');
  });

  it('asks to move a cafe without customers, and again when it loses them', () => {
    const world = createWorld(42);
    world.dispatch({
      type: 'BUILD_BUILDING',
      buildingType: 'CAT_APARTMENT',
      position: { x: 4, y: 4 },
    });
    world.dispatch({
      type: 'ASSIGN_HOME',
      catId: 'mochi',
      buildingId: world.getSnapshot().buildings[0]!.id,
    });
    // Four tiles from Mochi's home: open, but nobody comes.
    buildCafe(world, { x: 6, y: 6 });
    advance(world, 2 * BUILDINGS.CAT_CAFE.intervalMinutes);
    const guide = screenOf(world, view()).guide;
    expect(guide).toMatchObject({
      hint: expect.stringContaining('搬'),
      action: '回地图找到猫咖',
      income: expect.stringContaining(
        `客人 0/${CAFE.seats} · 每 ${HOURS} 小时 0 金币`,
      ),
      steps: [{ complete: true }, { complete: false }, { complete: false }],
    });
    expect(guideProgress(world.getSnapshot())).toMatchObject({
      stage: 'cafe',
      site: { x: 6, y: 6 },
      placed: true,
    });
    // The step says what is true now: done with a customer, open again without one.
    const cafe = world.getSnapshot().buildings[1]!.id;
    const move = (x: number, y: number) =>
      world.dispatch({
        type: 'MOVE_BUILDING',
        buildingId: cafe,
        position: { x, y },
      });
    move(4, 3);
    expect(screenOf(world, view()).guide.steps[1]).toMatchObject({
      complete: true,
      label: '猫咖有客人：已完成',
    });
    move(6, 6);
    expect(screenOf(world, view()).guide.steps[1]).toMatchObject({
      complete: false,
    });
  });

  it('points only at plots Core lets a building stand on', () => {
    const save = JSON.parse(createWorld(42).save());
    save.world.coins = 5000;
    const world = loadWorld(JSON.stringify(save));
    // The road at (4,5) goes: what is left at (3,5) no longer reaches the crossroads.
    expect(
      world.dispatch({ type: 'REMOVE_ROAD', position: { x: 4, y: 5 } }).ok,
    ).toBe(true);
    buildCafe(world, { x: 4, y: 4 });
    buildCafe(world, { x: 4, y: 3 });
    buildCafe(world, { x: 6, y: 3 });
    expect(world.getSnapshot().buildings).toHaveLength(3);
    const { site } = guideProgress(world.getSnapshot());
    // (3,4) comes next in reading order, but lies beside the cut-off road.
    expect(
      world.check({
        type: 'BUILD_BUILDING',
        buildingType: 'CAT_APARTMENT',
        position: { x: 3, y: 4 },
      }),
    ).toEqual({ ok: false, error: 'ROAD_NOT_CONNECTED' });
    expect(site).toEqual({ x: 6, y: 4 });
    expect(
      world.check({
        type: 'BUILD_BUILDING',
        buildingType: 'CAT_APARTMENT',
        position: site!,
      }),
    ).toEqual({ ok: true });
  });
});

// Spec 041 T-15 (cat-looks.md 3): the cat salon on the map, and choosing a cat there.
describe('the cat salon on the map', () => {
  /** A new game with coins, a salon on (4,4) and Pepper; then `coins` left over. */
  const salonCity = (coins = 1000) => {
    const world = new World({
      ...createWorld(42).getSnapshot(),
      coins: 10_000,
    });
    world.dispatch({
      type: 'BUILD_BUILDING',
      buildingType: 'CAT_SALON',
      position: { x: 4, y: 4 },
    });
    invite(world);
    return new World({ ...world.getSnapshot(), coins });
  };

  it('is offered on a plot only while the city has none', () => {
    const world = new World({ ...createWorld(42).getSnapshot(), coins: 5000 });
    expect(ids(world, view(tile(6, 4)))).toContain('build-cat_salon');
    expect(
      screenOf(world, view(tile(6, 4))).card!.buttons.find(
        ({ id }) => id === 'build-cat_salon',
      )!.text,
    ).toBe(`猫咪美容院 · ${buildingPrice('CAT_SALON', 0)}`);
    world.dispatch({
      type: 'BUILD_BUILDING',
      buildingType: 'CAT_SALON',
      position: { x: 4, y: 4 },
    });
    expect(ids(world, view(tile(6, 4)))).toEqual([
      'build-cat_cafe',
      'build-cat_apartment',
      'build-cat_lodge',
      'place-road',
    ]);
  });

  it('lists every companion to restyle, and says what one restyle costs', () => {
    const world = salonCity();
    const [mochi, pepper] = world.getSnapshot().cats;
    const card = screenOf(world, view(tile(4, 4))).card!;
    expect(card.title).toBe('猫咪美容院');
    expect(card.detail).toBe(
      `每次改造 ${RESTYLE_PRICE} 金币 · 选一只猫，重新挑它的毛色、花纹、白斑、眼色和脸型；品种不变`,
    );
    expect(card.buttons).toEqual([
      expect.objectContaining({ id: 'move-building' }),
      {
        id: 'restyle-mochi',
        text: '给 Mochi 改造',
        reason: null,
        intent: { kind: 'restyle', catId: mochi!.id },
      },
      {
        id: `restyle-${pepper!.id}`,
        text: '给 Pepper 改造',
        reason: null,
        intent: { kind: 'restyle', catId: pepper!.id },
      },
    ]);
    expect(card.reasons).toEqual([]);
  });

  it('says what is needed when coins are short, once for all the cats', () => {
    const world = salonCity(RESTYLE_PRICE - 1);
    const card = screenOf(world, view(tile(4, 4))).card!;
    const short = `金币不足：需要 ${RESTYLE_PRICE}，现有 ${RESTYLE_PRICE - 1}。`;
    expect(card.buttons.slice(1).map(({ reason }) => reason)).toEqual([
      short,
      short,
    ]);
    expect(card.reasons).toEqual([short]);
    // The last coin is enough.
    const exact = salonCity(RESTYLE_PRICE);
    expect(
      screenOf(exact, view(tile(4, 4))).card!.buttons.map(
        ({ reason }) => reason,
      ),
    ).toEqual([null, null, null]);
  });
});
