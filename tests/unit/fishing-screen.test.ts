import { describe, expect, it } from 'vitest';
import { FISHING } from '../../src/content/fishing';
import { fishingScreen, SCREEN_COPY } from '../../src/view/fishing/screen';
import {
  initialFishingView,
  reduceFishingView,
  type Capability,
  type FishingView,
  type FishingViewEvent,
} from '../../src/view/fishing/view-state';
import type { AnglingRun } from '../../src/minigames/angling';

const view = (
  options: { phone?: boolean; preference?: 'motion' | 'buttons' } = {},
  ...events: FishingViewEvent[]
) =>
  events.reduce(
    reduceFishingView,
    initialFishingView({
      preference: options.preference ?? 'motion',
      needsPermission: options.phone ?? true,
      coarsePointer: options.phone ?? true,
    }),
  );
const river: FishingViewEvent = { type: 'place', place: 'river' };
const ready: FishingViewEvent = { type: 'capability', capability: 'ready' };
const runOf = (
  mode: 'buttons' | 'motion',
  phase: AnglingRun['phase'] = 'waiting',
  phaseTick = 0,
) => ({ id: 'r', mode, phase, phaseTick }) as AnglingRun;

describe('fishing screen', () => {
  it('shows nothing of the river in the city, whatever the run or sensors', () => {
    const states: FishingView[] = [];
    for (const phone of [true, false])
      for (const preference of ['motion', 'buttons'] as const)
        for (const capability of ['unknown', 'ready', 'denied'] as Capability[])
          states.push(
            view({ phone, preference }, { type: 'capability', capability }),
          );
    for (const state of states)
      for (const run of [null, runOf('buttons'), runOf('motion')]) {
        const screen = fishingScreen(state, run);
        expect(screen).toMatchObject({
          readyToCast: false,
          console: false,
          motionPlay: false,
          motionCard: false,
          overlay: false,
          quick: { visible: false },
        });
      }
  });

  it('offers a phone that has not chosen only the motion card', () => {
    const screen = fishingScreen(view({}, river), null);
    expect(screen).toMatchObject({ motionCard: true, readyToCast: false });
    expect(screen.quick.visible).toBe(false);
    // Desktops (no permission prompt, fine pointer) go straight to buttons.
    expect(fishingScreen(view({ phone: false }, river), null)).toMatchObject({
      motionCard: false,
      readyToCast: true,
    });
  });

  it('in button mode keeps the manual cast and offers the way back, saying why', () => {
    const buttons = view({ preference: 'buttons' }, river, ready);
    expect(fishingScreen(buttons, null)).toMatchObject({
      readyToCast: true,
      motionCard: false,
      quick: {
        visible: true,
        label: SCREEN_COPY.quick.enable,
        disabled: false,
      },
    });
    const denied = view({}, river, {
      type: 'capability',
      capability: 'denied',
    });
    expect(fishingScreen(denied, null).quick).toEqual({
      visible: true,
      label: SCREEN_COPY.quick.denied,
      disabled: false,
    });
    const unsupported = view({}, river, {
      type: 'capability',
      capability: 'unsupported',
    });
    expect(fishingScreen(unsupported, null).quick).toMatchObject({
      label: SCREEN_COPY.quick.unsupported,
      disabled: true,
    });
    // Nothing to switch while tools cover the river or a run is on.
    expect(
      fishingScreen(
        view({ preference: 'buttons' }, river, { type: 'tools', open: true }),
        null,
      ).quick.visible,
    ).toBe(false);
    expect(fishingScreen(buttons, runOf('buttons')).quick.visible).toBe(false);
  });

  it('gives the river to motion play while motion is on, with aim tools before a run', () => {
    const motion = view({}, river, ready);
    expect(fishingScreen(motion, null)).toMatchObject({
      motionPlay: true,
      readyToCast: false,
      overlay: true,
      calibrateButton: true,
      powerMeter: true,
      hint: SCREEN_COPY.hint.aim,
    });
    const casting = fishingScreen(motion, runOf('motion', 'waiting'));
    expect(casting).toMatchObject({
      console: true,
      consoleMode: 'motion',
      calibrateButton: false,
      powerMeter: false,
    });
    // Tools over the river hide the plane.
    expect(
      fishingScreen(view({}, river, ready, { type: 'tools', open: true }), null)
        .overlay,
    ).toBe(false);
  });

  it('keeps a run in the mode it was cast in', () => {
    const motion = view({}, river, ready);
    expect(fishingScreen(motion, runOf('buttons'))).toMatchObject({
      motionPlay: false,
      consoleMode: 'buttons',
      overlay: false,
    });
    // A motion run restored after a reload still shows its plane and asks to enable.
    const reloaded = view({}, river);
    expect(fishingScreen(reloaded, runOf('motion', 'hook'))).toMatchObject({
      motionPlay: true,
      overlay: true,
      motionCard: true,
    });
  });

  it('words the hint by phase, pause, calibration and notices', () => {
    const motion = view({}, river, ready);
    // A cast run is playing: the view has seen it and resumed.
    const playing = view(
      {},
      river,
      ready,
      { type: 'run', runId: 'r' },
      { type: 'resume' },
    );
    const hint = (state: FishingView, run: AnglingRun | null) =>
      fishingScreen(state, run).hint;
    expect(hint(motion, null)).toBe(SCREEN_COPY.hint.aim);
    expect(hint(playing, runOf('motion', 'waiting'))).toBe(
      SCREEN_COPY.hint.waiting,
    );
    expect(hint(playing, runOf('motion', 'hook'))).toBe(SCREEN_COPY.hint.hook);
    expect(
      hint(playing, runOf('motion', 'fight', FISHING.motion.fight.graceTicks)),
    ).toBe(SCREEN_COPY.hint.settle);
    expect(
      hint(
        playing,
        runOf('motion', 'fight', FISHING.motion.fight.graceTicks + 1),
      ),
    ).toBe(SCREEN_COPY.hint.fight);
    const paused = reduceFishingView(playing, { type: 'pause' });
    expect(hint(paused, runOf('motion', 'hook'))).toBe(SCREEN_COPY.hint.paused);
    const calibrating = reduceFishingView(motion, {
      type: 'calibrating',
      on: true,
    });
    expect(hint(calibrating, null)).toBe(SCREEN_COPY.hint.calibrating);
    expect(fishingScreen(calibrating, null).calibrateButton).toBe(false);
    const notice = reduceFishingView(motion, {
      type: 'notice',
      text: '校准完成',
    });
    expect(hint(notice, null)).toBe('校准完成');
    // A notice never covers the hint of a run.
    expect(
      hint(
        reduceFishingView(playing, { type: 'notice', text: 'x' }),
        runOf('motion'),
      ),
    ).toBe(SCREEN_COPY.hint.waiting);
  });

  it('labels the settings switch and the pause button from the state', () => {
    const toggle = (state: FishingView) => fishingScreen(state, null).toggle;
    expect(toggle(view({}, ready))).toEqual({
      label: SCREEN_COPY.toggle.active,
      pressed: true,
      disabled: false,
    });
    expect(toggle(view({ preference: 'buttons' })).label).toBe(
      SCREEN_COPY.toggle.buttons,
    );
    expect(toggle(view({})).label).toBe(SCREEN_COPY.toggle.enable);
    expect(
      toggle(view({}, { type: 'capability', capability: 'denied' })).label,
    ).toBe(SCREEN_COPY.toggle.denied);
    expect(
      toggle(view({}, { type: 'capability', capability: 'unsupported' })),
    ).toMatchObject({
      label: SCREEN_COPY.toggle.unsupported,
      disabled: true,
    });
    const paused = view({}, river, { type: 'run', runId: 'r' });
    expect(fishingScreen(paused, runOf('buttons')).pauseLabel).toBe(
      SCREEN_COPY.pause.resume,
    );
    expect(
      fishingScreen(
        reduceFishingView(paused, { type: 'resume' }),
        runOf('buttons'),
      ).pauseLabel,
    ).toBe(SCREEN_COPY.pause.pause);
  });
});
