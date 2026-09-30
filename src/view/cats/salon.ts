import type { GameSession } from '../../application';
import { ERROR_MESSAGES } from '../common/errors';
import { mountCatMaker } from './cat-maker';
import { SALON_COPY, salonMaker } from './salon-screen';

/**
 * The cat salon (spec 041 cat-looks.md 3): the cat maker on one companion, its breed kept.
 * Confirming sends the one restyle command, which Core charges for; cancelling sends
 * nothing. The focus goes back to what opened it.
 */
export function mountSalon(deps: {
  session: GameSession;
  /** Where the maker floats, as the stray's does. */
  layer: HTMLElement;
  /** The settings gear floats over the maker: it is on the maker's Tab round. */
  gear: HTMLElement;
  /** 🎲's randomness: the view's own. */
  random: () => number;
  notify: (text: string) => void;
}) {
  const { session } = deps;
  const open = (catId: string) => {
    const cat = session.getSnapshot().cats.find((item) => item.id === catId);
    if (!cat) return;
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    mountCatMaker({
      layer: deps.layer,
      input: salonMaker(cat),
      random: deps.random,
      gear: deps.gear,
      done: (choice) => {
        if (choice) {
          const result = session.execute({
            type: 'RESTYLE_CAT',
            catId,
            appearance: choice.appearance,
          });
          deps.notify(
            result.ok
              ? SALON_COPY.done(cat.name)
              : ERROR_MESSAGES[result.error],
          );
        }
        if (opener?.isConnected) opener.focus();
      },
    });
  };
  return { open };
}
