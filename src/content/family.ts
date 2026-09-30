/** Family tuning (spec 041, design 5). */

/** A cat born in the city is a kitten for its first two game days. */
export const KITTEN_MINUTES = 2 * 1440;

/** Talent levels a cat can reach; first-generation cats have none (design 5.4). */
export const MAX_TALENT = 4;

/** Both parents must have reached this bond level with the player: 信任 (R-31). */
export const BREED_BOND_LEVEL = 2;

/** After a kitten, each parent rests three game days before it can have another (R-31). */
export const BREED_COOLDOWN_MINUTES = 3 * 1440;

/** Neutering a grown cat costs a few coins and needs no building (R-30, requirements D-3). */
export const NEUTER_PRICE = 100;
