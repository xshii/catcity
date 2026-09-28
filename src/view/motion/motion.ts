import './motion.css';
import {
  modeMessages,
  THROW_WINDOW_SECONDS,
  type MotionMode,
  type OffReason,
} from './motion-state';
import { mountMotionGuide } from './motion-guide';
import { mountMotionHook, type HookPoint } from './motion-hook';
import { OrientationTracker } from './orientation';
import type { AnglingRun } from '../../minigames/angling';

type Permission = 'granted' | 'denied' | 'unavailable' | 'error';
function hasPermissionRequest(
  api: object,
): api is { requestPermission: () => unknown } {
  return (
    'requestPermission' in api && typeof api.requestPermission === 'function'
  );
}

function request(api: unknown): Promise<Permission> {
  if (!api || (typeof api !== 'object' && typeof api !== 'function'))
    return Promise.resolve('unavailable');
  if (!hasPermissionRequest(api)) return Promise.resolve('granted');
  try {
    // Invoke before awaiting either sensor: both permissions need this click's activation.
    return Promise.resolve(api.requestPermission()).then(
      (value) => (value === 'granted' ? 'granted' : 'denied'),
      () => 'error',
    );
  } catch {
    return Promise.resolve('error');
  }
}
interface MotionActions {
  getRun: () => AnglingRun | null;
  isPaused: () => boolean;
  cast: (power: number) => boolean;
}

