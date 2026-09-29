import { STARTER_CAT_ID } from '../../content/cats';
import { CARE } from '../../content/care';
import {
  BUILDING_IDS,
  BUILDINGS,
  CITY_COSTS,
  CITY_TIME,
  ROAD_PRICE,
  WALK_MINUTES,
} from '../../content/city';
import { SPOTS, spotOpen, type SpotId } from '../../content/fishing';
import { onShore, samePosition, tileAt } from '../../core/city';
import {
  MAX_STAT,
  type CatEntity,
  type GameCommand,
  type WorldState,
} from '../../core';
import type { CityView, CityViewEvent } from './view-state';

const ROAD_NAMES = { DIRT: '土路', STONE: '石路' } as const;
const { CAT_CAFE } = BUILDINGS;

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
  /** Why Core would reject this command now, in the player's words; null when it passes. */
  blocked: (command: GameCommand) => string | null;
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
  { selectedCat, blocked }: CityScreenInputs,
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
    return done(
      title,
      building.type === 'CAT_CAFE'
        ? '猫咖每小时提供营业收入，沿道路迎接城市里的猫。'
        : `住户 ${residents.length}/${BUILDINGS.CAT_APARTMENT.homeCapacity}${residents.length ? ` · ${residents.map((cat) => cat.name).join('、')}` : ' · 住在家旁边，体力恢复更快'}`,
    );
  }
  let detail: string;
  if (!tile.owned) {
    detail = '先购买土地，再选择猫咖、公寓或道路。';
    button(
      'buy-land',
      `买下土地 · ${CITY_COSTS.buyLand} 金币`,
      command({ type: 'BUY_LAND', position }, '土地买好了，现在选择要建什么。'),
      blocked({ type: 'BUY_LAND', position }),
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
        blocked({ type: 'UPGRADE_ROAD', position }),
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
      const build = {
        type: 'BUILD_BUILDING',
        buildingType: type,
        position,
      } as const;
      button(
        `build-${type.toLowerCase()}`,
        `${definition.name} · ${definition.cost}`,
        command(build, `${definition.name} 建好了。`),
        blocked(build),
      ).buildType = type;
    }
    button(
      'place-road',
      `土路 · ${CITY_COSTS.placeRoad}`,
      command({ type: 'PLACE_ROAD', position }, '土路铺好了。'),
      blocked({ type: 'PLACE_ROAD', position }),
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

/** The tutorial's stage: open a cafe, earn from it, then fish together. */
export function guideProgress(world: WorldState) {
  const cafe = world.buildings.find((building) => building.type === 'CAT_CAFE');
  const earned = cafe
    ? Math.floor(
        (world.minute - cafe.builtAtMinute) / CAT_CAFE.intervalMinutes,
      ) * CAT_CAFE.income
    : 0;
  const remembered = !!world.cats.find((cat) => cat.id === STARTER_CAT_ID)
    ?.fishingMemory;
  const stage = !cafe
    ? 'cafe'
    : !earned
      ? 'earn'
      : !remembered
        ? 'remember'
        : 'grow';
  return { cafe, earned, remembered, stage } as const;
}

const GUIDE_STEPS = ['猫咖开张', '获得营业收入', '留下共同回忆'] as const;

/** The guide page and the next-step hint above the map. */
function cityGuide(world: WorldState) {
  const { cafe, earned, remembered, stage } = guideProgress(world);
  const pick = (words: Record<typeof stage, string>) => words[stage];
  return {
    steps: [!!cafe, earned > 0, remembered].map((complete, index) => ({
      complete,
      label: `${GUIDE_STEPS[index]}：${complete ? '已完成' : '未完成'}`,
    })),
    goal: pick({
      cafe: '先给 Mochi 建一间猫咖',
      earn: '猫咖开张了，试试第一笔收入',
      remember: '有了落脚点，再一起留下回忆',
      grow: '让小城继续生长',
    }),
    instruction: pick({
      cafe: `回地图选一块空地，先买地、再建猫咖或公寓。城中心已有少量土地和土路。猫咖需要 ${CAT_CAFE.cost} 金币。`,
      earn: `猫咖每游戏小时自动赚 ${CAT_CAFE.income} 金币。时间一直在走；顶部时钟旁的速度按钮可以切到 2× 或 4×。`,
      remember: '在地图点池塘，站在岸边就能开始钓鱼，留下一段共同回忆。',
      grow: '扩建猫咖赚收入，安排公寓与道路，带不同的猫去岸边钓鱼。猫空闲时会自己恢复体力。',
    }),
    action: pick({
      cafe: '回地图选择空地',
      earn: '去调快时间',
      remember: '在地图找到池塘',
      grow: '和 Mochi 聊聊共同回忆',
    }),
    hint: pick({
      cafe: '下一步：点城中心的空地，建一间猫咖',
      earn: '下一步：等猫咖营业满 1 小时 · 可点顶部「速度」调快',
      remember: '下一步：点池塘，和 Mochi 一起钓一次鱼',
      grow: '点地建设 · 选猫后点地块，在卡片上让它走过去',
    }),
    /** Waiting for the first income points at the clock speed button. */
    speedTarget: stage === 'earn',
    income: cafe
      ? `第一家猫咖 · 累计赚取 ${earned} 金币 · 距离下笔收入 ${CAT_CAFE.intervalMinutes - ((world.minute - cafe.builtAtMinute) % CAT_CAFE.intervalMinutes)} 游戏分钟`
      : null,
  };
}
