import { describe, expect, it } from 'vitest';
import { CITY_TIME, WALK_MINUTES } from '../../src/content/city';
import { walkingMinutes } from '../../src/core/city/path';
import { createWorld, World } from '../../src/core/world';
import { advance } from '../helpers/world';
import {
  catchUp,
  leadMinutes,
  walkGlide,
  walkerAt,
} from '../../src/view/city/walk-glide';

const from = { x: 2, y: 3 };
const east = { x: 3, y: 3 };
const step = (spentMinutes: number, speed = 1, stepMinutes = 6) =>
  walkGlide({ from, to: east, stepMinutes, spentMinutes, speed });

describe('one step of a walk', () => {
  it('glides from the tile the cat leaves to the tile it enters for the whole step', () => {
    expect(step(0)).toEqual({ x: 2, y: 3, msLeft: 6000 });
    expect(step(3)).toEqual({ x: 2.5, y: 3, msLeft: 3000 });
    expect(step(6)).toEqual({ x: 3, y: 3, msLeft: 0 });
    expect(
      walkGlide({
        from,
        to: { x: 2, y: 2 },
        stepMinutes: 2,
        spentMinutes: 0.5,
        speed: 1,
      }),
    ).toEqual({ x: 2, y: 2.75, msLeft: 1500 });
  });

  it('takes the content minutes in real seconds at 1×, and a quarter of them at 4×', () => {
    const seconds = (speed: number) =>
      Object.values(WALK_MINUTES).map(
        (minutes) => step(0, speed, minutes).msLeft / 1000,
      );
    expect(seconds(1)).toEqual([6, 3, 2]);
    expect(seconds(2)).toEqual([3, 1.5, 1]);
    expect(seconds(4)).toEqual([1.5, 0.75, 0.5]);
  });

  it('keeps the place and only changes the time left when the speed changes', () => {
    for (const speed of CITY_TIME.speeds)
      expect(step(2, speed)).toMatchObject({ x: 2 + 2 / 6, y: 3 });
    expect(step(2, 1).msLeft).toBe(4000);
    expect(step(2, 4).msLeft).toBe(1000);
  });

  it('never leaves the two tiles, whatever minutes it is given', () => {
    expect(step(-4)).toEqual({ x: 2, y: 3, msLeft: 6000 });
    expect(step(9)).toEqual({ x: 3, y: 3, msLeft: 0 });
  });
});

/** Mochi on the crossroads, sent along the dirt road and onto grass. */
function walker(destination = { x: 6, y: 6 }) {
  const state = createWorld(42).getSnapshot();
  state.cats[0]!.position = { x: 5, y: 5 };
  state.cats[0]!.fishingSpotId = null;
  const world = new World(state);
  expect(
    world.dispatch({ type: 'WALK_CAT', catId: 'mochi', destination }).ok,
  ).toBe(true);
  return world;
}
const at = (world: World, lead = 0, speed = 1) => {
  const snapshot = world.getSnapshot();
  return walkerAt(
    snapshot.cats[0]!,
    snapshot.minute + lead,
    (position) => walkingMinutes(snapshot, position),
    speed,
  );
};

