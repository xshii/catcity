/**
 * The rod's lifting motion in the river scene (spec 033 F6): it snaps up when the hook is
 * set, stays raised and bends with the fish's pull through the fight, lifts once more to
 * land a catch and eases back to rest otherwise. Presentation only: Core never reads it.
 */
export const ROD_MOTION = {
  /** Hook set: ms up to `1 + over`, then ms settling back to the raised pose (1). */
  set: { rise: 180, settle: 160, over: 0.15 },
  /** Landing: ms up to `lift`, then ms back down to rest. */
  land: { rise: 300, lower: 400, lift: 1.5 },
  /** Ms easing back to rest after an escape or an abandoned run. */
  rest: 300,
  /** Canvas px the tip moves per unit of lift. */
  raise: { x: 12, y: -60 },
  /**
   * The bend of a raised rod with no pull (the rest grows with the pull, up to 1), the
   * canvas px a full bend draws the tip toward the float, and where along the rod the
   * curve turns.
   */
  bend: { slack: 0.35, reach: 26, from: 0.6 },
  /** Straight pieces a bent rod is drawn in. */
  pieces: 10,
} as const;
export type RodStance = 'rest' | 'raised' | 'landing';
type RodPose = { lift: number; bend: number };
type Point = { x: number; y: number };

const M = ROD_MOTION;
/** Share (0–1) of a move `ms` in, of `duration` ms. */
const share = (ms: number, duration: number) =>
  Math.min(1, Math.max(0, ms / duration));
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeInOut = (t: number) => t * t * (3 - 2 * t);

/**
 * What the rod is doing, from the run and the last result. `watched` is the id of the run
 * this view last saw active: only its catch is landed, not a save's earlier result.
 */
export function rodStance(
  fishing: {
    active: { id: string; phase: string } | null;
    lastResult: { runId: string; caught: boolean } | null;
  },
  watched: string | null,
): RodStance {
  if (fishing.active)
    return fishing.active.phase === 'fight' ? 'raised' : 'rest';
  const result = fishing.lastResult;
  return result?.caught && result.runId === watched ? 'landing' : 'rest';
}

/**
 * The rod's pose `ms` after it took its `stance`, having been at the lift `from` then:
 * `lift` is 0 at rest and 1 raised, `bend` (0–1) follows the lift and the fish's `pull`
 * (0–1). `still` (reduced motion) gives the pose the move ends in.
 */
export function rodPose(
  rod: { stance: RodStance; ms: number; from: number; pull: number },
  still = false,
): RodPose {
  const ms = still ? Infinity : rod.ms;
  let lift: number;
  if (rod.stance === 'raised') {
    const peak = 1 + M.set.over;
    lift =
      ms < M.set.rise
        ? rod.from + (peak - rod.from) * easeOut(share(ms, M.set.rise))
        : 1 +
          M.set.over * (1 - easeInOut(share(ms - M.set.rise, M.set.settle)));
  } else if (rod.stance === 'landing')
    lift =
      ms < M.land.rise
        ? rod.from + (M.land.lift - rod.from) * easeOut(share(ms, M.land.rise))
        : M.land.lift * (1 - easeInOut(share(ms - M.land.rise, M.land.lower)));
  else lift = rod.from * (1 - easeOut(share(ms, M.rest)));
  const pull = Math.min(1, Math.max(0, rod.pull));
  return {
    lift,
    bend: Math.min(1, lift) * (M.bend.slack + (1 - M.bend.slack) * pull),
  };
}

/**
 * The rod as points from its grip `base`: straight to the resting `tip` at rest; raised
 * by the lift, and curved by the bend so that the tip leans toward the `float`.
 */
export function rodShape(
  pose: RodPose,
  base: Point,
  tip: Point,
  float: Point,
): Point[] {
  const raised = {
    x: tip.x + M.raise.x * pose.lift,
    y: tip.y + M.raise.y * pose.lift,
  };
  const away = Math.hypot(float.x - raised.x, float.y - raised.y);
  if (pose.bend === 0 || away === 0) return [base, raised];
  const lean = (M.bend.reach * pose.bend) / away;
  const end = {
    x: raised.x + (float.x - raised.x) * lean,
    y: raised.y + (float.y - raised.y) * lean,
  };
  const turn = {
    x: base.x + (raised.x - base.x) * M.bend.from,
    y: base.y + (raised.y - base.y) * M.bend.from,
  };
  return Array.from({ length: M.pieces + 1 }, (_, i) => {
    const t = i / M.pieces;
    const [a, b, c] = [(1 - t) ** 2, 2 * t * (1 - t), t * t];
    return {
      x: a * base.x + b * turn.x + c * end.x,
      y: a * base.y + b * turn.y + c * end.y,
    };
  });
}
