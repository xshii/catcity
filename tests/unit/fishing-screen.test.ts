import { describe, expect, it } from 'vitest';
import { FISH_IDS, FISHING, fishById } from '../../src/content/fishing';
import { createWorld } from '../../src/core/world';
import {
  fishPath,
  motionSchedule,
  type FishState,
} from '../../src/minigames/angling-motion';
import {
  aimedSteps,
  castNotice,
  fishingScreen,
  motionNibble,
  motionWant,
  ringHeld,
  SCREEN_COPY,
  tapStrikes,
} from '../../src/view/fishing/screen';
import {
  initialFishingView,
  reduceFishingView,
  type Capability,
  type FishingView,
  type FishingViewEvent,
  type GuideStep,
} from '../../src/view/fishing/view-state';
import {
  castAngling,
  initialAngling,
  type AnglingRun,
} from '../../src/minigames/angling';
import { replay } from '../helpers/fishing-view';
import { fishingFixture } from './fishing-fixture';

/** A device that finished the guide and calibrated before, unless told otherwise. */
const view = (
  options: {
    phone?: boolean;
    preference?: 'motion' | 'buttons';
    guide?: GuideStep;
  } = {},
  ...events: FishingViewEvent[]
) =>
  replay(
    initialFishingView({
      preference: options.preference ?? 'motion',
      needsPermission: options.phone ?? true,
      coarsePointer: options.phone ?? true,
      guide: options.guide ?? null,
      autoCalibrate: false,
    }),
    ...events,
  );
