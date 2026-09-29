import { describe, expect, it } from 'vitest';
import { FISHING } from '../../src/content/fishing';
import { createWorld } from '../../src/core/world';
import { motionSchedule } from '../../src/minigames/angling-motion';
import {
  fishingScreen,
  motionNibble,
  motionWant,
  SCREEN_COPY,
  tapStrikes,
} from '../../src/view/fishing/screen';
import {
  initialFishingView,
  reduceFishingView,
  type Capability,
  type FishingView,
  type FishingViewEvent,
} from '../../src/view/fishing/view-state';
import type { AnglingRun } from '../../src/minigames/angling';
import { replay } from '../helpers/fishing-view';

const view = (
  options: { phone?: boolean; preference?: 'motion' | 'buttons' } = {},
  ...events: FishingViewEvent[]
) =>
  replay(
    initialFishingView({
      preference: options.preference ?? 'motion',
      needsPermission: options.phone ?? true,
      coarsePointer: options.phone ?? true,
    }),
    ...events,
  );
const river: FishingViewEvent = { type: 'place', place: 'river' };
const ready: FishingViewEvent = { type: 'capability', capability: 'ready' };
const runOf = (
  mode: 'buttons' | 'motion',
  phase: AnglingRun['phase'] = 'waiting',
  phaseTick = 0,
) => ({ id: 'r', mode, phase, phaseTick });

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
      consoleMode: 'buttons',
      overlay: false,
    });
    // A motion run restored after a reload still shows its plane and asks to enable.
    const reloaded = view({}, river);
    expect(fishingScreen(reloaded, runOf('motion', 'hook'))).toMatchObject({
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
    const hint = (state: FishingView, run: ReturnType<typeof runOf> | null) =>
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

  it('shows the bite mark while hooked and the fight marks while fighting', () => {
    const motion = view({}, river, ready);
    for (const phase of ['waiting', 'hook', 'fight', 'caught'] as const)
      expect(fishingScreen(motion, runOf('motion', phase))).toMatchObject({
        bite: phase === 'hook',
        fight: phase === 'fight',
      });
    // Never for a button run or off the river.
    expect(fishingScreen(motion, runOf('buttons', 'hook')).bite).toBe(false);
    expect(fishingScreen(view({}, ready), runOf('motion', 'fight')).fight).toBe(
      false,
    );
  });

  it('counts a cast before a run and a lift while a motion run waits or is hooked', () => {
    const playing = view(
      {},
      river,
      ready,
      { type: 'run', runId: 'r' },
      { type: 'resume' },
    );
    expect(motionWant(view({}, river, ready), null)).toBe('cast');
    expect(motionWant(playing, runOf('motion', 'waiting'))).toBe('lift');
    expect(motionWant(playing, runOf('motion', 'hook'))).toBe('lift');
    for (const phase of ['charge', 'fight', 'caught', 'escaped'] as const)
      expect(motionWant(playing, runOf('motion', phase))).toBeNull();
    // A button run, a paused run, motion off, or tools over the river: nothing counts.
    expect(motionWant(playing, runOf('buttons', 'hook'))).toBeNull();
    expect(
      motionWant(
        reduceFishingView(playing, { type: 'pause' }),
        runOf('motion'),
      ),
    ).toBeNull();
    expect(motionWant(view({}, river), null)).toBeNull();
    expect(
      motionWant(view({}, river, ready, { type: 'tools', open: true }), null),
    ).toBeNull();
  });

  it('lets a water tap strike an unpaused motion run that waits or is hooked', () => {
    // No sensors needed: the tap is the fallback when they fail.
    const playing = view(
      {},
      river,
      { type: 'run', runId: 'r' },
      { type: 'resume' },
    );
    expect(tapStrikes(playing, runOf('motion', 'waiting'))).toBe(true);
    expect(tapStrikes(playing, runOf('motion', 'hook'))).toBe(true);
    expect(tapStrikes(playing, runOf('motion', 'fight'))).toBe(false);
    expect(tapStrikes(playing, runOf('buttons', 'hook'))).toBe(false);
    expect(tapStrikes(playing, null)).toBe(false);
    expect(
      tapStrikes(
        reduceFishingView(playing, { type: 'pause' }),
        runOf('motion', 'hook'),
      ),
    ).toBe(false);
  });

  it('names the nibble a waiting motion run shows, and nothing between them', () => {
    const world = createWorld(42);
    const begun = world.dispatch({
      type: 'FISH_BEGIN',
      catId: 'mochi',
      spotId: 'POND',
      baitId: 'WORM',
      direction: 0,
      aimDepth: 50,
      mode: 'motion',
    });
    expect(begun.ok).toBe(true);
    const runId = world.getSnapshot().fishing.active!.id;
    expect(world.dispatch({ type: 'FISH_CAST', runId, power: 60 }).ok).toBe(
      true,
    );
    const waiting = world.getSnapshot().fishing.active!;
    const { nibbles } = motionSchedule(waiting);
    expect(nibbles.length).toBeGreaterThan(0);
    const at = (phaseTick: number, phase: AnglingRun['phase'] = 'waiting') =>
      motionNibble({ ...waiting, phase, phaseTick });
    for (const [index, start] of nibbles.entries()) {
      expect(at(start)).toBe(index);
      expect(at(start + FISHING.motion.nibbleTicks - 1)).toBe(index);
      expect(at(start + FISHING.motion.nibbleTicks)).toBeNull();
    }
    expect(at(nibbles[0]! - 1)).toBeNull();
    expect(at(nibbles[0]!, 'hook')).toBeNull();
    expect(
      motionNibble({ ...waiting, mode: 'buttons', phaseTick: nibbles[0]! }),
    ).toBeNull();
    expect(motionNibble(null)).toBeNull();
  });
});
