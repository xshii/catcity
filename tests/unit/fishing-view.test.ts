import { describe, expect, it } from 'vitest';
import { RandomService } from '../../src/core/random';
import { replay } from '../helpers/fishing-view';
import {
  canPlay,
  createFishingView,
  initialFishingView,
  motionActive,
  reduceFishingView,
  type FishingView,
  type FishingViewEvent,
} from '../../src/view/fishing/view-state';

const phone = { needsPermission: true, coarsePointer: true };
const start = () => initialFishingView({ preference: 'motion', ...phone });
const atRiver = (state = start()) =>
  replay(state, { type: 'place', place: 'river' });

describe('fishing view state', () => {
  it('starts paused in the city with nothing held or calibrating', () => {
    expect(start()).toMatchObject({
      place: 'city',
      paused: true,
      pressed: false,
      toolsOpen: false,
      pageHidden: false,
      runId: null,
      motion: {
        preference: 'motion',
        capability: 'unknown',
        calibrating: false,
      },
    });
    expect(canPlay(start())).toBe(false);
    expect(canPlay(atRiver())).toBe(true);
  });

  it('holds a button run only where play is possible, and holding resumes it', () => {
    const river = replay(atRiver(), { type: 'run', runId: 'a' });
    const held = replay(river, {
      type: 'hold',
      pressed: true,
      buttonRun: true,
    });
    expect(held).toMatchObject({ pressed: true, paused: false });
    expect(
      replay(held, { type: 'hold', pressed: false, buttonRun: true }),
    ).toMatchObject({
      pressed: false,
      paused: false,
    });
    // Not for a motion run, not with tools open, not in the city.
    expect(
      replay(river, { type: 'hold', pressed: true, buttonRun: false }).pressed,
    ).toBe(false);
    expect(
      replay(
        river,
        { type: 'tools', open: true },
        { type: 'hold', pressed: true, buttonRun: true },
      ).pressed,
    ).toBe(false);
    expect(
      replay(start(), { type: 'hold', pressed: true, buttonRun: true }).pressed,
    ).toBe(false);
  });

  it('pauses, releases and stops calibrating whenever play stops or a new run starts', () => {
    const playing = replay(
      atRiver(),
      { type: 'capability', capability: 'ready' },
      { type: 'calibrating', on: true },
      { type: 'run', runId: 'a' },
    );
    expect(playing.motion.calibrating).toBe(false);
    const live = replay(
      playing,
      { type: 'resume' },
      { type: 'hold', pressed: true, buttonRun: true },
    );
    for (const stop of [
      { type: 'place', place: 'city' },
      { type: 'tools', open: true },
      { type: 'page', hidden: true },
      { type: 'run', runId: 'b' },
      { type: 'pause' },
    ] as FishingViewEvent[])
      expect(replay(live, stop)).toMatchObject({
        paused: true,
        pressed: false,
      });
    // The same run id again changes nothing.
    expect(replay(live, { type: 'run', runId: 'a' })).toEqual(live);
  });

  it('resumes only where play is possible and toggles pause', () => {
    const river = replay(atRiver(), { type: 'run', runId: 'a' });
    expect(replay(river, { type: 'resume' }).paused).toBe(false);
    expect(
      replay(river, { type: 'tools', open: true }, { type: 'resume' }).paused,
    ).toBe(true);
    expect(replay(river, { type: 'toggle-pause' }).paused).toBe(false);
    expect(
      replay(river, { type: 'toggle-pause' }, { type: 'toggle-pause' }).paused,
    ).toBe(true);
  });

  it('keeps a ready sensor ready and lets a refusal be retried', () => {
    const ready = replay(start(), { type: 'capability', capability: 'ready' });
    expect(motionActive(ready)).toBe(true);
    expect(replay(ready, { type: 'grant' }).motion.capability).toBe('ready');
    const denied = replay(start(), {
      type: 'capability',
      capability: 'denied',
    });
    expect(replay(denied, { type: 'grant' }).motion.capability).toBe('unknown');
    const buttons = replay(ready, {
      type: 'preference',
      preference: 'buttons',
    });
    expect(motionActive(buttons)).toBe(false);
  });

  it('calibrates only while motion is active and playable', () => {
    expect(
      replay(atRiver(), { type: 'calibrating', on: true }).motion.calibrating,
    ).toBe(false);
    const ready = replay(atRiver(), {
      type: 'capability',
      capability: 'ready',
    });
    const calibrating = replay(ready, { type: 'calibrating', on: true });
    expect(calibrating.motion.calibrating).toBe(true);
    expect(
      replay(calibrating, { type: 'preference', preference: 'buttons' }).motion
        .calibrating,
    ).toBe(false);
  });

  it('keeps its invariants under any sequence of events', () => {
    const rng = new RandomService(7);
    const pick = <T>(items: readonly T[]) => items[rng.nextInt(items.length)]!;
    const events = (): FishingViewEvent =>
      pick<FishingViewEvent>([
        { type: 'place', place: pick(['city', 'river'] as const) },
        { type: 'tools', open: pick([true, false]) },
        { type: 'page', hidden: pick([true, false]) },
        { type: 'run', runId: pick([null, 'a', 'b']) },
        {
          type: 'hold',
          pressed: pick([true, false]),
          buttonRun: pick([true, false]),
        },
        { type: 'pause' },
        { type: 'resume' },
        { type: 'toggle-pause' },
        {
          type: 'preference',
          preference: pick(['motion', 'buttons'] as const),
        },
        {
          type: 'capability',
          capability: pick([
            'unknown',
            'ready',
            'denied',
            'unsupported',
          ] as const),
        },
        { type: 'grant' },
        { type: 'calibrating', on: pick([true, false]) },
        { type: 'notice', text: pick([null, 'x']) },
      ]);
    let state = start();
    for (let i = 0; i < 20_000; i++) {
      state = reduceFishingView(state, events());
      if (!canPlay(state)) {
        expect(state.paused).toBe(true);
        expect(state.pressed).toBe(false);
      }
      if (state.pressed) expect(state.paused).toBe(false);
      if (state.motion.calibrating) {
        expect(canPlay(state)).toBe(true);
        expect(motionActive(state)).toBe(true);
        expect(state.runId).toBeNull();
      }
    }
  });

  it('notifies subscribers once per change and not for no-ops', () => {
    const view = createFishingView(start());
    const seen: FishingView[] = [];
    view.subscribe((state) => seen.push(state));
    view.dispatch({ type: 'place', place: 'river' });
    view.dispatch({ type: 'place', place: 'river' });
    expect(seen).toHaveLength(1);
    expect(view.get().place).toBe('river');
  });
});
