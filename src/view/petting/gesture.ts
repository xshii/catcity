import type { PetSpot } from '../../content/petting';

/** A finger must travel this far over the cat before its drag counts as another stroke. */
export const STROKE_TRAVEL_PX = 40;

export interface Point {
  x: number;
  y: number;
}
/** A finger on the cat: where its latest stroke landed. Null while nothing is down. */
export type StrokeGesture = Point | null;

/**
 * Turns a touch into strokes (spec 039): a press on a spot is one stroke, and so is
 * every further stretch of a drag that ends on a spot. Where the finger is, not how
 * hard or how long it presses; Core's pace rule judges strokes that come too fast.
 */
export function reduceStroke(
  gesture: StrokeGesture,
  event:
    | { type: 'down' | 'move'; point: Point; spot: PetSpot | null }
    | { type: 'up' },
): { gesture: StrokeGesture; stroke: PetSpot | null } {
  if (event.type === 'up') return { gesture: null, stroke: null };
  if (event.type === 'down')
    return { gesture: event.point, stroke: event.spot };
  if (!gesture) return { gesture, stroke: null };
  const travelled = Math.hypot(
    event.point.x - gesture.x,
    event.point.y - gesture.y,
  );
  return event.spot && travelled >= STROKE_TRAVEL_PX
    ? { gesture: event.point, stroke: event.spot }
    : { gesture, stroke: null };
}
