import type { SpotId } from '../../content/fishing';
import type { CatMotion } from '../art/cat-look';

/** Which scene is on screen. View-local: it never enters the world or a save. */
export type Place = 'city' | 'river';

export function createPlace(initial: Place = 'city') {
  let current = initial;
  let petting = false;
  const listeners = new Set<(place: Place) => void>();
  const minigameListeners = new Set<(on: boolean) => void>();
  const minigame = () => current === 'river' || petting;
  /** Makes a change, then tells minigame listeners if it turned the flag. */
  const change = (apply: () => void) => {
    const was = minigame();
    apply();
    if (minigame() !== was)
      for (const listener of minigameListeners) listener(!was);
  };
  return {
    get: () => current,
    set(next: Place) {
      if (next === current) return;
      change(() => {
        current = next;
        for (const listener of listeners) listener(next);
      });
    },
    subscribe(listener: (place: Place) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /**
     * A minigame is going: the river, or the petting screen over either place. The city
     * clock runs at 1× meanwhile (041 R-22).
     */
    minigame,
    onMinigame(listener: (on: boolean) => void) {
      minigameListeners.add(listener);
      return () => minigameListeners.delete(listener);
    },
    /**
     * Only the petting screen calls this. It covers the place without being one: the tool
     * bar and the scene stay as they are.
     */
    setPetting(open: boolean) {
      if (open !== petting) change(() => (petting = open));
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
  /** The rod sets the power now (motion aiming), so the water previews the flight. */
  live: boolean;
}
export interface AimControl {
  get: () => Aim;
  /** Aiming on the water or by tilt; callers keep values within `FISHING.input`. */
  set: (next: Partial<Omit<Aim, 'spotId' | 'live'>>) => void;
  subscribe: (listener: () => void) => () => void;
  /** The motion fight ring's centre on the 100×100 water plane; the line runs to it. */
  ringCentre: () => { x: number; y: number };
}

/** The river cat's moves as it answers a tap (R-03): the fishing panel says them, the art plays them. */
export interface CatMoves {
  subscribe: (listener: (motion: CatMotion) => void) => () => void;
}
