import { STARTER_CAT_ID } from '../../content/cats';
import { CARE } from '../../content/care';
import {
  BUILDING_IDS,
  BUILDINGS,
  CAFE,
  CITY_COSTS,
  CITY_TIME,
  landPrice,
  ROAD_PRICE,
  WALK_MINUTES,
} from '../../content/city';
import { SPOTS, spotOpen, type SpotId } from '../../content/fishing';
import {
  cafeAssignment,
  gridDistance,
  nextBuildingPrice,
  onShore,
  samePosition,
  tileAt,
  touchesNetwork,
} from '../../core/city';
import {
  MAX_STAT,
  type CatEntity,
  type ErrorCode,
  type GameCommand,
  type Position,
  type WorldState,
} from '../../core';
import { ERROR_MESSAGES } from '../shell/errors';
import type { CityView, CityViewEvent } from './view-state';

const ROAD_NAMES = { DIRT: '土路', STONE: '石路' } as const;
const { CAT_CAFE } = BUILDINGS;
/** A cafe pays once per this many game hours. */
const CAFE_HOURS = CAT_CAFE.intervalMinutes / 60;
/** What a cafe with this many customers pays, in the player's words. */
const cafePay = (customers: number) =>
  `每 ${CAFE_HOURS} 小时 ${customers * CAFE.coinsPerCustomer} 金币`;
/**
 * Every cafe's customers, seated once per world snapshot: the session hands out one
 * frozen snapshot per world change, so renders and drag checks of it share the result.
 */
const seatings = new WeakMap<WorldState, ReturnType<typeof cafeAssignment>>();
function customersOf(world: WorldState, cafeId: string): CatEntity[] {
  let seating = seatings.get(world);
  if (!seating) {
    seating = cafeAssignment(world);
    seatings.set(world, seating);
  }
  return seating.get(cafeId) ?? [];
}
/** A cafe pays once per this many game hours. */
const CAFE_HOURS = CAT_CAFE.intervalMinutes / 60;
/** What a cafe with this many customers pays, in the player's words. */
const cafePay = (customers: number) =>
  `每 ${CAFE_HOURS} 小时 ${customers * CAFE.coinsPerCustomer} 金币`;
/** What one more building of the type costs now. */
const priceOf = (world: WorldState, type: (typeof BUILDING_IDS)[number]) =>
  buildingPrice(
    type,
    world.buildings.filter((building) => building.type === type).length,
  );

/** What a card button does; the DOM maps each kind to its handler. */
export type CardIntent =
  | {
      kind: 'command';
      command: GameCommand;
      success: string;
      /** Applied to the view after Core accepts the command. */
      then?: CityViewEvent;
    }
  | { kind: 'talk' }
  | { kind: 'move'; buildingId: string }
  | { kind: 'enter'; spotId: SpotId; catId: string };

interface CardButton {
  id: string;
  text: string;
  /** Why Core would reject it now; the button is disabled while set. */
  reason: string | null;
  intent: CardIntent;
  buildType?: (typeof BUILDING_IDS)[number];
}

export interface CityCard {
  title: string;
  detail: string;
  buttons: CardButton[];
  /** Each distinct reason once, in button order. */
  reasons: string[];
}

export interface CityScreenInputs {
  /** The session's selected cat: waterway cards send it to the shore. */
  selectedCat: string | null;
  /** Core's rejection of this command now; null when it passes. */
  blocked: (command: GameCommand) => ErrorCode | null;
}

/**
 * What the city screen shows (spec 015). Pure: the DOM only applies this after every view
 * or world change, so no route can leave the card, the guide or the camera button stale.
 * Nothing of the city card shows on the river.
 */
export function cityScreen(
  world: WorldState,
  view: CityView,
  inputs: CityScreenInputs,
) {
  return {
    card:
      view.place === 'city' && view.selection
        ? card(world, view, inputs)
        : null,
    overview: {
      pressed: view.overview,
      label: view.overview ? '跟随猫咪' : '总览地图',
    },
    guide: cityGuide(world),
  };
}
export type CityScreen = ReturnType<typeof cityScreen>;

