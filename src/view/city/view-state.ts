import type { WorldState } from '../../core';
import { tileAt } from '../../core/city';
import type { CitySelection } from '../art/city-map';
import type { Place } from '../common/place';

/**
 * Everything the city screen decides from, besides the world snapshot (spec 015).
 * View-local: never part of the world or a save. The overview pan stays in the scene;
 * this holds the states that switch the card, the highlight and the camera mode.
 */
export interface CityView {
  place: Place;
  selection: CitySelection;
  /** The building being moved; the next tile tapped is its new place. */
  moving: string | null;
  /** The cat picked on the map; tile cards offer to walk it there. */
  walker: string | null;
  /** The camera shows the whole map instead of following the cat. */
  overview: boolean;
}

export type CityViewEvent =
  | { type: 'place'; place: Place }
  /** A tile, a waterway or a cat on the map; a cat also becomes the walker. */
  | { type: 'select'; selection: NonNullable<CitySelection> }
  /** Tapping the picked cat again lets it go; another cat is picked. */
  | { type: 'cat'; catId: string }
  | { type: 'move'; buildingId: string }
  | { type: 'clear' }
  | { type: 'overview' };

export const initialCityView = (): CityView => ({
  place: 'city',
  selection: null,
  moving: null,
  walker: null,
  overview: false,
});

const cleared = (view: CityView): CityView => ({
  ...view,
  selection: null,
  moving: null,
  walker: null,
});

/**
 * Pure transitions. Invariants (unit-tested under random event sequences): nothing is
 * selected outside the city; a building moves only from a selected tile; a selected cat
 * is the walker.
 */
export function reduceCityView(view: CityView, event: CityViewEvent): CityView {
  const next = step(view, event);
  const settled =
    next.place !== 'city'
      ? cleared(next)
      : next.moving && next.selection?.kind !== 'tile'
        ? { ...next, moving: null }
        : next;
  return JSON.stringify(settled) === JSON.stringify(view) ? view : settled;
}

function step(view: CityView, event: CityViewEvent): CityView {
  switch (event.type) {
    case 'place':
      return { ...view, place: event.place };
    case 'select': {
      const { selection } = event;
      return {
        ...view,
        selection,
        moving: null,
        walker: selection.kind === 'cat' ? selection.catId : view.walker,
      };
    }
    case 'cat':
      return view.walker === event.catId
        ? cleared(view)
        : {
            ...view,
            selection: { kind: 'cat', catId: event.catId },
            moving: null,
            walker: event.catId,
          };
    case 'move':
      return { ...view, moving: event.buildingId };
    case 'clear':
      return cleared(view);
    case 'overview':
      return { ...view, overview: !view.overview };
  }
}

/** The selection names a cat or tile the world no longer has. */
export function selectionGone(view: CityView, world: WorldState): boolean {
  const selected = view.selection;
  if (selected?.kind === 'cat')
    return !world.cats.some((cat) => cat.id === selected.catId);
  if (selected?.kind === 'tile') return !tileAt(world.map, selected.position);
  return false;
}

/** A tiny store: dispatch events, read the state, subscribe to changes. */
export function createCityView(initial: CityView = initialCityView()) {
  let state = initial;
  const listeners = new Set<(view: CityView) => void>();
  return {
    get: () => state,
    dispatch(event: CityViewEvent) {
      const next = reduceCityView(state, event);
      if (next === state) return;
      state = next;
      for (const listener of listeners) listener(state);
    },
    subscribe(listener: (view: CityView) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
export type CityViewStore = ReturnType<typeof createCityView>;
