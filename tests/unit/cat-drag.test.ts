import { describe, expect, it } from 'vitest';
import type { GameCommand, Position } from '../../src/core';
import { spotAt } from '../../src/core/city';
import { createWorld, type World } from '../../src/core/world';
import {
  CAT_DRAG,
  catDrop,
  reduceMapGesture,
  type MapGesture,
  type MapPointerEvent,
} from '../../src/view/city/cat-drag';
import { MAP_VIEW } from '../../src/view/city/geometry';
import { cityScreen } from '../../src/view/city/screen';
import {
  initialCityView,
  reduceCityView,
} from '../../src/view/city/view-state';
import { ERROR_MESSAGES } from '../../src/view/shell/errors';

const gesture = (...events: MapPointerEvent[]) =>
  events.reduce<MapGesture>(reduceMapGesture, { phase: 'idle' });
const at = { x: 100, y: 200 };
const down = (catId: string | null, time = 0): MapPointerEvent => ({
  type: 'down',
  time,
  point: at,
  catId,
});
const move = (
  time: number,
  dx: number,
  tile: Position | null = null,
): MapPointerEvent => ({
  type: 'move',
  time,
  point: { x: at.x + dx, y: at.y },
  tile,
});
const up = (
  time: number,
  dx = 0,
  tile: Position | null = null,
): MapPointerEvent => ({
  type: 'up',
  time,
  point: { x: at.x + dx, y: at.y },
  tile,
});
const frame = (time: number): MapPointerEvent => ({ type: 'frame', time });

describe('map gesture', () => {
  it('a quick press and release is a tap, on a cat or on the ground', () => {
    expect(gesture(down('mochi'), up(120, 0, { x: 7, y: 3 }))).toEqual({
      phase: 'tapped',
      tile: { x: 7, y: 3 },
    });
    expect(gesture(down(null), frame(200), up(250))).toEqual({
      phase: 'tapped',
      tile: null,
    });
    // A few pixels of finger wobble are still a tap.
    expect(
      gesture(down('mochi'), move(50, MAP_VIEW.dragPx), up(90)).phase,
    ).toBe('tapped');
  });

  it('a press that moves before the hold time pans the map, also from a cat', () => {
    const panning = gesture(down('mochi'), move(100, MAP_VIEW.dragPx + 1));
    expect(panning).toEqual({
      phase: 'panning',
      start: at,
      point: { x: at.x + MAP_VIEW.dragPx + 1, y: at.y },
    });
    // Holding still afterwards never lifts the cat, and the release selects nothing.
    const held = gesture(
      down('mochi'),
      move(100, 30),
      frame(CAT_DRAG.holdMs + 500),
      move(CAT_DRAG.holdMs + 600, 60),
    );
    expect(held).toMatchObject({ phase: 'panning', point: { x: at.x + 60 } });
    expect(reduceMapGesture(held, up(2000, 60))).toEqual({ phase: 'idle' });
  });

  it('holding a cat still for the hold time lifts it', () => {
    expect(gesture(down('mochi'), frame(CAT_DRAG.holdMs - 1)).phase).toBe(
      'pressing',
    );
    expect(gesture(down('mochi', 1000), frame(1000 + CAT_DRAG.holdMs))).toEqual(
      { phase: 'lifted', catId: 'mochi', point: at, tile: null },
    );
    // A small move after the hold time lifts too, under the finger.
    expect(
      gesture(down('mochi'), move(CAT_DRAG.holdMs, 3, { x: 7, y: 3 })),
    ).toEqual({
      phase: 'lifted',
      catId: 'mochi',
      point: { x: at.x + 3, y: at.y },
      tile: { x: 7, y: 3 },
    });
  });

  it('holding the ground never lifts anything: the release is a tap as before', () => {
    const held = gesture(down(null), frame(5000));
    expect(held.phase).toBe('pressing');
    expect(reduceMapGesture(held, up(5100)).phase).toBe('tapped');
  });

  it('a lifted cat follows the finger without panning and drops on the tile under it', () => {
    const lifted = gesture(
      down('mochi'),
      frame(CAT_DRAG.holdMs),
      move(500, 80, { x: 6, y: 3 }),
      frame(600),
      move(700, 160, { x: 5, y: 3 }),
    );
    expect(lifted).toEqual({
      phase: 'lifted',
      catId: 'mochi',
      point: { x: at.x + 160, y: at.y },
      tile: { x: 5, y: 3 },
    });
    expect(reduceMapGesture(lifted, up(800, 170, { x: 4, y: 3 }))).toEqual({
      phase: 'dropped',
      catId: 'mochi',
      tile: { x: 4, y: 3 },
    });
    // Released off the board.
    expect(reduceMapGesture(lifted, up(800, 900, null))).toEqual({
      phase: 'dropped',
      catId: 'mochi',
      tile: null,
    });
  });

  it('a cancelled pointer ends any gesture with nothing to do', () => {
    const cancel: MapPointerEvent = { type: 'cancel' };
    expect(gesture(down('mochi'), cancel)).toEqual({ phase: 'idle' });
    expect(gesture(down('mochi'), frame(CAT_DRAG.holdMs), cancel)).toEqual({
      phase: 'idle',
    });
    expect(gesture(down(null), move(10, 40), cancel)).toEqual({
      phase: 'idle',
    });
  });

  it('a new press starts over from any phase; frames and moves mean nothing when idle', () => {
    expect(gesture(frame(10), move(20, 40), up(30))).toEqual({ phase: 'idle' });
    for (const before of [
      gesture(down('mochi'), up(10)),
      gesture(down('mochi'), frame(CAT_DRAG.holdMs), up(900)),
      gesture(down('mochi'), frame(CAT_DRAG.holdMs)),
      gesture(down(null), move(10, 40)),
    ])
      expect(reduceMapGesture(before, down('pepper', 5000))).toEqual({
        phase: 'pressing',
        catId: 'pepper',
        start: at,
        since: 5000,
      });
  });
});

