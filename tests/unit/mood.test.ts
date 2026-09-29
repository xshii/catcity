import { describe, expect, it } from 'vitest';
import { advance, interact } from '../helpers/world';
import { fishingFixture, finishFishing } from './fishing-fixture';
import { createWorld, loadWorld, World } from '../../src/core/world';
import { MOOD, moodBand } from '../../src/content/mood';
import { FISH_IDS, fishById } from '../../src/content/fishing';
import {
  castAngling,
  greenZone,
  initialAngling,
  type AnglingRun,
} from '../../src/minigames/angling';
import {
  motionBounds,
  motionSchedule,
  ringRadius,
  stepMotionRun,
} from '../../src/minigames/angling-motion';
import type { CatEntity } from '../../src/core/schema';

/** A world whose cats were changed as a save could hold them. */
function edited(world: World, change: (cats: CatEntity[]) => void): World {
  const state = world.getSnapshot();
  change(state.cats);
  return new World(state);
}
const withMood = (mood: number, world = createWorld(42)) =>
  edited(world, (cats) => (cats[0]!.mood = mood));
const moodOf = (world: World, index = 0) =>
  world.getSnapshot().cats[index]!.mood;

/** Mochi on the central road beside its own apartment at (4,4). */
function atHome(mood: number): World {
  const world = createWorld(42);
  world.dispatch({
    type: 'BUILD_BUILDING',
    buildingType: 'CAT_APARTMENT',
    position: { x: 4, y: 4 },
  });
  const home = world.getSnapshot().buildings[0]!.id;
  const state = world.getSnapshot();
  Object.assign(state.cats[0]!, {
    position: { x: 4, y: 5 },
    fishingSpotId: null,
    home,
    mood,
  });
  return new World(state);
}

describe('mood bands', () => {
  it('splits at 80, 50 and 30', () => {
    expect([100, 80, 79, 50, 49, 30, 29, 0].map(moodBand)).toEqual([
      'happy',
      'happy',
      'calm',
      'calm',
      'glum',
      'glum',
      'low',
      'low',
    ]);
  });
});

describe('hourly drift', () => {
  it('moves toward the resting mood only on each full game hour', () => {
    const world = withMood(70);
    advance(world, 59);
    expect(moodOf(world)).toBe(70);
    advance(world, 1);
    expect(moodOf(world)).toBe(70 - MOOD.drift);
    const low = withMood(0);
    advance(low, 60);
    expect(moodOf(low)).toBe(MOOD.drift);
  });

  it('never drifts past the resting mood', () => {
    for (const start of [61, 59, 60]) {
      const world = withMood(start);
      advance(world, 60 * 3);
      expect(moodOf(world)).toBe(MOOD.rest);
    }
  });

  it('adds a little beside the home apartment, within 0–100', () => {
    const world = atHome(MOOD.rest);
    advance(world, 60);
    expect(moodOf(world)).toBe(MOOD.rest + MOOD.home);
    advance(world, 60 * 5);
    expect(moodOf(world)).toBe(MOOD.rest + MOOD.home);
    const full = atHome(100);
    advance(full, 60);
    expect(moodOf(full)).toBe(100 - MOOD.drift + MOOD.home);
    const glum = atHome(40);
    advance(glum, 60);
    expect(moodOf(glum)).toBe(40 + MOOD.drift + MOOD.home);
  });

  it('gives the same result in one advance as in minute steps', () => {
    const world = atHome(95);
    world.dispatch({ type: 'DEBUG_SPAWN_CAT', position: { x: 6, y: 6 } });
    expect(
      world.dispatch({
        type: 'WALK_CAT',
        catId: 'mochi',
        destination: { x: 3, y: 3 },
      }).ok,
    ).toBe(true);
    const stepwise = loadWorld(world.save());
    advance(world, 600);
    for (let minute = 0; minute < 600; minute++) advance(stepwise, 1);
    expect(stepwise.getSnapshot()).toEqual(world.getSnapshot());
  });
});

