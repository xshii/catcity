import { FISHING, fishById } from '../content/fishing';
import { RandomService, streamSeed } from '../core/random';
import type { AnglingRun } from './angling';

/**
 * Motion fishing (spec 030): nibbles and a bite after the cast, a timed lift, then a
 * fight where the player keeps the rod-tip point inside a moving, breathing fish ring.
 * Numbers live in `content/fishing/motion.ts`.
 * Everything derives from the run's seed, stars and ticks, so nothing extra is saved.
 */
const M = FISHING.motion;
const PLANE = 100;

const starsOf = (run: AnglingRun) =>
  run.speciesId ? fishById(run.speciesId).stars : 0;
const pick = <T>(table: readonly T[], run: AnglingRun) => table[starsOf(run)]!;
const validTicks = (ticks: number) =>
  Number.isInteger(ticks) && ticks >= 1 && ticks <= FISHING.input.maxTicks;
const onPlane = (value: number) =>
  Number.isInteger(value) && value >= 0 && value <= PLANE;

/** Fake nibbles and the real bite, in waiting-phase ticks after the cast. */
export function motionSchedule(run: AnglingRun): {
  nibbles: number[];
  bite: number;
} {
  const rng = new RandomService(streamSeed(run.seed, 'bite'));
  const [min, max] = pick(M.nibbles, run);
  const count = min + rng.nextInt(max - min + 1);
  let at = M.firstNibble.baseTicks + rng.nextInt(M.firstNibble.jitterTicks);
  const nibbles: number[] = [];
  for (let i = 0; i < count; i++) {
    nibbles.push(at);
    at +=
      M.nibbleTicks +
      M.betweenNibbles.baseTicks +
      rng.nextInt(M.betweenNibbles.jitterTicks);
  }
  const bite =
    at +
    M.biteAfterNibbles.baseTicks +
    rng.nextInt(M.biteAfterNibbles.jitterTicks) +
    (run.spooked ? M.spook.delayTicks : 0);
  return { nibbles, bite };
}

const strikeWindow = (run: AnglingRun) =>
  pick(M.strikeWindowTicks, run) -
  (run.spooked ? M.spook.windowPenaltyTicks : 0);

const F = M.fight;
const W = M.walk;
/** Fixed-point scale for the walk, so replays never depend on floating-point drift. */
const SCALE = 100;
const HEADINGS = 32;
/** cos(k × 11.25°) × 1000 for k = 0…8; all 32 headings mirror it (no engine trig). */
const COS = [1000, 981, 924, 831, 707, 556, 383, 195, 0];
const wrap = (heading: number) => ((heading % HEADINGS) + HEADINGS) % HEADINGS;
function unit(heading: number): [number, number] {
  const quarter = Math.floor(heading / 8);
  const c = COS[heading % 8]!;
  const s = COS[8 - (heading % 8)]!;
  return quarter === 0
    ? [c, s]
    : quarter === 1
      ? [-s, c]
      : quarter === 2
        ? [-c, -s]
        : [s, -c];
}

export interface FishState {
  x: number;
  y: number;
  /** A dash is announced: show the ripple now, it starts when this ends. */
  warning: boolean;
  dashing: boolean;
}

/**
 * Where the fish is `tick` ticks into the fight. A correlated random walk from the run's
 * seed: straight runs with a turn between them, rests, announced dashes, and a bounce at
 * the water's edge. The fish waits while the player settles in, then eases up to speed.
 */
export function fishPoint(run: AnglingRun, tick: number): FishState {
  return fishPath(run, tick)[tick]!;
}

/** The fish at every tick from 0 to `ticks`, in one pass (see `fishPoint`). */
export function fishPath(run: AnglingRun, ticks: number): FishState[] {
  const rng = new RandomService(streamSeed(run.seed, 'fish'));
  const speed = pick(W.speed, run);
  const margin = (pick(F.radius, run).start + F.breathe.amplitude) * SCALE;
  const still = F.graceTicks - F.rampTicks;
  const fish = {
    x: (PLANE / 2) * SCALE,
    y: (PLANE / 2) * SCALE,
    heading: rng.nextInt(HEADINGS),
    pace: 100,
    runLeft: 0,
    warnLeft: 0,
    dashLeft: 0,
    cooldown: 0,
  };
  const newRun = () => {
    const [shortest, longest] = pick(W.runTicks, run);
    fish.runLeft = shortest + rng.nextInt(longest - shortest + 1);
    const [least, most] = pick(W.turnDeg, run);
    const degrees = least + rng.nextInt(most - least + 1);
    const steps = Math.floor((degrees * HEADINGS + 180) / 360);
    fish.heading = wrap(fish.heading + (rng.nextInt(2) ? steps : -steps));
    const jitter = pick(W.speedJitterPercent, run);
    fish.pace =
      rng.nextInt(100) < pick(W.rest.percent, run)
        ? W.rest.speedPercent
        : 100 - jitter + rng.nextInt(2 * jitter + 1);
  };
  const at = (): FishState => ({
    x: Math.round(fish.x / SCALE),
    y: Math.round(fish.y / SCALE),
    warning: fish.warnLeft > 0,
    dashing: fish.dashLeft > 0,
  });
  const path = Array.from({ length: Math.min(still, ticks) + 1 }, at);
  for (let t = still + 1; t <= ticks; t++) {
    if (fish.warnLeft > 0) {
      fish.warnLeft--;
      if (fish.warnLeft === 0) {
        newRun();
        fish.dashLeft = W.dash.ticks;
      }
    } else if (fish.dashLeft > 0) {
      fish.dashLeft--;
      if (fish.dashLeft === 0) fish.cooldown = W.dash.cooldownTicks;
    } else if (fish.cooldown > 0) fish.cooldown--;
    else if (
      t > F.graceTicks &&
      rng.nextInt(100 * FISHING.ticksPerSecond) <
        pick(W.dash.perSecondPercent, run)
    )
      fish.warnLeft = W.dash.warnTicks;
    if (fish.runLeft === 0) newRun();
    fish.runLeft--;
    const ramp = Math.min(F.rampTicks, t - still);
    const pace = fish.dashLeft > 0 ? W.dash.speedPercent : fish.pace;
    const step = Math.trunc(
      (speed * SCALE * pace * ramp) /
        (FISHING.ticksPerSecond * 100 * F.rampTicks),
    );
    const [ux, uy] = unit(fish.heading);
    let x = fish.x + Math.trunc((ux * step) / 1000);
    let y = fish.y + Math.trunc((uy * step) / 1000);
    if (x < margin || x > PLANE * SCALE - margin) {
      fish.heading = wrap(HEADINGS / 2 - fish.heading);
      x = Math.min(PLANE * SCALE - margin, Math.max(margin, x));
    }
    if (y < margin || y > PLANE * SCALE - margin) {
      fish.heading = wrap(-fish.heading);
      y = Math.min(PLANE * SCALE - margin, Math.max(margin, y));
    }
    fish.x = x;
    fish.y = y;
    path.push(at());
  }
  return path;
}