// The starter map: Mochi stands on the pond shore at (7,3); (4,4) is owned grass; the
// reeds at (0,0) are locked.
describe('cat drop', () => {
  const judge = (world: World) => (command: GameCommand) => {
    const result = world.check(command);
    return result.ok ? null : ERROR_MESSAGES[result.error];
  };
  const drop = (world: World, tile: Position | null, catId = 'mochi') =>
    catDrop(world.getSnapshot(), catId, tile, judge(world));
  const pond = (world: World) =>
    world
      .getSnapshot()
      .map.tiles.find(
        (tile) => spotAt(world.getSnapshot().map, tile.position) === 'POND',
      )!.position;

  it('sends the walk the action card would send', () => {
    const world = createWorld(42);
    const found = drop(world, { x: 4, y: 4 });
    expect(found).toMatchObject({
      kind: 'walk',
      intent: {
        kind: 'command',
        command: {
          type: 'WALK_CAT',
          catId: 'mochi',
          destination: { x: 4, y: 4 },
        },
      },
    });
    const view = [
      { type: 'cat', catId: 'mochi' } as const,
      {
        type: 'select',
        selection: { kind: 'tile', position: { x: 4, y: 4 } },
      } as const,
    ].reduce(reduceCityView, initialCityView());
    const card = cityScreen(world.getSnapshot(), view, {
      selectedCat: 'mochi',
      blocked: judge(world),
    }).card!;
    expect(found).toEqual({
      kind: 'walk',
      intent: card.buttons.find((button) => button.id === 'walk-here')!.intent,
    });
    if (found.kind === 'none') throw new Error('Expected a walk');
    expect(world.dispatch(found.intent.command).ok).toBe(true);
    expect(world.getSnapshot().cats[0]!.walk?.destination).toEqual({
      x: 4,
      y: 4,
    });
  });

  it('does nothing on the own tile, off the board, on a building or for a missing cat', () => {
    const world = createWorld(42);
    expect(drop(world, { x: 7, y: 3 })).toEqual({ kind: 'none' });
    expect(drop(world, null)).toEqual({ kind: 'none' });
    expect(drop(world, { x: 40, y: 4 })).toEqual({ kind: 'none' });
    expect(drop(world, { x: 4, y: 4 }, 'ghost')).toEqual({ kind: 'none' });
    expect(
      world.dispatch({
        type: 'BUILD_BUILDING',
        buildingType: 'CAT_CAFE',
        position: { x: 4, y: 4 },
      }).ok,
    ).toBe(true);
    expect(drop(world, { x: 4, y: 4 })).toEqual({ kind: 'none' });
  });

  it('travels to an open fishing spot from its water, never to a locked one or the one already reached', () => {
    const world = createWorld(42);
    // Mochi already stands on the pond shore.
    expect(drop(world, pond(world))).toEqual({ kind: 'none' });
    expect(drop(world, { x: 0, y: 0 })).toEqual({ kind: 'none' });
    expect(
      world.dispatch({
        type: 'WALK_CAT',
        catId: 'mochi',
        destination: { x: 4, y: 4 },
      }).ok,
    ).toBe(true);
    expect(world.dispatch({ type: 'ADVANCE_TIME', minutes: 120 }).ok).toBe(
      true,
    );
    expect(world.getSnapshot().cats[0]!.position).toEqual({ x: 4, y: 4 });
    expect(drop(world, pond(world))).toMatchObject({
      kind: 'travel',
      intent: {
        kind: 'command',
        command: {
          type: 'TRAVEL_TO_FISHING_SPOT',
          catId: 'mochi',
          spotId: 'POND',
        },
        // As after the card: the water stays selected, to enter the spot on arrival.
        then: {
          type: 'select',
          selection: { kind: 'water', spotId: 'POND', position: pond(world) },
        },
      },
    });
    expect(drop(world, { x: 0, y: 0 })).toEqual({ kind: 'none' });
  });

  it('never changes the world by deciding', () => {
    const world = createWorld(42);
    const before = world.save();
    drop(world, { x: 4, y: 4 });
    drop(world, pond(world));
    drop(world, { x: 0, y: 0 });
    expect(world.save()).toBe(before);
  });
});
