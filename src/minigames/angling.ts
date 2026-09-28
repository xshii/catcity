import type { CatBreed } from '../content/breeds';
import {
  fishById,
  canCatchFish,
  type CatchKind,
  type BaitId,
  type FishId,
  type SpotId,
} from '../content/fish';
import { RandomService } from '../core/random';

export interface AnglingRun {
  id: string;
  catId: string;
  catBreed: CatBreed;
  catchKind: CatchKind;
  lengthMm: number;
  lootAmount: number;
  seed: number;
  baitId: BaitId;
  direction: number;
  aimDepth: number;
  skillLevel: number;
  spotId: SpotId;
  phase: 'charge' | 'waiting' | 'hook' | 'fight' | 'caught' | 'escaped';
  tick: number;
  phaseTick: number;
  motionStableTicks: number;
  power: number;
  cursor: number;
  pressed: boolean;
  hasHeld: boolean;
  speciesId: FishId | null;
  weight: number;
  precision: boolean;
  tension: number;
  progress: number;
  lineHealth: number;
  reason: 'none' | 'missed-hook' | 'line-break' | 'escaped';
}
export function initialAngling(
  input: Pick<
    AnglingRun,
    | 'id'
    | 'catId'
    | 'seed'
    | 'baitId'
    | 'direction'
    | 'skillLevel'
    | 'spotId'
    | 'catBreed'
    | 'aimDepth'
  >,
): AnglingRun {
  return {
    ...input,
    catchKind: 'fish',
    lengthMm: 0,
    lootAmount: 0,
    phase: 'charge',
    tick: 0,
    phaseTick: 0,
    motionStableTicks: 0,
    power: 0,
    cursor: 0,
    pressed: false,
    hasHeld: false,
    speciesId: null,
    weight: 0,
    precision: false,
    tension: 50,
    progress: 0,
    lineHealth: 100,
    reason: 'none',
  };
}
const triangle = (tick: number, period: number) =>
  Math.round((Math.abs((tick % period) - period / 2) * 200) / period);
export function greenZone(run: AnglingRun): { low: number; high: number } {
  if (run.phase === 'charge') return { low: 55, high: 80 };
  const stars = run.speciesId ? fishById(run.speciesId).stars : 1;
  const width = Math.min(
    64,
    58 - stars * 8 + (run.skillLevel - 1) * 2 + (run.precision ? 4 : 0),
  );
  const targetCenter =
    run.phase === 'hook'
      ? 55
      : 30 +
        Math.round(
          triangle(run.phaseTick + (run.seed % 40), 140 - stars * 18) * 0.4,
        );
  const center = Math.max(width / 2, Math.min(100 - width / 2, targetCenter));
  return {
    low: Math.round(center - width / 2),
    high: Math.round(center + width / 2),
  };
}

/** The View draws this target; Core alone decides whether input holds inside it. */
export function motionTarget(run: AnglingRun): {
  x: 50;
  y: 50;
  radius: number;
  holdTicks: number;
} {
  const zone = greenZone({ ...run, phase: 'hook' });
  const stars = run.speciesId ? fishById(run.speciesId).stars : 1;
  return {
    x: 50,
    y: 50,
    radius: (zone.high - zone.low) / 2,
    holdTicks: 6 + 2 * stars,
  };
}

/** One normalized point is held for bounded ticks; no sensor or wall-clock dependency. */
export function stepMotionAngling(
  input: AnglingRun,
  x: number,
  y: number,
  ticks: number,
): AnglingRun {
  if (input.phase !== 'hook') throw new Error('Motion requires hook phase');
  if (
    ![x, y].every(
      (value) => Number.isInteger(value) && value >= 0 && value <= 100,
    )
  )
    throw new Error('Invalid motion point');
  if (!Number.isInteger(ticks) || ticks < 1 || ticks > 4)
    throw new Error('Invalid angling ticks');
  const run = { ...input, pressed: false };
  const target = motionTarget(run);
  const inside =
    (x - target.x) ** 2 + (y - target.y) ** 2 <= target.radius ** 2;
  for (let i = 0; i < ticks && run.phase === 'hook'; i++) {
    run.tick++;
    run.phaseTick++;
    run.cursor = 100 - triangle(run.phaseTick, 64);
    if (run.phaseTick >= 128) {
      run.phase = 'escaped';
      run.reason = 'missed-hook';
      run.motionStableTicks = 0;
      break;
    }
    run.motionStableTicks = inside ? run.motionStableTicks + 1 : 0;
    if (run.motionStableTicks >= target.holdTicks) {
      run.phase = run.catchKind === 'fish' ? 'fight' : 'caught';
      run.phaseTick = 0;
      run.tension = 50;
      run.motionStableTicks = 0;
    }
  }
  return run;
}

