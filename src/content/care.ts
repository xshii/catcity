/** Cat care tuning shared by recovery, walking energy and relationship rules. */
export const CARE = {
  /** An idle cat (not fishing, not stepping) recovers each tick; faster beside its home. */
  recovery: { tickMinutes: 10, idle: 5, home: 10 },
  walkEnergyPerTile: 1,
  /** Recent chat kept per cat; shared-activity facts are stored separately. */
  memoryLimit: 50,
} as const;

/**
 * Bond points by source (spec 038). The bond grows by what the player does, never by the
 * clock alone; only free sources have a daily allowance.
 */
export const BOND = {
  catch: 2,
  favoriteGift: 3,
  gift: 1,
  chat: 1,
  /** Added to each of the above for a cat that is happy at that moment. */
  happy: 1,
  /** Chats that earn points, per cat and game day. */
  chatsPerDay: 1,
  /** Gifts that earn points and lift mood, per cat and game day; later ones are kept. */
  giftsPerDay: 3,
  /** A good round of petting (spec 039), for the first `pettingPerDay` of a game day per cat. */
  petting: 2,
  pettingPerDay: 3,
  dayMinutes: 24 * 60,
} as const;

/** Bond levels (spec 036), lowest first: a cat is at the last one whose `bond` it has reached. */
export const BOND_LEVELS = [
  { name: '初识', bond: 0 },
  { name: '熟悉', bond: 25 },
  { name: '信任', bond: 150 },
  { name: '亲密', bond: 500 },
  { name: '家人', bond: 1500 },
] as const;

/** The index into `BOND_LEVELS` that these bond points have reached; derived, never saved. */
export function bondLevel(playerBond: number): number {
  return BOND_LEVELS.filter((level) => playerBond >= level.bond).length - 1;
}