const holdTarget = (run: AnglingRun) =>
  pick(F.holdTicks, run) * F.hold.insideGain;

/** Ring radius: shrinks toward its minimum as the hold fills, breathing all the while. */
export function ringRadius(run: AnglingRun): number {
  const size = pick(F.radius, run);
  const min = size.min + (run.precision ? F.precisionRadiusBonus : 0);
  const filled = Math.min(1, run.hold / holdTarget(run));
  const base = size.start - (size.start - size.min) * filled;
  const { amplitude, periodTicks } = F.breathe;
  const phase = (run.phaseTick + periodTicks / 4) % periodTicks;
  const breath =
    (Math.abs(phase - periodTicks / 2) * 4 * amplitude) / periodTicks -
    amplitude;
  return Math.max(min, Math.round(base + breath));
}

/** Phase limits a saved motion run must stay within (used by save validation). */
export function motionBounds(run: AnglingRun) {
  return {
    bite: motionSchedule(run).bite,
    strikeWindow: strikeWindow(run),
    holdTarget: holdTarget(run),
    fightLimit: F.graceTicks + F.limitTicks,
  };
}

/** Advance waiting, the strike window or the fight; `point` is the rod tip (fight only). */
export function stepMotionRun(
  input: AnglingRun,
  point: { x: number; y: number } | null,
  ticks: number,
): AnglingRun {
  if (input.mode !== 'motion') throw new Error('Not a motion run');
  if (input.phase === 'charge') throw new Error('Cast first');
  if (!validTicks(ticks)) throw new Error('Invalid angling ticks');
  if (point && (!onPlane(point.x) || !onPlane(point.y)))
    throw new Error('Invalid motion point');
  const run = { ...input };
  for (let i = 0; i < ticks; i++) {
    if (run.phase === 'caught' || run.phase === 'escaped') break;
    run.tick++;
    run.phaseTick++;
    if (run.phase === 'waiting') {
      if (run.phaseTick >= motionSchedule(run).bite) {
        run.phase = 'hook';
        run.phaseTick = 0;
      }
    } else if (run.phase === 'hook') {
      if (run.phaseTick >= strikeWindow(run)) {
        run.phase = 'escaped';
        run.reason = 'missed-hook';
      }
    } else if (run.phase === 'fight' && run.phaseTick > F.graceTicks) {
      const fish = fishPoint(run, run.phaseTick);
      const reach = ringRadius(run) + F.toleranceUnits;
      const inside =
        point !== null &&
        (point.x - fish.x) ** 2 + (point.y - fish.y) ** 2 <= reach ** 2;
      run.hold = inside
        ? run.hold + F.hold.insideGain
        : Math.max(0, run.hold - F.hold.outsideLoss);
      if (run.hold >= holdTarget(run)) run.phase = 'caught';
      else if (run.phaseTick >= F.graceTicks + F.limitTicks) {
        run.phase = 'escaped';
        run.reason = 'escaped';
      }
    }
  }
  return run;
}

/** A quick lift: spooks a nibble, hooks during the bite window, is ignored otherwise. */
export function strikeMotionRun(input: AnglingRun): AnglingRun {
  if (input.mode !== 'motion') throw new Error('Not a motion run');
  if (input.phase === 'waiting') {
    const nibbling = motionSchedule(input).nibbles.some(
      (at) => input.phaseTick >= at && input.phaseTick < at + M.nibbleTicks,
    );
    return nibbling && !input.spooked ? { ...input, spooked: true } : input;
  }
  if (input.phase !== 'hook') throw new Error('Strike not ready');
  const perfect =
    input.phaseTick <=
    Math.floor((strikeWindow(input) * M.perfect.windowPercent) / 100);
  const run: AnglingRun = {
    ...input,
    strike: perfect ? 'perfect' : 'good',
    hold: perfect
      ? Math.round((holdTarget(input) * M.perfect.holdBonusPercent) / 100)
      : 0,
    phaseTick: 0,
  };
  run.phase = run.catchKind === 'fish' ? 'fight' : 'caught';
  return run;
}
