import { describe, expect, it } from 'vitest';
import { FISH_IDS, FISHING, fishById } from '../../src/content/fishing';
import { createWorld } from '../../src/core/world';
import { fishShadows, shadowUnderCast } from '../../src/core';
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
  resultShown,
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

  it('says once, as a run is cast onto a fish shadow, that it landed there', () => {
    // A pond world with a shadow a cast at power 50 can reach head-on.
    const pond = () => {
      for (let seed = 1; ; seed++) {
        const world = fishingFixture(seed);
        const shadows = fishShadows(world.getSnapshot(), 'POND');
        const target = shadows.find((s) => s.reach >= 25 && s.reach <= 75);
        const miss = [-45, 0, 45]
          .flatMap((direction) =>
            [0, 50, 100].map((aimDepth) => ({ direction, aimDepth })),
          )
          .find(
            (aim) =>
              shadowUnderCast(world.getSnapshot(), 'POND', {
                ...aim,
                power: 50,
              }) === null,
          );
        if (target && miss) return { world, target, miss };
      }
    };
    /** A real cast at power 50 through Core: a flick, or a button held to 50. */
    const cast = (mode: 'motion' | 'buttons', onShadow: boolean) => {
      const { world, target, miss } = pond();
      const aim = onShadow
        ? { direction: target.direction, aimDepth: 2 * target.reach - 50 }
        : miss;
      world.dispatch({
        type: 'FISH_BEGIN',
        catId: 'mochi',
        baitId: 'BREAD',
        spotId: 'POND',
        ...aim,
        ...(mode === 'motion' ? { mode } : {}),
      });
      const charge = world.getSnapshot().fishing.active!;
      if (mode === 'motion')
        world.dispatch({ type: 'FISH_CAST', runId: charge.id, power: 50 });
      else {
        // Holding 16 ticks sweeps the power up to 50; release there.
        for (let tick = 0; tick < 16; tick++)
          world.dispatch({
            type: 'FISH_CONTROL',
            runId: charge.id,
            pressed: true,
            ticks: 1,
          });
        world.dispatch({
          type: 'FISH_CONTROL',
          runId: charge.id,
          pressed: false,
          ticks: 1,
        });
      }
      return { charge, after: world.getSnapshot().fishing.active! };
    };
    for (const mode of ['motion', 'buttons'] as const)
      for (const onShadow of [true, false]) {
        const { charge, after } = cast(mode, onShadow);
        expect(after).toMatchObject({ phase: 'waiting', power: 50 });
        expect(after.shadow !== null).toBe(onShadow);
        expect(castNotice(charge, after)).toBe(
          onShadow ? SCREEN_COPY.cast.onShadow : null,
        );
        // Only the cast itself: not before, not again, not another run, not a reload.
        expect(castNotice(charge, charge)).toBeNull();
        expect(castNotice(after, after)).toBeNull();
        expect(castNotice(after, { ...after, phase: 'hook' })).toBeNull();
        expect(castNotice({ ...charge, id: 'other' }, after)).toBeNull();
        expect(castNotice(null, after)).toBeNull();
        expect(castNotice(charge, null)).toBeNull();
      }
    expect(SCREEN_COPY.cast.onShadow).toBe('落在鱼影上');
    expect(SCREEN_COPY.cast.legend).toBe('落点圈变绿＝对准了鱼影');
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

describe('the catch card', () => {
  const result = { runId: 'r' };
  it('shows only a run this page watched end, until the player leaves the river', () => {
    // A save's last result from an earlier visit: nothing was caught here yet.
    expect(resultShown(view({}, river), null, result)).toBe(false);
    const watched = view({}, river, { type: 'run', runId: 'r' });
    expect(resultShown(watched, runOf('motion'), result)).toBe(false);
    const ended = replay(watched, { type: 'run', runId: null });
    expect(resultShown(ended, null, result)).toBe(true);
    expect(resultShown(ended, null, { runId: 'other' })).toBe(false);
    expect(resultShown(ended, null, null)).toBe(false);
    // Back from the city, the card is no longer "this" catch.
    const away = replay(ended, { type: 'place', place: 'city' }, river);
    expect(resultShown(away, null, result)).toBe(false);
  });
});
