import type { GameCommand, Position, WorldState } from '../../core';
import { spotAt } from '../../core/city';
import { MAP_VIEW } from './geometry';
import { cityScreen, type CardIntent } from './screen';
import { initialCityView } from './view-state';

export const CAT_DRAG = {
  /** A press held this long on a cat, without becoming a drag, lifts it. */
  holdMs: 350,
} as const;

interface Point {
  x: number;
  y: number;
}

/**
 * One press on the city map (spec 035), in CSS px and milliseconds. `tapped` and `dropped`
 * are what a release asks for; the scene acts on them and the next press starts over.
 */
export type MapGesture =
  | { phase: 'idle' }
  | { phase: 'pressing'; catId: string | null; start: Point; since: number }
  | { phase: 'panning'; start: Point; point: Point }
  | { phase: 'lifted'; catId: string; point: Point; tile: Position | null }
  | { phase: 'tapped'; tile: Position | null }
  | { phase: 'dropped'; catId: string; tile: Position | null };

/** `catId` is the cat under the press; `tile` the tile under the pointer, null off the board. */
export type MapPointerEvent =
  | { type: 'down'; time: number; point: Point; catId: string | null }
  | { type: 'move'; time: number; point: Point; tile: Position | null }
  /** A drawn frame: time passes under a finger that keeps still. */
  | { type: 'frame'; time: number }
  | { type: 'up'; time: number; point: Point; tile: Position | null }
  | { type: 'cancel' };

/**
 * Pure. A press that travels more than `MAP_VIEW.dragPx` before the hold time pans the map;
 * a cat held still for `CAT_DRAG.holdMs` is lifted and then follows the finger, so the map
 * never pans under it; anything released sooner is a tap.
 */
export function reduceMapGesture(
  gesture: MapGesture,
  event: MapPointerEvent,
): MapGesture {
  if (event.type === 'down')
    return {
      phase: 'pressing',
      catId: event.catId,
      start: event.point,
      since: event.time,
    };
  if (event.type === 'cancel') return { phase: 'idle' };
  switch (gesture.phase) {
    case 'idle':
    case 'tapped':
    case 'dropped':
      return event.type === 'up' ? { phase: 'idle' } : gesture;
    case 'pressing': {
      if (event.type === 'up') return { phase: 'tapped', tile: event.tile };
      const point = event.type === 'move' ? event.point : gesture.start;
      if (
        Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) >
        MAP_VIEW.dragPx
      )
        return { phase: 'panning', start: gesture.start, point };
      return gesture.catId !== null &&
        event.time - gesture.since >= CAT_DRAG.holdMs
        ? {
            phase: 'lifted',
            catId: gesture.catId,
            point,
            tile: event.type === 'move' ? event.tile : null,
          }
        : gesture;
    }
    case 'panning':
      if (event.type === 'up') return { phase: 'idle' };
      return event.type === 'move'
        ? { ...gesture, point: event.point }
        : gesture;
    case 'lifted':
      if (event.type === 'up')
        return { phase: 'dropped', catId: gesture.catId, tile: event.tile };
      return event.type === 'move'
        ? { ...gesture, point: event.point, tile: event.tile }
        : gesture;
  }
}

export type CatDrop =
  | {
      kind: 'walk' | 'travel';
      intent: Extract<CardIntent, { kind: 'command' }>;
    }
  | { kind: 'none' };

/**
 * What letting a lifted cat go over `tile` does. Pure, and no rules of its own: it is the
 * button the action card would offer this cat on that tile (walk here) or water (walk to
 * the shore), and nothing when the card has no such button or Core would reject it. Like
 * the card, a walk leaves the cat selected and a trip to the shore its water.
 */
export function catDrop(
  world: WorldState,
  catId: string,
  tile: Position | null,
  blocked: (command: GameCommand) => ErrorCode | null,
): CatDrop {
  if (!tile || !world.cats.some((cat) => cat.id === catId))
    return { kind: 'none' };
  const spotId = spotAt(world.map, tile);
  const button = cityScreen(
    world,
    {
      ...initialCityView(),
      walker: catId,
      selection: spotId
        ? { kind: 'water', spotId, position: tile }
        : { kind: 'tile', position: tile },
    },
    { selectedCat: catId, blocked },
  ).card?.buttons.find(
    ({ id }) => id === (spotId ? 'walk-to-waterway' : 'walk-here'),
  );
  if (!button || button.reason !== null || button.intent.kind !== 'command')
    return { kind: 'none' };
  return spotId
    ? {
        kind: 'travel',
        intent: {
          ...button.intent,
          then: {
            type: 'select',
            selection: { kind: 'water', spotId, position: tile },
          },
        },
      }
    : { kind: 'walk', intent: button.intent };
}
