import { FISHING } from '../../content/fishing';
import type { AnglingRun } from '../../minigames/angling';
import { fishPoint, motionSchedule } from '../../minigames/angling-motion';
import {
  canPlay,
  motionActive,
  type FishingView,
  type GuideStep,
} from './view-state';

/** What a precise cast gives in each mode (spec 033 F5); Core decides `precision`. */
const PRECISE_CAST = {
  motion: '稳投：遛鱼圈更大',
  buttons: '稳投：提竿和收线的绿区更宽',
} as const;

/** Player-facing words of the fishing screen's switchable controls. */
export const SCREEN_COPY = {
  hint: {
    calibrating: '校准：向下快甩两次',
    paused: '已暂停 · 点「继续钓鱼」再继续',
    aim: '左右瞄准 · 俯仰调力度 · 下甩抛竿',
    waiting: '拿稳鱼竿，等"！"再上扬',
    hook: '快速上扬提竿！',
    settle: '稳住，用圈罩住鱼',
    fight: '倾斜手机，让圈罩住鱼',
    pull: '往回拉！',
  },
  /** The first motion cast, one step at a time (spec 033 F3). */
  guide: {
    aim: '1/5 左右瞄准：左右转动手机',
    power: '2/5 后仰加力：手机慢慢往后仰，把落点圈推进绿区',
    cast: '3/5 下甩抛竿：朝水面快速下甩',
    strike: '4/5 等"！"再上扬：看到"！"就快速抬起手机',
    fight: '5/5 用圈罩住鱼：倾斜手机，让圈跟住鱼',
    skip: '跳过引导',
  },
  pause: { pause: '暂停', resume: '继续钓鱼' },
  /** The cast power read out while aiming; the water shows it as the landing arc. */
  power: {
    label: '抛竿力度',
    valueText: (power: number, low: number, high: number) =>
      `力度 ${power}，精准区间 ${low}–${high}`,
  },
  /** The precise band: what it gives, and what the cast just made of it (spec 033 F5). */
  cast: {
    legend: `绿区＝${PRECISE_CAST.motion}`,
    precise: PRECISE_CAST,
    loose: '不在绿区，没有稳投加成',
    notice: (power: number, note: string) => `力度 ${power} · ${note}`,
  },
  calibrate: {
    button: '校准甩竿',
    done: (peak: number) => `校准完成：下甩 ${peak}°/s`,
    failed: '没感到两次一致的下甩，打开设置点「校准甩竿」再试一次',
  },
  /** The gear over the water and its sheet (spec 034). */
  settings: {
    title: '设置',
    close: '关闭设置',
    mode: '钓鱼方式',
    motion: '体感',
    buttons: '按钮',
    runLocked: '这一竿结束后才能换钓鱼方式',
    denied: '体感未获授权 · 点「体感」重试',
    unsupported: '此设备或连接不支持体感（需 HTTPS 与陀螺仪）',
    waiting: '等待体感读数…（需陀螺仪）',
  },
  /** Said once when the phone refuses its sensors (spec 034). */
  permission: {
    denied: '体感未获授权，已改用按钮；可在设置里重试',
  },
} as const;

type Run = Pick<AnglingRun, 'mode' | 'phase' | 'phaseTick'>;

/**
 * How far the aim must turn and the power rise before the guide counts the step learned:
 * past the wobble of a steady hand (a third of the aim, well into the precise band).
 */
const GUIDE_AIM = {
  direction: Math.round(FISHING.input.maxDirection / 3),
  power: 65,
};
/** Where each guide step is taught: aiming before a run, then the run's phases. */
const GUIDE_PHASES: Record<GuideStep, readonly (AnglingRun['phase'] | null)[]> =
  {
    aim: [null],
    power: [null],
    cast: [null],
    strike: ['waiting', 'hook'],
    fight: ['fight'],
  };

/**
 * What the fishing scene shows (spec 015). Pure: the DOM only applies this, after every
 * change, so no route can leave a control stale. Nothing of the river shows elsewhere,
 * and a run keeps the controls of the mode it was cast in.
 */
