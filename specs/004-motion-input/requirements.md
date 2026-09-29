# 004 体感瞄准、甩竿与提竿

- 状态：已被 [030](../030-fishing-gestures/requirements.md) 取代（旧的倾斜预瞄、加速度甩竿、二维稳定提竿已移除）
- 来源：原型需求；界面契约见 [界面与输入](../../docs/ui-layout.md#体感操作面板)

## 需求

体感默认关闭，主动开启后：倾斜预瞄与校准、明确准备后在 4 秒窗口内甩竿生成力度、咬钩时把二维光点保持在圆内完成提竿。拒绝权限、非 HTTPS、无传感器或无读数时保留完整手动玩法；可选震动。

## 验收标准与证据

| 标准                                             | 证据                                                                         |
| ------------------------------------------------ | ---------------------------------------------------------------------------- |
| 连续姿态跨 Euler 边界不反向；校准重新建立基准    | `tests/unit/orientation.test.ts`、`tests/e2e/fishing-motion.spec.ts`         |
| 圆内连续稳定 tick 才提竿，离圈清零，由 Core 判定 | `tests/unit/motion-control.test.ts`、`tests/unit/motion-target.test.ts`      |
| 部分权限、延迟读数、关闭体感后手动可完成同一竿   | `tests/e2e/motion-recovery.spec.ts`、`tests/e2e/fishing-hook-motion.spec.ts` |
| 中途保存的稳定进度可续玩                         | `tests/integration/motion-save.test.ts`                                      |
| 关闭震动或不支持震动不影响玩法                   | `tests/view/fishing-buttons.test.ts`                                         |

## 未完成 / 限制

- 真实 Safari 权限弹窗、传感器方向与手感**未实机验证**；自动化只注入模拟读数。见 [020](../020-device-polish/requirements.md)。
