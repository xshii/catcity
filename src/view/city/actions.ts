import { CARE } from '../../content/care';
import type { GameSession } from '../../application';
import {
  BUILDINGS,
  CITY_COSTS,
  CITY_TIME,
  WALK_MINUTES,
} from '../../content/city';
import { SPOTS, spotOpen, type SpotId } from '../../content/fishing';
import { onShore, samePosition, spotAt, tileAt } from '../../core/city';
import type { GameCommand } from '../../core';
import type { CatEntity, Position } from '../../core';
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

const coordinate = (position: Position) =>
  `${String.fromCharCode(65 + position.y)}${position.x + 1}`;

/** Local map selection and command input. Core owns routes, costs and placement. */
export function mountCityActions(
  session: GameSession,
  notify: (text: string) => void,
  enterFishing: (spotId: SpotId, catId: string) => void,
): CityActions {
  const stage = document.getElementById('fishing-stage')!;
  const card = document.createElement('section');
  card.id = 'city-action-card';
  card.setAttribute('aria-label', '地图操作');
  card.hidden = true;
  card.innerHTML =
    '<div class="city-action-heading"><strong id="city-selection-label"></strong><button id="cancel-city-action" class="quiet" aria-label="取消地图选择">取消</button></div><p id="city-action-detail"></p><div id="city-action-buttons"></div>';
  stage.after(card);
  const title = card.querySelector<HTMLElement>('#city-selection-label')!;
  const detail = card.querySelector<HTMLElement>('#city-action-detail')!;
  const actions = card.querySelector<HTMLElement>('#city-action-buttons')!;
  const listeners = new Set<() => void>();
  let selection: CitySelection = null;
  let movingBuilding: string | null = null;
  const announce = () => {
    render();
    listeners.forEach((listener) => listener());
  };
  const closeTools = () => {
    if (!document.getElementById('river-tools')!.hidden)
      document.getElementById('river-tools-close')!.click();
  };
  const currentCat = () => {
    const world = session.getSnapshot();
    return (
      world.cats.find((cat) => cat.id === session.selectedEntity) ??
      world.cats[0]!
    );
  };
  const command = (input: GameCommand, success: string) => {
    const result = session.execute(input);
    notify(result.ok ? success : `暂时无法操作：${result.error}`);
    return result.ok;
  };
  const button = (
    id: string,
    text: string,
    action: () => void,
    disabled = false,
  ) => {
    const element = document.createElement('button');
    element.id = id;
    element.className = 'quiet';
    element.textContent = text;
    element.disabled = disabled;
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
    if (cat.rest)
      return `休息中 · 还需 ${cat.rest.until - session.getSnapshot().minute} 分钟${cat.walk ? ' · 路线已暂停' : ''}`;
    if (cat.walk && cat.needs.energy === 0)
      return '体力耗尽，路线已暂停；让这只猫休息后继续。';
    if (cat.walk)
      return `正走向 ${coordinate(cat.walk.destination)} · 还剩 ${cat.walk.route.length} 格 · 每格 ${CARE.walkEnergyPerTile} 体力`;
    return `位于 ${coordinate(cat.position)} · 点目标地块步行，再点这只猫取消选择`;
  };
  const render = () => {
    card.hidden = !selection || stage.classList.contains('is-river');
    if (!selection) return;
    const world = session.getSnapshot();
    actions.replaceChildren();
    if (movingBuilding) {
      title.textContent = '选择搬迁位置';
      detail.textContent = '点击已拥有的空地确认搬迁。位置不合法时可继续选择。';
      return;
    }
    if (selection.kind === 'cat') {
      const catId = selection.catId;
      const cat = world.cats.find((item) => item.id === catId);
      if (!cat) return clear();
      title.textContent = `${cat.name} · 体力 ${cat.needs.energy}/100`;
      detail.textContent = walking(cat);
      button('city-cat-chat', '聊一会', () => {
        const chat = document.getElementById('city-tab-chat')!;
        if (chat.getAttribute('aria-selected') !== 'true') chat.click();
        document.getElementById('chat-tab-talk')!.click();
      });
      button(
        'city-rest-cat',
        cat.rest ? '正在休息' : `休息 ${CARE.rest.minutes / 60} 小时`,
        () =>
          command(
            { type: 'REST_CAT', catId: cat.id },
            `${cat.name} 开始休息，城市时间继续流动。`,
          ),
        !!cat.rest,
      );
      if (cat.walk || cat.rest) wait();
      return;
    }
    if (selection.kind === 'water') {
      const spotId = selection.spotId;
      const spot = SPOTS[spotId];
      const cat = currentCat();
      const unlocked = spotOpen(spotId, world.fishing);
      const arrived =
        unlocked && !cat.walk && onShore(world.map, spotId, cat.position);
      title.textContent = `${spot.name} · ${cat.name} ${cat.needs.energy}/100`;
      detail.textContent = !unlocked
        ? `需钓技 ${spot.level} 级与 ${spot.species} 种图鉴。猫只能在草地岸边钓鱼。`
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
          !!cat.rest,
        );
      } else {
        button(
          'walk-to-waterway',
          cat.walk?.spotId === spotId
            ? '正在走向岸边'
            : `让 ${cat.name} 走到岸边`,
          () =>
            command(
              { type: 'TRAVEL_TO_FISHING_SPOT', catId: cat.id, spotId },
              `${cat.name} 出发了，可以看着它沿路线走到岸边。`,
            ),
          !unlocked || cat.walk?.spotId === spotId,
        );
      }
      if (cat.walk || cat.rest) wait();
      return;
    }
    const position = selection.position;
    const tile = tileAt(world.map, position);
    if (!tile) return clear();
    const building = world.buildings.find((item) =>
      samePosition(item.position, position),
    );
    title.textContent = `${coordinate(position)} · ${building ? BUILDINGS[building.type].name : !tile.owned ? '待购买土地' : tile.road ? (tile.road === 'DIRT' ? '土路' : '石路') : '已拥有空地'}`;
    if (building) {
      const residents = world.cats.filter((cat) => cat.home === building.id);
      detail.textContent =
        building.type === 'CAT_CAFE'
          ? '猫咖每小时提供营业收入，沿道路迎接城市里的猫。'
          : `住户 ${residents.length}/${BUILDINGS.CAT_APARTMENT.homeCapacity}${residents.length ? ` · ${residents.map((cat) => cat.name).join('、')}` : ' · 安顿猫咪，休息恢复更快'}`;
      button('move-building', '移动建筑', () => {
        movingBuilding = building.id;
        announce();
      });
      if (building.type === 'CAT_APARTMENT') {
        const cat = currentCat();
        button(
          'assign-home',
          `让 ${cat.name} 入住`,
          () =>
            command(
              { type: 'ASSIGN_HOME', catId: cat.id, buildingId: building.id },
              `${cat.name} 有了自己的住处。`,
            ),
          cat.home === building.id ||
            residents.length >= BUILDINGS.CAT_APARTMENT.homeCapacity,
        );
      }
    } else if (!tile.owned) {
      detail.textContent = '先购买土地，再选择猫咖、公寓或道路。';
      button(
        'buy-land',
        `买下土地 · ${CITY_COSTS.buyLand} 金币`,
        () =>
          command(
            { type: 'BUY_LAND', position },
            '土地买好了，现在选择要建什么。',
          ),
        world.coins < CITY_COSTS.buyLand,
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
          world.coins < CITY_COSTS.upgradeRoad,
        );
    } else {
      detail.textContent = '选择建筑；会在已拥有的土地内连接道路。';
      for (const type of ['CAT_CAFE', 'CAT_APARTMENT'] as const) {
        const definition = BUILDINGS[type];
        const element = button(
          `build-${type.toLowerCase()}`,
          `${definition.name} · ${definition.cost}`,
          () =>
            command(
              { type: 'BUILD_BUILDING', buildingType: type, position },
              `${definition.name} 建好了。`,
            ),
          world.coins < definition.cost,
        );
        element.dataset.buildType = type;
      }
      button(
        'place-road',
        `土路 · ${CITY_COSTS.placeRoad}`,
        () => command({ type: 'PLACE_ROAD', position }, '土路铺好了。'),
        world.coins < CITY_COSTS.placeRoad,
      );
    }
  };
  function clear() {
    selection = null;
    movingBuilding = null;
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
      if (spotId) selection = { kind: 'water', spotId, position };
      else if (selection?.kind === 'cat')
        command(
          { type: 'WALK_CAT', catId: selection.catId, destination: position },
          '路线已安排，猫咪开始向目标前进。',
        );
      else selection = { kind: 'tile', position };
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
    if (selection?.kind === 'cat' && selection.catId === catId) clear();
    else {
      selection = { kind: 'cat', catId };
      session.select(catId);
      announce();
    }
  };
  const focusWaterway = (spotId: SpotId) => {
    document.getElementById('visit-city')!.click();
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
  let wasRiver = stage.classList.contains('is-river');
  new MutationObserver(() => {
    const isRiver = stage.classList.contains('is-river');
    if (isRiver !== wasRiver) {
      wasRiver = isRiver;
      if (isRiver) clear();
      else render();
    } else render();
  }).observe(stage, {
    attributes: true,
    attributeFilter: ['class'],
  });
  return {
    selectTile,
    selectCat,
    focusWaterway,
    clear,
    getSelection: () => selection,
    isSelected: (catId) =>
      selection?.kind === 'cat' && selection.catId === catId,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