function chooseFish(run: AnglingRun): void {
  const rng = new RandomService(run.seed);
  let species: FishId = run.direction < -10 ? 'SILVER' : 'CRUCIAN';
  if (run.spotId === 'REEDS') {
    if (run.baitId === 'WORM') species = 'PERCH';
    if (run.baitId === 'SHRIMP' && run.direction > 10 && run.power >= 55)
      species = 'CATFISH';
  }
  if (run.spotId === 'MOON') {
    species = run.baitId === 'WORM' && run.direction < 0 ? 'KOI' : 'PERCH';
    if (run.baitId === 'SHRIMP' && run.direction > 10 && run.power >= 70)
      species = rng.nextInt(100) < 65 ? 'MOON_CARP' : 'KOI';
    if (run.baitId === 'BREAD') species = 'CRUCIAN';
  }
  if (run.spotId === 'COAST') {
    species =
      run.baitId === 'SHRIMP' && run.direction > 10 && run.power >= 55
        ? 'SEA_BREAM'
        : 'MACKEREL';
  }
  if (!canCatchFish(species, run.catBreed)) species = 'PERCH';
  // Light bread casts may hook supplies. Trash is only a failed-fishing outcome.
  if (run.baitId === 'BREAD' && run.power < 35) {
    const roll = rng.nextInt(4);
    if (roll < 2) {
      run.catchKind = (['can', 'coins'] as const)[roll]!;
      run.lootAmount = run.catchKind === 'coins' ? 25 + rng.nextInt(26) : 1;
      return;
    }
  }
  // Correct conditions determine the pool; seeded variation affects size and rare encounters.
  run.speciesId = species;
  const fish = fishById(species);
  run.weight =
    fish.minWeight + rng.nextInt(fish.maxWeight - fish.minWeight + 1);
  run.lengthMm =
    fish.minLengthMm +
    Math.floor(
      ((run.weight - fish.minWeight) * (fish.maxLengthMm - fish.minLengthMm)) /
        (fish.maxWeight - fish.minWeight),
    );
}
export function stepAngling(
  input: AnglingRun,
  pressed: boolean,
  ticks: number,
): AnglingRun {
  if (!Number.isInteger(ticks) || ticks < 1 || ticks > 4)
    throw new Error('Invalid angling ticks');
  const run = { ...input, motionStableTicks: 0 };
  for (let i = 0; i < ticks; i++) {
    if (run.phase === 'caught' || run.phase === 'escaped') break;
    if (run.phase === 'charge' && !pressed && run.hasHeld) {
      Object.assign(run, castAngling(run, run.power));
      continue;
    }
    const rising = pressed && !run.pressed;
    run.tick++;
    run.phaseTick++;
    if (run.phase === 'charge') {
      if (pressed) {
        run.hasHeld = true;
        run.power = 100 - triangle(run.phaseTick, 64);
      }
    } else if (run.phase === 'waiting') {
      if (run.phaseTick >= 24 + (run.seed % 16)) {
        run.phase = 'hook';
        run.phaseTick = 0;
        run.cursor = 0;
      }
    } else if (run.phase === 'hook') {
      const zone = greenZone(run);
      if (run.phaseTick >= 128) {
        run.phase = 'escaped';
        run.reason = 'missed-hook';
      } else if (rising) {
        if (run.cursor >= zone.low && run.cursor <= zone.high) {
          run.phase = run.catchKind === 'fish' ? 'fight' : 'caught';
          run.phaseTick = 0;
          run.tension = 50;
        } else {
          run.phase = 'escaped';
          run.reason = 'missed-hook';
        }
      } else {
        run.cursor = 100 - triangle(run.phaseTick, 64);
      }
    } else if (run.phase === 'fight') {
      const stars = fishById(run.speciesId!).stars;
      run.tension = Math.max(
        0,
        Math.min(100, run.tension + (pressed ? 3 : -2)),
      );
      const zone = greenZone(run);
      if (run.tension >= zone.low && run.tension <= zone.high)
        run.progress = Math.min(
          100,
          run.progress + (run.phaseTick % (stars + 1) === 0 ? 2 : 0),
        );
      else if (run.phaseTick % 4 === 0)
        run.progress = Math.max(0, run.progress - 1);
      if (run.tension < 8 || run.tension > 92)
        run.lineHealth = Math.max(0, run.lineHealth - 3);
      if (run.progress >= 100) run.phase = 'caught';
      else if (run.lineHealth === 0 || run.phaseTick >= 420) {
        run.phase = 'escaped';
        run.reason = run.lineHealth === 0 ? 'line-break' : 'escaped';
      }
    }
    run.pressed = pressed;
  }
  return run;
}

/** Source-independent cast input shared by button release and motion adapters. */
export function castAngling(input: AnglingRun, power: number): AnglingRun {
  if (input.phase !== 'charge') throw new Error('Cast requires charge phase');
  if (!Number.isInteger(power) || power < 0 || power > 100)
    throw new Error('Invalid cast power');
  const run: AnglingRun = {
    ...input,
    power,
    precision: power >= 55 && power <= 80,
    phase: 'waiting',
    phaseTick: 0,
    tick: input.tick + 1,
    hasHeld: true,
    pressed: false,
  };
  chooseFish(run);
  return run;
}
