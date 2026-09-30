import { FISH, FISHING, lengthStar, type FishId } from '../../content/fishing';
import type { WorldState } from '../../core';
import type { AnglingRun } from '../../minigames/angling';
import { fishPoint, motionSchedule } from '../../minigames/angling-motion';
import {
  canPlay,
  motionActive,
  type FishingView,
  type GuideStep,
} from './view-state';

/** Player-facing words of the fishing screen's switchable controls. */
export const SCREEN_COPY = {
  hint: {
    calibrating: '校准：向下快甩两次',
    paused: '已暂停 · 点「继续钓鱼」再继续',
    aim: '左右瞄准 · 俯仰调远近 · 下甩抛竿',
    waiting: '拿稳鱼竿，等"！"再上扬',
    hook: '快速上扬提竿！',
    settle: '稳住，用圈罩住鱼',
    fight: '倾斜手机，让圈罩住鱼',
    pull: '往回拉！',
  },
  /** The first motion cast, one step at a time (spec 033 F3). */
  guide: {
    aim: '1/5 左右瞄准：左右转动手机',
    power: '2/5 后仰加力：手机慢慢往后仰，落点圈往远处走',
    cast: '3/5 下甩抛竿：朝水面快速下甩',
    strike: '4/5 等"！"再上扬：看到"！"就快速抬起手机',
    fight: '5/5 用圈罩住鱼：倾斜手机，让圈跟住鱼',
    skip: '跳过引导',
  },
  pause: { pause: '暂停', resume: '继续钓鱼' },
  /** The cast power read out while aiming; the water shows it as the landing arc. */
  power: {
    label: '抛竿力度',
    /** At an end of the range the landing ring goes no further, and this says so. */
    valueText: (power: number, low: number, high: number): string => {
      const { limit } = SCREEN_COPY.power;
      const end =
        power <= 0
          ? limit.near
          : power >= FISHING.input.maxPower
            ? limit.far
            : '';
      return `力度 ${power}，精准区间 ${low}–${high}${end && `，${end}`}`;
    },
    limit: { near: '已到最近', far: '已到最远' },
  },
  /** The ring turns green over a fish shadow, and a cast says so once (spec 033 F5b). */
  cast: {
    legend: '落点圈变绿＝对准了鱼影',
    onShadow: '落在鱼影上',
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
    deniedAgain: '仍未获授权 · 请在浏览器设置里允许「运动与方向访问」后重试',
    unsupported: '此设备或连接不支持体感（需 HTTPS 与陀螺仪）',
    waiting: '等待体感读数…（需陀螺仪）',
  },
  /** Said each time the phone refuses its sensors (spec 034). */
  permission: {
    denied: '体感未获授权，已改用按钮；可在设置里重试',
  },
  /** A caught species' record stars (R-54): which are collected, never the lengths. */
  atlas: {
    /** A species never caught: named only once it is (user decision, 2026-09-30). */
    unknown: '未发现的鱼影',
    stars: ['铜星', '银星', '金星'],
    names: ['铜', '银', '金'],
    glyph: { lit: '★', unlit: '☆' },
    label: (collected: readonly string[]) =>
      `体长评星：${collected.length ? `已收集${collected.join('、')}` : '还没有星'}`,
    newSpecies: (name: string, star: string | null) =>
      `图鉴新添：${name}${star ? `，评上${star}` : ''}`,
    reached: (name: string, star: string) => `${name}的纪录评上${star}`,
  },
} as const;

type Atlas = WorldState['fishing']['atlas'];
type AtlasRecord = Atlas[FishId];

/**
 * An atlas entry's bronze, silver and gold, each lit once the record earns it, and the
 * words read for them; none for a fish never caught.
 */
export function atlasStars(id: FishId, record: AtlasRecord) {
  if (!record.count) return null;
  const lit = lengthStar(id, record.bestLengthMm);
  const words = SCREEN_COPY.atlas;
  return {
    lit,
    marks: words.names.map((name, index) => ({ name, lit: index < lit })),
    label: words.label(words.stars.slice(0, lit)),
  };
}

/**
 * What one catch added to the atlas, told from the snapshots before and after it: a
 * species caught for the first time, or the highest star a record newly reached; '' if
 * neither.
 */
