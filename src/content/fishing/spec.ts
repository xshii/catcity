/**
 * Fishing minigame specification: every tuning number lives here. Core, the pure
 * minigame and the View read these values; they are game design, not real fish data.
 */
export const FISHING = {
  /** Player aim and cast input ranges (integers). */
  input: { maxDirection: 45, maxDepth: 100, maxPower: 100, maxTicks: 4 },
  /** The View submits one fishing tick per interval while a run is live. */
  ticksPerSecond: 20,
  cast: { staminaCost: 8, precisionPower: { min: 55, max: 80 } },
  /** Power bar and hook cursor sweep 0→100→0 over this many ticks. */
  oscillationTicks: 64,
  waiting: { baseTicks: 24, seedJitterTicks: 16 },
  hook: {
    deadlineTicks: 128,
    zoneCenter: 55,
    motionCenter: 50,
    holdBaseTicks: 6,
    holdTicksPerStar: 2,
  },
  /** Width = base − stars × perStar + (skill − 1) × perSkill (+ precision), capped. */
  greenZone: {
    baseWidth: 58,
    widthPerStar: 8,
    widthPerSkill: 2,
    precisionBonus: 4,
    maxWidth: 64,
    unknownStars: 1,
    fightLow: 30,
    fightSwing: 0.4,
    fightPeriodTicks: 140,
    fightPeriodPerStar: 18,
    seedPhaseTicks: 40,
  },
  fight: {
    startTension: 50,
    reelTension: 3,
    slackTension: 2,
    progressStep: 2,
    progressDecayEveryTicks: 4,
    safeTension: { min: 8, max: 92 },
    lineDamage: 3,
    maxTicks: 420,
  },
  encounter: {
    sideDegrees: 10,
    strongPower: 55,
    moonCarpPower: 70,
    moonCarpChancePercent: 65,
    breedFallback: 'PERCH',
  },
  /** Light bread casts may hook supplies instead of fish. */
  supplies: {
    breadPowerBelow: 35,
    rollSides: 4,
    coins: { min: 25, max: 50 },
    canEnergy: 20,
    trashCoins: 3,
  },
  /** Failed 0–2★ fights may snag trash; cancel, success and loot never do. */
  trash: { maxStars: 2, baseChancePercent: 60, chancePerStarPercent: 15 },
  bag: { capacity: 30 },
  bait: { max: 999, initial: { WORM: 6, SHRIMP: 3 } },
  skill: { baseXp: 10, xpPerStar: 5, xpPerLevel: 40, maxLevel: 10 },
  companion: { catchMood: 3, giftMood: 3, favoriteGiftMood: 8, giftHunger: 10 },
  /**
   * Motion fishing (spec 030): the phone is the rod. Per-star tables are indexed by the
   * fish's stars (0–5); times are ticks at `ticksPerSecond`, positions use a 100×100
   * water plane. The button mode above stays unchanged.
   */
  motion: {
    /** Fake nibbles before the real bite: [min, max] per star. */
    nibbles: [
      [0, 1],
      [1, 1],
      [1, 2],
      [2, 2],
      [2, 3],
      [3, 3],
    ],
    nibbleTicks: 6,
    firstNibble: { baseTicks: 20, jitterTicks: 20 },
    betweenNibbles: { baseTicks: 15, jitterTicks: 15 },
    biteAfterNibbles: { baseTicks: 15, jitterTicks: 20 },
    /** Lifting during a nibble spooks the fish: the bite comes later, the window shrinks. */
    spook: { delayTicks: 20, windowPenaltyTicks: 3 },
    strikeWindowTicks: [18, 16, 14, 12, 10, 9],
    /** A lift within this share of the window is perfect and pre-fills the hold. */
    perfect: { windowPercent: 33, holdBonusPercent: 15 },
    fishSpeed: [12, 16, 20, 26, 32, 40],
    turnTicks: [40, 32, 26, 20, 16, 12],
    burstPercent: [0, 5, 10, 15, 20, 25],
    radius: [
      { start: 22, min: 14 },
      { start: 20, min: 12 },
      { start: 18, min: 11 },
      { start: 16, min: 10 },
      { start: 15, min: 9 },
      { start: 14, min: 8 },
    ],
    /** The ring breathes by ±`amplitude` over `periodTicks` while shrinking overall. */
    breathe: { amplitude: 2, periodTicks: 40 },
    /** The hit test is this much wider than the drawn ring to absorb tilt noise. */
    toleranceUnits: 1,
    precisionRadiusBonus: 1,
    holdTicks: [60, 80, 100, 120, 140, 160],
    /** Inside earns `insideGain`, outside loses `outsideLoss` (half-ticks, so 0.5×). */
    hold: { insideGain: 2, outsideLoss: 1 },
    fightLimitTicks: [400, 440, 480, 520, 560, 600],
  },
} as const;
