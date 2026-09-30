import type { GameSession } from '../../application';
import { MAX_STAT } from '../../core';
import type { PlaceState } from '../common/place';
import { rosterScreen, type RosterCard } from './screen';

function createEnergyCard(catId: string, select: (id: string) => void) {
  const button = document.createElement('button');
  button.className = 'energy-cat';
  button.dataset.catId = catId;
  let portrait = '';
  const text = document.createElement('span');
  const name = document.createElement('strong');
  const energy = document.createElement('small');
  const progress = document.createElement('progress');
  progress.max = MAX_STAT;
  const activity = document.createElement('small');
  const mood = document.createElement('small');
  mood.className = 'mood-line';
  mood.setAttribute('role', 'img');
  const hint = document.createElement('small');
  hint.className = 'mood-hint';
  // The curled portrait shows it; screen readers hear the words.
  const rest = document.createElement('small');
  rest.className = 'rest-label';
  rest.textContent = '在休息';
  const bond = document.createElement('small');
  bond.className = 'bond-line';
  bond.setAttribute('role', 'img');
  text.append(name, energy, progress, activity, rest, mood, hint, bond);
  button.append(text);
  button.addEventListener('click', () => select(catId));
  return {
    button,
    update(card: RosterCard) {
      if (portrait !== card.portrait) {
        portrait = card.portrait;
        button.querySelector('svg')?.remove();
        button.insertAdjacentHTML('afterbegin', portrait);
      }
      button.setAttribute('aria-pressed', String(card.pressed));
      button.disabled = card.disabled;
      name.textContent = card.name;
      energy.textContent = card.energy;
      progress.value = card.energyValue;
      progress.setAttribute('aria-label', card.energyLabel);
      activity.textContent = card.activity;
      rest.hidden = !card.resting;
      mood.textContent = card.mood.text;
      mood.setAttribute('aria-label', card.mood.label);
      hint.textContent = card.mood.hint;
      hint.hidden = !card.mood.hint;
      bond.textContent = card.bond.text;
      bond.setAttribute('aria-label', card.bond.label);
    },
  };
}

/**
 * The cats panel's roster (spec 041 T-12): a card per cat, whose tap selects it. Renders
 * on world, selection and place changes; `rosterScreen` decides what each card shows.
 */
export function mountRoster(deps: {
  session: GameSession;
  place: PlaceState;
  /** The cats panel's roster page: the roster heads it. */
  page: HTMLElement;
}) {
  const { session, place } = deps;
  const roster = document.createElement('section');
  roster.id = 'river-roster';
  roster.setAttribute('aria-label', '猫咪体力');
  roster.innerHTML =
    '<div id="cat-energy-cards" class="cat-energy-cards"></div>';
  deps.page.append(roster);
  const cards = new Map<string, ReturnType<typeof createEnergyCard>>();
  const cardContainer = roster.querySelector<HTMLElement>('#cat-energy-cards')!;
  const render = () => {
    const shown = rosterScreen(
      session.getSnapshot(),
      session.selectedEntity,
      place.get() === 'river',
    );
    // Keep button identity across clock ticks so keyboard focus and touch targets survive.
    let next = cardContainer.firstElementChild;
    for (const row of shown) {
      let card = cards.get(row.id);
      if (!card) {
        card = createEnergyCard(row.id, (id) => session.select(id));
        cards.set(row.id, card);
      }
      card.update(row);
      if (card.button !== next) cardContainer.insertBefore(card.button, next);
      next = card.button.nextElementSibling;
    }
    for (const [id, card] of cards) {
      if (shown.some((row) => row.id === id)) continue;
      card.button.remove();
      cards.delete(id);
    }
  };
  session.subscribe(render);
  place.subscribe(render);
  render();
}
