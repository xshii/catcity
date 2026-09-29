import type { PlaceState, Tools } from '../shell/place';
import { CARE } from '../../content/care';
import type { GameSession } from '../../application';
import {
  BUILDING_IDS,
  BUILDINGS,
  CITY_COSTS,
  CITY_TIME,
  ROAD_PRICE,
  WALK_MINUTES,
} from '../../content/city';
import { SPOTS, spotOpen, type SpotId } from '../../content/fishing';
import { onShore, samePosition, spotAt, tileAt } from '../../core/city';
import type { GameCommand } from '../../core';
import { MAX_STAT, type CatEntity, type Position } from '../../core';
import { ERROR_MESSAGES } from '../shell/errors';
import './actions.css';

export type CitySelection =
  | { kind: 'tile'; position: Position }
  | { kind: 'cat'; catId: string }
  | { kind: 'water'; position: Position; spotId: SpotId }
  | null;

export interface CityActions {
  selectTile(position: Position): void;
  selectCat(catId: string): void;
  focusWaterway(spotId: SpotId): void;
  clear(): void;
  getSelection(): CitySelection;
  isSelected(catId: string): boolean;
  subscribe(listener: () => void): () => void;
}

const ROAD_NAMES = { DIRT: '土路', STONE: '石路' } as const;

