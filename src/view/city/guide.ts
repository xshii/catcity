import type { GameSession } from '../../application';
import { BUILDINGS } from '../../content/city';
import type { Position, WorldState } from '../../core';
import { tileAt } from '../../core/city';
import type { CityActions } from './actions';

const { CAT_CAFE } = BUILDINGS;

function recommendedCafeSite(world: WorldState): Position | undefined {
  const candidates = [{ x: 4, y: 4 }];
  for (let y = 0; y < world.map.height; y++)
    for (let x = 0; x < world.map.width; x++) candidates.push({ x, y });
  return candidates.find(
    (position) =>
      tileAt(world.map, position)?.terrain === 'GRASS' &&
      tileAt(world.map, position)?.owned === true &&
      tileAt(world.map, position)?.road === null &&
      ![...world.cats, ...world.buildings].some(
        (entity) =>
          entity.position.x === position.x && entity.position.y === position.y,
      ),
  );
}

export function mountCityGuide(
  session: GameSession,
  notify: (text: string) => void,
  cityActions: CityActions,
) {
  const get = (id: string) => document.getElementById(id)!;
  const action = get('city-action') as HTMLButtonElement;
  const read = () => {
    const world = session.getSnapshot();
    const cafe = world.buildings.find(
      (building) => building.type === 'CAT_CAFE',
    );
    const earned = cafe
      ? Math.floor(
          (world.minute - cafe.builtAtMinute) / CAT_CAFE.intervalMinutes,
        ) * CAT_CAFE.income
      : 0;
    const mochi = world.cats.find((cat) => cat.id === 'mochi');
    const remembered = !!mochi?.fishingMemory;
    return { world, cafe, earned, remembered };
  };
  const render = () => {
    const { world, cafe, earned, remembered } = read();
    const complete = [!!cafe, earned > 0, remembered];
    document
      .querySelectorAll<HTMLElement>('[data-city-step]')
      .forEach((step, index) => {
        step.dataset.complete = String(complete[index]);
        step.setAttribute(
          'aria-label',
          `${['猫咖开张', '获得营业收入', '留下共同回忆'][index]}：${complete[index] ? '已完成' : '未完成'}`,
        );
      });
    action.disabled = false;
    get('city-goal').textContent = !cafe
      ? '先给 Mochi 建一间猫咖'
      : !earned
        ? '猫咖开张了，试试第一笔收入'
        : !remembered
          ? '有了落脚点，再一起留下回忆'
          : '让小城继续生长';
    get('city-instruction').textContent = !cafe
      ? `回地图选一块空地，先买地、再建猫咖或公寓。城中心已有少量土地和土路。猫咖需要 ${CAT_CAFE.cost} 金币。`
      : !earned
        ? `猫咖每游戏小时自动赚 ${CAT_CAFE.income} 金币。点按钮快进一小时，马上看到收入。`
        : !remembered
          ? '在地图点池塘，站在岸边就能开始钓鱼，留下一段共同回忆。'
          : '扩建猫咖赚收入，安排公寓与道路，带不同的猫去岸边钓鱼。累了就让它们休息。';
    action.textContent = !cafe
      ? '回地图选择空地'
      : !earned
        ? `营业一小时 · +${CAT_CAFE.income} 金币`
        : !remembered
          ? '在地图找到池塘'
          : '和 Mochi 聊聊共同回忆';
    get('cafe-income').hidden = !cafe;
    get('cafe-income').textContent =
      `第一家猫咖 · 累计赚取 ${earned} 金币 · 距离下笔收入 ${CAT_CAFE.intervalMinutes - (cafe ? (world.minute - cafe.builtAtMinute) % CAT_CAFE.intervalMinutes : 0)} 游戏分钟`;
  };
  action.addEventListener('click', () => {
    const { world, cafe, earned, remembered } = read();
    if (!cafe) {
      const position = recommendedCafeSite(world);
      get('river-tools-close').click();
      cityActions.clear();
      if (position) cityActions.selectTile(position);
      notify('点击地图空地选址，再在下方选择要建的建筑。');
    } else if (!earned) {
      const result = session.execute({
        type: 'ADVANCE_TIME',
        minutes: CAT_CAFE.intervalMinutes,
      });
      notify(
        result.ok
          ? `第一家猫咖的营业收入到账：+${CAT_CAFE.income} 金币。接下来邀请 Mochi 一起出游吧。`
          : result.error,
      );
    } else if (!remembered) {
      cityActions.focusWaterway('POND');
    } else {
      session.select('mochi');
      const chat = get('city-tab-chat');
      if (chat.getAttribute('aria-selected') !== 'true') chat.click();
      get('chat-tab-talk').click();
      document
        .querySelector<HTMLButtonElement>(
          '[data-message="还记得我们钓鱼吗？"]',
        )!
        .click();
    }
  });
  session.subscribe(render);
  render();
}
