import type { SpotId } from '../../content/fishing';

/** Which scene is on screen. View-local: it never enters the world or a save. */
export type Place = 'city' | 'river';

export function createPlace(initial: Place = 'city') {
  let current = initial;
  const listeners = new Set<(place: Place) => void>();
  return {
    get: () => current,
    set(next: Place) {
      if (next === current) return;
      current = next;
      for (const listener of listeners) listener(next);
    },
    subscribe(listener: (place: Place) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
export type PlaceState = ReturnType<typeof createPlace>;

/** Tool-sheet actions other modules may trigger instead of clicking its buttons. */
export interface Tools {
  close: () => void;
  openTalk: () => void;
}

/** The cast being lined up before a run. Owned by the fishing panel; the river previews it. */
export interface Aim {
  spotId: SpotId;
  direction: number;
  depth: number;
  /** Cast power the rod is set to (motion); the landing preview moves with it. */
  power: number;
}
export interface AimControl {
  get: () => Aim;
  /** Aiming on the water or by tilt; callers keep values within `FISHING.input`. */
  set: (next: Partial<Omit<Aim, 'spotId'>>) => void;
  subscribe: (listener: () => void) => () => void;
}
