import { describe, expect, it } from 'vitest';
import {
  fishingFixture,
  finishFishing,
  holdTicks,
  ticksFor,
} from './fishing-fixture';
import type { GameCommand } from '../../src/core';
import type { World } from '../../src/core/world';
import { greenZone } from '../../src/minigames/angling';
import { motionSchedule } from '../../src/minigames/angling-motion';
import {
  initialFishingView,
  type FishingViewEvent,
} from '../../src/view/fishing/view-state';
import {
  reelLevel,
  soundCues,
  soundLabel,
  soundOn,
  type SoundCue,
} from '../../src/view/fishing/sound-cues';
import { replay } from '../helpers/fishing-view';

/** A world whose every command is followed by the sounds its change calls for. */
function listening(world: World) {
  let previous = world.getSnapshot().fishing;
  const heard: SoundCue[] = [];
  return {
    heard,
    getSnapshot: () => world.getSnapshot(),
    dispatch(command: GameCommand) {
      const result = world.dispatch(command);
      const next = world.getSnapshot().fishing;
      heard.push(...soundCues(previous, next));
      previous = next;
      return result;
    },
  };
}
const begin = (
  game: ReturnType<typeof listening>,
  mode: 'buttons' | 'motion' = 'buttons',
) => {
  expect(
    game.dispatch({
      type: 'FISH_BEGIN',
      catId: 'mochi',
      spotId: 'POND',
      baitId: 'WORM',
      direction: -30,
      aimDepth: 50,
      ...(mode === 'motion' ? { mode } : {}),
    }).ok,
  ).toBe(true);
  return game.getSnapshot().fishing.active!.id;
};
/** Charges, casts on release and strikes inside the green zone, stopping at the fight. */
function toButtonFight(game: ReturnType<typeof listening>, runId: string) {
  for (let tick = 0; tick < 150; tick++) {
    const run = game.getSnapshot().fishing.active!;
    if (run.phase === 'fight') return;
    const zone = greenZone(run);
    game.dispatch({
      type: 'FISH_CONTROL',
      runId,
      pressed:
        run.phase === 'charge'
          ? run.tick < 23
          : run.phase === 'hook' &&
            run.cursor >= zone.low &&
            run.cursor <= zone.high,
      ticks: ticksFor(run, 23),
    });
  }
  throw new Error('No fight reached');
}
/** Casts a motion run, waits through its nibbles for the bite and strikes it. */
function toMotionFight(game: ReturnType<typeof listening>) {
  const runId = begin(game, 'motion');
  game.dispatch({ type: 'FISH_CAST', runId, power: 60 });
  const schedule = motionSchedule(game.getSnapshot().fishing.active!);
  for (let tick = 0; tick < schedule.bite; tick++)
    game.dispatch({
      type: 'FISH_MOTION_CONTROL',
      runId,
      x: 50,
      y: 50,
      ticks: 1,
    });
  game.dispatch({ type: 'FISH_STRIKE', runId });
  expect(game.getSnapshot().fishing.active!.phase).toBe('fight');
  return schedule;
}
const playing = (...events: FishingViewEvent[]) =>
  replay(
    initialFishingView({
      preference: 'buttons',
      needsPermission: false,
      coarsePointer: false,
    }),
    { type: 'place', place: 'river' },
    { type: 'run', runId: 'r' },
    ...events,
  );

