import { describe, expect, it } from 'vitest';
import { RandomService } from '../../src/core/random';
import { replay } from '../helpers/fishing-view';
import {
  canPlay,
  createFishingView,
  initialFishingView,
  motionActive,
  reduceFishingView,
  GUIDE_STEPS,
  type FishingView,
  type FishingViewEvent,
  type GuideStep,
} from '../../src/view/fishing/view-state';

const phone = { needsPermission: true, coarsePointer: true };
/** A phone that finished the guide and calibrated before, unless told otherwise. */
const start = (
  device: { guide?: GuideStep | null; autoCalibrate?: boolean } = {},
) =>
  initialFishingView({
    preference: 'motion',
    ...phone,
    guide: null,
    autoCalibrate: false,
    ...device,
  });
const atRiver = (state = start()) =>
  replay(state, { type: 'place', place: 'river' });
const ready: FishingViewEvent = { type: 'capability', capability: 'ready' };

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

  it('opens the settings sheet only on the river, where it covers play like the tools', () => {
    const open: FishingViewEvent = { type: 'settings', open: true };
    expect(replay(start(), open).settingsOpen).toBe(false);
    const playing = replay(
      atRiver(),
      { type: 'run', runId: 'a' },
      {
        type: 'resume',
      },
    );
    const sheet = replay(playing, open);
    expect(sheet).toMatchObject({ settingsOpen: true, paused: true });
    expect(canPlay(sheet)).toBe(false);
    // Closing it asks the player to resume, as closing the tools does.
    expect(replay(sheet, { type: 'settings', open: false })).toMatchObject({
      settingsOpen: false,
      paused: true,
    });
    // Leaving the river or opening the tools closes it.
    for (const away of [
      { type: 'place', place: 'city' },
      { type: 'tools', open: true },
    ] as FishingViewEvent[])
      expect(replay(sheet, away).settingsOpen).toBe(false);
    expect(
      replay(atRiver(), { type: 'tools', open: true }, open).settingsOpen,
    ).toBe(false);
  });

  it('starting calibration from the settings sheet closes it and calibrates', () => {
    const sheet = replay(atRiver(), ready, { type: 'settings', open: true });
    expect(sheet.motion.calibrating).toBe(false);
    expect(replay(sheet, { type: 'calibrating', on: true })).toMatchObject({
      settingsOpen: false,
      motion: { calibrating: true },
    });
  });

  it('remembers that sensors were asked for on this page', () => {
    expect(start().motion.asked).toBe(false);
    const asked = replay(start(), { type: 'ask' });
    expect(asked.motion.asked).toBe(true);
    // A refusal, a retry's grant or a reading never makes it ask by itself again.
    for (const later of [
      { type: 'capability', capability: 'denied' },
      { type: 'grant' },
      ready,
    ] as FishingViewEvent[])
      expect(replay(asked, later).motion.asked).toBe(true);
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

  it('teaches the guide in order: a step moves on only on its own move', () => {
    let state = replay(atRiver(start({ guide: 'aim' })), ready);
    for (const [index, step] of GUIDE_STEPS.entries()) {
      // Any other step's move, earlier or later, changes nothing.
      for (const other of GUIDE_STEPS.filter((item) => item !== step))
        expect(replay(state, { type: 'guide', did: other })).toBe(state);
      state = replay(state, { type: 'guide', did: step });
      expect(state.motion.guide).toBe(GUIDE_STEPS[index + 1] ?? null);
    }
    // Once done, it stays done.
    expect(
      replay(state, { type: 'guide', did: 'aim' }).motion.guide,
    ).toBeNull();
  });

  it('ends the guide when skipped, whatever the step', () => {
    for (const step of GUIDE_STEPS) {
      const skipped = replay(
        atRiver(start({ guide: step })),
        ready,
        { type: 'skip-guide' },
        { type: 'guide', did: step },
      );
      expect(skipped.motion.guide).toBeNull();
    }
  });

  it('moves the guide only in motion play, never for the button flow', () => {
    const guided = atRiver(start({ guide: 'aim' }));
    const aim: FishingViewEvent = { type: 'guide', did: 'aim' };
    // Sensors not ready yet, motion turned off, or button mode by choice.
    expect(replay(guided, aim).motion.guide).toBe('aim');
    expect(
      replay(guided, ready, { type: 'preference', preference: 'buttons' }, aim)
        .motion.guide,
    ).toBe('aim');
    expect(
      replay(
        atRiver(
          initialFishingView({
            preference: 'buttons',
            ...phone,
            guide: 'aim',
            autoCalibrate: false,
          }),
        ),
        ready,
        aim,
      ).motion.guide,
    ).toBe('aim');
  });

  it('calibrates by itself once, the first time a never-calibrated device can aim', () => {
    const fresh = atRiver(start({ autoCalibrate: true }));
    // Not before the sensors answer.
    expect(fresh.motion).toMatchObject({
      calibrating: false,
      autoCalibrate: true,
    });
    const started = replay(fresh, ready);
    expect(started.motion).toMatchObject({
      calibrating: true,
      autoCalibrate: false,
    });
    // Finished, or cut short by the tools: aiming again does not start it again.
    for (const end of [
      [{ type: 'calibrating', on: false }],
      [
        { type: 'tools', open: true },
        { type: 'tools', open: false },
      ],
    ] as FishingViewEvent[][])
      expect(replay(started, ...end).motion.calibrating).toBe(false);
    // A run in the way waits: it starts once the run is over.
    const busy = replay(fresh, { type: 'run', runId: 'a' }, ready);
    expect(busy.motion.calibrating).toBe(false);
    expect(replay(busy, { type: 'run', runId: null }).motion.calibrating).toBe(
      true,
    );
    // A device that calibrated before never starts by itself.
    expect(replay(atRiver(), ready).motion.calibrating).toBe(false);
  });

  it('keeps its invariants under any sequence of events', () => {
    const rng = new RandomService(7);
    const pick = <T>(items: readonly T[]) => items[rng.nextInt(items.length)]!;
    const events = (): FishingViewEvent =>
      pick<FishingViewEvent>([
        { type: 'place', place: pick(['city', 'river'] as const) },
        { type: 'tools', open: pick([true, false]) },
        { type: 'settings', open: pick([true, false]) },
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
        { type: 'ask' },
        { type: 'calibrating', on: pick([true, false]) },
        { type: 'notice', text: pick([null, 'x']) },
        { type: 'guide', did: pick(GUIDE_STEPS) },
      ]);
    // Guide progress as a number: done (null) is past the last step.
    const progress = (view: FishingView) =>
      view.motion.guide === null
        ? GUIDE_STEPS.length
        : GUIDE_STEPS.indexOf(view.motion.guide);
    // Episodes from a fresh device, so the guide and auto-calibration keep being tried.
    let state = start();
    let autoStarts = 0;
    let episodes = 0;
    let steps = 0;
    for (let i = 0; i < 20_000; i++) {
      if (i % 500 === 0) {
        state = start({ guide: pick(GUIDE_STEPS), autoCalibrate: true });
        episodes++;
      }
      const event: FishingViewEvent =
        rng.nextInt(200) === 0 ? { type: 'skip-guide' } : events();
      const before = state;
      state = reduceFishingView(state, event);
      // Only the flag starts calibration without being asked, and it is used up.
      if (
        !before.motion.calibrating &&
        state.motion.calibrating &&
        !(event.type === 'calibrating' && event.on)
      ) {
        expect(before.motion.autoCalibrate).toBe(true);
        autoStarts++;
      }
      if (state.motion.autoCalibrate)
        expect(before.motion.autoCalibrate).toBe(true);
      // The guide moves forward only: one step on its move in motion play, or skipped.
      if (event.type === 'skip-guide') expect(state.motion.guide).toBeNull();
      else if (progress(state) !== progress(before)) {
        expect(event).toEqual({ type: 'guide', did: before.motion.guide });
        expect(motionActive(before)).toBe(true);
        expect(progress(state)).toBe(progress(before) + 1);
        steps++;
      }
      if (!canPlay(state)) {
        expect(state.paused).toBe(true);
        expect(state.pressed).toBe(false);
      }
      if (state.settingsOpen) {
        expect(state.place).toBe('river');
        expect(state.toolsOpen).toBe(false);
      }
      if (before.motion.asked) expect(state.motion.asked).toBe(true);
      if (state.pressed) expect(state.paused).toBe(false);
      if (state.motion.calibrating) {
        expect(canPlay(state)).toBe(true);
        expect(motionActive(state)).toBe(true);
        expect(state.runId).toBeNull();
      }
    }
    // Each fresh device calibrated by itself at most once; the guide really moved.
    expect(autoStarts).toBeGreaterThan(0);
    expect(autoStarts).toBeLessThanOrEqual(episodes);
    expect(steps).toBeGreaterThan(0);
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