export function atlasNote(before: Atlas, after: Atlas): string {
  const words = SCREEN_COPY.atlas;
  return FISH.flatMap((fish) => {
    const was = before[fish.id];
    const now = after[fish.id];
    const stars = lengthStar(fish.id, now.bestLengthMm);
    const star =
      stars > lengthStar(fish.id, was.bestLengthMm)
        ? words.stars[stars - 1]!
        : null;
    if (!was.count && now.count) return [words.newSpecies(fish.name, star)];
    return star ? [words.reached(fish.name, star)] : [];
  }).join('。');
}

/**
 * How long the catch card stays before it closes by itself (R-02): it floats over the
 * scene, so it gives the scene back. Its countdown bar runs for the same time.
 */
export const CATCH_CARD_MS = 4000;

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
  const { capability, preference, needsPermission, asked, refusals } =
    view.motion;
  const words = SCREEN_COPY.settings;
  const current = run ? run.mode : active ? 'motion' : 'buttons';
  const note = run
    ? words.runLocked
    : capability === 'unsupported'
      ? words.unsupported
      : capability === 'denied'
        ? refusals > 1
          ? words.deniedAgain
          : words.denied
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

/** Motion is what the player fishes with, sensors allowing: a run's mode, else the choice. */
export const wantsMotion = (
  view: FishingView,
  run: Pick<AnglingRun, 'mode'> | null,
) => (run ? run.mode === 'motion' : view.motion.preference === 'motion');

/**
 * Whether a tap on the river asks for sensor access by itself (spec 034): on a phone
 * that must ask, once per page, while motion is wanted (the default, or a motion run
 * restored after a reload) and nothing has answered yet. Not by a tap that leaves the
 * settings or the tools open, nor over a run that is playing (a prompt would cost the
 * bite): a restored run starts paused. The tap handler asks inside the tap, as iOS
 * requires.
 */
export const askSensors = (
  view: FishingView,
  run: Pick<AnglingRun, 'mode'> | null,
) =>
  canPlay(view) &&
  (!run || view.paused) &&
  view.motion.needsPermission &&
  view.motion.coarsePointer &&
  !view.motion.asked &&
  view.motion.capability === 'unknown' &&
  wantsMotion(view, run);

/**
 * Said as the phone refuses its sensors, each time it does: play goes on with buttons.
 * Not to a player who chose buttons before the answer came.
 */
export const permissionNotice = (before: FishingView, after: FishingView) =>
  after.motion.refusals > before.motion.refusals &&
  after.motion.preference === 'motion'
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

type CastRun = Pick<AnglingRun, 'id' | 'phase' | 'shadow'>;
/**
 * Said once as a run is cast onto a fish shadow, as Core recorded it (spec 033 F5b); null
 * for any other change. Neutral: a wrong bait makes the shadow sniff and leave.
 */
export function castNotice(
  before: CastRun | null,
  after: CastRun | null,
): string | null {
  if (!after || before?.id !== after.id) return null;
  if (before.phase !== 'charge' || after.phase === 'charge') return null;
  return after.shadow ? SCREEN_COPY.cast.onShadow : null;
}

/**
 * The catch card shows "this catch": a result the player watched a run end in, on this
 * page and this visit to the river, until a notice is raised over it. A save's last
 * result from before is not one.
 */
export const resultShown = (
  view: FishingView,
  run: AnglingRun | null,
  result: { runId: string } | null,
) => !run && !!result && result.runId === view.watched;

/**
 * The catch card's countdown (R-02): none without the card; it runs while the river is
 * in play and is held while a panel, the settings or a hidden page covers it.
 */
export const catchCountdown = (
  view: FishingView,
  run: AnglingRun | null,
  result: { runId: string } | null,
): 'running' | 'held' | null =>
  !resultShown(view, run, result) ? null : canPlay(view) ? 'running' : 'held';

/**
 * The notice bar and the catch card float in the same place under the scene bar, so never
 * both: the card withdraws the notice that stood when it appeared, and a notice raised
 * later takes the card away (the view's `said`), so none is lost.
 */
export const noticeShown = (
  view: FishingView,
  run: AnglingRun | null,
  result: { runId: string } | null,
) => !resultShown(view, run, result);

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
