import type { PlaceState, Tools } from '../shell/place';
import type { GameSession } from '../../application';
import type { SpotId } from '../../content/fishing';
import type { GameCommand, Position } from '../../core';
import { mountCityActions } from './actions';
import { catDrop } from './cat-drag';
import { mountCityGuide } from './guide';
import { mountOuting } from './outing';
import { cityScreen } from './screen';
import { createCityView, initialCityView, selectionGone } from './view-state';

/**
 * The city screen (spec 015): one view store, one pure screen model, one render that
 * applies it after every view or world change. The elements come from the page shell.
 */
export function mountCity(deps: {
  session: GameSession;
  place: PlaceState;
  tools: Tools;
  notify: (text: string) => void;
  enterFishing: (spotId: SpotId, catId: string) => void;
  talk: (message: string) => void;
  elements: {
    /** The action card goes right after the map stage. */
    stage: HTMLElement;
    guide: HTMLElement;
    hint: HTMLElement;
    overview: HTMLElement;
    outing: HTMLElement;
  };
}) {
  const { session, place, tools, notify, elements } = deps;
  const view = createCityView({ ...initialCityView(), place: place.get() });
  const actions = mountCityActions({
    session,
    view,
    place,
    tools,
    notify,
    enterFishing: deps.enterFishing,
    anchor: elements.stage,
  });
  mountOuting(session, elements.outing, actions.focusWaterway);
  const guide = mountCityGuide({
    session,
    notify,
    cityActions: actions,
    tools,
    talk: deps.talk,
    guide: elements.guide,
    hint: elements.hint,
  });
  const blocked = (command: GameCommand) => {
    const result = session.check(command);
    return result.ok ? null : result.error;
  };
  const render = () => {
    const screen = cityScreen(session.getSnapshot(), view.get(), {
      selectedCat: session.selectedEntity,
      blocked,
    });
    actions.apply(screen.card);
    guide.apply(screen.guide);
    elements.overview.setAttribute(
      'aria-pressed',
      String(screen.overview.pressed),
    );
    elements.overview.textContent = screen.overview.label;
  };
  elements.overview.addEventListener('click', () =>
    view.dispatch({ type: 'overview' }),
  );
  place.subscribe((next) => view.dispatch({ type: 'place', place: next }));
  // A world change or a view change: either way, one render applies the screen.
  session.subscribe(() => {
    const before = view.get();
    if (selectionGone(before, session.getSnapshot()))
      view.dispatch({ type: 'clear' });
    if (view.get() === before) render();
  });
  view.subscribe(render);
  render();
  /** What letting a lifted cat go over the tile would do (spec 035). */
  const dropOf = (catId: string, tile: Position | null) =>
    catDrop(session.getSnapshot(), catId, tile, blocked);
  const dropCat = (catId: string, tile: Position | null) => {
    const drop = dropOf(catId, tile);
    if (drop.kind === 'none') return;
    session.select(catId);
    actions.run(drop.intent);
  };
  const { selectTile, selectCat, focusWaterway } = actions;
  return { view, selectTile, selectCat, focusWaterway, dropOf, dropCat };
}
export type City = ReturnType<typeof mountCity>;
