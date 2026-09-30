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
  askSensors,
  castNotice,
  CATCH_CARD_MS,
  catchCountdown,
  fishingScreen,
  motionNibble,
  motionWant,
  noticeShown,
  permissionNotice,
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

/**
 * A device that finished the guide and calibrated before, and has not seen the aim hint,
 * unless told otherwise.
 */
const view = (
  options: {
    phone?: boolean;
    preference?: 'motion' | 'buttons';
    guide?: GuideStep;
    aimHintSeen?: boolean;
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
      aimHintSeen: options.aimHintSeen ?? false,
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
          overlay: false,
          settings: { page: false, calibrate: false },
        });
        expect(askSensors(state, run)).toBe(false);
      }
  });

  it('fishes by motion by default: no card, and a river tap on a phone asks for sensors once', () => {
    // A phone that must ask: nothing covers the river while it waits for the tap.
    const phone = view({}, river);
    expect(fishingScreen(phone, null)).toMatchObject({
      readyToCast: true,
      overlay: false,
    });
    expect(askSensors(phone, null)).toBe(true);
    // Asked once on this page: the next taps do not ask again, whatever the answer.
    const asked = replay(phone, { type: 'ask' });
    expect(askSensors(asked, null)).toBe(false);
    expect(
      askSensors(
        replay(
          asked,
          { type: 'capability', capability: 'denied' },
          {
            type: 'grant',
          },
        ),
        null,
      ),
    ).toBe(false);
    // Answered already, chosen buttons, a button run, off the river: no asking.
    expect(askSensors(view({}, river, ready), null)).toBe(false);
    expect(
      askSensors(
        view({}, river, { type: 'capability', capability: 'denied' }),
        null,
      ),
    ).toBe(false);
    expect(askSensors(view({ preference: 'buttons' }, river), null)).toBe(
      false,
    );
    expect(askSensors(phone, runOf('buttons'))).toBe(false);
    expect(askSensors(view({}), null)).toBe(false);
    // A motion run restored after a reload needs the sensors again, whatever the choice.
    expect(
      askSensors(view({ preference: 'buttons' }, river), runOf('motion')),
    ).toBe(true);
    // Desktops (no permission prompt, or a fine pointer) never ask by themselves.
    expect(askSensors(view({ phone: false }, river), null)).toBe(false);
    // Not by the tap that opens the settings or the tools, nor on anything inside them.
    for (const cover of [
      { type: 'settings', open: true },
      { type: 'tools', open: true },
      { type: 'page', hidden: true },
    ] as FishingViewEvent[])
      expect(askSensors(replay(phone, cover), null)).toBe(false);
    // Not over a restored run that is playing: a prompt would cost the bite.
    const restored = replay(phone, { type: 'run', runId: 'r' });
    const playing = replay(restored, { type: 'resume' });
    for (const phase of ['waiting', 'hook', 'fight'] as const) {
      expect(askSensors(restored, runOf('motion', phase))).toBe(true);
      expect(askSensors(playing, runOf('motion', phase))).toBe(false);
    }
    // Once the sensors report, motion takes the river.
    expect(fishingScreen(view({}, river, ready), null)).toMatchObject({
      readyToCast: false,
      overlay: true,
    });
  });

  it('says once, as the phone refuses its sensors, that buttons take over', () => {
    const phone = view({}, river, { type: 'ask' });
    const denied = replay(phone, { type: 'capability', capability: 'denied' });
    expect(permissionNotice(phone, denied)).toBe(SCREEN_COPY.permission.denied);
    expect(SCREEN_COPY.permission.denied).toBe(
      '体感未获授权，已改用按钮；可在设置里重试',
    );
    expect(fishingScreen(denied, null)).toMatchObject({
      readyToCast: true,
      overlay: false,
    });
    // A retry refused again says so again; the sheet, which covers the message, too.
    const again = replay(denied, { type: 'capability', capability: 'denied' });
    expect(permissionNotice(denied, again)).toBe(SCREEN_COPY.permission.denied);
    expect(fishingScreen(denied, null).settings.mode.note).toBe(
      SCREEN_COPY.settings.denied,
    );
    expect(fishingScreen(again, null).settings.mode.note).toBe(
      SCREEN_COPY.settings.deniedAgain,
    );
    expect(SCREEN_COPY.settings.deniedAgain).not.toBe(
      SCREEN_COPY.settings.denied,
    );
    // An answer that arrives after the player chose buttons changes nothing for them.
    const chose = replay(phone, { type: 'preference', preference: 'buttons' });
    expect(
      permissionNotice(
        chose,
        replay(chose, { type: 'capability', capability: 'denied' }),
      ),
    ).toBeNull();
    // Not again for the same refusal, nor for any other change.
    expect(permissionNotice(denied, denied)).toBeNull();
    expect(
      permissionNotice(denied, replay(denied, { type: 'pause' })),
    ).toBeNull();
    expect(permissionNotice(phone, replay(phone, ready))).toBeNull();
    expect(
      permissionNotice(
        phone,
        replay(phone, { type: 'capability', capability: 'unsupported' }),
      ),
    ).toBeNull();
  });

  it('the settings sheet shows the mode in use and says why motion is not', () => {
    const mode = (state: FishingView, run: AnglingRun | null = null) =>
      fishingScreen(state, run).settings.mode;
    const words = SCREEN_COPY.settings;
    expect(mode(view({}, river, ready))).toEqual({
      motion: { pressed: true, disabled: false },
      buttons: { pressed: false, disabled: false },
      note: null,
    });
    expect(mode(view({ preference: 'buttons' }, river, ready))).toEqual({
      motion: { pressed: false, disabled: false },
      buttons: { pressed: true, disabled: false },
      note: null,
    });
    // Buttons by choice keep the manual cast, even with the sensors reporting.
    expect(
      fishingScreen(view({ preference: 'buttons' }, river, ready), null)
        .readyToCast,
    ).toBe(true);
    // Refused: buttons are in use, and "motion" retries.
    expect(
      mode(view({}, river, { type: 'capability', capability: 'denied' })),
    ).toEqual({
      motion: { pressed: false, disabled: false },
      buttons: { pressed: true, disabled: false },
      note: words.denied,
    });
    // Unsupported: motion cannot be chosen, and the sheet says why.
    expect(
      mode(view({}, river, { type: 'capability', capability: 'unsupported' })),
    ).toEqual({
      motion: { pressed: false, disabled: true },
      buttons: { pressed: true, disabled: false },
      note: words.unsupported,
    });
    // Motion wanted and asked for, but no reading yet; a phone not yet asked says nothing.
    expect(mode(view({}, river, { type: 'ask' })).note).toBe(words.waiting);
    expect(mode(view({ phone: false }, river)).note).toBe(words.waiting);
    expect(mode(view({}, river)).note).toBeNull();
    // A run keeps its mode: both locked, the run's mode pressed, and why.
    for (const run of [runOf('motion'), runOf('buttons')])
      expect(mode(view({}, river, ready), run)).toEqual({
        motion: { pressed: run.mode === 'motion', disabled: true },
        buttons: { pressed: run.mode === 'buttons', disabled: true },
        note: words.runLocked,
      });
  });

  it('fills the page section of the settings sheet on the river; the open sheet covers play', () => {
    const closed = view({}, river, ready);
    expect(fishingScreen(closed, null).settings.page).toBe(true);
    const open = replay(closed, { type: 'settings', open: true });
    expect(fishingScreen(open, null)).toMatchObject({
      settings: { page: true },
      // The sheet covers play: no aiming, no gesture counts.
      overlay: false,
    });
    expect(motionWant(open, null)).toBeNull();
    // The river's section stays during a run, in either mode.
    for (const run of [runOf('motion'), runOf('buttons')])
      expect(fishingScreen(closed, run).settings.page).toBe(true);
    // The sheet opened in the city has no river section.
    expect(
      fishingScreen(view({}, { type: 'settings', open: true }), null).settings
        .page,
    ).toBe(false);
    // Nor the sheet opened over the petting screen: that page has no settings of its own.
    const petting = replay(closed, { type: 'petting', open: true });
    expect(fishingScreen(petting, null).settings.page).toBe(false);
    expect(
      fishingScreen(replay(petting, { type: 'petting', open: false }), null)
        .settings.page,
    ).toBe(true);
  });

  it('gives the river to motion play while motion is on, with aim tools before a run', () => {
    const motion = view({}, river, ready);
    expect(fishingScreen(motion, null)).toMatchObject({
      readyToCast: false,
      overlay: true,
      settings: { calibrate: true },
      powerMeter: true,
      hint: SCREEN_COPY.hint.aim,
    });
    // The sheet offers calibration while it covers the aim; buttons never do.
    expect(
      fishingScreen(replay(motion, { type: 'settings', open: true }), null)
        .settings.calibrate,
    ).toBe(true);
    expect(
      fishingScreen(view({ preference: 'buttons' }, river, ready), null)
        .settings.calibrate,
    ).toBe(false);
    const casting = fishingScreen(motion, runOf('motion', 'waiting'));
    expect(casting).toMatchObject({
      console: true,
      consoleMode: 'motion',
      settings: { calibrate: false },
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
    // A motion run restored after a reload still shows its plane; a tap asks again.
    const reloaded = view({}, river);
    expect(fishingScreen(reloaded, runOf('motion', 'hook'))).toMatchObject({
      overlay: true,
      readyToCast: false,
    });
    expect(askSensors(reloaded, runOf('motion', 'hook'))).toBe(true);
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
    expect(fishingScreen(calibrating, null).settings.calibrate).toBe(false);
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

  it('shows the aim hint once, with a close, and leaves the other hints alone (user, 2026-09-30)', () => {
    const aiming = view({}, river, ready);
    expect(fishingScreen(aiming, null)).toMatchObject({
      hint: SCREEN_COPY.hint.aim,
      aimHint: true,
    });
    // Seen on this device: the aim shows no hint at all.
    const seen = view({ aimHintSeen: true }, river, ready);
    expect(fishingScreen(seen, null)).toMatchObject({
      hint: '',
      aimHint: false,
    });
    // Calibration, its result and the guide's aim steps show instead, without a close.
    for (const [state, hint] of [
      [
        replay(aiming, { type: 'calibrating', on: true }),
        SCREEN_COPY.hint.calibrating,
      ],
      [replay(aiming, { type: 'notice', text: '校准完成' }), '校准完成'],
      [view({ guide: 'aim' }, river, ready), SCREEN_COPY.guide.aim],
    ] as const)
      expect(fishingScreen(state, null)).toMatchObject({
        hint,
        aimHint: false,
      });
    // A run's hints stay once it is seen (each phase's words: the test above).
    const playing = replay(
      seen,
      { type: 'run', runId: 'r' },
      { type: 'resume' },
    );
    expect(fishingScreen(playing, runOf('motion', 'waiting'))).toMatchObject({
      hint: SCREEN_COPY.hint.waiting,
      aimHint: false,
    });
    // Never in button play.
    expect(
      fishingScreen(view({ preference: 'buttons' }, river, ready), null)
        .aimHint,
    ).toBe(false);
    expect(SCREEN_COPY.hint.close).toBe('关闭提示');
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
  });

  it('labels the pause button from the state', () => {
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

  it('withdraws the notice that stood when the card appeared', () => {
    const watched = view({}, river, { type: 'run', runId: 'r' });
    // The cast's notice shows through the run; a notice in a run changes nothing.
    expect(noticeShown(watched, runOf('motion'), null)).toBe(true);
    expect(replay(watched, { type: 'said' })).toBe(watched);
    const ended = replay(watched, { type: 'run', runId: null });
    expect(resultShown(ended, null, result)).toBe(true);
    expect(noticeShown(ended, null, result)).toBe(false);
    // Under a panel too: the old notice stays withdrawn.
    const tools = replay(ended, { type: 'tools', open: true });
    expect(noticeShown(tools, null, result)).toBe(false);
    // A save's earlier result shows no card, so notices show.
    expect(noticeShown(view({}, river), null, result)).toBe(true);
    expect(
      noticeShown(
        replay(ended, { type: 'place', place: 'city' }),
        null,
        result,
      ),
    ).toBe(true);
  });

  it('gives way to a notice raised while it shows: the card goes, the notice shows', () => {
    const ended = view(
      {},
      river,
      { type: 'run', runId: 'r' },
      { type: 'run', runId: null },
    );
    for (const state of [ended, replay(ended, { type: 'tools', open: true })]) {
      const said = replay(state, { type: 'said' });
      // Never both: they float in the same place.
      expect(resultShown(said, null, result)).toBe(false);
      expect(noticeShown(said, null, result)).toBe(true);
      // The card does not come back with the panel closed or a later notice.
      const later = replay(
        said,
        { type: 'tools', open: false },
        { type: 'said' },
      );
      expect(resultShown(later, null, result)).toBe(false);
      expect(noticeShown(later, null, result)).toBe(true);
    }
  });

  it('the next cast takes the card away and shows its notices, as before', () => {
    const ended = view(
      {},
      river,
      { type: 'run', runId: 'r' },
      { type: 'run', runId: null },
    );
    for (const state of [ended, replay(ended, { type: 'said' })]) {
      const next = replay(state, { type: 'run', runId: 'next' });
      expect(resultShown(next, runOf('buttons'), result)).toBe(false);
      expect(noticeShown(next, runOf('buttons'), result)).toBe(true);
      // That run's own result is the next card.
      const landed = replay(
        next,
        { type: 'said' },
        { type: 'run', runId: null },
      );
      expect(resultShown(landed, null, { runId: 'next' })).toBe(true);
      expect(noticeShown(landed, null, { runId: 'next' })).toBe(false);
    }
  });

  it('closes when dismissed, by a tap or its time, and the next catch shows as before (R-02)', () => {
    const ended = view(
      {},
      river,
      { type: 'run', runId: 'r' },
      { type: 'run', runId: null },
    );
    const dismissed = replay(ended, { type: 'dismissed' });
    expect(resultShown(dismissed, null, result)).toBe(false);
    expect(noticeShown(dismissed, null, result)).toBe(true);
    // Nothing brings it back: not a panel closing, not a later notice.
    const later = replay(
      dismissed,
      { type: 'tools', open: true },
      { type: 'tools', open: false },
      { type: 'said' },
    );
    expect(resultShown(later, null, result)).toBe(false);
    // In a run there is no card: dismissing changes nothing, and the run's result shows.
    const next = replay(dismissed, { type: 'run', runId: 'next' });
    expect(replay(next, { type: 'dismissed' })).toBe(next);
    const landed = replay(next, { type: 'run', runId: null });
    expect(resultShown(landed, null, { runId: 'next' })).toBe(true);
    expect(noticeShown(landed, null, { runId: 'next' })).toBe(false);
  });

  it('counts down while the river is in play; a panel, the settings or a hidden page hold it', () => {
    const ended = view(
      {},
      river,
      { type: 'run', runId: 'r' },
      { type: 'run', runId: null },
    );
    expect(CATCH_CARD_MS).toBe(4000);
    expect(catchCountdown(ended, null, result)).toBe('running');
    for (const [cover, uncover] of [
      [
        { type: 'tools', open: true },
        { type: 'tools', open: false },
      ],
      [
        { type: 'settings', open: true },
        { type: 'settings', open: false },
      ],
      [
        { type: 'page', hidden: true },
        { type: 'page', hidden: false },
      ],
    ] satisfies [FishingViewEvent, FishingViewEvent][]) {
      const covered = replay(ended, cover);
      expect(catchCountdown(covered, null, result)).toBe('held');
      expect(catchCountdown(replay(covered, uncover), null, result)).toBe(
        'running',
      );
    }
    // No card, no countdown: in a run, for a save's result, after it closed.
    expect(catchCountdown(ended, runOf('buttons'), result)).toBeNull();
    expect(catchCountdown(view({}, river), null, result)).toBeNull();
    expect(
      catchCountdown(replay(ended, { type: 'dismissed' }), null, result),
    ).toBeNull();
  });
});
