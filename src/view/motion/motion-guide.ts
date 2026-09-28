import { THROW_WINDOW_SECONDS, type MotionMode } from './motion-state';
import './motion-guide.css';

interface MotionGuideState {
  mode: MotionMode;
  phase: string;
  visible: boolean;
  direction: number;
  depth: number;
  power: number;
  armed: boolean;
  canThrow: boolean;
  canHook: boolean;
  zone: { low: number; high: number };
}

function guideCopy({ mode, phase, armed, canThrow }: MotionGuideState) {
  if (mode.kind !== 'on')
    return {
      title: '体感连接中',
      step: '请允许传感器权限，稍等手机读数',
      capability: '按钮操作始终可用',
    };
  if (mode.calibration === 'required')
    return {
      title: '体感待校准',
      step: '屏幕方向改变，请点右上角「校准」',
      capability: '保持当前握姿，重新校准后继续',
    };
  const aim = mode.orientation === 'ready';
  const flick = mode.motion === 'ready';
  if (!aim && !flick)
    return {
      title: '体感连接中',
      step: '等待手机读数，按钮操作仍可用',
      capability: '收到读数后会显示瞄准点与甩竿引导',
    };
  const capability =
    aim && flick
      ? '倾斜瞄准 / 向前甩竿'
      : aim
        ? '仅倾斜瞄准可用 · 请用按钮抛竿'
        : '仅甩竿可用 · 请用滑杆瞄准';
  return {
    title:
      phase === 'charge' && flick ? '体感甩竿' : aim ? '体感瞄准' : '体感甩竿',
    step:
      phase === 'charge'
        ? canThrow
          ? armed
            ? `落点锁定→${THROW_WINDOW_SECONDS}秒内向前甩，力度随动作变化`
            : `落点锁定→点准备甩竿→${THROW_WINDOW_SECONDS}秒内向前甩`
          : '落点锁定→按住按钮蓄力，松开抛投'
        : aim
          ? flick
            ? '倾斜瞄准→点准备抛竿后直接向前甩'
            : '倾斜瞄准→点准备抛竿'
          : '拖动瞄准滑杆→点准备抛竿',
    capability,
  };
}

function controlLabel(
  phase: string,
  canThrow: boolean,
  canHook: boolean,
): string {
  if (phase === 'charge')
    return canThrow ? '按钮蓄力（备用）' : '按住蓄力 · 松开抛投';
  if (phase === 'hook') return canHook ? '切回按钮提竿' : '进入绿色 → 按下提竿';
  if (phase === 'fight') return '按住收线 · 松开放线';
  return '等待咬钩…';
}

/** Sensor feedback is a view of input state; it never issues game commands. */
export function mountMotionGuide(stage: HTMLElement) {
  const guide = document.createElement('section');
  guide.id = 'motion-guide';
  guide.hidden = true;
  guide.setAttribute('aria-label', '体感操作引导');
  guide.innerHTML = `<div class="motion-aim-map" aria-hidden="true">
    <span class="motion-aim-far">远</span><span class="motion-aim-near">近</span>
    <i id="motion-aim-dot"></i>
  </div><div class="motion-guide-copy">
    <div class="motion-guide-heading"><strong id="motion-guide-title" role="status"></strong><span id="motion-power-value"></span></div>
    <span id="motion-aim-value"></span>
    <p id="motion-guide-step"></p><small id="motion-guide-capability"></small>
    <div id="motion-power-meter" role="meter" aria-label="抛竿力度" aria-valuemin="0" aria-valuemax="100"><span id="motion-power-green"></span><i id="motion-power-cursor"></i></div>
  </div>`;
  stage.append(guide);
  const get = <T extends HTMLElement>(id: string) =>
    guide.querySelector<T>(`#${id}`)!;
  const title = get('motion-guide-title');
  const aim = get('motion-aim-value');
  const dot = get('motion-aim-dot');
  const step = get('motion-guide-step');
  const capability = get('motion-guide-capability');
  const powerText = get('motion-power-value');
  const powerMeter = get('motion-power-meter');
  const powerGreen = get('motion-power-green');
  const powerCursor = get('motion-power-cursor');
  const label = stage.querySelector<HTMLElement>('#control-label')!;
  const write = (element: HTMLElement, text: string) => {
    if (element.textContent !== text) element.textContent = text;
  };
  return {
    render(state: MotionGuideState) {
      const visible =
        state.visible &&
        state.mode.kind !== 'off' &&
        (state.phase === 'ready' || state.phase === 'charge');
      guide.hidden = !visible;
      guide.dataset.phase = state.phase;
      stage.dataset.motionGuide = String(visible);
      write(label, controlLabel(state.phase, state.canThrow, state.canHook));
      if (!visible) return;
      const direction = Math.round(
        Math.max(-45, Math.min(45, state.direction)),
      );
      const depth = Math.round(Math.max(0, Math.min(100, state.depth)));
      const power = Math.round(Math.max(0, Math.min(100, state.power)));
      const copy = guideCopy(state);
      write(title, copy.title);
      write(step, copy.step);
      write(capability, copy.capability);
      write(
        aim,
        `方向 ${direction === 0 ? '正前方' : `${direction < 0 ? '左' : '右'} ${Math.abs(direction)}°`} · 远近 ${depth}%`,
      );
      dot.style.left = `${8 + ((direction + 45) / 90) * 84}%`;
      dot.style.top = `${92 - depth * 0.84}%`;
      guide.dataset.armed = String(state.armed);
      powerText.hidden = state.phase !== 'charge';
      powerMeter.hidden = state.phase !== 'charge';
      write(powerText, `${power}% 力度`);
      powerMeter.setAttribute('aria-valuenow', String(power));
      powerMeter.setAttribute(
        'aria-valuetext',
        `${power}% 力度，绿色目标 ${state.zone.low}–${state.zone.high}%`,
      );
      powerGreen.style.left = `${state.zone.low}%`;
      powerGreen.style.width = `${state.zone.high - state.zone.low}%`;
      powerCursor.style.left = `${power}%`;
    },
  };
}