export function fishingScreen(view: FishingView, run: AnglingRun | null) {
  const river = view.place === 'river';
  const playable = canPlay(view);
  const active = motionActive(view);
  const motionRun = run?.mode === 'motion' ? run : null;
  // A button run keeps its own controls even while the phone's motion is on.
  const overlay = playable && (!!motionRun || (active && !run));
  const aiming = overlay && !motionRun && active;
  const guide = overlay && active ? guideStep(view, motionRun) : null;
  // A dash's "pull back" is urgent: it shows over the guide's step.
  const usual = hint(view, motionRun);
  return {
    /** The manual "ready to cast" area. */
    readyToCast: river && !run && !active,
    /** The in-run console (pause, leave; and the button flow's meters). */
    console: river && !!run,
    consoleMode: river && run ? run.mode : null,
    /** The gear over the water and the sheet it opens (spec 034). */
    settings: {
      gear: river,
      open: river && view.settingsOpen,
      mode: modeChoices(view, run, active),
      /** Calibration is offered while motion aims: before a run, not over one. */
      calibrate: river && active && !run && !view.motion.calibrating,
    },
    /** The motion plane over the water. */
    overlay,
    overlayPhase: motionRun?.phase ?? 'aim',
    powerMeter: aiming,
    /** The "!" that asks for a lift. */
    bite: overlay && motionRun?.phase === 'hook',
    /** The fish, the player's ring and the hold meter. */
    fight: overlay && motionRun?.phase === 'fight',
    hint:
      guide && usual !== SCREEN_COPY.hint.pull
        ? SCREEN_COPY.guide[guide]
        : usual,
    /** The first-cast guide's step whose hint shows, with a way to skip the guide. */
    guide,
    pauseLabel: view.paused
      ? SCREEN_COPY.pause.resume
      : SCREEN_COPY.pause.pause,
  };
}
export type FishingScreen = ReturnType<typeof fishingScreen>;

/**
 * The sheet's fishing modes: the one in use pressed, both locked while a run keeps its
 * mode, and a line saying why motion is not in use when it was wanted or cannot be.
 */
function modeChoices(
  view: FishingView,
  run: Pick<AnglingRun, 'mode'> | null,
  active: boolean,
) {
  const { capability, preference, needsPermission, asked } = view.motion;
  const words = SCREEN_COPY.settings;
  const current = run ? run.mode : active ? 'motion' : 'buttons';
  const note = run
    ? words.runLocked
    : capability === 'unsupported'
      ? words.unsupported
      : capability === 'denied'
        ? words.denied
        : preference === 'motion' &&
            capability === 'unknown' &&
            (asked || !needsPermission)
          ? words.waiting
          : null;
  return {
    motion: {
      pressed: current === 'motion',
      disabled: !!run || capability === 'unsupported',
    },
    buttons: { pressed: current === 'buttons', disabled: !!run },
    note,
  };
}

/**
 * Whether a tap on the river asks for sensor access by itself (spec 034): on a phone
 * that must ask, once per page, while motion is wanted (the default, or a motion run
 * restored after a reload) and nothing has answered yet. The tap handler asks inside
 * the tap, as iOS requires.
 */
export const askSensors = (
  view: FishingView,
  run: Pick<AnglingRun, 'mode'> | null,
) =>
  view.place === 'river' &&
  view.motion.needsPermission &&
  view.motion.coarsePointer &&
  !view.motion.asked &&
  view.motion.capability === 'unknown' &&
  (run ? run.mode === 'motion' : view.motion.preference === 'motion');

/** Said once as the phone refuses its sensors: play goes on with buttons. */
export const permissionNotice = (before: FishingView, after: FishingView) =>
  after.motion.capability === 'denied' && before.motion.capability !== 'denied'
    ? SCREEN_COPY.permission.denied
    : null;

const strikable = (run: Run) =>
  run.mode === 'motion' && (run.phase === 'waiting' || run.phase === 'hook');

/**
 * The rod gesture that counts now: a cast before a run, a lift while a motion run waits
 * for or has a bite; none while motion is off, play is covered, the rod is calibrating
 * or the run is paused.
 */
