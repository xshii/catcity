/**
 * Motion fishing tuning (spec 030): the phone is the rod. Numbers only; the rules live in
 * `minigames/angling-motion.ts`. Per-star tables are indexed by the fish's stars (0–5);
 * times are ticks at `FISHING.ticksPerSecond` (20 per second); positions use the 100×100
 * water plane. `tests/simulation/fight-balance.test.ts` checks the catch rates these give.
 */
export const MOTION = {
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
  /** The fight: keep the rod tip inside the fish ring until the hold fills. */
  fight: {
    /** Settling in: the fish waits, then eases up to speed over `rampTicks`; the hold is frozen. */
    graceTicks: 30,
    rampTicks: 10,
    /** Fight time after settling in, the same for every fish. */
    limitTicks: 300,
    /** Inside time needed to land the fish, per star. */
    holdTicks: [60, 70, 80, 90, 100, 120],
    /** Inside earns `insideGain` per tick, outside loses `outsideLoss`: drifting never pays. */
    hold: { insideGain: 1, outsideLoss: 2 },
    /** The ring shrinks from `start` to `min` as the hold fills and grows back as it drains. */
    radius: [
      { start: 22, min: 15 },
      { start: 20, min: 13 },
      { start: 18, min: 12 },
      { start: 17, min: 11 },
      { start: 16, min: 10 },
      { start: 15, min: 9 },
    ],
    /** The ring breathes by ±`amplitude` over `periodTicks`. */
    breathe: { amplitude: 2, periodTicks: 40 },
    /** The hit test is this much wider than the drawn ring to absorb tilt noise. */
    toleranceUnits: 1,
    precisionRadiusBonus: 1,
  },
  /**
   * The fish's correlated random walk: straight runs, a turn between runs, rests and
   * dashes that are always announced `warnTicks` ahead. It bounces off the water's edge.
   */
  walk: {
    /** Cruise speed, plane units per second. */
    speed: [12, 18, 24, 30, 34, 38],
    /** Straight-run length, [min, max] ticks. */
    runTicks: [
      [30, 50],
      [24, 40],
      [18, 32],
      [14, 26],
      [10, 20],
      [8, 16],
    ],
    /** Turn between runs, [min, max] degrees to either side. */
    turnDeg: [
      [0, 60],
      [20, 90],
      [30, 110],
      [45, 135],
      [55, 150],
      [70, 160],
    ],
    /** Each run's pace varies by up to ± this share of the cruise speed. */
    speedJitterPercent: [10, 15, 20, 25, 30, 35],
    /** Some runs are rests at `speedPercent` of the cruise speed. */
    rest: { percent: [30, 24, 18, 12, 6, 0], speedPercent: 30 },
    dash: {
      perSecondPercent: [0, 5, 8, 12, 15, 20],
      warnTicks: 8,
      ticks: 12,
      speedPercent: 180,
      cooldownTicks: 40,
    },
  },
  /**
   * Swing gestures from the gyroscope rate about `axis` (°/s). Holding the phone upright,
   * tipping the top away (the forward whip) lowers beta, so forward reads negative. One-tap
   * calibration replaces the axis, sign and thresholds with the player's own swing.
   */
  gesture: {
    axis: 'beta',
    pitchSign: -1,
    backswingDegPerSec: 120,
    forwardDegPerSec: 250,
    fullPowerDegPerSec: 900,
    minPower: 20,
    swingWindowMs: 700,
    liftDegPerSec: 300,
    liftCooldownMs: 400,
    /** Tilting ±`tiltRangeDeg` from the calibrated pose spans the water plane. */
    tiltRangeDeg: 30,
    /** Exponential smoothing of the rod tip; 1 means no smoothing. */
    smoothing: 0.3,
    /** Roll that maps to the full ±`input.maxDirection` aim. */
    aimRangeDeg: 30,
    /**
     * One-tap calibration: two swings within `windowMs`. Thresholds are a share of the
     * measured peaks (the whip, or the backswing for the backswing and the lift), clamped.
     */
    calibration: {
      windowMs: 2500,
      minForwardDegPerSec: 150,
      forward: { percent: 50, min: 120, max: 400 },
      backswing: { percent: 50, min: 60, max: 200 },
      fullPower: { percent: 120, min: 300, max: 1500 },
      lift: { percent: 70, min: 120, max: 300 },
    },
  },
} as const;