describe('a walking cat between two clock ticks', () => {
  it('stands on its tile when it has no walk', () => {
    const cat = createWorld(42).getSnapshot().cats[0]!;
    expect(walkerAt(cat, 500, () => 6, 1)).toEqual({
      ...cat.position,
      msLeft: 0,
    });
  });

  it('is on the tile Core says at every minute Core completes a step', () => {
    const world = walker();
    const [road, grass] = world.getSnapshot().cats[0]!.walk!.route;
    expect(at(world)).toEqual({ x: 5, y: 5, msLeft: 3000 });
    advance(world, WALK_MINUTES.DIRT);
    expect(world.getSnapshot().cats[0]!.position).toEqual(road);
    expect(at(world)).toEqual({ ...road!, msLeft: 6000 });
    advance(world, WALK_MINUTES.GRASS);
    expect(world.getSnapshot().cats[0]!.position).toEqual(grass);
    expect(at(world)).toEqual({ ...grass!, msLeft: 0 });
  });

  it('follows the route past the next tile, so a tick of several tiles shows each of them', () => {
    const world = walker();
    const [road, grass] = world.getSnapshot().cats[0]!.walk!.route;
    const ahead = at(world, WALK_MINUTES.DIRT + 3, 4);
    expect(ahead.x).toBeCloseTo((road!.x + grass!.x) / 2);
    expect(ahead.y).toBeCloseTo((road!.y + grass!.y) / 2);
    expect(ahead.msLeft).toBe(750);
    // The same place whether the clock ticked in between or not.
    advance(world, WALK_MINUTES.DIRT);
    expect(at(world, 3, 4)).toEqual(ahead);
    // It waits on the last tile for Core to finish the walk.
    expect(at(walker(), 60)).toEqual({ ...grass!, msLeft: 0 });
  });

  it('stands still on its tile while exhaustion pauses the walk', () => {
    const save = JSON.parse(walker().save());
    save.world.cats[0].needs.energy = 1;
    const world = new World(save.world);
    advance(world, WALK_MINUTES.DIRT);
    const tired = world.getSnapshot().cats[0]!;
    expect(tired.walk!.nextStepMinute).toBeNull();
    expect(at(world, 0.5)).toEqual({ ...tired.position, msLeft: 0 });
  });

  it('does not walk ahead further than the energy Core will let it', () => {
    const save = JSON.parse(walker().save());
    save.world.cats[0].needs.energy = 1;
    const world = new World(save.world);
    const [road] = world.getSnapshot().cats[0]!.walk!.route;
    expect(at(world, WALK_MINUTES.DIRT + 2)).toEqual({ ...road!, msLeft: 0 });
  });

  it('is on a tile, not between two, once a walk is blocked or replanned', () => {
    const world = walker({ x: 4, y: 4 });
    advance(world, 1);
    const before = at(world, 0.5);
    expect(Number.isInteger(before.x) && Number.isInteger(before.y)).toBe(
      false,
    );
    world.dispatch({
      type: 'BUILD_BUILDING',
      buildingType: 'CAT_CAFE',
      position: { x: 4, y: 4 },
    });
    const cat = world.getSnapshot().cats[0]!;
    expect(cat.walk).toBeNull();
    expect(at(world, 0.5)).toEqual({ ...cat.position, msLeft: 0 });
  });
});

describe('the minutes the sprite runs ahead of the last tick', () => {
  it('grow with real time at the chosen speed and stop at one tick', () => {
    expect(leadMinutes(0, 500, 1)).toBe(0.5);
    expect(leadMinutes(0.5, 250, 4)).toBe(1.5);
    expect(leadMinutes(0.9, 500, 1)).toBe(1);
    expect(leadMinutes(3.9, 500, 4)).toBe(4);
  });

  it('carry on from where they are when the speed changes', () => {
    const slow = leadMinutes(0, 400, 1);
    expect(leadMinutes(slow, 100, 4)).toBeCloseTo(0.8);
    // Back at 1× the cat does not step back: it waits for the clock.
    expect(leadMinutes(2.5, 100, 1)).toBe(2.5);
  });
});

describe('catching up with Core', () => {
  const target = { x: 300, y: 100 };
  it('follows a walking cat exactly', () => {
    // The fastest walk: a stone road tile (52 px) in half a second.
    expect(catchUp({ x: 298, y: 100 }, target, 16, 52)).toEqual(target);
  });

  it('glides to a far place within about a second instead of jumping', () => {
    let point = { x: 0, y: 100 };
    const first = catchUp(point, target, 16, 52);
    expect(first.x).toBeGreaterThan(0);
    expect(first.x).toBeLessThan(40);
    expect(first.y).toBe(100);
    let ms = 0;
    while (point.x !== target.x && ms < 5000) {
      point = catchUp(point, target, 16, 52);
      ms += 16;
    }
    expect(point).toEqual(target);
    expect(ms).toBeLessThan(1200);
  });
});