function card(
  world: WorldState,
  view: CityView,
  { selectedCat, blocked: rejection }: CityScreenInputs,
): CityCard | null {
  const selected = view.selection!;
  const buttons: CardButton[] = [];
  const button = (
    id: string,
    text: string,
    intent: CardIntent,
    reason: string | null = null,
  ) => {
    const made: CardButton = { id, text, reason, intent };
    buttons.push(made);
    return made;
  };
  const command = (
    input: GameCommand,
    success: string,
    then?: CityViewEvent,
  ): CardIntent => ({
    kind: 'command',
    command: input,
    success,
    ...(then && { then }),
  });
  const done = (title: string, detail: string): CityCard => ({
    title,
    detail,
    buttons,
    reasons: [
      ...new Set(buttons.flatMap(({ reason }) => (reason ? [reason] : []))),
    ],
  });
  /** Why Core would reject the command now, in the player's words. */
  const blocked = (input: GameCommand) => {
    const code = rejection(input);
    return code && ERROR_MESSAGES[code];
  };
  /** The same for a paid command; too few coins is said with the real figures. */
  const affordable = (input: GameCommand, price: number) =>
    rejection(input) === 'INSUFFICIENT_COINS'
      ? `金币不足：需要 ${price}，现有 ${world.coins}。`
      : blocked(input);
  const wait = () =>
    button(
      'city-wait',
      `等 ${CITY_TIME.waitMinutes} 分钟`,
      command(
        { type: 'ADVANCE_TIME', minutes: CITY_TIME.waitMinutes },
        `城市时间前进了 ${CITY_TIME.waitMinutes} 分钟。`,
      ),
    );
  if (view.moving)
    return done(
      '选择搬迁位置',
      '点击已拥有的空地确认搬迁。位置不合法时可继续选择。',
    );
  if (selected.kind === 'cat') {
    const cat = world.cats.find((item) => item.id === selected.catId);
    if (!cat) return null;
    button('city-cat-chat', '聊一会', { kind: 'talk' });
    if (cat.walk) wait();
    return done(
      `${cat.name} · 体力 ${cat.needs.energy}/${MAX_STAT}`,
      walking(cat),
    );
  }
  if (selected.kind === 'water') {
    const { spotId } = selected;
    const spot = SPOTS[spotId];
    const cat =
      world.cats.find((item) => item.id === selectedCat) ?? world.cats[0]!;
    const unlocked = spotOpen(spotId, world.fishing);
    const arrived =
      unlocked && !cat.walk && onShore(world.map, spotId, cat.position);
    const condition = `需钓技 ${spot.level} 级与 ${spot.species} 种图鉴。`;
    if (arrived)
      button(
        'begin-fishing',
        world.fishing.active ? '返回当前钓鱼' : '进入钓点',
        { kind: 'enter', spotId, catId: cat.id },
      );
    else {
      const travel = {
        type: 'TRAVEL_TO_FISHING_SPOT',
        catId: cat.id,
        spotId,
      } as const;
      const onTheWay = cat.walk?.spotId === spotId;
      button(
        'walk-to-waterway',
        onTheWay ? '正在走向岸边' : `让 ${cat.name} 走到岸边`,
        command(travel, `${cat.name} 出发了，可以看着它沿路线走到岸边。`),
        !unlocked
          ? condition
          : onTheWay
            ? `${cat.name} 已经在路上了。`
            : blocked(travel),
      );
    }
    if (cat.walk) wait();
    return done(
      `${spot.name} · ${cat.name} ${cat.needs.energy}/${MAX_STAT}`,
      !unlocked
        ? `${condition}猫只能在草地岸边钓鱼。`
        : arrived
          ? `${cat.name} 已到岸边，进入钓点选好落点，再准备抛竿。`
          : cat.walk
            ? walking(cat)
            : `${spot.hint} · 先让猫沿地图走到岸边。`,
    );
  }
  const { position } = selected;
  const tile = tileAt(world.map, position);
  if (!tile) return null;
  const building = world.buildings.find((item) =>
    samePosition(item.position, position),
  );
  const title = building
    ? BUILDINGS[building.type].name
    : !tile.owned
      ? '待购买土地'
      : tile.road
        ? ROAD_NAMES[tile.road]
        : '已拥有空地';
  if (building) {
    const residents = world.cats.filter((cat) => cat.home === building.id);
    button('move-building', '移动建筑', {
      kind: 'move',
      buildingId: building.id,
    });
    if (building.type === 'CAT_APARTMENT')
      for (const cat of world.cats) {
        const home = {
          type: 'ASSIGN_HOME',
          catId: cat.id,
          buildingId: building.id,
        } as const;
        button(
          `assign-home-${cat.id}`,
          `${cat.name} 入住`,
          command(home, `${cat.name} 有了自己的住处。`),
          blocked(home),
        );
      }
    const customers = customersOf(world, building.id);
    return done(
      title,
      building.type === 'CAT_CAFE'
        ? `客人 ${customers.length}/${CAFE.seats} · ${cafePay(customers.length)}${customers.length ? ` · ${customers.map((cat) => cat.name).join('、')}` : ` · 家在 ${CAFE.range} 格内的猫会来做客，搬移免费`}`
        : `住户 ${residents.length}/${BUILDINGS.CAT_APARTMENT.homeCapacity}${residents.length ? ` · ${residents.map((cat) => cat.name).join('、')}` : ' · 住在家旁边，体力恢复更快'}`,
    );
  }
  let detail: string;
  if (!tile.owned) {
    detail = '先购买土地，再选择猫咖、公寓或道路。';
    button(
      'buy-land',
      `买下土地 · ${landPrice(position)} 金币`,
      command({ type: 'BUY_LAND', position }, '土地买好了，现在选择要建什么。'),
      affordable({ type: 'BUY_LAND', position }, landPrice(position)),
    );
  } else if (tile.road) {
    detail =
      tile.road === 'DIRT'
        ? `土路每格 ${WALK_MINUTES.DIRT} 分钟；升级石路后每格 ${WALK_MINUTES.STONE} 分钟。`
        : `石路每格 ${WALK_MINUTES.STONE} 分钟；每走一格消耗 ${CARE.walkEnergyPerTile} 体力。`;
    if (tile.road === 'DIRT')
      button(
        'upgrade-road',
        `升级石路 · ${CITY_COSTS.upgradeRoad} 金币`,
        command(
          { type: 'UPGRADE_ROAD', position },
          '道路升级了，猫咪可以更快地走过。',
        ),
        affordable({ type: 'UPGRADE_ROAD', position }, CITY_COSTS.upgradeRoad),
      );
    const refund = ROAD_PRICE[tile.road];
    button(
      'remove-road',
      `拆除道路 · 退 ${refund} 金币`,
      command(
        { type: 'REMOVE_ROAD', position },
        `道路拆除了，退回 ${refund} 金币；这块地可以重新建设。`,
      ),
      blocked({ type: 'REMOVE_ROAD', position }),
    );
  } else {
    detail = '建筑要紧挨一格连着城中心路网的道路；也可以在这里铺路。';
    for (const type of BUILDING_IDS) {
      const definition = BUILDINGS[type];
      const price = nextBuildingPrice(world, type);
      const build = {
        type: 'BUILD_BUILDING',
        buildingType: type,
        position,
      } as const;
      button(
        `build-${type.toLowerCase()}`,
        `${definition.name} · ${price}`,
        command(build, `${definition.name} 建好了。`),
        affordable(build, price),
      ).buildType = type;
    }
    button(
      'place-road',
      `土路 · ${CITY_COSTS.placeRoad}`,
      command({ type: 'PLACE_ROAD', position }, '土路铺好了。'),
      affordable({ type: 'PLACE_ROAD', position }, CITY_COSTS.placeRoad),
    );
  }
  // A picked cat can be sent to the tile on its card.
  const walker = world.cats.find((item) => item.id === view.walker);
  if (walker) {
    const walk = {
      type: 'WALK_CAT',
      catId: walker.id,
      destination: position,
    } as const;
    button(
      'walk-here',
      `让 ${walker.name} 走到这里`,
      command(walk, `${walker.name} 出发了，沿路线走过去。`, {
        type: 'select',
        selection: { kind: 'cat', catId: walker.id },
      }),
      blocked(walk),
    );
  }
  return done(title, detail);
}

