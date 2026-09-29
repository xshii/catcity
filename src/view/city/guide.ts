import type { Tools } from '../shell/place';
import { STARTER_CAT_ID } from '../../content/cats';
import type { GameSession } from '../../application';
import type { CityActions } from './actions';
import { guideProgress, type CityScreen } from './screen';

/** The guide page and the next-step hint; the screen model words both. */
export function mountCityGuide(deps: {
  session: GameSession;
  notify: (text: string) => void;
  cityActions: CityActions;
  tools: Tools;
  talk: (message: string) => void;
  /** The guide page section and the next-step hint. */
  guide: HTMLElement;
  hint: HTMLElement;
}) {
  const { session, notify, cityActions, tools, guide } = deps;
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
    $('cafe-income').hidden = screen.income === null;
    $('cafe-income').textContent = screen.income ?? '';
  };
  action.addEventListener('click', () => {
    const world = session.getSnapshot();
    const { stage, site, placed } = guideProgress(world);
    if (stage === 'home' || stage === 'cafe') {
      tools.close();
      cityActions.clear();
      if (site) cityActions.selectTile(site);
      notify(
        placed
          ? '在下方的卡片上完成这一步。'
          : '点击地图空地选址，再在下方选择要建的建筑。',
      );
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