const river: FishingViewEvent = { type: 'place', place: 'river' };
const ready: FishingViewEvent = { type: 'capability', capability: 'ready' };
const runOf = (
  mode: 'buttons' | 'motion',
  phase: AnglingRun['phase'] = 'waiting',
  phaseTick = 0,
) => ({ id: 'r', mode, phase, phaseTick }) as AnglingRun;
/** A real 5★ motion fight, so the hint can read its fish. */
const fightRun = (): AnglingRun => {
  const cast = castAngling(
    initialAngling({
      happy: false,
      id: 'angling-1',
      catId: 'mochi',
      seed: 3,
      baitId: 'WORM',
      direction: 30,
      aimDepth: 50,
      skillLevel: 1,
      spotId: 'POND',
      catBreed: 'RAGDOLL',
      mode: 'motion',
    }),
    60,
  );
  return {
    ...cast,
    phase: 'fight',
    speciesId: FISH_IDS.find((id) => fishById(id).stars === 5)!,
  };
};

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
    // After settling in, the hint follows the fish drawn next (the tick Core judges).
    const fight = fightRun();
    const tickWhere = (test: (fish: FishState) => boolean) =>
      fishPath(fight, 200).findIndex(
        (fish, tick) =>
          tick > FISHING.motion.fight.graceTicks + 1 && test(fish),
      ) - 1;
    const at = (phaseTick: number) => hint(playing, { ...fight, phaseTick });
    expect(at(tickWhere((fish) => !fish.warning && !fish.dashing))).toBe(
      SCREEN_COPY.hint.fight,
    );
    expect(at(tickWhere((fish) => fish.warning))).toBe(SCREEN_COPY.hint.pull);
    expect(at(tickWhere((fish) => fish.dashing))).toBe(SCREEN_COPY.hint.pull);
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

  it('teaches the first cast in the hint, each step where it happens, with a skip', () => {
    const playing: FishingViewEvent[] = [
      river,
      ready,
      { type: 'run', runId: 'r' },
      { type: 'resume' },
    ];
    const cases: [
      GuideStep,
      FishingViewEvent[],
      ReturnType<typeof runOf> | null,
    ][] = [
      ['aim', [river, ready], null],
      ['power', [river, ready], null],
      ['cast', [river, ready], null],
      ['strike', playing, runOf('motion', 'waiting')],
      ['strike', playing, runOf('motion', 'hook')],
      ['fight', playing, runOf('motion', 'fight')],
    ];
    for (const [guide, events, run] of cases)
      expect(fishingScreen(view({ guide }, ...events), run)).toMatchObject({
        guide,
        hint: SCREEN_COPY.guide[guide],
      });
    // A step waits for its moment: the usual hint shows until then.
    expect(
      fishingScreen(view({ guide: 'strike' }, river, ready), null),
    ).toMatchObject({ guide: null, hint: SCREEN_COPY.hint.aim });
    expect(
      fishingScreen(view({ guide: 'aim' }, ...playing), runOf('motion')),
    ).toMatchObject({ guide: null, hint: SCREEN_COPY.hint.waiting });
    // Finished or skipped: no guide.
    expect(fishingScreen(view({}, river, ready), null).guide).toBeNull();
    // A dash's "pull back" shows over the ring step; the guide stays for after it.
    const fight = fightRun();
    const dash = fishPath(fight, 200).findIndex(
      (fish, tick) =>
        tick > FISHING.motion.fight.graceTicks + 1 && fish.dashing,
    );
    expect(
      fishingScreen(view({ guide: 'fight' }, ...playing), {
        ...fight,
        phaseTick: dash - 1,
      }),
    ).toMatchObject({ guide: 'fight', hint: SCREEN_COPY.hint.pull });
  });

  it('never shows the guide in button mode, over calibration, a notice or a pause', () => {
    const guide = 'aim';
    for (const state of [
      view({ guide, preference: 'buttons' }, river, ready),
      view({ guide }, river),
      view({ guide }, river, { type: 'capability', capability: 'denied' }),
      view({ guide }, ready),
    ])
      expect(fishingScreen(state, null).guide).toBeNull();
    // A button run on a phone with motion on gets no motion guide either.
    expect(
      fishingScreen(view({ guide: 'strike' }, river, ready), runOf('buttons'))
        .guide,
    ).toBeNull();
    const calibrating = view({ guide }, river, ready, {
      type: 'calibrating',
      on: true,
    });
    expect(fishingScreen(calibrating, null)).toMatchObject({
      guide: null,
      hint: SCREEN_COPY.hint.calibrating,
    });
    // A failed calibration's notice shows first; the guide continues after it.
    const failed = view({ guide }, river, ready, {
      type: 'notice',
      text: SCREEN_COPY.calibrate.failed,
    });
    expect(fishingScreen(failed, null)).toMatchObject({
      guide: null,
      hint: SCREEN_COPY.calibrate.failed,
    });
    expect(SCREEN_COPY.calibrate.failed).toContain(
      SCREEN_COPY.calibrate.button,
    );
    expect(
      fishingScreen(
        reduceFishingView(failed, { type: 'notice', text: null }),
        null,
      ).guide,
    ).toBe(guide);
    const paused = view({ guide: 'strike' }, river, ready, {
      type: 'run',
      runId: 'r',
    });
    expect(fishingScreen(paused, runOf('motion', 'hook'))).toMatchObject({
      guide: null,
      hint: SCREEN_COPY.hint.paused,
    });
  });

  it('counts a clear turn as aiming and a clear pitch back as power', () => {
    expect(aimedSteps({ direction: 0, power: 50 })).toEqual([]);
    // A steady hand's wobble does not count.
    expect(aimedSteps({ direction: 3, power: 54 })).toEqual([]);
    expect(aimedSteps({ direction: -15, power: 50 })).toEqual(['aim']);
    expect(aimedSteps({ direction: 15, power: 65 })).toEqual(['aim', 'power']);
    expect(aimedSteps({ direction: 0, power: 100 })).toEqual(['power']);
  });

  it('counts the ring as held when Core fills the hold of the same motion fight', () => {
    const fight = {
      id: 'r',
      mode: 'motion' as const,
      phase: 'fight' as const,
      hold: 5,
    };
    expect(ringHeld(fight, { ...fight, hold: 6 })).toBe(true);
    expect(ringHeld(fight, fight)).toBe(false);
    expect(ringHeld(fight, { ...fight, hold: 3 })).toBe(false);
    // A strike's head start is not a hold, nor another run's, nor a button run's.
    expect(ringHeld({ ...fight, phase: 'hook', hold: 0 }, fight)).toBe(false);
    expect(ringHeld({ ...fight, id: 'q', hold: 0 }, fight)).toBe(false);
    expect(
      ringHeld(
        { ...fight, mode: 'buttons' },
        { ...fight, mode: 'buttons', hold: 6 },
      ),
    ).toBe(false);
    expect(ringHeld(fight, null)).toBe(false);
    expect(ringHeld(null, fight)).toBe(false);
  });

  it('says once, as a run is cast, whether Core counted it a precise cast', () => {
    const { min, max } = FISHING.cast.precisionPower;
    const words = SCREEN_COPY.cast;
    /** A real cast through Core: a flick at `power`, or a button held `power` ticks. */
    const cast = (mode: 'motion' | 'buttons', power: number) => {
      const world = fishingFixture(7);
      world.dispatch({
        type: 'FISH_BEGIN',
        catId: 'mochi',
        baitId: 'BREAD',
        direction: 0,
        aimDepth: 50,
        spotId: 'POND',
        ...(mode === 'motion' ? { mode } : {}),
      });
      const charge = world.getSnapshot().fishing.active!;
      if (mode === 'motion')
        world.dispatch({ type: 'FISH_CAST', runId: charge.id, power });
      else
        for (let tick = 0; tick <= power; tick++)
          world.dispatch({
            type: 'FISH_CONTROL',
            runId: charge.id,
            pressed: tick < power,
            ticks: 1,
          });
      return { charge, after: world.getSnapshot().fishing.active! };
    };
    const seen = new Set<string>();
    for (const [mode, inputs] of [
      ['motion', [min - 15, min, max, max + 12]],
      ['buttons', [5, 20, 25, 30]],
    ] as const)
      for (const input of inputs) {
        const { charge, after } = cast(mode, input);
        expect(after.phase).toBe('waiting');
        expect(after.precision).toBe(after.power >= min && after.power <= max);
        seen.add(`${mode}/${after.precision}`);
        expect(castNotice(charge, after)).toBe(
          words.notice(
            after.power,
            after.precision ? words.precise[mode] : words.loose,
          ),
        );
        // Only the cast itself: not before, not again, not another run, not a reload.
        expect(castNotice(charge, charge)).toBeNull();
        expect(castNotice(after, after)).toBeNull();
        expect(castNotice(after, { ...after, phase: 'hook' })).toBeNull();
        expect(castNotice({ ...charge, id: 'other' }, after)).toBeNull();
        expect(castNotice(null, after)).toBeNull();
        expect(castNotice(charge, null)).toBeNull();
      }
    expect(seen).toEqual(
      new Set(['motion/true', 'motion/false', 'buttons/true', 'buttons/false']),
    );
    expect(words.notice(68, words.precise.motion)).toBe(
      '力度 68 · 稳投：遛鱼圈更大',
    );
    expect(words.legend).toBe('绿区＝稳投：遛鱼圈更大');
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
    // Calibrating: every flick feeds the calibration, none casts.
    expect(
      motionWant(
        view({}, river, ready, { type: 'calibrating', on: true }),
        null,
      ),
    ).toBeNull();
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
