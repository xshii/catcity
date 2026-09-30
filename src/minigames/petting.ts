import {
  PETTING,
  PET_SPOTS,
  type PetSpot,
  type PetTaste,
} from '../content/petting';

const { purr: PURR, pace: PACE, meter: METER, mood: MOOD } = PETTING;

/** The two spots a cat has an opinion on; the other two are neutral. */
export interface PetTastes {
  favourite: PetSpot;
  disliked: PetSpot;
}
export interface PetStroke {
  tick: number;
  spot: PetSpot;
}
/** How the cat took a stroke: purring along, liking it, fine, or pulling away. */
export type PetReaction = 'purr' | 'like' | 'fine' | 'dislike' | 'hurried';

/**
 * One round of petting (spec 039): a pure simulation over integer ticks, like angling.
 * It knows nothing of the world; Core replays a round's strokes through it to settle.
 */
export interface PettingRound {
  tastes: PetTastes;
  tick: number;
  /** Contentment, 0–100. */
  meter: number;
  /** The cat has pulled away until this tick; strokes before it are ignored. */
  awayUntil: number;
  /** Ticks of the latest strokes the cat took, for the pace rule. */
  recent: number[];
  /** Strokes the cat took on each spot, the disliked one included. */
  counts: Record<PetSpot, number>;
  last: (PetStroke & { reaction: PetReaction }) | null;
}

export function startPetting(tastes: PetTastes): PettingRound {
  return {
    tastes: { ...tastes },
    tick: 0,
    meter: 0,
    awayUntil: 0,
    recent: [],
    counts: { HEAD: 0, CHIN: 0, BACK: 0, BELLY: 0 },
    last: null,
  };
}

export const tasteOf = (tastes: PetTastes, spot: PetSpot): PetTaste =>
  spot === tastes.favourite
    ? 'favourite'
    : spot === tastes.disliked
      ? 'disliked'
      : 'neutral';
/** The purr swells at the start of each period; a stroke then counts for more. */
export const purring = (tick: number) =>
  tick % PURR.periodTicks < PURR.windowTicks;
export const pettingDone = (round: PettingRound) =>
  round.tick >= PETTING.roundTicks;
export const pettingAway = (round: PettingRound) =>
  round.tick < round.awayUntil;

/** Time passes; a finished round stays as it is. */
export function stepPetting(round: PettingRound, ticks: number): PettingRound {
  if (pettingDone(round) || ticks < 1) return round;
  return { ...round, tick: Math.min(PETTING.roundTicks, round.tick + ticks) };
}

/** A stroke at the round's current tick; ignored once done or while the cat is away. */
export function strokePetting(
  round: PettingRound,
  spot: PetSpot,
): PettingRound {
  if (pettingDone(round) || pettingAway(round)) return round;
  const { tick } = round;
  const recent = round.recent.filter((at) => tick - at < PACE.windowTicks);
  const taste = tasteOf(round.tastes, spot);
  const hurried = recent.length >= PACE.maxStrokes;
  const reaction: PetReaction = hurried
    ? 'hurried'
    : taste === 'disliked'
      ? 'dislike'
      : taste === 'neutral'
        ? 'fine'
        : purring(tick)
          ? 'purr'
          : 'like';
  const change = hurried
    ? -METER.hurried
    : taste === 'disliked'
      ? -METER.disliked
      : METER[taste][purring(tick) ? 'purring' : 'other'];
  const away = hurried || taste === 'disliked';
  return {
    ...round,
    meter: Math.max(0, Math.min(METER.max, round.meter + change)),
    awayUntil: away ? tick + PETTING.awayTicks : round.awayUntil,
    recent: hurried ? recent : [...recent, tick],
    counts: hurried
      ? round.counts
      : { ...round.counts, [spot]: round.counts[spot] + 1 },
    last: { tick, spot, reaction },
  };
}

/** A whole round from its strokes, which come in the order of their ticks. */
export function playPetting(
  tastes: PetTastes,
  strokes: readonly PetStroke[],
): PettingRound {
  let round = startPetting(tastes);
  for (const stroke of strokes)
    round = strokePetting(
      stepPetting(round, stroke.tick - round.tick),
      stroke.spot,
    );
  return stepPetting(round, PETTING.roundTicks - round.tick);
}

export interface PettingOutcome {
  meter: number;
  /** The meter reached at least half. */
  good: boolean;
  /** The mood the round is worth before the cat's allowance of lifts. */
  mood: number;
  /** The spot stroked most; the earlier listed on a tie. Null for a round without strokes. */
  spot: PetSpot | null;
  /** Every spot the cat was stroked on, in listing order. */
  touched: PetSpot[];
}

export function pettingOutcome(round: PettingRound): PettingOutcome {
  const touched = PET_SPOTS.filter((spot) => round.counts[spot] > 0);
  const strokes = touched.reduce((sum, spot) => sum + round.counts[spot], 0);
  const mostly = round.counts[round.tastes.disliked] * 2 > strokes;
  return {
    meter: round.meter,
    good: round.meter >= PETTING.good,
    mood: mostly
      ? -MOOD.disliked
      : MOOD.min +
        Math.floor((round.meter * (MOOD.max - MOOD.min)) / METER.max),
    spot: touched.reduce<PetSpot | null>(
      (most, spot) =>
        most === null || round.counts[spot] > round.counts[most] ? spot : most,
      null,
    ),
    touched,
  };
}