function walking(cat: CatEntity) {
  if (cat.walk && cat.needs.energy === 0)
    return '体力耗尽，路线已暂停；歇一会儿会自己接着走。';
  if (cat.walk)
    return `正在走路 · 还剩 ${cat.walk.route.length} 格 · 每格 ${CARE.walkEnergyPerTile} 体力`;
  return `点一块地，在卡片上选「让 ${cat.name} 走到这里」；再点这只猫取消选择。`;
}

/** Said as a cat is picked: the card's way to send it, and lifting it (spec 035). */
export const selectedNotice = (name: string) =>
  `已选中 ${name}：点一块地，在卡片上选「让 ${name} 走到这里」；也可以长按猫咪，拖到想去的地方。`;

/** Owned free grass that Core lets a building stand on, the town centre first; `near` keeps it in cafe range. */
function freeSite(world: WorldState, near?: Position): Position | null {
  const candidates = [{ x: 4, y: 4 }];
  for (let y = 0; y < world.map.height; y++)
    for (let x = 0; x < world.map.width; x++) candidates.push({ x, y });
  return (
    candidates.find((position) => {
      const tile = tileAt(world.map, position);
      return (
        tile?.terrain === 'GRASS' &&
        tile.owned &&
        !tile.road &&
        ![...world.cats, ...world.buildings].some((entity) =>
          samePosition(entity.position, position),
        ) &&
        touchesNetwork(world, position) &&
        (!near || gridDistance(near, position) <= CAFE.range)
      );
    }) ?? null
  );
}

