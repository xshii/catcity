import { FISHING, fishById } from '../content/fishing';
import { RandomService, streamSeed } from '../core/random';
import type { AnglingRun } from './angling';

/**
 * Motion fishing (spec 030): nibbles and a bite after the cast, a timed lift, then a
 * fight where the player keeps the rod-tip point inside a moving, breathing fish ring.
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

/** Where the fish is `tick` ticks into the fight: seeded segments toward random targets. */
export function fishPoint(
  run: AnglingRun,
  tick: number,
): { x: number; y: number } {
  const rng = new RandomService(streamSeed(run.seed, 'fish'));
  const segment = pick(M.turnTicks, run);
  const speed = pick(M.fishSpeed, run) / FISHING.ticksPerSecond;
  let x = PLANE / 2;
  let y = PLANE / 2;
  for (let start = 0; ; start += segment) {
    const burst = rng.nextInt(100) < pick(M.burstPercent, run) ? 2 : 1;
    const tx = 10 + rng.nextInt(81);
    const ty = 10 + rng.nextInt(81);
    const distance = Math.sqrt((tx - x) ** 2 + (ty - y) ** 2);
    const reach = Math.min(distance, speed * burst * segment);
    const ex = distance ? x + ((tx - x) * reach) / distance : x;
    const ey = distance ? y + ((ty - y) * reach) / distance : y;
    if (tick <= start + segment) {
      const part = (tick - start) / segment;
      return {
        x: Math.round(x + (ex - x) * part),
        y: Math.round(y + (ey - y) * part),
      };
    }
    x = ex;
    y = ey;
  }
}

/** Ring radius: shrinks from start toward its minimum while breathing (triangle wave). */
export function ringRadius(run: AnglingRun, tick: number): number {
  const size = pick(M.radius, run);
  const min = size.min + (run.precision ? M.precisionRadiusBonus : 0);
  const limit = pick(M.fightLimitTicks, run);
  const base = size.start - ((size.start - size.min) * tick) / limit;
  const { amplitude, periodTicks } = M.breathe;
  const phase = (tick + periodTicks / 4) % periodTicks;
  const breath =
    (Math.abs(phase - periodTicks / 2) * 4 * amplitude) / periodTicks -
    amplitude;
  return Math.max(min, Math.round(base + breath));
}

const holdTarget = (run: AnglingRun) =>
  pick(M.holdTicks, run) * M.hold.insideGain;

/** Phase limits a saved motion run must stay within (used by save validation). */
export function motionBounds(run: AnglingRun) {
  return {
    bite: motionSchedule(run).bite,
    strikeWindow: strikeWindow(run),
    holdTarget: holdTarget(run),
    fightLimit: pick(M.fightLimitTicks, run),
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
    } else if (run.phase === 'fight') {
      const fish = fishPoint(run, run.phaseTick);
      const reach = ringRadius(run, run.phaseTick) + M.toleranceUnits;
      const inside =
        point !== null &&
        (point.x - fish.x) ** 2 + (point.y - fish.y) ** 2 <= reach ** 2;
      run.hold = inside
        ? run.hold + M.hold.insideGain
        : Math.max(0, run.hold - M.hold.outsideLoss);
      if (run.hold >= holdTarget(run)) run.phase = 'caught';
      else if (run.phaseTick >= pick(M.fightLimitTicks, run)) {
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
