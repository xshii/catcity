import type { CatBreed } from '../content/breeds';
import {
  FISHING,
  fishById,
  canCatchFish,
  catchLengthMm,
  SPOTS,
  type CatchKind,
  type BaitId,
  type FishId,
  type SpotId,
} from '../content/fishing';
import { MOOD } from '../content/mood';
import { RandomService } from '../core/random';

const { input: INPUT, hook: HOOK, greenZone: ZONE, fight: FIGHT } = FISHING;
const PERIOD = FISHING.oscillationTicks;
const starsOf = (run: AnglingRun) =>
  run.speciesId ? fishById(run.speciesId).stars : ZONE.unknownStars;
const validTicks = (ticks: number) =>
  Number.isInteger(ticks) && ticks >= 1 && ticks <= INPUT.maxTicks;
const percent = (value: number) =>
  Number.isInteger(value) && value >= 0 && value <= 100;

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
  power: number;
  cursor: number;
  pressed: boolean;
  hasHeld: boolean;
  speciesId: FishId | null;
  weight: number;
  precision: boolean;
  /** Line tension 0–100: the button fight's meter; a motion fight's dash pull (spec 033). */
  tension: number;
  progress: number;
  lineHealth: number;
  reason: 'none' | 'missed-hook' | 'line-break' | 'escaped';
  /** Buttons keep the frozen tension fight; motion runs use angling-motion.ts. */
  mode: 'buttons' | 'motion';
  /** Motion runs: lift quality, a spooked nibble, and hold earned inside the ring. */
  strike: 'none' | 'perfect' | 'good';
  spooked: boolean;
  hold: number;
  /** The cat was happy when the run began (spec 032): a small bonus for the whole run. */
  happy: boolean;
  /** The fish of the shadow the cast landed on (spec 033); null before the cast or off shadows. */
  shadow: FishId | null;
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
    | 'mode'
    | 'happy'
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
    power: 0,
    cursor: 0,
    pressed: false,
    hasHeld: false,
    speciesId: null,
    weight: 0,
    precision: false,
    tension: FIGHT.startTension,
    progress: 0,
    lineHealth: 100,
    reason: 'none',
    strike: 'none',
    spooked: false,
    hold: 0,
    shadow: null,
  };
}
const triangle = (tick: number, period: number) =>
  Math.round((Math.abs((tick % period) - period / 2) * 200) / period);
export function greenZone(run: AnglingRun): { low: number; high: number } {
  if (run.phase === 'charge')
    return {
      low: FISHING.cast.precisionPower.min,
      high: FISHING.cast.precisionPower.max,
    };
  const stars = starsOf(run);
  const width = Math.min(
    ZONE.maxWidth,
    ZONE.baseWidth -
      stars * ZONE.widthPerStar +
      (run.skillLevel - 1) * ZONE.widthPerSkill +
      (run.precision ? ZONE.precisionBonus : 0) +
      (run.happy ? MOOD.bonus.greenZone : 0),
  );
  const targetCenter =
    run.phase === 'hook'
      ? HOOK.zoneCenter
      : ZONE.fightLow +
        Math.round(
          triangle(
            run.phaseTick + (run.seed % ZONE.seedPhaseTicks),
            ZONE.fightPeriodTicks - stars * ZONE.fightPeriodPerStar,
          ) * ZONE.fightSwing,
        );
  const center = Math.max(width / 2, Math.min(100 - width / 2, targetCenter));
  return {
    low: Math.round(center - width / 2),
    high: Math.round(center + width / 2),
  };
}

/**
 * How the landed-on shadow reacts (spec 033). It only ever makes a catch better: a fish
 * with fewer stars than the rules' pick is ignored. Otherwise it bites when the spot, the
 * bait and the cat's breed allow it, and sniffs a wrong bait and leaves.
 */
function shadowTake(run: AnglingRun): 'none' | 'bite' | 'sniff' {
  const fish = run.shadow;
  if (!fish || !SPOTS[run.spotId].fish.includes(fish)) return 'none';
  const rulePick = ruleFish(run, new RandomService(run.seed));
  if (fishById(fish).stars < fishById(rulePick).stars) return 'none';
  if (!(fishById(fish).baits as readonly BaitId[]).includes(run.baitId))
    return 'sniff';
  return canCatchFish(fish, run.catBreed) ? 'bite' : 'none';
}

/** A waiting time after the shadow: shorter when it bites, later when it sniffs. */
export function shadowWait(run: AnglingRun, ticks: number): number {
  const { bitePercent, sniffTicks } = FISHING.shadows;
  const take = shadowTake(run);
  if (take === 'bite') return Math.floor((ticks * bitePercent) / 100);
  return take === 'sniff' ? ticks + sniffTicks : ticks;
}

/** The fish the aim, bait and breed rules pick; it takes the first draws of `rng`. */
function ruleFish(run: AnglingRun, rng: RandomService): FishId {
  const RULE = FISHING.encounter;
  const left = run.direction < -RULE.sideDegrees;
  const strongRightShrimp = (power: number) =>
    run.baitId === 'SHRIMP' &&
    run.direction > RULE.sideDegrees &&
    run.power >= power;
  let species: FishId = left ? 'SILVER' : 'CRUCIAN';
  if (run.spotId === 'REEDS') {
    if (run.baitId === 'WORM') species = 'PERCH';
    if (strongRightShrimp(RULE.strongPower)) species = 'CATFISH';
  }
  if (run.spotId === 'MOON') {
    species = run.baitId === 'WORM' && run.direction < 0 ? 'KOI' : 'PERCH';
    if (strongRightShrimp(RULE.moonCarpPower))
      species =
        rng.nextInt(100) < RULE.moonCarpChancePercent ? 'MOON_CARP' : 'KOI';
    if (run.baitId === 'BREAD') species = 'CRUCIAN';
  }
  if (run.spotId === 'COAST') {
    species = strongRightShrimp(RULE.strongPower) ? 'SEA_BREAM' : 'MACKEREL';
  }
  return canCatchFish(species, run.catBreed) ? species : RULE.breedFallback;
}