describe('chat', () => {
  it('lifts mood only when the hourly bond reward is granted', () => {
    const world = withMood(70);
    expect(interact(world, 'mochi', '你好', '喵').ok).toBe(true);
    expect(moodOf(world)).toBe(70 + MOOD.chat);
    interact(world, 'mochi', '还在吗', '喵');
    expect(moodOf(world)).toBe(70 + MOOD.chat);
    advance(world, 60);
    const drifted = moodOf(world);
    interact(world, 'mochi', '又见面了', '喵');
    expect(moodOf(world)).toBe(drifted + MOOD.chat);
    const full = withMood(99);
    interact(full, 'mochi', '你好', '喵');
    expect(moodOf(full)).toBe(100);
  });

  it('leaves mood alone when the command is rejected', () => {
    const world = withMood(70);
    const before = world.save();
    expect(interact(world, 'ghost', '你好', '喵').ok).toBe(false);
    expect(world.save()).toBe(before);
  });
});

describe('fishing', () => {
  const begin = (world: World, mode: 'buttons' | 'motion' = 'motion') =>
    world.dispatch({
      type: 'FISH_BEGIN',
      catId: 'mochi',
      spotId: 'POND',
      baitId: 'BREAD',
      direction: -30,
      aimDepth: 50,
      mode,
    });
  /** Cast a motion run and never lift: the bite window closes. */
  const missBite = (world: World) => {
    const runId = world.getSnapshot().fishing.active!.id;
    world.dispatch({ type: 'FISH_CAST', runId, power: 60 });
    for (let n = 0; n < 200 && world.getSnapshot().fishing.active; n++)
      world.dispatch({
        type: 'FISH_MOTION_CONTROL',
        runId,
        x: 50,
        y: 50,
        ticks: 4,
      });
  };

  it('keeps the catch and gift rewards', () => {
    const world = withMood(50, fishingFixture(42));
    begin(world, 'buttons');
    finishFishing(world);
    expect(moodOf(world)).toBe(50 + MOOD.catch);
    const fish = world.getSnapshot().fishing.inventory[0]!;
    // Silver is Mochi's favourite.
    world.dispatch({ type: 'GIFT_FISH', fishId: fish.id, catId: 'mochi' });
    expect(moodOf(world)).toBe(50 + MOOD.catch + MOOD.favoriteGift);
  });

  it('costs the run cat a little when the fish gets away, not on a cancel', () => {
    const world = withMood(50, fishingFixture(42));
    begin(world);
    missBite(world);
    expect(world.getSnapshot().fishing.lastResult).toMatchObject({
      caught: false,
      reason: 'missed-hook',
    });
    expect(moodOf(world)).toBe(50 - MOOD.escape);
    const runId = (begin(world), world.getSnapshot().fishing.active!.id);
    world.dispatch({ type: 'FISH_CANCEL', runId });
    expect(moodOf(world)).toBe(50 - MOOD.escape);
    const low = withMood(1, fishingFixture(42));
    begin(low);
    missBite(low);
    expect(moodOf(low)).toBe(0);
  });

  it('records a happy run from the mood at the start of the run', () => {
    const happy = withMood(MOOD.happy, fishingFixture(42));
    begin(happy);
    expect(happy.getSnapshot().fishing.active!.happy).toBe(true);
    expect(loadWorld(happy.save()).save()).toBe(happy.save());
    const calm = withMood(MOOD.happy - 1, fishingFixture(42));
    begin(calm);
    expect(calm.getSnapshot().fishing.active!.happy).toBe(false);
    // A chat afterwards lifts the mood but not the run already under way.
    interact(calm, 'mochi', '你好', '喵');
    expect(moodOf(calm)).toBeGreaterThanOrEqual(MOOD.happy);
    expect(calm.getSnapshot().fishing.active!.happy).toBe(false);
  });

  it('leaves mood and the run untouched when a begin is rejected', () => {
    const world = withMood(90, fishingFixture(42));
    const before = world.save();
    expect(
      world.dispatch({
        type: 'FISH_BEGIN',
        catId: 'mochi',
        spotId: 'MOON',
        baitId: 'BREAD',
        direction: 0,
        aimDepth: 50,
      }).ok,
    ).toBe(false);
    expect(world.save()).toBe(before);
  });
});

