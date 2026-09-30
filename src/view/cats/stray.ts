import './stray.css';
import type { GameSession } from '../../application';
import { catLook, type CatPose } from '../art/cat-look';
import { catPortrait } from '../art/illustrations';
import { mountCatMaker } from './cat-maker';
import { STRAY_COPY, STRAY_MAKER } from './stray-screen';

/** Curled up by the road, before the player looks closer. */
const DOZING: CatPose = { face: 'calm', ears: 'up', curled: true };

/**
 * A new game's start (spec 041 cat-looks.md 2): a stray by the road, then the cat maker,
 * the one time a breed may be picked. Confirming starts the game with that cat; cancelling
 * comes back here, so the step cannot be skipped. `shown` holds the city clock meanwhile.
 */
export function mountStrayStart(deps: {
  session: GameSession;
  /** Where the screen floats, as the petting screen does. */
  layer: HTMLElement;
  /** The settings gear floats over the maker: it is on the maker's Tab round. */
  gear: HTMLElement;
  /** 🎲's randomness: the view's own. */
  random: () => number;
  notify: (text: string) => void;
}) {
  const screen = document.createElement('section');
  screen.id = 'stray-start';
  screen.className = 'stray-start';
  screen.hidden = true;
  screen.setAttribute('role', 'dialog');
  screen.setAttribute('aria-modal', 'true');
  screen.setAttribute('aria-labelledby', 'stray-title');
  const stray = catLook(STRAY_MAKER.breed, STRAY_MAKER.appearance);
  screen.innerHTML =
    `<div class="stray-card">${catPortrait(stray, DOZING)}` +
    `<h2 id="stray-title">${STRAY_COPY.title}</h2><p>${STRAY_COPY.line}</p>` +
    `<button id="stray-look" type="button" class="primary">${STRAY_COPY.look}</button></div>`;
  deps.layer.append(screen);
  const look = screen.querySelector<HTMLButtonElement>('#stray-look')!;
  let shown = false;
  const show = () => {
    shown = true;
    screen.hidden = false;
    look.focus();
  };
  // Its one control keeps the focus: only a cat closes this screen.
  screen.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    event.preventDefault();
    look.focus();
  });
  look.addEventListener('click', () => {
    screen.hidden = true;
    mountCatMaker({
      layer: deps.layer,
      input: STRAY_MAKER,
      random: deps.random,
      gear: deps.gear,
      done: (choice) => {
        if (!choice) return show();
        shown = false;
        deps.session.resetDemo(choice);
        deps.notify(STRAY_COPY.home(deps.session.getSnapshot().cats[0]!.name));
      },
    });
  });
  return { open: show, shown: () => shown };
}
