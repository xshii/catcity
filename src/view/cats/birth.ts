import './birth.css';
import type { birthCard } from './breed-screen';

/**
 * The card of a birth (spec 041 T-22; ui-design 4.1 level 5, 5.4), over a scrim in the
 * dialog layers (3.1: 50 and 51): the kitten, whom it takes after, where it sleeps and
 * when it grows up. It stays until "看看它" (or Escape, or the scrim); `done` follows.
 * It sends nothing. Every word is set as text.
 */
export function showBirthCard(deps: {
  layer: HTMLElement;
  card: ReturnType<typeof birthCard>;
  done: () => void;
}) {
  const { card } = deps;
  const root = document.createElement('div');
  root.className = 'birth';
  root.innerHTML =
    '<div class="birth-scrim"></div><section id="birth-card" class="birth-card" role="dialog" aria-modal="true" aria-labelledby="birth-title" aria-describedby="birth-about">' +
    '<p class="birth-sparkles" aria-hidden="true">✦ ✦ ✦</p><span class="birth-portrait" aria-hidden="true"></span>' +
    '<h2 id="birth-title"></h2><p id="birth-about"></p><p id="birth-like"></p><p id="birth-talent"></p><p id="birth-home"></p><p id="birth-grows"></p>' +
    '<button id="birth-see" type="button" class="primary"></button></section>';
  const $ = (id: string) => root.querySelector<HTMLElement>(`#${id}`)!;
  root.querySelector('.birth-portrait')!.innerHTML = card.portrait;
  $('birth-title').textContent = card.title;
  $('birth-about').textContent = card.about;
  $('birth-like').textContent = card.resemblance;
  $('birth-talent').textContent = card.talent;
  $('birth-talent').hidden = !card.talent;
  $('birth-home').textContent = card.home;
  $('birth-grows').textContent = card.grows;
  const see = $('birth-see');
  see.textContent = card.see;
  const close = () => {
    root.remove();
    deps.done();
  };
  see.addEventListener('click', close);
  root.querySelector('.birth-scrim')!.addEventListener('click', close);
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'Tab') {
      // Its one button keeps the focus.
      event.preventDefault();
      see.focus();
    }
  });
  deps.layer.append(root);
  see.focus();
}
