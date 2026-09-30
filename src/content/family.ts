import { FISHING } from './fishing';

/** Family tuning (spec 041, design 5). */

/** A cat born in the city is a kitten for its first two game days. */
export const KITTEN_MINUTES = 2 * 1440;

/**
 * A cat's three talents (R-35, design 5.4), each 0–4: 钓感 (`feel`), 耐力 (`stamina`) and
 * 亲人 (`affection`). First-generation cats have none; a kitten takes each from a parent.
 */
export const TALENT_NAMES = ['feel', 'stamina', 'affection'] as const;
type TalentName = (typeof TALENT_NAMES)[number];
export type Talent = Record<TalentName, number>;
export const MAX_TALENT = 4;
/** A first-generation cat's talents. */
export const NO_TALENT: Talent = { feel: 0, stamina: 0, affection: 0 };

/**
 * What each level of a talent does (design 5.4). Tuned by the balance and pacing
 * simulations (tests/simulation/talent-balance.test.ts, family-pacing.test.ts).
 */
export const TALENT_EFFECTS = {
  /** 钓感: ticks more to lift in a motion run; points more of a button run's hook zone. */
  feel: { strikeTicks: 1, hookZone: 2 },
  /** 耐力: stamina a cast costs less. */
  stamina: { castCost: 1 },
  /** 亲人: how much less a happy cat's mood falls each hour, by level. */
  affection: { slowerFall: [0, 0, 1, 1, 2] },
} as const;

/** The stamina one cast takes from a cat of this 耐力. */
export const castCost = (stamina: number): number =>
  FISHING.cast.staminaCost - stamina * TALENT_EFFECTS.stamina.castCost;

/**
 * The bond levels (`BOND_LEVELS` indexes) that each give a cat one family mark (家传)
 * once reached: 亲密 and 家人. The bond never falls, so a cat's marks follow from its bond.
 */
export const HERITAGE_BOND_LEVELS = [3, 4] as const;

/** Both parents must have reached this bond level with the player: 信任 (R-31). */
export const BREED_BOND_LEVEL = 2;

/** After a kitten, each parent rests three game days before it can have another (R-31). */
export const BREED_COOLDOWN_MINUTES = 3 * 1440;

/** Neutering a grown cat costs a few coins and needs no building (R-30, requirements D-3). */
export const NEUTER_PRICE = 100;