/** Local map selection and command input. Core owns routes, costs and placement. */
export function mountCityActions(
  session: GameSession,
  place: PlaceState,
  tools: Tools,
  notify: (text: string) => void,
  enterFishing: (spotId: SpotId, catId: string) => void,
): CityActions {
  const stage = document.getElementById('fishing-stage')!;
  const card = document.createElement('section');
  card.id = 'city-action-card';
  card.setAttribute('aria-label', '地图操作');
  card.hidden = true;
  card.innerHTML =
    '<div class="city-action-heading"><strong id="city-selection-label"></strong><button id="cancel-city-action" class="quiet" aria-label="取消地图选择">取消</button></div><p id="city-action-detail"></p><div id="city-action-buttons"></div><p id="city-action-reason" hidden></p>';
  stage.after(card);
  const title = card.querySelector<HTMLElement>('#city-selection-label')!;
  const detail = card.querySelector<HTMLElement>('#city-action-detail')!;
  const actions = card.querySelector<HTMLElement>('#city-action-buttons')!;
  const reasonLine = card.querySelector<HTMLElement>('#city-action-reason')!;
  const listeners = new Set<() => void>();
  let selection: CitySelection = null;
  let movingBuilding: string | null = null;
  /** The cat picked on the map; tile cards offer to walk it there. */
  let walker: string | null = null;
  let reasons: string[] = [];
  const announce = () => {
    render();
    listeners.forEach((listener) => listener());
  };
  const closeTools = tools.close;
  const currentCat = () => {
    const world = session.getSnapshot();
    return (
      world.cats.find((cat) => cat.id === session.selectedEntity) ??
      world.cats[0]!
    );
  };
  const command = (input: GameCommand, success: string) => {
    const result = session.execute(input);
    notify(result.ok ? success : ERROR_MESSAGES[result.error]);
    return result.ok;
  };
  /** Why Core would reject this now, in the player's words; null when it would pass. */
  const blocked = (input: GameCommand) => {
    const result = session.check(input);
    return result.ok ? null : ERROR_MESSAGES[result.error];
  };
  const button = (
    id: string,
    text: string,
    action: () => void,
    reason: string | null = null,
  ) => {
    const element = document.createElement('button');
    element.id = id;
    element.className = 'quiet';
    element.textContent = text;
    element.disabled = reason !== null;
    if (reason !== null) {
      element.title = reason;
      element.setAttribute('aria-describedby', reasonLine.id);
      if (!reasons.includes(reason)) reasons.push(reason);
    }
    element.addEventListener('click', action);
    actions.append(element);
    return element;
  };
  const wait = () =>
    button('city-wait', `等 ${CITY_TIME.waitMinutes} 分钟`, () =>
      command(
        { type: 'ADVANCE_TIME', minutes: CITY_TIME.waitMinutes },
        `城市时间前进了 ${CITY_TIME.waitMinutes} 分钟。`,
      ),
    );
  const walking = (cat: CatEntity) => {
    if (cat.walk && cat.needs.energy === 0)
      return '体力耗尽，路线已暂停；歇一会儿会自己接着走。';
    if (cat.walk)
      return `正在走路 · 还剩 ${cat.walk.route.length} 格 · 每格 ${CARE.walkEnergyPerTile} 体力`;
    return `点一块地，在卡片上选「让 ${cat.name} 走到这里」；再点这只猫取消选择。`;
  };
  const render = () => {
    card.hidden = !selection || place.get() === 'river';
    actions.replaceChildren();
    reasons = [];
    if (selection) renderSelection(selection);
    reasonLine.textContent = reasons.join(' · ');
    reasonLine.hidden = !reasons.length;
  };
  const renderSelection = (selected: NonNullable<CitySelection>) => {
    const world = session.getSnapshot();
    if (movingBuilding) {
      title.textContent = '选择搬迁位置';
      detail.textContent = '点击已拥有的空地确认搬迁。位置不合法时可继续选择。';
      return;
    }
    if (selected.kind === 'cat') {
      const catId = selected.catId;
      const cat = world.cats.find((item) => item.id === catId);
      if (!cat) return clear();
      title.textContent = `${cat.name} · 体力 ${cat.needs.energy}/${MAX_STAT}`;
      detail.textContent = walking(cat);
      button('city-cat-chat', '聊一会', tools.openTalk);
      if (cat.walk) wait();
      return;
    }
    if (selected.kind === 'water') {
      const spotId = selected.spotId;
      const spot = SPOTS[spotId];
      const cat = currentCat();
      const unlocked = spotOpen(spotId, world.fishing);
      const arrived =
        unlocked && !cat.walk && onShore(world.map, spotId, cat.position);
      const condition = `需钓技 ${spot.level} 级与 ${spot.species} 种图鉴。`;
      title.textContent = `${spot.name} · ${cat.name} ${cat.needs.energy}/${MAX_STAT}`;
      detail.textContent = !unlocked
        ? `${condition}猫只能在草地岸边钓鱼。`
        : arrived
          ? `${cat.name} 已到岸边，进入钓点选好落点，再准备抛竿。`
          : cat.walk
            ? walking(cat)
            : `${spot.hint} · 先让猫沿地图走到岸边。`;
      if (arrived) {
        button(
          'begin-fishing',
          world.fishing.active ? '返回当前钓鱼' : '进入钓点',
          () => enterFishing(spotId, cat.id),
          null,
        );
      } else {
        const travel = {
          type: 'TRAVEL_TO_FISHING_SPOT',
          catId: cat.id,
          spotId,
        } as const;
        button(
          'walk-to-waterway',
          cat.walk?.spotId === spotId
            ? '正在走向岸边'
            : `让 ${cat.name} 走到岸边`,
          () =>
            command(travel, `${cat.name} 出发了，可以看着它沿路线走到岸边。`),
          !unlocked
            ? condition
            : cat.walk?.spotId === spotId
              ? `${cat.name} 已经在路上了。`
              : blocked(travel),
        );
      }
      if (cat.walk) wait();
      return;
    }
    const position = selected.position;
    const tile = tileAt(world.map, position);
    if (!tile) return clear();
    const building = world.buildings.find((item) =>
      samePosition(item.position, position),
    );
    title.textContent = building
      ? BUILDINGS[building.type].name
      : !tile.owned
        ? '待购买土地'
        : tile.road
          ? ROAD_NAMES[tile.road]
          : '已拥有空地';
    if (building) {
      const residents = world.cats.filter((cat) => cat.home === building.id);
      detail.textContent =
        building.type === 'CAT_CAFE'
          ? '猫咖每小时提供营业收入，沿道路迎接城市里的猫。'
          : `住户 ${residents.length}/${BUILDINGS.CAT_APARTMENT.homeCapacity}${residents.length ? ` · ${residents.map((cat) => cat.name).join('、')}` : ' · 住在家旁边，体力恢复更快'}`;
      button('move-building', '移动建筑', () => {
        movingBuilding = building.id;
        announce();
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
            () => command(home, `${cat.name} 有了自己的住处。`),
            blocked(home),
          );
        }
      return;
    }
    const walkHere = () => {
      const cat = world.cats.find((item) => item.id === walker);
      if (!cat) return;
      const walk = {
        type: 'WALK_CAT',
        catId: cat.id,
        destination: position,
      } as const;
      button(
        'walk-here',
        `让 ${cat.name} 走到这里`,
        () => {
          if (command(walk, `${cat.name} 出发了，沿路线走过去。`)) {
            selection = { kind: 'cat', catId: cat.id };
            announce();
          }
        },
        blocked(walk),
      );
    };
    if (!tile.owned) {
      detail.textContent = '先购买土地，再选择猫咖、公寓或道路。';
      button(
        'buy-land',
        `买下土地 · ${CITY_COSTS.buyLand} 金币`,
        () =>
          command(
            { type: 'BUY_LAND', position },
            '土地买好了，现在选择要建什么。',
          ),
        blocked({ type: 'BUY_LAND', position }),
      );
    } else if (tile.road) {
      detail.textContent =
        tile.road === 'DIRT'
          ? `土路每格 ${WALK_MINUTES.DIRT} 分钟；升级石路后每格 ${WALK_MINUTES.STONE} 分钟。`
          : `石路每格 ${WALK_MINUTES.STONE} 分钟；每走一格消耗 ${CARE.walkEnergyPerTile} 体力。`;
      if (tile.road === 'DIRT')
        button(
          'upgrade-road',
          `升级石路 · ${CITY_COSTS.upgradeRoad} 金币`,
          () =>
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
        () =>
          command(
            { type: 'REMOVE_ROAD', position },
            `道路拆除了，退回 ${refund} 金币；这块地可以重新建设。`,
          ),
        blocked({ type: 'REMOVE_ROAD', position }),
      );
    } else {
      detail.textContent =
        '建筑要紧挨一格连着城中心路网的道路；也可以在这里铺路。';
      for (const type of BUILDING_IDS) {
        const definition = BUILDINGS[type];
        const build = {
          type: 'BUILD_BUILDING',
          buildingType: type,
          position,
        } as const;
        const element = button(
          `build-${type.toLowerCase()}`,
          `${definition.name} · ${definition.cost}`,
          () => command(build, `${definition.name} 建好了。`),
          blocked(build),
        );
        element.dataset.buildType = type;
      }
      button(
        'place-road',
        `土路 · ${CITY_COSTS.placeRoad}`,
        () => command({ type: 'PLACE_ROAD', position }, '土路铺好了。'),
        blocked({ type: 'PLACE_ROAD', position }),
      );
    }
    walkHere();
  };
  function clear() {
    selection = null;
    movingBuilding = null;
    walker = null;
    announce();
  }
  const selectTile = (position: Position) => {
    const world = session.getSnapshot();
    if (!tileAt(world.map, position)) return;
    closeTools();
    if (movingBuilding) {
      if (
        command(
          { type: 'MOVE_BUILDING', buildingId: movingBuilding, position },
          '建筑已经搬到新位置。',
        )
      ) {
        movingBuilding = null;
        selection = { kind: 'tile', position };
      }
    } else {
      const spotId = spotAt(world.map, position);
      selection = spotId
        ? { kind: 'water', spotId, position }
        : { kind: 'tile', position };
    }
    announce();
  };
  const selectCat = (catId: string) => {
    if (movingBuilding) {
      const cat = session.getSnapshot().cats.find((item) => item.id === catId);
      if (cat) selectTile(cat.position);
      return;
    }
    closeTools();
    if (walker === catId) clear();
    else {
      walker = catId;
      selection = { kind: 'cat', catId };
      session.select(catId);
      announce();
    }
  };
  const focusWaterway = (spotId: SpotId) => {
    place.set('city');
    closeTools();
    const world = session.getSnapshot();
    const tile = world.map.tiles.find(
      (item) => spotAt(world.map, item.position) === spotId,
    );
    if (!tile) return;
    movingBuilding = null;
    selection = { kind: 'water', position: tile.position, spotId };
    announce();
  };
  card.querySelector('#cancel-city-action')!.addEventListener('click', clear);
  session.subscribe(render);
  // Entering the river clears any map selection; returning re-renders the card.
  place.subscribe((next) => {
    if (next === 'river') clear();
    else render();
  });
  return {
    selectTile,
    selectCat,
    focusWaterway,
    clear,
    getSelection: () => selection,
    isSelected: (catId) => walker === catId,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