function chooseFish(run: AnglingRun): void {
  const LOOT = FISHING.supplies;
  const rng = new RandomService(run.seed);
  let species = ruleFish(run, rng);
  const shadowBites = shadowTake(run) === 'bite';
  if (shadowBites) species = run.shadow!;
  // Light bread casts may hook supplies. Trash is only a failed-fishing outcome.
  if (
    !shadowBites &&
    run.baitId === 'BREAD' &&
    run.power < LOOT.breadPowerBelow
  ) {
    const roll = rng.nextInt(LOOT.rollSides);
    if (roll < 2) {
      run.catchKind = (['can', 'coins'] as const)[roll]!;
      run.lootAmount =
        run.catchKind === 'coins'
          ? LOOT.coins.min + rng.nextInt(LOOT.coins.max - LOOT.coins.min + 1)
          : 1;
      return;
    }
  }
  // Correct conditions determine the pool; seeded variation affects size and rare encounters.
  run.speciesId = species;
  const fish = fishById(species);
  run.weight =
    fish.minWeight + rng.nextInt(fish.maxWeight - fish.minWeight + 1);
  run.lengthMm = catchLengthMm(fish, run.weight);
}
/** `shadow`: the shadow's fish under the landing if this step releases the charge. */
export function stepAngling(
  input: AnglingRun,
  pressed: boolean,
  ticks: number,
  shadow: FishId | null = null,
): AnglingRun {
  if (!validTicks(ticks)) throw new Error('Invalid angling ticks');
  const run = { ...input };
  for (let i = 0; i < ticks; i++) {
    if (run.phase === 'caught' || run.phase === 'escaped') break;
    if (run.phase === 'charge' && !pressed && run.hasHeld) {
      Object.assign(run, castAngling(run, run.power, shadow));
      continue;
    }
    const rising = pressed && !run.pressed;
    run.tick++;
    run.phaseTick++;
    if (run.phase === 'charge') {
      if (pressed) {
        run.hasHeld = true;
        run.power = 100 - triangle(run.phaseTick, PERIOD);
      }
    } else if (run.phase === 'waiting') {
      const { baseTicks, seedJitterTicks } = FISHING.waiting;
      if (
        run.phaseTick >=
        shadowWait(run, baseTicks + (run.seed % seedJitterTicks))
      ) {
        run.phase = 'hook';
        run.phaseTick = 0;
        run.cursor = 0;
      }
    } else if (run.phase === 'hook') {
      const zone = greenZone(run);
      if (run.phaseTick >= HOOK.deadlineTicks) {
        run.phase = 'escaped';
        run.reason = 'missed-hook';
      } else if (rising) {
        if (run.cursor >= zone.low && run.cursor <= zone.high) {
          run.phase = run.catchKind === 'fish' ? 'fight' : 'caught';
          run.phaseTick = 0;
          run.tension = FIGHT.startTension;
        } else {
          run.phase = 'escaped';
          run.reason = 'missed-hook';
        }
      } else {
        run.cursor = 100 - triangle(run.phaseTick, PERIOD);
      }
    } else if (run.phase === 'fight') {
      const stars = fishById(run.speciesId!).stars;
      run.tension = Math.max(
        0,
        Math.min(
          100,
          run.tension + (pressed ? FIGHT.reelTension : -FIGHT.slackTension),
        ),
      );
      const zone = greenZone(run);
      if (run.tension >= zone.low && run.tension <= zone.high)
        run.progress = Math.min(
          100,
          run.progress +
            (run.phaseTick % (stars + 1) === 0 ? FIGHT.progressStep : 0),
        );
      else if (run.phaseTick % FIGHT.progressDecayEveryTicks === 0)
        run.progress = Math.max(0, run.progress - 1);
      if (
        run.tension < FIGHT.safeTension.min ||
        run.tension > FIGHT.safeTension.max
      )
        run.lineHealth = Math.max(0, run.lineHealth - FIGHT.lineDamage);
      if (run.progress >= 100) run.phase = 'caught';
      else if (run.lineHealth === 0 || run.phaseTick >= FIGHT.maxTicks) {
        run.phase = 'escaped';
        run.reason = run.lineHealth === 0 ? 'line-break' : 'escaped';
      }
    }
    run.pressed = pressed;
  }
  return run;
}

/** A button cast released at this power is precise: the fight is a little easier. */
function precisePower(power: number): boolean {
  const { min, max } = FISHING.cast.precisionPower;
  return power >= min && power <= max;
}

/**
 * Source-independent cast input shared by button release and motion adapters; `shadow`
 * is the fish of the shadow at the landing point, found by Core.
 */
export function castAngling(
  input: AnglingRun,
  power: number,
  shadow: FishId | null = null,
): AnglingRun {
  if (input.phase !== 'charge') throw new Error('Cast requires charge phase');
  if (!percent(power)) throw new Error('Invalid cast power');
  const run: AnglingRun = {
    ...input,
    power,
    // Every motion cast is steady: aiming at a fish shadow is its choice (spec 033 F5b).
    precision: input.mode === 'motion' || precisePower(power),
    phase: 'waiting',
    phaseTick: 0,
    tick: input.tick + 1,
    hasHeld: true,
    pressed: false,
    shadow,
  };
  chooseFish(run);
  return run;
}
