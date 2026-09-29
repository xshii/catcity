import type { Tools } from '../shell/place';
import { STARTER_CAT_ID } from '../../content/cats';
import type { GameSession } from '../../application';
import type { Position, WorldState } from '../../core';
import { tileAt } from '../../core/city';
import type { CityActions } from './actions';
import { guideProgress, type CityScreen } from './screen';

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

/** The guide page and the next-step hint; the screen model words both. */
export function mountCityGuide(deps: {
  session: GameSession;
  notify: (text: string) => void;
  cityActions: CityActions;
  tools: Tools;
  talk: (message: string) => void;
  /** The guide page section, the next-step hint and the clock speed button. */
  guide: HTMLElement;
  hint: HTMLElement;
  clockSpeed: HTMLElement;
}) {
  const { session, notify, cityActions, tools, guide, clockSpeed } = deps;
  const $ = (id: string) => guide.querySelector<HTMLElement>(`#${id}`)!;
  const action = $('city-action');
  const steps = Array.from(
    guide.querySelectorAll<HTMLElement>('[data-city-step]'),
  );
  const apply = (screen: CityScreen['guide']) => {
    steps.forEach((step, index) => {
      step.dataset.complete = String(screen.steps[index]!.complete);
      step.setAttribute('aria-label', screen.steps[index]!.label);
    });
    $('city-goal').textContent = screen.goal;
    $('city-instruction').textContent = screen.instruction;
    action.textContent = screen.action;
    deps.hint.textContent = screen.hint;
    clockSpeed.classList.toggle('guide-target', screen.speedTarget);
    $('cafe-income').hidden = screen.income === null;
    $('cafe-income').textContent = screen.income ?? '';
  };
  action.addEventListener('click', () => {
    const world = session.getSnapshot();
    const { stage } = guideProgress(world);
    if (stage === 'cafe') {
      const position = recommendedCafeSite(world);
      tools.close();
      cityActions.clear();
      if (position) cityActions.selectTile(position);
      notify('点击地图空地选址，再在下方选择要建的建筑。');
    } else if (stage === 'earn') {
      tools.close();
      clockSpeed.focus();
      notify('点顶部的「速度」切换 1× / 2× / 4×，猫咖营业满一小时就有收入。');
    } else if (stage === 'remember') {
      cityActions.focusWaterway('POND');
    } else {
      session.select(STARTER_CAT_ID);
      tools.openTalk();
      deps.talk('还记得我们钓鱼吗？');
    }
  });
  return { apply };
}
