/** Wishes (spec 041 R-50 – R-53, design 7): what a grown companion may wish for. */

/**
 * A fish of one species, given as a gift (target: the species); a home; a cafe near its
 * home; a round of petting; a fish caught together at one water (target: the water).
 */
export const WISH_KINDS = [
  'FISH',
  'HOME',
  'CAFE',
  'PETTING',
  'OUTING',
] as const;
export type WishKind = (typeof WISH_KINDS)[number];

export const WISH = {
  /**
   * The chance (percent) that a grown companion without a wish thinks of one as a game
   * day starts. Tuned by tests/simulation/pacing.test.ts.
   */
  chancePercent: 50,
  /** A granted wish: bond points (one more from a happy cat) and mood. */
  bond: 10,
  mood: 10,
} as const;
