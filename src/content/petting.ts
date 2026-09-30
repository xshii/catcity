/** Where a cat can be stroked (spec 039), in the order the screen and saves list them. */
export const PET_SPOTS = ['HEAD', 'CHIN', 'BACK', 'BELLY'] as const;
export type PetSpot = (typeof PET_SPOTS)[number];
export const PET_SPOT_NAMES: Record<PetSpot, string> = {
  HEAD: '头顶',
  CHIN: '下巴',
  BACK: '后背',
  BELLY: '肚子',
};
/** How a cat takes a stroke on a spot: one favourite, one disliked, the rest neutral. */
export type PetTaste = 'favourite' | 'neutral' | 'disliked';

/**
 * Petting tuning (spec 039). A round is short and costs nothing; it only ever adds mood,
 * except a round spent mostly on the disliked spot. Times are integer input ticks.
 */
export const PETTING = {
  ticksPerSecond: 20,
  /** 12 seconds. */
  roundTicks: 240,
  /** The purr swells for `windowTicks` at the start of every `periodTicks`. */
  purr: { periodTicks: 30, windowTicks: 18 },
  /** A stroke that follows `maxStrokes` others within `windowTicks` is too fast. */
  pace: { windowTicks: 20, maxStrokes: 3 },
  /** How long the cat pulls away after a hurried stroke or one on the disliked spot. */
  awayTicks: 20,
  /** Contentment 0–100 and what each stroke adds; losses are magnitudes. */
  meter: {
    max: 100,
    favourite: { purring: 10, other: 4 },
    neutral: { purring: 2, other: 1 },
    disliked: 8,
    hurried: 3,
  },
  /** A meter at least this full is a good round: it may grow the bond. */
  good: 50,
  /** Mood for an empty and a full meter; a round mostly on the disliked spot costs 1. */
  mood: { min: 2, max: 8, disliked: 1 },
} as const;
