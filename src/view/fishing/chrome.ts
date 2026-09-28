import type { Place } from '../shell/place';

export interface ChromeInput {
  place: Place;
  run: { mode: 'buttons' | 'motion' } | null;
  /** Motion fishing is chosen and the sensors answer. */
  motionActive: boolean;
  /** A phone that has not chosen yet is being offered motion fishing. */
  offersMotion: boolean;
}

/**
 * Which fishing controls the scene shows. Pure, so every combination is unit-tested:
 * nothing of the river leaks into another place, and a run keeps the controls of the
 * mode it was cast in.
 */
export function fishingChrome(input: ChromeInput) {
  const river = input.place === 'river';
  const { run } = input;
  return {
    /** The manual "ready to cast" area. */
    readyToCast: river && !run && !input.motionActive && !input.offersMotion,
    /** The in-run console (pause, leave; and the button flow's meters). */
    console: river && !!run,
    consoleMode: river && run ? run.mode : null,
    /** The river gives most of the screen to the motion plane. */
    motionPlay: river && (run ? run.mode === 'motion' : input.motionActive),
  };
}
