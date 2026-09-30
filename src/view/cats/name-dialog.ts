import './name-dialog.css';
import { SUGGESTED_NAMES } from '../../content/names';
import type { WorldState } from '../../core';
import {
  NAME_COPY,
  nameDialogScreen,
  typedName,
  type NameDialogInput,
} from './name-dialog-screen';

const ARROWS: Record<string, number> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

/**
 * The name box (spec 041 R-16, ui-design 5.4) over a scrim (ui-design 3.1: layers 50 and
 * 51), for a rename and later a kitten (T-22): the question, the name in a field, six
 * suggested names, "换一批", cancel and confirm. The keyboard stays down until the field
 * is tapped. Confirm gives `done` the name; cancel, Escape or the scrim give null. It
 * sends no command; it goes, and the focus returns to where it was. Names are text only.
 */
export function mountNameDialog(deps: {
  layer: HTMLElement;
  /** The city as the box opens: its names and the seed its suggestions come from. */
  world: WorldState;
  input: NameDialogInput;
  done: (name: string | null) => void;
}): HTMLElement {
  const { world, input } = deps;
  const opener = document.activeElement as HTMLElement | null;
  const root = document.createElement('div');
  root.className = 'name-dialog';
  root.innerHTML =
    '<div class="name-scrim"></div><form id="name-dialog" class="name-card" role="dialog" aria-modal="true" aria-labelledby="name-title" tabindex="-1">' +
    '<h2 id="name-title"></h2><div class="name-field">' +
    '<input id="name-input" aria-labelledby="name-title" aria-describedby="name-note" autocomplete="off" enterkeyhint="done" />' +
    `<button id="name-clear" type="button" tabindex="-1" aria-label="${NAME_COPY.clear}">✕</button></div>` +
    '<small id="name-note" class="name-note" aria-live="polite"></small>' +
    `<div id="name-suggestions" class="name-suggestions" role="radiogroup" aria-label="${NAME_COPY.suggestions}">` +
    '<button type="button" role="radio"></button>'.repeat(SUGGESTED_NAMES) +
    `</div><button id="name-more" type="button" class="quiet">${NAME_COPY.more}</button>` +
    `<div class="name-actions"><button id="name-cancel" type="button">${NAME_COPY.cancel}</button>` +
    '<button id="name-confirm" type="submit" class="primary"></button></div></form>';
  const $ = <T extends HTMLElement>(id: string) =>
    root.querySelector<T>(`#${id}`)!;
  const box = $<HTMLFormElement>('name-dialog');
  const field = $<HTMLInputElement>('name-input');
  const chips = Array.from(root.querySelectorAll<HTMLElement>('[role=radio]'));
  // The caller's words, and the player's: text only.
  $('name-title').textContent = input.title;
  $('name-confirm').textContent = input.confirm;
  field.value = input.initial;
  let page = 0;
  let model = nameDialogScreen(world, input, field.value, page);
  const render = () => {
    model = nameDialogScreen(world, input, field.value, page);
    model.suggestions.forEach(({ name, checked }, i) => {
      chips[i]!.textContent = name;
      chips[i]!.setAttribute('aria-checked', String(checked));
    });
    $('name-note').textContent = model.note;
  };
  // With the keyboard up, the box keeps to the part of the screen still showing.
  const viewport = window.visualViewport;
  const fit = () => {
    root.style.top = `${viewport!.offsetTop}px`;
    root.style.height = `${viewport!.height}px`;
  };
  viewport?.addEventListener('resize', fit);
  viewport?.addEventListener('scroll', fit);
  const close = (name: string | null) => {
    viewport?.removeEventListener('resize', fit);
    viewport?.removeEventListener('scroll', fit);
    root.remove();
    opener?.focus();
    deps.done(name);
  };
  const keep = (event: Event) => {
    // An input method still composing keeps its text until it is done.
    if ((event as InputEvent).isComposing) return;
    const kept = typedName(field.value);
    if (kept !== field.value) field.value = kept;
    render();
  };
  field.addEventListener('input', keep);
  field.addEventListener('compositionend', keep);
  chips.forEach((chip, i) =>
    chip.addEventListener('click', () => {
      field.value = model.suggestions[i]!.name;
      render();
    }),
  );
  $('name-clear').addEventListener('click', () => {
    field.value = '';
    render();
  });
  $('name-more').addEventListener('click', () => {
    page++;
    render();
  });
  $('name-cancel').addEventListener('click', () => close(null));
  root
    .querySelector('.name-scrim')!
    .addEventListener('click', () => close(null));
  box.addEventListener('submit', (event) => {
    event.preventDefault();
    close(model.name);
  });
  root.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement;
    if (event.key === 'Escape') {
      // On top of everything: Escape closes the box, not the panel under it.
      event.preventDefault();
      event.stopPropagation();
      close(null);
    } else if (event.key === 'Tab') {
      // The box is modal: Tab goes round its stops, from the last to the first.
      const stops = Array.from(
        box.querySelectorAll<HTMLElement>('input, button:not([tabindex="-1"])'),
      );
      const at = stops.indexOf(target);
      const step = event.shiftKey ? -1 : 1;
      event.preventDefault();
      stops[
        at === -1
          ? step > 0
            ? 0
            : stops.length - 1
          : (at + step + stops.length) % stops.length
      ]!.focus();
    } else if (ARROWS[event.key] && chips.includes(target)) {
      event.preventDefault();
      const next = chips.indexOf(target) + ARROWS[event.key]! + chips.length;
      chips[next % chips.length]!.focus();
    }
  });
  deps.layer.append(root);
  if (viewport) fit();
  render();
  box.focus();
  return root;
}
