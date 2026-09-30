import type { PlaceState, Tools } from '../common/place';
import type { GameSession } from '../../application';
import type { SpotId } from '../../content/fishing';
import { spotAt, tileAt } from '../../core/city';
import type { GameCommand, Position } from '../../core';
import { ERROR_MESSAGES } from '../common/errors';
import type { CardIntent, CityCard } from './screen';
import type { CityViewStore } from './view-state';
import './actions.css';

export interface CityActions {
  selectTile(position: Position): void;
  selectCat(catId: string): void;
  focusWaterway(spotId: SpotId): void;
  clear(): void;
}

/**
 * The map's action card and command input. The screen model decides what the card shows;
 * this applies it and turns taps into view events and commands. Core owns routes, costs
 * and placement.
 */
export function mountCityActions(deps: {
  session: GameSession;
  view: CityViewStore;
  place: PlaceState;
  tools: Tools;
  notify: (text: string) => void;
  enterFishing: (spotId: SpotId, catId: string) => void;
  /** The card goes right after this element. */
  anchor: HTMLElement;
}) {
  const { session, view, tools, notify } = deps;
  const card = document.createElement('section');
  card.id = 'city-action-card';
  card.setAttribute('aria-label', '地图操作');
  card.hidden = true;
  card.innerHTML =
    '<div class="city-action-heading"><strong id="city-selection-label"></strong><button id="cancel-city-action" class="quiet" aria-label="取消地图选择">取消</button></div><p id="city-action-detail"></p><div id="city-action-buttons"></div><p id="city-action-reason" hidden></p>';
  deps.anchor.after(card);
  const title = card.querySelector<HTMLElement>('#city-selection-label')!;
  const detail = card.querySelector<HTMLElement>('#city-action-detail')!;
  const actions = card.querySelector<HTMLElement>('#city-action-buttons')!;
  const reasonLine = card.querySelector<HTMLElement>('#city-action-reason')!;
  const command = (input: GameCommand, success: string) => {
    const result = session.execute(input);
    notify(result.ok ? success : ERROR_MESSAGES[result.error]);
    return result.ok;
  };
  const run = (intent: CardIntent) => {
    switch (intent.kind) {
      case 'command':
        if (command(intent.command, intent.success) && intent.then)
          view.dispatch(intent.then);
        return;
      case 'talk':
        return tools.openTalk();
      case 'move':
        return view.dispatch({ type: 'move', buildingId: intent.buildingId });
      case 'enter':
        return deps.enterFishing(intent.spotId, intent.catId);
    }
  };
  /** The card's buttons by id, each with what it does now. */
  const made = new Map<
    string,
    { element: HTMLButtonElement; intent: CardIntent }
  >();
  let applied = '';
  const apply = (screen: CityCard | null) => {
    // The clock changes the world every second: the same card keeps its elements, so
    // a tap that spans a tick, keyboard focus and a test's click all land.
    const signature = JSON.stringify(screen);
    if (signature === applied) return;
    applied = signature;
    card.hidden = !screen;
    const shown = (screen?.buttons ?? []).map((item) => {
      let button = made.get(item.id);
      if (!button) {
        const element = document.createElement('button');
        element.id = item.id;
        element.className = 'quiet';
        element.addEventListener('click', () => run(made.get(item.id)!.intent));
        button = { element, intent: item.intent };
        made.set(item.id, button);
      }
      button.intent = item.intent;
      const { element } = button;
      element.textContent = item.text;
      element.disabled = item.reason !== null;
      element.title = item.reason ?? '';
      if (item.reason !== null)
        element.setAttribute('aria-describedby', reasonLine.id);
      else element.removeAttribute('aria-describedby');
      if (item.buildType) element.dataset.buildType = item.buildType;
      return element;
    });
    for (const [id, { element }] of made)
      if (!shown.includes(element)) made.delete(id);
    // Only another set of buttons touches the list; labels and reasons change in place.
    if (
      shown.length !== actions.children.length ||
      shown.some((element, index) => element !== actions.children[index])
    )
      actions.replaceChildren(...shown);
    if (!screen) return;
    title.textContent = screen.title;
    detail.textContent = screen.detail;
    reasonLine.textContent = screen.reasons.join(' · ');
    reasonLine.hidden = !screen.reasons.length;
  };
  const clear = () => view.dispatch({ type: 'clear' });
  const selectTile = (position: Position) => {
    const world = session.getSnapshot();
    if (!tileAt(world.map, position)) return;
    tools.close();
    const moving = view.get().moving;
    if (moving) {
      if (
        command(
          { type: 'MOVE_BUILDING', buildingId: moving, position },
          '建筑已经搬到新位置。',
        )
      )
        view.dispatch({
          type: 'select',
          selection: { kind: 'tile', position },
        });
      return;
    }
    const spotId = spotAt(world.map, position);
    view.dispatch({
      type: 'select',
      selection: spotId
        ? { kind: 'water', spotId, position }
        : { kind: 'tile', position },
    });
  };
  const selectCat = (catId: string) => {
    if (view.get().moving) {
      const cat = session.getSnapshot().cats.find((item) => item.id === catId);
      if (cat) selectTile(cat.position);
      return;
    }
    tools.close();
    const picking = view.get().walker !== catId;
    view.dispatch({ type: 'cat', catId });
    if (picking) session.select(catId);
  };
  const focusWaterway = (spotId: SpotId) => {
    deps.place.set('city');
    tools.close();
    const world = session.getSnapshot();
    const tile = world.map.tiles.find(
      (item) => spotAt(world.map, item.position) === spotId,
    );
    if (!tile) return;
    view.dispatch({
      type: 'select',
      selection: { kind: 'water', position: tile.position, spotId },
    });
  };
  card.querySelector('#cancel-city-action')!.addEventListener('click', clear);
  return { selectTile, selectCat, focusWaterway, clear, apply, run };
}