export function motionWant(
  view: FishingView,
  run: Run | null,
): 'cast' | 'lift' | null {
  if (!motionActive(view) || !canPlay(view) || view.motion.calibrating)
    return null;
  if (!run) return 'cast';
  return !view.paused && strikable(run) ? 'lift' : null;
}

/** Tapping the water strikes too, so a lost sensor stream never strands a bite. */
export const tapStrikes = (view: FishingView, run: Run | null) =>
  !!run && !view.paused && strikable(run);

/** The fake nibble a waiting motion run shows now, by index; null between nibbles. */
export function motionNibble(run: AnglingRun | null): number | null {
  if (run?.mode !== 'motion' || run.phase !== 'waiting') return null;
  const index = motionSchedule(run).nibbles.findIndex(
    (at) =>
      run.phaseTick >= at && run.phaseTick < at + FISHING.motion.nibbleTicks,
  );
  return index === -1 ? null : index;
}

/** The guide's aim steps a motion aim preview shows done: a clear turn, a clear pitch back. */
export function aimedSteps(aim: {
  direction: number;
  power: number;
}): GuideStep[] {
  const steps: GuideStep[] = [];
  if (Math.abs(aim.direction) >= GUIDE_AIM.direction) steps.push('aim');
  if (aim.power >= GUIDE_AIM.power) steps.push('power');
  return steps;
}

type CastRun = Pick<
  AnglingRun,
  'id' | 'mode' | 'phase' | 'power' | 'precision'
>;
/**
 * Said once as a run is cast (spec 033 F5): its power and whether Core counted it a
 * precise cast, with what that gives in its mode; null for any other change.
 */
export function castNotice(
  before: CastRun | null,
  after: CastRun | null,
): string | null {
  if (!after || before?.id !== after.id) return null;
  if (before.phase !== 'charge' || after.phase === 'charge') return null;
  const words = SCREEN_COPY.cast;
  return words.notice(
    after.power,
    after.precision ? words.precise[after.mode] : words.loose,
  );
}

/**
 * The catch card shows "this catch": a result the player watched a run end in, on this
 * page and this visit to the river. A save's last result from before is not one.
 */
export const resultShown = (
  view: FishingView,
  run: AnglingRun | null,
  result: { runId: string } | null,
) => !run && !!result && result.runId === view.watched;

type HoldRun = Pick<AnglingRun, 'id' | 'mode' | 'phase' | 'hold'>;
/** Core counted the ring over the fish on this world change: the guide's last step. */
export const ringHeld = (before: HoldRun | null, after: HoldRun | null) =>
  after?.mode === 'motion' &&
  after.phase === 'fight' &&
  before?.id === after.id &&
  before.phase === 'fight' &&
  after.hold > before.hold;

/** The guide step taught now: not over calibration, a notice or a pause. */
function guideStep(view: FishingView, motionRun: Run | null): GuideStep | null {
  const step = view.motion.guide;
  if (!step || view.motion.calibrating) return null;
  if (motionRun ? view.paused : view.motion.notice) return null;
  return GUIDE_PHASES[step].includes(motionRun?.phase ?? null) ? step : null;
}

function hint(view: FishingView, motionRun: AnglingRun | null): string {
  const words = SCREEN_COPY.hint;
  if (view.motion.calibrating) return words.calibrating;
  if (view.motion.notice && !motionRun) return view.motion.notice;
  if (!motionRun) return words.aim;
  if (view.paused) return words.paused;
  if (motionRun.phase === 'waiting') return words.waiting;
  if (motionRun.phase === 'hook') return words.hook;
  if (motionRun.phase === 'fight') {
    if (motionRun.phaseTick <= FISHING.motion.fight.graceTicks)
      return words.settle;
    // A dash is announced or on (spec 033): the fish drawn next, as Core judges it.
    const fish = fishPoint(motionRun, motionRun.phaseTick + 1);
    return fish.warning || fish.dashing ? words.pull : words.fight;
  }
  return '';
}
