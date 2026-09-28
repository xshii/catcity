/** Cat care tuning shared by recovery, walking energy and relationship rules. */
export const CARE = {
  /** An idle cat (not fishing, not stepping) recovers each tick; faster beside its home. */
  recovery: { tickMinutes: 10, idle: 5, home: 10 },
  walkEnergyPerTile: 1,
  /** Bond grows at most once per game hour across chat and gifts. */
  bondCooldownMinutes: 60,
  /** Recent chat kept per cat; shared-activity facts are stored separately. */
  memoryLimit: 50,
} as const;
