import './cat-tap.css';
import type { GameSession } from '../../application';
import { moodBand } from '../../content/mood';
import type { CatEntity } from '../../core';
import type { CatMotion } from '../art/cat-look';
import { companionBox } from '../art/water-view';
import type { CatMoves } from '../shell/place';
import { CAT_LINES, CAT_TAP_MS, catReaction, shownCatch } from './screen';
import type { FishingViewStore } from './view-state';
import { followCanvas } from './water-plane';

/**
 * Tapping the cat beside the player at the river (R-03): a clear button over the cat as
 * drawn, above the water plane (whose taps strike), and a bubble beside the cat with its
 * line for a moment. `catReaction` decides the line and the move from the world and the
 * view at the tap; a tap hard on the last one's heels is the same tap. Nothing in the
 * world changes.
 */
export function mountCatTap(deps: {
  session: GameSession;
  view: FishingViewStore;
  /** The canvas box: the button and the bubble are placed over the canvas as drawn. */
  plane: HTMLElement;
  /** The cat fishing with the player now. */
  companion: () => CatEntity;
}) {
  const button = document.createElement('button');
  button.id = 'river-cat';
  button.type = 'button';
  button.className = 'river-cat-tap';
  const bubble = document.createElement('p');
  bubble.id = 'river-cat-bubble';
  bubble.className = 'river-cat-bubble';
  bubble.setAttribute('aria-live', 'polite');
  bubble.hidden = true;
  deps.plane.append(button, bubble);
  const place = followCanvas(deps.plane, (box, art) => {
    const at = companionBox(box, art, document.documentElement.clientWidth);
    button.style.left = `${at.touch.left}px`;
    button.style.top = `${at.touch.top}px`;
    button.style.width = `${at.touch.width}px`;
    button.style.height = `${at.touch.height}px`;
    bubble.style.left = `${at.bubble.left}px`;
    bubble.style.top = `${at.bubble.top}px`;
    bubble.style.maxWidth = `${at.bubble.room}px`;
  });

  const listeners = new Set<(motion: CatMotion) => void>();
  let taps = 0;
  let quiet = false;
  let quietTimer = 0;
  let bubbleTimer = 0;
  const hush = () => {
    window.clearTimeout(bubbleTimer);
    bubble.hidden = true;
    bubble.textContent = '';
  };
  button.addEventListener('click', () => {
    if (quiet) return;
    quiet = true;
    quietTimer = window.setTimeout(() => (quiet = false), CAT_TAP_MS.repeat);
    const world = deps.session.getSnapshot();
    const run = world.fishing.active;
    const { motion, line } = catReaction({
      band: moodBand(deps.companion().mood),
      phase: run?.phase ?? null,
      result: shownCatch(deps.view.get(), run, world.fishing.lastResult),
      count: taps++,
    });
    // A new line replaces the one showing, for its own time.
    window.clearTimeout(bubbleTimer);
    bubble.textContent = line;
    bubble.hidden = false;
    bubbleTimer = window.setTimeout(hush, CAT_TAP_MS.bubble);
    for (const listener of listeners) listener(motion);
  });

  return {
    /** Applied on every render: on the river only, named for the cat fishing there. */
    apply(river: boolean, cat: CatEntity) {
      button.hidden = !river;
      if (!river) {
        hush();
        window.clearTimeout(quietTimer);
        quiet = false;
        return;
      }
      place();
      const label = CAT_LINES.label(cat.name);
      if (button.getAttribute('aria-label') !== label)
        button.setAttribute('aria-label', label);
    },
    moves: {
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    } satisfies CatMoves,
  };
}
