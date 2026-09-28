/** Cat care tuning shared by rest, walking energy and relationship rules. */
export const CARE = {
  rest: { minutes: 60, tickMinutes: 10, recovery: 5, homeRecovery: 10 },
  walkEnergyPerTile: 1,
  /** Bond grows at most once per game hour across chat and gifts. */
  bondCooldownMinutes: 60,
  /** Recent chat kept per cat; shared-activity facts are stored separately. */
  memoryLimit: 50,
} as const;
