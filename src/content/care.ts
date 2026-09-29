/** Cat care tuning shared by recovery, walking energy and relationship rules. */
export const CARE = {
  /** An idle cat (not fishing, not stepping) recovers each tick; faster beside its home. */
  recovery: { tickMinutes: 10, idle: 5, home: 10 },
  walkEnergyPerTile: 1,
  /** Bond grows at most once per game hour across chat, gifts and shared catches. */
  bondCooldownMinutes: 60,
  /** Recent chat kept per cat; shared-activity facts are stored separately. */
  memoryLimit: 50,
} as const;

/** Bond levels (spec 034), lowest first: a cat is at the last one whose `bond` it has reached. */
export const BOND_LEVELS = [
  { name: '初识', bond: 0 },
  { name: '熟悉', bond: 5 },
  { name: '信任', bond: 15 },
  { name: '亲密', bond: 30 },
  { name: '家人', bond: 60 },
] as const;

/** The index into `BOND_LEVELS` that a bond of 0–100 has reached; derived, never saved. */
export function bondLevel(playerBond: number): number {
  return BOND_LEVELS.filter((level) => playerBond >= level.bond).length - 1;
}
