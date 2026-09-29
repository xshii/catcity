import { MOTION } from './motion';

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
  /** Mood changes live in `content/mood.ts`. */
  companion: { giftHunger: 10 },
  /** Motion fishing (spec 030), tuned in `motion.ts`; the button mode above is frozen. */
  motion: MOTION,
} as const;
