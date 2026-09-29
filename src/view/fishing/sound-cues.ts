import type { WorldState } from '../../core';
import { FISHING } from '../../content/fishing';
import type { AnglingRun } from '../../minigames/angling';
import { motionBounds } from '../../minigames/angling-motion';
import { motionNibble } from './screen';
import type { FishingView } from './view-state';

type Fishing = WorldState['fishing'];

/** One-shot fishing sounds (spec 033 F4); the reeling hum is continuous, see `reelLevel`. */
export type SoundCue = 'cast' | 'nibble' | 'bite' | 'strain' | 'catch' | 'snap';

/** Per-device sound choice; never part of the world or a save. */
export const SOUND_KEY = 'cat-city.sound';
/** Sound is on unless this device switched it off. */
export const soundOn = (stored: string | null) => stored !== 'off';
export const soundLabel = (supported: boolean, on: boolean) =>
  supported ? `音效：${on ? '开' : '关'}` : '此浏览器不支持音效';

/** A motion fight's line sounds its strain each time its tension climbs past a step. */
const STRAIN_STEP = 25;
/**
 * How strained the line is, in steps: a button fight is strained above its safe range,
 * where the line wears; a motion fight by its tug-of-war tension (spec 033 F1).
 */
const strainSteps = (run: AnglingRun) => {
  if (run.phase !== 'fight') return 0;
  if (run.mode === 'motion') return Math.floor(run.tension / STRAIN_STEP);
  return run.tension > FISHING.fight.safeTension.max ? 1 : 0;
};

/**
 * The sounds one world change calls for, from the fishing state before and after it.
 * Only changes within one run count, so a reload or a loaded save replays nothing.
 */
export function soundCues(previous: Fishing, next: Fishing): SoundCue[] {
  const before = previous.active;
  const run = next.active;
  const cues: SoundCue[] = [];
  if (run && before?.id === run.id) {
    if (before.phase === 'charge' && run.phase !== 'charge') cues.push('cast');
    const nibble = motionNibble(run);
    if (nibble !== null && nibble !== motionNibble(before)) cues.push('nibble');
    if (before.phase !== 'hook' && run.phase === 'hook') cues.push('bite');
    if (strainSteps(run) > strainSteps(before)) cues.push('strain');
  }
  const ended = next.lastResult;
  if (
    ended &&
    ended.runId === before?.id &&
    ended.runId !== previous.lastResult?.runId
  ) {
    if (ended.caught) cues.push('catch');
    else if (ended.reason === 'line-break') cues.push('snap');
  }
  return cues;
}

/** The reeling hum while a fight is played: how far it has come (0–1), or null for silence. */
export function reelLevel(
  view: FishingView,
  run: AnglingRun | null,
): number | null {
  if (run?.phase !== 'fight' || view.paused) return null;
  const level =
    run.mode === 'motion'
      ? run.hold / motionBounds(run).holdTarget
      : run.progress / 100;
  return Math.min(1, Math.max(0, level));
}