describe('walking', () => {
  it('costs mood once when a walking cat runs out of energy', () => {
    const state = createWorld(42).getSnapshot();
    Object.assign(state.cats[0]!, {
      position: { x: 5, y: 5 },
      fishingSpotId: null,
      needs: { hunger: 30, energy: 1 },
      mood: 70,
    });
    const world = new World(state);
    world.dispatch({
      type: 'WALK_CAT',
      catId: 'mochi',
      destination: { x: 6, y: 6 },
    });
    advance(world, 5);
    expect(world.getSnapshot().cats[0]!.needs.energy).toBe(0);
    expect(moodOf(world)).toBe(70 - MOOD.exhausted);
    advance(world, 4);
    expect(moodOf(world)).toBe(70 - MOOD.exhausted);
    const flat = new World({
      ...state,
      cats: [{ ...state.cats[0]!, mood: 2 }],
    });
    flat.dispatch({
      type: 'WALK_CAT',
      catId: 'mochi',
      destination: { x: 6, y: 6 },
    });
    advance(flat, 5);
    expect(moodOf(flat)).toBe(0);
  });
});

describe('happy run bonuses', () => {
  function run(
    happy: boolean,
    mode: 'buttons' | 'motion',
    direction = 30,
  ): AnglingRun {
    return castAngling(
      initialAngling({
        id: 'angling-1',
        catId: 'mochi',
        seed: 7,
        baitId: 'WORM',
        direction,
        aimDepth: 50,
        skillLevel: 1,
        spotId: 'POND',
        catBreed: 'RAGDOLL',
        mode,
        happy,
      }),
      40,
    );
  }
  const width = (zone: { low: number; high: number }) => zone.high - zone.low;

  it('widens the button green zone', () => {
    for (const phase of ['hook', 'fight'] as const) {
      const plain = { ...run(false, 'buttons'), phase };
      const happy = { ...plain, happy: true };
      expect(width(greenZone(happy))).toBe(
        width(greenZone(plain)) + MOOD.bonus.greenZone,
      );
    }
  });

  it('grows the motion ring at every stage of the fight', () => {
    const fight = { ...run(false, 'motion'), phase: 'fight' as const };
    for (const star of [0, 5]) {
      const speciesId = FISH_IDS.find((id) => fishById(id).stars === star)!;
      for (const [phaseTick, hold] of [
        [0, 0],
        [17, 20],
        [60, 200],
      ] as const) {
        const plain = { ...fight, speciesId, phaseTick, hold };
        expect(ringRadius({ ...plain, happy: true })).toBe(
          ringRadius(plain) + MOOD.bonus.ringRadius,
        );
      }
    }
  });

  it('keeps the strike window open a little longer', () => {
    const plain = run(false, 'motion');
    const happy = run(true, 'motion');
    expect(motionBounds(happy).strikeWindow).toBe(
      motionBounds(plain).strikeWindow + MOOD.bonus.strikeWindowTicks,
    );
    const hookAt = (start: AnglingRun) => {
      let next = start;
      for (let n = 0; n < motionSchedule(start).bite; n++)
        next = stepMotionRun(next, null, 1);
      return next;
    };
    const late = motionBounds(plain).strikeWindow;
    const wait = (start: AnglingRun) => {
      let next = hookAt(start);
      for (let n = 0; n < late; n++) next = stepMotionRun(next, null, 1);
      return next.phase;
    };
    expect(wait(plain)).toBe('escaped');
    expect(wait(happy)).toBe('hook');
  });
});
