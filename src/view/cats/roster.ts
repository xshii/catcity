import './cats.css';
import type { GameSession } from '../../application';
import { MAX_STAT } from '../../core';
import type { PlaceState } from '../shell/place';
import { CATS_COPY, rosterScreen, type RosterCard } from './screen';
import type { CatsViewStore } from './view-state';

const part = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  role?: string,
) => {
  const element = document.createElement(tag);
  element.className = className;
  if (role) element.setAttribute('role', role);
  return element;
};

/** One row: the card that picks the cat, and the way into its detail when it is picked. */
function createRow(
  catId: string,
  select: (id: string) => void,
  open: (id: string) => void,
) {
  const row = document.createElement('li');
  row.className = 'roster-row';
  row.dataset.row = catId;
  const button = part('button', 'energy-cat');
  button.dataset.catId = catId;
  let portrait = '';
  const name = document.createElement('strong');
  const sex = part('span', 'roster-sex', 'img');
  const generation = part('span', 'gen-badge');
  const mood = part('small', 'mood-line', 'img');
  const bond = part('small', 'bond-line', 'img');
  const hint = part('small', 'mood-hint');
  const progress = document.createElement('progress');
  progress.max = MAX_STAT;
  const energy = part('small', 'energy-line');
  // The curled portrait shows it; screen readers hear the words.
  const rest = part('small', 'rest-label');
  rest.textContent = '在休息';
  const title = part('span', 'roster-title');
  title.append(name, sex, generation);
  const status = part('span', 'roster-status');
  status.append(mood, bond);
  const meter = part('span', 'roster-energy');
  meter.append(progress, energy);
  const text = part('span', 'roster-text');
  text.append(title, status, hint, meter, rest);
  button.append(text);
  const details = part('button', 'roster-details');
  details.type = 'button';
  details.dataset.catDetails = catId;
  details.textContent = CATS_COPY.details;
  row.append(button, details);
  button.addEventListener('click', () => select(catId));
  details.addEventListener('click', () => open(catId));
  return {
    row,
    details,
    update(card: RosterCard) {
      if (portrait !== card.portrait) {
        portrait = card.portrait;
        button.querySelector('svg')?.remove();
        button.insertAdjacentHTML('afterbegin', portrait);
      }
      button.setAttribute('aria-pressed', String(card.pressed));
      button.disabled = card.disabled;
      name.textContent = card.name;
      sex.textContent = card.sex.mark;
      sex.setAttribute('aria-label', card.sex.label);
      generation.textContent = card.generation;
      progress.value = card.energyValue;
      progress.setAttribute('aria-label', card.energyLabel);
      energy.textContent = card.energy;
      rest.hidden = !card.resting;
      mood.textContent = card.mood.text;
      mood.setAttribute('aria-label', card.mood.label);
      hint.textContent = card.mood.hint;
      hint.hidden = !card.mood.hint;
      bond.textContent = card.bond.text;
      bond.setAttribute('aria-label', card.bond.label);
      details.hidden = !card.pressed;
      details.setAttribute('aria-label', card.details);
    },
  };
}

/**
 * The cats panel's roster (spec 041 T-12, ui-design 5.1): a row per cat in one column that
 * scrolls with its page. A tap picks the cat; the picked row opens its detail. Rows are
 * made once per cat and kept (design 10.2); `rosterScreen` decides what they show.
 */
export function mountRoster(deps: {
  session: GameSession;
  place: PlaceState;
  view: CatsViewStore;
  /** The cats panel's roster page: the roster heads it. */
  page: HTMLElement;
}) {
  const { session, place, view } = deps;
  const roster = document.createElement('section');
  roster.id = 'river-roster';
  roster.setAttribute('aria-label', '猫咪名册');
  roster.innerHTML = '<ul id="cat-energy-cards" class="cat-energy-cards"></ul>';
  deps.page.append(roster);
  const rows = new Map<string, ReturnType<typeof createRow>>();
  const list = roster.querySelector<HTMLElement>('#cat-energy-cards')!;
  const render = () => {
    const shown = rosterScreen(
      session.getSnapshot(),
      session.selectedEntity,
      place.get() === 'river',
    );
    // Keep row identity across clock ticks so keyboard focus and touch targets survive.
    let next = list.firstElementChild;
    for (const card of shown) {
      let row = rows.get(card.id);
      if (!row) {
        row = createRow(
          card.id,
          (id) => session.select(id),
          (id) => view.dispatch({ type: 'detail', catId: id }),
        );
        rows.set(card.id, row);
      }
      row.update(card);
      if (row.row !== next) list.insertBefore(row.row, next);
      next = row.row.nextElementSibling;
    }
    for (const [id, row] of rows) {
      if (shown.some((card) => card.id === id)) continue;
      row.row.remove();
      rows.delete(id);
    }
  };
  // Back from a detail, the focus returns to the way in. The detail, mounted first, has
  // put the roster back on screen by then.
  let detail = view.get().detail;
  view.subscribe((state) => {
    if (detail && !state.detail) rows.get(detail)?.details.focus();
    detail = state.detail;
  });
  session.subscribe(render);
  place.subscribe(render);
  render();
}
