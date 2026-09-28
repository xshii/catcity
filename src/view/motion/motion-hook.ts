import { motionTarget, type AnglingRun } from '../../minigames/angling';
import './motion-hook.css';

export interface HookPoint {
  x: number;
  y: number;
}

/** Presents the same target and stability counter that the simulation validates. */
export function mountMotionHook(stage: HTMLElement) {
  const guide = document.createElement('section');
  guide.id = 'motion-hook-guide';
  guide.hidden = true;
  guide.setAttribute('aria-label', '二维体感提竿');
  guide.innerHTML = `<div id="motion-hook-pad" role="img" aria-label="倾斜手机，把准星移入圆圈">
    <span id="motion-hook-target"></span><i id="motion-hook-dot"></i>
  </div><div class="motion-hook-copy"><strong>倾斜入圈 · 稳住提竿</strong>
    <span id="motion-hook-status" role="status"></span>
    <progress id="motion-hook-progress" aria-label="提竿稳定进度"></progress>
    <small id="motion-hook-hint"></small>
  </div>`;
  stage.append(guide);
  const get = <T extends HTMLElement>(id: string) =>
    guide.querySelector<T>(`#${id}`)!;
  const pad = get('motion-hook-pad');
  const circle = get('motion-hook-target');
  const dot = get('motion-hook-dot');
  const status = get('motion-hook-status');
  const progress = get<HTMLProgressElement>('motion-hook-progress');
  const hint = get('motion-hook-hint');
  return {
    render(
      run: AnglingRun | null,
      point: HookPoint,
      visible: boolean,
      paused: boolean,
    ) {
      const shown = visible && run?.phase === 'hook';
      guide.hidden = !shown;
      stage.dataset.motionHook = String(shown);
      if (!shown) return;
      const target = motionTarget(run);
      const inside =
        (point.x - target.x) ** 2 + (point.y - target.y) ** 2 <=
        target.radius ** 2;
      guide.dataset.inside = String(inside);
      circle.style.left = `${target.x}%`;
      circle.style.top = `${target.y}%`;
      circle.style.width = circle.style.height = `${target.radius * 2}%`;
      circle.dataset.radius = String(target.radius);
      circle.dataset.holdTicks = String(target.holdTicks);
      dot.style.left = `${point.x}%`;
      dot.style.top = `${point.y}%`;
      dot.dataset.x = String(point.x);
      dot.dataset.y = String(point.y);
      pad.setAttribute(
        'aria-label',
        `准星横向 ${point.x}，纵向 ${point.y}，${inside ? '圈内' : '圈外'}`,
      );
      progress.max = target.holdTicks;
      progress.value = run.motionStableTicks;
      status.textContent = paused
        ? '已暂停 · 可调整姿势或校准'
        : inside
          ? `圈内，稳住 · ${Math.round((run.motionStableTicks / target.holdTicks) * 100)}%`
          : '圈外 · 左右、前后倾斜';
      hint.textContent = `入圈保持 ${(target.holdTicks / 20).toFixed(1)} 秒；也可用下方按钮提竿`;
    },
  };
}
