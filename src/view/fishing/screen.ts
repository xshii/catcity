import { FISHING } from '../../content/fishing';
import type { AnglingRun } from '../../minigames/angling';
import { canPlay, motionActive, type FishingView } from './view-state';

/** Player-facing words of the fishing screen's switchable controls. */
export const SCREEN_COPY = {
  quick: {
    enable: '改用体感钓鱼',
    denied: '体感未获授权 · 点此重试',
    unsupported: '此设备或连接不支持体感',
  },
  toggle: {
    active: '钓鱼操作：体感 ✓（点此改用按钮）',
    unsupported: '此设备或连接不支持体感（需 HTTPS 与陀螺仪）',
    denied: '体感未获授权（点此重试）',
    enable: '开启体感钓鱼',
    buttons: '钓鱼操作：按钮（点此开启体感）',
  },
  hint: {
    calibrating: '校准：向下快甩两次',
    paused: '已暂停 · 点「继续钓鱼」再继续',
    aim: '左右瞄准 · 俯仰调力度 · 下甩抛竿',
    waiting: '拿稳鱼竿，等"！"再上扬',
    hook: '快速上扬提竿！',
    settle: '稳住，竿尖放进鱼圈',
    fight: '倾斜手机追住鱼圈',
  },
  pause: { pause: '暂停', resume: '继续钓鱼' },
} as const;

type Run = Pick<AnglingRun, 'mode' | 'phase' | 'phaseTick'>;

/**
 * What the fishing scene shows (spec 015). Pure: the DOM only applies this, after every
 * change, so no route can leave a control stale. Nothing of the river shows elsewhere,
 * and a run keeps the controls of the mode it was cast in.
 */
export function fishingScreen(view: FishingView, run: Run | null) {
  const river = view.place === 'river';
  const playable = canPlay(view);
  const active = motionActive(view);
  const motionRun = run?.mode === 'motion' ? run : null;
  const { capability, preference } = view.motion;
  // Phones that must ask for sensor permission get the one-tap card until the player
  // chooses; a motion run restored after a reload needs the tap again to strike.
  const motionCard =
    playable &&
    !!(motionRun || (preference === 'motion' && !run)) &&
    capability === 'unknown' &&
    view.motion.needsPermission &&
    view.motion.coarsePointer;
  // A button run keeps its own controls even while the phone's motion is on.
  const overlay = playable && (!!motionRun || (active && !run));
  const aiming = overlay && !motionRun && active;
  return {
    /** The manual "ready to cast" area. */
    readyToCast: river && !run && !active && !motionCard,
    /** The in-run console (pause, leave; and the button flow's meters). */
    console: river && !!run,
    consoleMode: river && run ? run.mode : null,
    /** The river gives most of the screen to the motion plane. */
    motionPlay: river && (run ? run.mode === 'motion' : active),
    motionCard,
    /** In button mode, by choice or failure, the way back sits by the cast button. */
    quick: {
      visible: playable && !active && !run && !motionCard,
      label:
        capability === 'unsupported'
          ? SCREEN_COPY.quick.unsupported
          : capability === 'denied'
            ? SCREEN_COPY.quick.denied
            : SCREEN_COPY.quick.enable,
      disabled: capability === 'unsupported',
    },
    toggle: {
      label: active
        ? SCREEN_COPY.toggle.active
        : capability === 'unsupported'
          ? SCREEN_COPY.toggle.unsupported
          : capability === 'denied'
            ? SCREEN_COPY.toggle.denied
            : preference === 'motion'
              ? SCREEN_COPY.toggle.enable
              : SCREEN_COPY.toggle.buttons,
      pressed: active,
      disabled: capability === 'unsupported',
    },
    /** The motion plane over the water. */
    overlay,
    overlayPhase: motionRun?.phase ?? 'aim',
    calibrateButton: aiming && !view.motion.calibrating,
    powerMeter: aiming,
    hint: hint(view, motionRun),
    pauseLabel: view.paused
      ? SCREEN_COPY.pause.resume
      : SCREEN_COPY.pause.pause,
  };
}
export type FishingScreen = ReturnType<typeof fishingScreen>;

function hint(view: FishingView, motionRun: Run | null): string {
  const words = SCREEN_COPY.hint;
  if (view.motion.calibrating) return words.calibrating;
  if (view.motion.notice && !motionRun) return view.motion.notice;
  if (!motionRun) return words.aim;
  if (view.paused) return words.paused;
  if (motionRun.phase === 'waiting') return words.waiting;
  if (motionRun.phase === 'hook') return words.hook;
  if (motionRun.phase === 'fight')
    return motionRun.phaseTick <= FISHING.motion.fight.graceTicks
      ? words.settle
      : words.fight;
  return '';
}
