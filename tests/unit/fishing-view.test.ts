import { describe, expect, it } from 'vitest';
import { RandomService } from '../../src/core/random';
import { replay } from '../helpers/fishing-view';
import {
  aimHintShown,
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
/**
 * A phone that finished the guide and calibrated before, and has not seen the aim hint,
 * unless told otherwise.
 */
const start = (
  device: {
    guide?: GuideStep | null;
    autoCalibrate?: boolean;
    aimHintSeen?: boolean;
  } = {},
) =>
  initialFishingView({
    preference: 'motion',
    ...phone,
    guide: null,
    autoCalibrate: false,
    aimHintSeen: false,
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

  it('follows the settings sheet, open on any page, which covers play like the tools', () => {
    const open: FishingViewEvent = { type: 'settings', open: true };
    const close: FishingViewEvent = { type: 'settings', open: false };
    // One gear on every page (2026-09-30): the shell opens and closes the sheet.
    expect(replay(start(), open).settingsOpen).toBe(true);
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
    expect(replay(sheet, close)).toMatchObject({
      settingsOpen: false,
      paused: true,
    });
    // Opened over a panel, it closes back to the panel: play stays covered.
    const both = replay(playing, { type: 'tools', open: true }, open);
    expect(both).toMatchObject({ settingsOpen: true, toolsOpen: true });
    expect(canPlay(replay(both, close))).toBe(false);
  });

  it('calibration starts once the settings sheet has closed, never under it', () => {
    const sheet = replay(atRiver(), ready, { type: 'settings', open: true });
    expect(
      replay(sheet, { type: 'calibrating', on: true }).motion.calibrating,
    ).toBe(false);
    // The sheet's button closes the sheet, then calibrates.
    expect(
      replay(
        sheet,
        { type: 'settings', open: false },
        { type: 'calibrating', on: true },
      ).motion.calibrating,
    ).toBe(true);
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

  it('counts every refusal, so a retry refused again is a change', () => {
    const denied: FishingViewEvent = {
      type: 'capability',
      capability: 'denied',
    };
    expect(start().motion.refusals).toBe(0);
    const once = replay(start(), denied);
    const twice = replay(once, denied);
    expect(once.motion.refusals).toBe(1);
    expect(twice.motion).toMatchObject({ capability: 'denied', refusals: 2 });
    expect(replay(twice, ready).motion.refusals).toBe(2);
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
            aimHintSeen: false,
          }),
        ),
        ready,
        aim,
      ).motion.guide,
    ).toBe('aim');
  });

  it('shows the aim hint once per device, until closed or cast (user, 2026-09-30)', () => {
    const aiming = replay(atRiver(), ready);
    expect(aimHintShown(aiming)).toBe(true);
    const closed = replay(aiming, { type: 'aim-hint-seen' });
    expect(closed.motion.aimHintSeen).toBe(true);
    expect(aimHintShown(closed)).toBe(false);
    // A cast while it shows sees it too; the next aim has none.
    const cast = replay(aiming, { type: 'run', runId: 'a' });
    expect(cast.motion.aimHintSeen).toBe(true);
    expect(aimHintShown(replay(cast, { type: 'run', runId: null }))).toBe(
      false,
    );
    // Mid-guide, re-aiming past the guide's aim steps, it shows too; closed or cast
    // from, the next aim has none.
    const midGuide = replay(atRiver(start({ guide: 'strike' })), ready);
    expect(aimHintShown(midGuide)).toBe(true);
    for (const seen of [
      { type: 'aim-hint-seen' },
      { type: 'run', runId: 'a' },
    ] as const)
      expect(
        aimHintShown(replay(midGuide, seen, { type: 'run', runId: null })),
      ).toBe(false);
    // Not while the guide teaches at the aim, calibration or its notice is up, play is
    // covered or motion is off; a cast then leaves it for later.
    for (const hidden of [
      replay(atRiver(start({ guide: 'aim' })), ready),
      replay(aiming, { type: 'calibrating', on: true }),
      replay(aiming, { type: 'notice', text: '校准完成' }),
      replay(aiming, { type: 'tools', open: true }),
      replay(aiming, { type: 'preference', preference: 'buttons' }),
    ]) {
      expect(aimHintShown(hidden)).toBe(false);
      expect(
        replay(hidden, { type: 'run', runId: 'a' }).motion.aimHintSeen,
      ).toBe(false);
    }
    // The guide done or skipped, the next aim shows it.
    expect(
      aimHintShown(
        replay(atRiver(start({ guide: 'aim' })), ready, { type: 'skip-guide' }),
      ),
    ).toBe(true);
  });

  it('calibrates by itself, the first time a never-calibrated device can aim, until one finishes', () => {
    const fresh = atRiver(start({ autoCalibrate: true }));
    // Not before the sensors answer.
    expect(fresh.motion).toMatchObject({
      calibrating: false,
      autoCalibrate: true,
    });
    const started = replay(fresh, ready);
    expect(started.motion.calibrating).toBe(true);
    // Finished: aiming again does not start it again.
    const finished = replay(started, { type: 'calibrating', on: false });
    expect(finished.motion).toMatchObject({
      calibrating: false,
      autoCalibrate: false,
    });
    expect(
      replay(
        finished,
        { type: 'tools', open: true },
        { type: 'tools', open: false },
      ).motion.calibrating,
    ).toBe(false);
    // Cut short by the settings, the tools or a hidden page: it starts again after.
    for (const [cover, back] of [
      [
        { type: 'settings', open: true },
        { type: 'settings', open: false },
      ],
      [
        { type: 'tools', open: true },
        { type: 'tools', open: false },
      ],
      [
        { type: 'page', hidden: true },
        { type: 'page', hidden: false },
      ],
    ] as FishingViewEvent[][]) {
      const covered = replay(started, cover!);
      expect(covered.motion.calibrating).toBe(false);
      expect(replay(covered, back!).motion.calibrating).toBe(true);
    }
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
    let autoFinished = 0;
    let episodes = 0;
    let steps = 0;
    let hintCasts = 0;
    for (let i = 0; i < 30_000; i++) {
      // After 20 000 events, devices past the guide and calibration, aiming: the aim hint.
      const seasoned = i >= 20_000;
      if (i % 500 === 0) {
        if (seasoned) state = replay(atRiver(), ready);
        else {
          state = start({ guide: pick(GUIDE_STEPS), autoCalibrate: true });
          episodes++;
        }
      }
      const event: FishingViewEvent =
        rng.nextInt(200) === 0
          ? { type: seasoned ? 'aim-hint-seen' : 'skip-guide' }
          : events();
      const before = state;
      state = reduceFishingView(state, event);
      // Only the flag starts calibration without being asked; finishing one uses it up.
      if (
        !before.motion.calibrating &&
        state.motion.calibrating &&
        !(event.type === 'calibrating' && event.on)
      ) {
        expect(before.motion.autoCalibrate).toBe(true);
        autoStarts++;
      }
      if (
        before.motion.calibrating &&
        event.type === 'calibrating' &&
        !event.on
      ) {
        expect(state.motion.autoCalibrate).toBe(false);
        if (before.motion.autoCalibrate) autoFinished++;
      }
      if (before.motion.refusals > state.motion.refusals)
        throw new Error('refusals never go back');
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
      // The sheet is the shell's: the state follows it, whatever else happens.
      if (event.type === 'settings')
        expect(state.settingsOpen).toBe(event.open);
      else expect(state.settingsOpen).toBe(before.settingsOpen);
      if (before.motion.asked) expect(state.motion.asked).toBe(true);
      // The aim hint, once seen, stays seen: closed, or cast from while it showed.
      if (before.motion.aimHintSeen)
        expect(state.motion.aimHintSeen).toBe(true);
      else if (state.motion.aimHintSeen && event.type !== 'aim-hint-seen') {
        expect(event).toMatchObject({ type: 'run', runId: expect.any(String) });
        expect(aimHintShown(before)).toBe(true);
        hintCasts++;
      }
      if (state.pressed) expect(state.paused).toBe(false);
      if (state.motion.calibrating) {
        expect(canPlay(state)).toBe(true);
        expect(motionActive(state)).toBe(true);
        expect(state.runId).toBeNull();
      }
    }
    // Each fresh device finished calibrating by itself at most once, however often it
    // was cut short; the guide really moved.
    expect(autoStarts).toBeGreaterThan(0);
    expect(autoFinished).toBeGreaterThan(0);
    expect(autoFinished).toBeLessThanOrEqual(episodes);
    expect(steps).toBeGreaterThan(0);
    expect(hintCasts).toBeGreaterThan(0);
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