describe('fishing sounds', () => {
  it('a caught fish sounds its cast, its bite and the catch, once each', () => {
    const game = listening(fishingFixture(7));
    begin(game);
    expect(game.heard).toEqual([]);
    finishFishing(game);
    expect(game.heard).toEqual(['cast', 'bite', 'catch']);
  });

  it('holding too hard strains the line once, then it snaps', () => {
    const game = listening(fishingFixture(1000039));
    const runId = begin(game);
    toButtonFight(game, runId);
    expect(game.heard).toEqual(['cast', 'bite']);
    holdTicks(game, runId, true, 100);
    expect(game.getSnapshot().fishing.lastResult).toMatchObject({
      caught: false,
      reason: 'line-break',
    });
    expect(game.heard).toEqual(['cast', 'bite', 'strain', 'snap']);
  });

  it('a motion run sounds every fake nibble, then the bite; a strike is silent', () => {
    const game = listening(fishingFixture(42));
    const { nibbles } = toMotionFight(game);
    expect(nibbles.length).toBeGreaterThan(0);
    expect(game.heard).toEqual([
      'cast',
      ...nibbles.map(() => 'nibble' as const),
      'bite',
    ]);
  });

  it('a motion fight strains each time its tug tension climbs past a step', () => {
    const game = listening(fishingFixture(42));
    toMotionFight(game);
    const fishing = game.getSnapshot().fishing;
    const at = (tension: number) => ({
      ...fishing,
      active: { ...fishing.active!, tension },
    });
    expect(soundCues(at(0), at(10))).toEqual([]);
    expect(soundCues(at(20), at(26))).toEqual(['strain']);
    expect(soundCues(at(26), at(34))).toEqual([]);
    expect(soundCues(at(34), at(24))).toEqual([]);
    expect(soundCues(at(24), at(25))).toEqual(['strain']);
    expect(soundCues(at(70), at(82))).toEqual(['strain']);
  });

  it('a missed bite and a rod put away make no ending sound', () => {
    const game = listening(fishingFixture(7));
    const runId = begin(game);
    holdTicks(game, runId, true, 23);
    holdTicks(game, runId, false, 400);
    expect(game.getSnapshot().fishing.lastResult).toMatchObject({
      reason: 'missed-hook',
    });
    const cancelled = begin(game);
    game.dispatch({ type: 'FISH_CANCEL', runId: cancelled });
    expect(game.heard).toEqual(['cast', 'bite']);
  });

  it('a restored run or a loaded result replays nothing', () => {
    const game = listening(fishingFixture(7));
    const empty = game.getSnapshot().fishing;
    begin(game);
    finishFishing(game);
    const ended = game.getSnapshot().fishing;
    const other = listening(fishingFixture(1000039));
    toButtonFight(other, begin(other));
    const fighting = other.getSnapshot().fishing;
    expect(soundCues(empty, ended)).toEqual([]);
    expect(soundCues(empty, fighting)).toEqual([]);
    expect(soundCues(ended, fighting)).toEqual([]);
    expect(soundCues(ended, ended)).toEqual([]);
  });
});

describe('reeling hum', () => {
  const runOf = (changes: object) => {
    const game = listening(fishingFixture(1000039));
    toButtonFight(game, begin(game));
    return { ...game.getSnapshot().fishing.active!, ...changes };
  };

  it('follows the fight while it is played and is silent otherwise', () => {
    const fight = runOf({ progress: 40 });
    expect(reelLevel(playing({ type: 'resume' }), fight)).toBe(0.4);
    expect(
      reelLevel(playing({ type: 'resume' }), { ...fight, progress: 100 }),
    ).toBe(1);
    expect(reelLevel(playing(), fight)).toBeNull();
    expect(
      reelLevel(
        playing({ type: 'resume' }, { type: 'tools', open: true }),
        fight,
      ),
    ).toBeNull();
    expect(
      reelLevel(playing({ type: 'resume' }), { ...fight, phase: 'waiting' }),
    ).toBeNull();
    expect(reelLevel(playing({ type: 'resume' }), null)).toBeNull();
  });

  it('follows the hold of a motion fight', () => {
    const game = listening(fishingFixture(42));
    toMotionFight(game);
    const run = game.getSnapshot().fishing.active!;
    const level = reelLevel(playing({ type: 'resume' }), run)!;
    expect(level).toBeGreaterThan(0);
    expect(level).toBeLessThan(1);
    expect(reelLevel(playing({ type: 'resume' }), { ...run, hold: 0 })).toBe(0);
  });
});

describe('sound setting', () => {
  it('is on unless this device switched it off, and says which', () => {
    expect(soundOn(null)).toBe(true);
    expect(soundOn('on')).toBe(true);
    expect(soundOn('off')).toBe(false);
    expect(soundLabel(true, true)).toBe('音效：开');
    expect(soundLabel(true, false)).toBe('音效：关');
    expect(soundLabel(false, true)).toBe('此浏览器不支持音效');
  });
});
