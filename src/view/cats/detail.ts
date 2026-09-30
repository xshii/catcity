import type { GameSession } from '../../application';
import { STARTER_CAT_ID } from '../../content/cats';
import { catDetail } from './screen';
import { createCatsView } from './view-state';

/**
 * The selected cat's card in the cats panel (spec 041 T-12): its name, mood, traits, bond
 * and the lines it greets the player with; `catDetail` decides them. The chat below it
 * belongs to the shell. Nothing here changes the world except choosing the first cat.
 */
export function mountDetail(deps: {
  session: GameSession;
  /** The cat card of the page markup: the detail fills it. */
  card: HTMLElement;
}) {
  const { session, card } = deps;
  const view = createCatsView();
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
    card.querySelector<T>(selector)!;
  const render = () => {
    const model = catDetail(
      session.getSnapshot(),
      session.selectedEntity,
      view.get(),
    );
    $('#cat-detail').hidden = !model.known;
    $('#cat-description').hidden = model.known;
    $('#meet-cat').hidden = model.known;
    $('#cat-name').textContent = model.name;
    $('#mood').textContent = model.mood.text;
    $('#mood').setAttribute('aria-label', model.mood.label);
    $('#mood-hint').textContent = model.mood.hint;
    $('#mood-hint').hidden = !model.mood.hint;
    if (model.cat) {
      $('label[for=message]').textContent = model.cat.talk;
      $('.cat-avatar').classList.toggle('gray-cat', model.cat.gray);
      $('#traits').textContent = model.cat.traits;
      const bond = model.cat.bond;
      $('#bond-level').setAttribute('aria-label', bond.label);
      $('#bond-hearts').textContent = bond.hearts;
      $('#bond-name').textContent = bond.name;
      $<HTMLProgressElement>('#bond-progress').max = bond.progress.max;
      $<HTMLProgressElement>('#bond-progress').value = bond.progress.value;
      $('#bond-next').textContent = bond.next;
      $('#bond-news').textContent = model.cat.news;
      $('#bond-news').hidden = !model.cat.news;
    }
    $('#reunion').textContent = model.reunion;
    $('#bond').textContent = model.together;
  };
  $('#meet-cat').addEventListener('click', () =>
    session.select(STARTER_CAT_ID),
  );
  session.subscribe(render);
  view.subscribe(render);
  render();
  return {
    /** A chat went through: the level it reached (or '') stays on the card for that cat. */
    chatted(catId: string, note: string) {
      view.dispatch({ type: 'chatted', catId, note });
    },
  };
}