/** Optional browser input adapter. Sensor readings never own world state. */
export function mountFishingMotion(
  parent: HTMLElement,
  actions: MotionActions,
) {
  const controls = document.createElement('section');
  controls.className = 'motion-controls';
  controls.innerHTML =
    '<div><button id="motion-toggle" aria-pressed="false">体感：关</button><button id="motion-calibrate" disabled>校准当前姿势</button></div><p id="motion-status" role="status">可选：倾斜手机瞄准，准备后向前甩竿。滑杆与蓄力按钮始终可用。</p>';
  parent.append(controls);
  const toggle = controls.querySelector<HTMLButtonElement>('#motion-toggle')!;
  const calibrate =
    controls.querySelector<HTMLButtonElement>('#motion-calibrate')!;
  const status = controls.querySelector<HTMLElement>('#motion-status')!;
  const direction =
    document.querySelector<HTMLInputElement>('#fish-direction')!;
  const depth = document.querySelector<HTMLInputElement>('#fish-depth')!;
  const stage = document.getElementById('fishing-stage')!;
  const shortcut = document.createElement('div');
  shortcut.className = 'motion-scene-control';
  shortcut.innerHTML =
    '<div class="motion-scene-buttons"><button id="motion-quick-toggle" aria-pressed="false">按钮模式 · 启用体感</button><button id="motion-quick-calibrate" aria-label="重新校准体感" title="拿稳手机，按当前姿势重新校准" disabled hidden>校准</button></div><span id="motion-quick-status" role="status">按住按钮也能钓鱼</span>';
  document.getElementById('river-hud')!.append(shortcut);
  const quickToggle = shortcut.querySelector<HTMLButtonElement>(
    '#motion-quick-toggle',
  )!;
  const quickStatus = shortcut.querySelector<HTMLElement>(
    '#motion-quick-status',
  )!;
  const quickCalibrate = shortcut.querySelector<HTMLButtonElement>(
    '#motion-quick-calibrate',
  )!;

  const sheet = document.getElementById('river-tools')!;
  const arm = document.createElement('button');
  arm.id = 'motion-cast-arm';
  arm.className = 'primary';
  arm.textContent = '准备甩竿';
  arm.setAttribute('aria-pressed', 'false');
  arm.hidden = true;
  document.getElementById('angling-live')!.append(arm);
  const guide = mountMotionGuide(stage);
  const hookGuide = mountMotionHook(stage);
  const bar = document.getElementById('angling-bar')!;
  const orientationTracker = new OrientationTracker();

  let mode: MotionMode = { kind: 'off', reason: 'initial' };
  let focused = true;
  let applying = false;
  let rebaseNext = true;
  let latest: { x: number; y: number } | null = null;
  let baseline = { x: 0, y: 0, direction: 0, depth: 50 };
  let watchdog: number | undefined;
  let armed = false;
  let samples = 0;
  let peak = 0;
  let armTimeout: number | undefined;
  let peakTimeout: number | undefined;
  let hookRunId: string | null = null;
  let manualHook = false;
  let hookPoint: HookPoint = { x: 80, y: 20 };
  let hookOrigin = { x: 0, y: 0, pointX: 80, pointY: 20 };

  const visible = () =>
    focused &&
    !document.hidden &&
    stage.classList.contains('is-river') &&
    sheet.hidden;
  const canThrow = () =>
    mode.kind === 'on' &&
    mode.motion === 'ready' &&
    mode.calibration !== 'required' &&
    visible() &&
    stage.dataset.phase === 'charge';
  const canHook = () =>
    mode.kind === 'on' &&
    mode.orientation === 'ready' &&
    mode.calibration !== 'required' &&
    latest !== null &&
    !manualHook &&
    hookRunId !== null &&
    visible() &&
    stage.dataset.phase === 'hook';
  const rebaseHook = () => {
    if (latest)
      hookOrigin = { ...latest, pointX: hookPoint.x, pointY: hookPoint.y };
  };
  const cancelArm = (message = '准备甩竿') => {
    armed = false;
    peak = 0;
    samples = 0;
    window.clearTimeout(armTimeout);
    window.clearTimeout(peakTimeout);
    armTimeout = undefined;
    peakTimeout = undefined;
    arm.textContent = message;
    arm.setAttribute('aria-pressed', 'false');
  };
  const measuredPower = () =>
    peak < 3 ? 0 : Math.round(Math.max(0, Math.min(100, 15 + (peak - 3) * 8)));
  const refresh = () => {
    const run = actions.getRun();
    const nextHookId = run?.phase === 'hook' ? run.id : null;
    if (hookRunId !== nextHookId) {
      hookRunId = nextHookId;
      manualHook = false;
      hookPoint = { x: 80, y: 20 };
      rebaseHook();
    }
    if (armed && !canThrow()) cancelArm();
    const enabled = mode.kind === 'on';
    const pending = mode.kind === 'requesting';
    arm.hidden = !canThrow();
    toggle.textContent = enabled ? '体感：开' : '体感：关';
    toggle.setAttribute('aria-pressed', String(enabled));
    toggle.disabled = pending;
    calibrate.disabled =
      mode.kind !== 'on' || mode.orientation !== 'ready' || !latest;
    quickCalibrate.disabled = calibrate.disabled;
    quickCalibrate.hidden = !enabled;
    quickToggle.disabled = pending;
    quickToggle.setAttribute('aria-pressed', String(enabled));
    quickToggle.textContent = pending
      ? '正在请求体感权限…'
      : enabled
        ? '体感：开 · 关闭'
        : '按钮模式 · 启用体感';
    const messages = modeMessages(mode);
    status.textContent = messages.detail;
    const phase = stage.dataset.phase ?? 'ready';
    quickStatus.textContent = armed
      ? `甩竿识别中 · ${THROW_WINDOW_SECONDS} 秒内向前甩`
      : mode.kind === 'on' && mode.calibration === 'required'
        ? messages.summary
        : enabled && phase === 'waiting'
          ? mode.kind === 'on' && mode.orientation === 'ready'
            ? '等待咬钩 · 咬钩后倾斜入圈'
            : '已抛竿 · 咬钩后用按钮提竿'
          : enabled && phase === 'hook'
            ? canHook()
              ? '左右、前后倾斜 · 入圈稳住提竿'
              : '游标进绿色区 · 按按钮提竿'
            : enabled && phase === 'fight'
              ? '按住按钮收线 · 松开放线'
              : messages.summary;
    stage.dataset.motionCasting = String(canThrow());
    guide.render({
      mode,
      phase,
      visible: visible(),
      direction: Number(direction.value),
      depth: Number(depth.value),
      power: armed
        ? measuredPower()
        : Number(bar.getAttribute('aria-valuenow')),
      zone: {
        low: Number(bar.dataset.low ?? 0),
        high: Number(bar.dataset.high ?? 0),
      },
      armed,
      canThrow: canThrow(),
      canHook: canHook(),
    });
    hookGuide.render(run, hookPoint, canHook(), actions.isPaused());
  };
  const rebase = () => {
    if (!latest) return;
    baseline = {
      ...latest,
      direction: Number(direction.value),
      depth: Number(depth.value),
    };
    rebaseNext = false;
    rebaseHook();
  };
  const write = (input: HTMLInputElement, value: number) => {
    if (Number(input.value) === value) return;
    applying = true;
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    applying = false;
  };
  const offset = (delta: number) =>
    Math.abs(delta) <= 3
      ? 0
      : Math.round(((delta - Math.sign(delta) * 3) * 1.5) / 5) * 5;
  const orientation = (event: DeviceOrientationEvent) => {
    if (mode.kind !== 'on' || mode.orientation === 'unavailable') return;
    const next = orientationTracker.sample(
      event.beta,
      event.gamma,
      screen.orientation?.angle ??
        (window as Window & { orientation?: number }).orientation ??
        0,
    );
    if (!next) return;
    latest = next;
    mode.orientation = 'ready';
    refresh();
    if (mode.calibration === 'required') return;
    if (rebaseNext || !visible()) {
      rebase();
      return;
    }
    if (canHook()) {
      hookPoint = {
        x: Math.max(
          0,
          Math.min(100, hookOrigin.pointX + offset(latest.x - hookOrigin.x)),
        ),
        y: Math.max(
          0,
          Math.min(100, hookOrigin.pointY + offset(latest.y - hookOrigin.y)),
        ),
      };
      refresh();
      return;
    }
    if (actions.getRun()) {
      rebase();
      return;
    }
    write(
      direction,
      Math.max(
        -45,
        Math.min(45, baseline.direction + offset(latest.x - baseline.x)),
      ),
    );
    write(
      depth,
      Math.max(
        0,
        Math.min(100, baseline.depth + offset(latest.y - baseline.y)),
      ),
    );
  };
  const finishThrow = () => {
    if (!armed) return;
    const power = measuredPower();
    const allowed = peak >= 3 && canThrow();
    cancelArm(allowed ? '准备甩竿' : '未识别 · 重试');
    if (allowed) actions.cast(power);
    refresh();
  };
  const motion = (event: DeviceMotionEvent) => {
    const acceleration = event.acceleration;
    if (
      mode.kind !== 'on' ||
      mode.motion === 'unavailable' ||
      !acceleration ||
      acceleration.x === null ||
      acceleration.y === null ||
      acceleration.z === null ||
      ![acceleration.x, acceleration.y, acceleration.z].every(Number.isFinite)
    )
      return;
    mode.motion = 'ready';
    refresh();
    if (!armed || !canThrow()) return;
    samples++;
    if (samples === 1) return;
    const forward = -acceleration.z;
    if (
      forward < 3 ||
      forward < Math.abs(acceleration.x) * 1.4 ||
      forward < Math.abs(acceleration.y) * 0.6
    )
      return;
    peak = Math.max(peak, forward);
    refresh();
    if (peakTimeout === undefined)
      peakTimeout = window.setTimeout(finishThrow, 250);
  };
  const stop = (reason: OffReason) => {
    mode = { kind: 'off', reason };
    latest = null;
    orientationTracker.reset();
    window.clearTimeout(watchdog);
    window.removeEventListener('deviceorientation', orientation);
    window.removeEventListener('devicemotion', motion);
    cancelArm();
    refresh();
  };
  const toggleMotion = () => {
    if (mode.kind === 'requesting') return;
    if (mode.kind === 'on') {
      stop('disabled');
      return;
    }
    if (!window.isSecureContext) {
      stop('insecure');
      return;
    }
    const orientationPermission = request(window.DeviceOrientationEvent);
    const motionPermission = request(window.DeviceMotionEvent);
    mode = { kind: 'requesting' };
    refresh();
    void Promise.all([orientationPermission, motionPermission]).then(
      ([aim, flick]) => {
        if (aim !== 'granted' && flick !== 'granted') {
          stop(
            aim === 'denied' || flick === 'denied'
              ? 'denied'
              : aim === 'error' || flick === 'error'
                ? 'error'
                : 'unsupported',
          );
          return;
        }
        const active: Extract<MotionMode, { kind: 'on' }> = {
          kind: 'on',
          orientation: aim === 'granted' ? 'waiting' : 'unavailable',
          motion: flick === 'granted' ? 'waiting' : 'unavailable',
          calibration: 'initial',
        };
        mode = active;
        rebaseNext = true;
        manualHook = false;
        if (aim === 'granted')
          window.addEventListener('deviceorientation', orientation);
        if (flick === 'granted')
          window.addEventListener('devicemotion', motion);
        watchdog = window.setTimeout(() => {
          if (mode !== active) return;
          // Startup delay is not a permission denial. Keep granted listeners so
          // late readings, including after returning to the page, can recover.
          if (active.orientation === 'waiting') active.orientation = 'delayed';
          if (active.motion === 'waiting') active.motion = 'delayed';
          refresh();
        }, 2500);
        refresh();
      },
    );
  };
  toggle.addEventListener('click', toggleMotion);
  quickToggle.addEventListener('click', toggleMotion);
  const calibratePose = () => {
    if (!latest || mode.kind !== 'on' || mode.orientation !== 'ready') return;
    cancelArm();
    mode.calibration = 'done';
    // Ready aiming is a local preview. Centre it before taking the new pose
    // baseline; an active run keeps the cast parameters already sent to Core.
    if (!actions.getRun()) {
      write(direction, 0);
      write(depth, 50);
    }
    rebase();
    refresh();
  };
  calibrate.addEventListener('click', calibratePose);
  quickCalibrate.addEventListener('click', calibratePose);
  const prepareCast = () => {
    if (!canThrow()) return;
    cancelArm();
    armed = true;
    peak = 0;
    samples = 0;
    arm.textContent = `向前甩动 · ${THROW_WINDOW_SECONDS} 秒`;
    arm.setAttribute('aria-pressed', 'true');
    armTimeout = window.setTimeout(finishThrow, THROW_WINDOW_SECONDS * 1000);
    refresh();
  };
  arm.addEventListener('click', () => {
    if (armed) {
      cancelArm();
      refresh();
    } else prepareCast();
  });
  const useManualControl = () => {
    const switched = canHook();
    if (switched) manualHook = true;
    cancelArm();
    refresh();
    return switched;
  };
  document
    .getElementById('fish-pause')!
    .addEventListener('click', () => cancelArm());
  for (const input of [direction, depth])
    input.addEventListener('input', () => {
      if (!applying) rebase();
    });
  const rotate = () => {
    if (mode.kind !== 'on') return;
    if (mode.orientation === 'unavailable') {
      stop('rotated');
      return;
    }
    mode.calibration = 'required';
    latest = null;
    orientationTracker.reset();
    rebaseNext = true;
    cancelArm();
    refresh();
  };
  screen.orientation?.addEventListener('change', rotate);
  window.addEventListener('orientationchange', rotate);
  window.addEventListener('blur', () => {
    focused = false;
    rebaseNext = true;
    latest = null;
    orientationTracker.reset();
    refresh();
  });
  window.addEventListener('focus', () => {
    focused = true;
    rebaseNext = true;
    refresh();
  });
  document.addEventListener('visibilitychange', () => {
    rebaseNext = true;
    latest = null;
    orientationTracker.reset();
    refresh();
  });
  const navigation = new MutationObserver(refresh);
  navigation.observe(stage, {
    attributes: true,
    attributeFilter: ['class', 'data-phase'],
  });
  navigation.observe(sheet, { attributes: true, attributeFilter: ['hidden'] });
  refresh();
  return {
    refresh,
    prepareCast,
    useManualControl,
    controlPoint: (): HookPoint | null => (canHook() ? { ...hookPoint } : null),
  };
}