/**
 * The tutorial's stage, from what is true of the world now: a cat has a home, a cafe has
 * customers, Mochi remembers fishing together. Whether a cafe has ever paid is not
 * recorded anywhere, so no step claims it. `site` is the tile the guide points at;
 * `placed` says a building stands there.
 */
export function guideProgress(world: WorldState) {
  const homes = world.buildings.filter((building) =>
    world.cats.some((cat) => cat.home === building.id),
  );
  const apartment = world.buildings.find(
    (building) => building.type === 'CAT_APARTMENT',
  );
  const cafes = world.buildings.filter(
    (building) => building.type === 'CAT_CAFE',
  );
  const cafe =
    cafes.find((building) => customersOf(world, building.id).length) ??
    cafes[0];
  const customers = cafe ? customersOf(world, cafe.id).length : 0;
  const remembered = !!world.cats.find((cat) => cat.id === STARTER_CAT_ID)
    ?.fishingMemory;
  const stage = !homes.length
    ? 'home'
    : !customers
      ? 'cafe'
      : !remembered
        ? 'remember'
        : 'grow';
  const placed =
    stage === 'home' ? apartment : stage === 'cafe' ? cafe : undefined;
  const site =
    placed?.position ??
    (stage === 'home'
      ? freeSite(world)
      : stage === 'cafe'
        ? freeSite(world, homes[0]!.position)
        : null);
  return {
    housed: homes.length > 0,
    cafe,
    customers,
    remembered,
    stage,
    site,
    placed: !!placed,
  } as const;
}

const GUIDE_STEPS = ['猫咪入住', '猫咖有客人', '留下共同回忆'] as const;

/** The guide page and the next-step hint above the map. */
function cityGuide(world: WorldState) {
  const { housed, cafe, customers, remembered, stage, placed } =
    guideProgress(world);
  const pick = (words: Record<typeof stage, string>) => words[stage];
  const rate = `每位客人每 ${CAFE_HOURS} 游戏小时带来 ${CAFE.coinsPerCustomer} 金币`;
  return {
    steps: [housed, customers > 0, remembered].map((complete, index) => ({
      complete,
      label: `${GUIDE_STEPS[index]}：${complete ? '已完成' : '未完成'}`,
    })),
    goal: pick({
      home: '先给 Mochi 安个家',
      cafe: '在家附近开一间猫咖',
      remember: '猫咖有客人了，再一起留下回忆',
      grow: '让小城继续生长',
    }),
    instruction: pick({
      home: placed
        ? '点地图上的猫公寓，选「Mochi 入住」。住在附近的猫才会去猫咖做客。'
        : `回地图选一块城中心的空地，建一座猫公寓（${nextBuildingPrice(world, 'CAT_APARTMENT')} 金币），再让 Mochi 入住。住在附近的猫才会去猫咖做客。`,
      cafe: placed
        ? `猫咖还没有客人：点猫咖选「移动建筑」，搬到有猫住的公寓 ${CAFE.range} 格内。搬移免费。`
        : `在有猫住的公寓 ${CAFE.range} 格内建一间猫咖（${nextBuildingPrice(world, 'CAT_CAFE')} 金币）。${rate}，每家最多 ${CAFE.seats} 位。`,
      remember: `${rate}，全城同时结算；顶部时钟旁的速度按钮可以切到 2× 或 4×。在地图点池塘，站在岸边就能开始钓鱼，留下一段共同回忆。`,
      grow: '多住几只猫、在家附近开猫咖赚收入，安排公寓与道路，带不同的猫去岸边钓鱼。猫空闲时会自己恢复体力。',
    }),
    action: pick({
      home: placed ? '回地图找到公寓' : '回地图选择空地',
      cafe: placed ? '回地图找到猫咖' : '回地图选择空地',
      remember: '在地图找到池塘',
      grow: '和 Mochi 聊聊共同回忆',
    }),
    hint: pick({
      home: placed
        ? '下一步：点猫公寓，让 Mochi 入住'
        : '下一步：点城中心的空地，建一座猫公寓',
      cafe: placed
        ? `下一步：把猫咖搬到公寓 ${CAFE.range} 格内 · 搬移免费`
        : `下一步：在公寓 ${CAFE.range} 格内建一间猫咖`,
      remember: '下一步：点池塘，和 Mochi 一起钓一次鱼',
      grow: '点地建设 · 选猫后点地块，在卡片上让它走过去',
    }),
    income: cafe
      ? `猫咖 · 客人 ${customers}/${CAFE.seats} · ${cafePay(customers)} · 距离下次结算 ${CAT_CAFE.intervalMinutes - (world.minute % CAT_CAFE.intervalMinutes)} 游戏分钟`
      : null,
  };
}
