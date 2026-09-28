type SensorState = 'waiting' | 'delayed' | 'ready' | 'unavailable';
export const THROW_WINDOW_SECONDS = 4;
export type OffReason =
  | 'initial'
  | 'disabled'
  | 'insecure'
  | 'denied'
  | 'error'
  | 'unsupported'
  | 'rotated';
export type MotionMode =
  | { kind: 'off'; reason: OffReason }
  | { kind: 'requesting' }
  | {
      kind: 'on';
      orientation: SensorState;
      motion: SensorState;
      calibration: 'initial' | 'required' | 'done';
    };

const offMessages: Record<OffReason, { detail: string; summary: string }> = {
  initial: {
    detail: '可选：倾斜手机瞄准，准备后向前甩竿。滑杆与蓄力按钮始终可用。',
    summary: '按住按钮蓄力，松开抛竿',
  },
  disabled: {
    detail: '体感已关闭。可继续使用滑杆与蓄力按钮。',
    summary: '按住按钮蓄力，松开抛竿',
  },
  insecure: {
    detail: '体感需要 HTTPS 安全连接。当前仍可用滑杆与蓄力按钮。',
    summary: '需要 HTTPS · 当前继续用按钮',
  },
  denied: {
    detail: '体感未获授权。可继续使用滑杆与蓄力按钮。',
    summary: '未获授权 · 继续用按钮',
  },
  error: {
    detail: '暂时无法启用体感。可继续使用滑杆与蓄力按钮。',
    summary: '无法启用体感 · 继续用按钮',
  },
  unsupported: {
    detail: '此浏览器不支持体感。继续用按钮钓鱼，也可拖动滑杆瞄准。',
    summary: '设备不支持体感 · 继续用按钮',
  },
  rotated: {
    detail: '屏幕方向已改变，请重新启用体感，或使用蓄力按钮。',
    summary: '屏幕方向改变 · 继续用按钮',
  },
};

/** Both status surfaces describe the same state; copy never determines capabilities. */
export function modeMessages(mode: MotionMode) {
  if (mode.kind === 'off') return offMessages[mode.reason];
  if (mode.kind === 'requesting')
    return { detail: '正在请求体感权限…', summary: '正在请求体感权限…' };
  if (mode.calibration === 'required')
    return {
      detail: '屏幕方向已改变，请保持姿势并点击校准。',
      summary: '姿势改变，请点右上角校准',
    };
  const delayed = mode.orientation === 'delayed' || mode.motion === 'delayed';
  let detail = delayed
    ? '尚未收到有效读数，仍在等待；可继续使用滑杆与蓄力按钮。'
    : '等待传感器读数…滑杆与蓄力按钮仍可使用。';
  let summary = delayed
    ? '仍在等待读数 · 按钮可用'
    : '已获授权 · 等待传感器读数';
  if (mode.orientation === 'ready' && mode.motion === 'ready') {
    detail = `已启用。左右 / 前后倾斜瞄准；点「准备抛竿」后 ${THROW_WINDOW_SECONDS} 秒内向前甩动。`;
    summary = '体感已生效 · 倾斜瞄准 / 准备后甩竿';
  } else if (mode.orientation === 'ready') {
    detail =
      mode.motion === 'unavailable'
        ? '倾斜瞄准可用；甩竿读数不可用，请用按钮蓄力抛竿。'
        : mode.motion === 'delayed'
          ? '倾斜瞄准已启用；甩竿仍在等待有效读数，可用按钮抛竿。'
          : '倾斜瞄准已启用；正在等待甩竿读数，仍可按住按钮蓄力。';
    summary = '倾斜瞄准生效 · 也可按钮蓄力';
  } else if (mode.motion === 'ready') {
    detail =
      mode.orientation === 'delayed'
        ? '甩竿读数有效；倾斜瞄准仍在等待有效读数，可用滑杆瞄准。'
        : `甩竿读数有效，可用滑杆瞄准；点「准备抛竿」后 ${THROW_WINDOW_SECONDS} 秒内向前甩动。`;
    summary = '甩竿读数有效 · 先准备抛竿';
  }
  if (mode.calibration === 'done') {
    detail = `已按当前握姿校准；抛竿前校准会让落点回到水面中央。${detail}`;
    summary = `已校准 · ${summary}`;
  }
  return { detail, summary };
}
