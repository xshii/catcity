import './cat-maker.css';
import type { CatLook } from '../art/cat-look';
import { pettingCat } from '../art/cat-petting';
import {
  CAT_MAKER_COPY,
  catMakerScreen,
  choose,
  PREVIEW_POSE,
  randomChoice,
  type CatChoice,
  type CatMakerInput,
  type MakerItem,
} from './cat-maker-screen';

const ARROWS: Record<string, number> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

/**
 * The cat maker (spec 041 cat-looks.md 4): the cat as chosen, drawn big with its body, over
 * a row of choices for each item (the breed's only when it may be picked). Its buttons are
 * made once; picking or 🎲 changes only the marks and the preview, and sends no command.
 * Confirm gives `done` the choice, cancel or Escape gives null; then the screen goes.
 */
export function mountCatMaker(deps: {
  /** Where the screen floats: over the scene, its bars and panels. */
  layer: HTMLElement;
  input: CatMakerInput;
  /** A number in [0, 1) at each call, for 🎲: the view's own randomness, fixed in tests. */
  random: () => number;
  done: (choice: CatChoice | null) => void;
  /** The settings gear, floating over the screen: the first stop of its Tab round. */
  gear?: HTMLElement;
}): HTMLElement {
  const { input } = deps;
  let choice: CatChoice = { breed: input.breed, appearance: input.appearance };
  const screen = document.createElement('section');
  screen.id = 'cat-maker';
  screen.className = 'cat-maker';
  screen.setAttribute('role', 'dialog');
  screen.setAttribute('aria-modal', 'true');
  screen.setAttribute('aria-labelledby', 'cat-maker-title');
  const { rows } = catMakerScreen(input.pickBreed, choice);
  screen.innerHTML =
    `<h2 id="cat-maker-title">${CAT_MAKER_COPY.title}</h2>` +
    '<div id="cat-maker-preview" class="cat-maker-preview"></div><div class="cat-maker-rows">' +
    rows
      .map(
        ({ item, label, options }) =>
          `<div class="cat-maker-row" role="radiogroup" aria-labelledby="cat-maker-${item}" data-item="${item}"><span id="cat-maker-${item}" class="cat-maker-label">${label}</span><div class="cat-maker-options">` +
          options
            .map(
              ({ option, name, hint }) =>
                `<button type="button" role="radio" data-item="${item}" data-option="${option}">${name}${hint ? `<small>${hint}</small>` : ''}</button>`,
            )
            .join('') +
          '</div></div>',
      )
      .join('') +
    '</div><div class="cat-maker-actions">' +
    `<button id="cat-maker-random" type="button" aria-label="${CAT_MAKER_COPY.randomLabel}">${CAT_MAKER_COPY.random}</button>` +
    `<button id="cat-maker-cancel" type="button">${CAT_MAKER_COPY.cancel}</button>` +
    '<button id="cat-maker-confirm" type="button" class="primary"></button></div>';
  const $ = (id: string) => screen.querySelector<HTMLElement>(`#${id}`)!;
  // The caller's words, as text.
  $('cat-maker-confirm').textContent = input.confirm;
  const radios = Array.from(
    screen.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
  );
  deps.layer.append(screen);

  let drawn: CatLook | null = null;
  /** Only the chosen option of a row is a Tab stop; arrows move within the row. */
  const render = () => {
    const view = catMakerScreen(input.pickBreed, choice);
    view.rows
      .flatMap((row) => row.options)
      .forEach(({ checked }, i) => {
        radios[i]!.setAttribute('aria-checked', String(checked));
        radios[i]!.tabIndex = checked ? 0 : -1;
      });
    if (view.look !== drawn) {
      drawn = view.look;
      $('cat-maker-preview').innerHTML = pettingCat(view.look, PREVIEW_POSE);
    }
  };
  const pick = (radio: HTMLButtonElement) => {
    choice = choose(
      choice,
      radio.dataset.item as MakerItem,
      radio.dataset.option!,
    );
    render();
  };
  const close = (made: CatChoice | null) => {
    screen.remove();
    deps.gear?.removeEventListener('keydown', onKey);
    deps.done(made);
  };
  for (const radio of radios)
    radio.addEventListener('click', () => pick(radio));
  $('cat-maker-random').addEventListener('click', () => {
    choice = randomChoice(choice, input.pickBreed, deps.random);
    render();
  });
  $('cat-maker-cancel').addEventListener('click', () => close(null));
  $('cat-maker-confirm').addEventListener('click', () => close(choice));
  function onKey(event: KeyboardEvent) {
    const target = event.target as HTMLButtonElement;
    if (event.key === 'Escape') {
      event.preventDefault();
      close(null);
    } else if (event.key === 'Tab') {
      // The screen is modal: Tab goes round its stops, from the last to the first.
      const stops = [
        ...(deps.gear ? [deps.gear] : []),
        ...Array.from(
          screen.querySelectorAll<HTMLElement>('button:not([tabindex="-1"])'),
        ),
      ];
      const at = stops.indexOf(target);
      const next = at + (event.shiftKey ? -1 : 1) + stops.length;
      event.preventDefault();
      stops[at === -1 ? 0 : next % stops.length]!.focus();
    } else if (ARROWS[event.key] && radios.includes(target)) {
      const row = radios.filter((r) => r.dataset.item === target.dataset.item);
      const next = row.indexOf(target) + ARROWS[event.key]! + row.length;
      event.preventDefault();
      pick(row[next % row.length]!);
      row[next % row.length]!.focus();
    }
  }
  screen.addEventListener('keydown', onKey);
  // The gear is outside the screen's markup: its Tab and Escape are the screen's too.
  deps.gear?.addEventListener('keydown', onKey);
  render();
  radios.find((radio) => radio.tabIndex === 0)!.focus();
  return screen;
}
