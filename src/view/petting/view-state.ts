import { PET_SPOTS, type PetSpot } from '../../content/petting';
import {
  pettingDone,
  startPetting,
  stepPetting,
  strokePetting,
  type PetStroke,
  type PetTastes,
  type PettingRound,
} from '../../minigames/petting';

/** What Core made of a round; null fields never reach the screen. */
interface PettingResult {
  spot: PetSpot;
  meter: number;
  mood: number;
  full: boolean;
  /** What the round changed for the cat beyond the number: a mood band, a bond level. */
  note: string;
}

/**
 * Everything the petting screen decides from, besides the world snapshot (spec 015, 039).
 * View-local and never saved: a round exists only here until its strokes are sent, so
 * closing the screen ends it with no effect. The round is the engine's own state, run
 * here for what the player sees; Core replays `strokes` to judge.
 */
export interface PettingView {
  /** The cat being petted; null while the screen is closed. */
  catId: string | null;
  round: PettingRound | null;
  /** The strokes the cat took, as Core will replay them. */
  strokes: PetStroke[];
  /** The spot the keyboard is on. */
  focus: PetSpot;
  /** A settled round, shown until the player goes on; 'none' for a round without a stroke. */
  result: PettingResult | 'none' | null;
}

export type PettingViewEvent =
  | { type: 'open'; catId: string; tastes: PetTastes }
  | { type: 'close' }
  | { type: 'tick' }
  | { type: 'stroke'; spot: PetSpot }
  | { type: 'focus'; spot: PetSpot }
  | { type: 'arrow'; key: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' }
  | { type: 'settled'; result: PettingResult | 'none' }
  /** The page went to the background: a round does not wait. */
  | { type: 'page'; hidden: boolean };

export const closedPetting = (): PettingView => ({
  catId: null,
  round: null,
  strokes: [],
  focus: PET_SPOTS[0],
  result: null,
});

export type PettingPhase = 'closed' | 'playing' | 'settling' | 'result';
export function pettingPhase(view: PettingView): PettingPhase {
  if (!view.catId || !view.round) return 'closed';
  if (view.result) return 'result';
  return pettingDone(view.round) ? 'settling' : 'playing';
}

/** The spots lie in a grid of two columns: head and chin in front, back and belly behind. */
const GRID: readonly (readonly PetSpot[])[] = [
  ['HEAD', 'BACK'],
  ['CHIN', 'BELLY'],
];
function neighbour(
  spot: PetSpot,
  key: Extract<PettingViewEvent, { type: 'arrow' }>['key'],
): PetSpot {
  const row = GRID.findIndex((spots) => spots.includes(spot));
  const column = GRID[row]!.indexOf(spot);
  const sideways = key === 'ArrowLeft' || key === 'ArrowRight';
  // Two rows and two columns: either arrow of a pair moves to the other one.
  return GRID[sideways ? row : 1 - row]![sideways ? 1 - column : column]!;
}

export function reducePettingView(
  view: PettingView,
  event: PettingViewEvent,
): PettingView {
  const phase = pettingPhase(view);
  switch (event.type) {
    case 'open':
      return {
        ...closedPetting(),
        catId: event.catId,
        round: startPetting(event.tastes),
        focus: view.focus,
      };
    case 'close':
      return phase === 'closed'
        ? view
        : { ...closedPetting(), focus: view.focus };
    case 'page':
      return event.hidden && phase !== 'closed'
        ? { ...closedPetting(), focus: view.focus }
        : view;
    case 'tick':
      return phase === 'playing'
        ? { ...view, round: stepPetting(view.round!, 1) }
        : view;
    case 'stroke': {
      if (phase !== 'playing') return view;
      const round = strokePetting(view.round!, event.spot);
      // A stroke the cat did not take (it had pulled away) is not part of the round.
      return round === view.round
        ? view
        : {
            ...view,
            round,
            focus: event.spot,
            strokes: [...view.strokes, { tick: round.tick, spot: event.spot }],
          };
    }
    case 'focus':
      return phase === 'closed' || view.focus === event.spot
        ? view
        : { ...view, focus: event.spot };
    case 'arrow':
      return phase === 'playing'
        ? { ...view, focus: neighbour(view.focus, event.key) }
        : view;
    case 'settled':
      return phase === 'settling' ? { ...view, result: event.result } : view;
  }
}

/** A tiny store: dispatch events, read the state, subscribe to changes. */
export function createPettingView() {
  let state = closedPetting();
  const listeners = new Set<(view: PettingView) => void>();
  return {
    get: () => state,
    dispatch(event: PettingViewEvent) {
      const next = reducePettingView(state, event);
      if (next === state) return;
      state = next;
      for (const listener of listeners) listener(state);
    },
    subscribe(listener: (view: PettingView) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
