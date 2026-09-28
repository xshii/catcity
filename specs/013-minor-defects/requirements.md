# 013 规则与平台小缺陷

- 状态：提出
- 来源：2026-09-28 代码检视

| 问题                                                                              | 位置                                      |
| --------------------------------------------------------------------------------- | ----------------------------------------- |
| Pepper 按行序出生在地图左上角，常在锁定的湖边，不在起始区域                       | `core/fishing/commands.ts` INVITE_PEPPER  |
| `currentActivity` 语义混乱：步行结束设为 `resting`，`chatting` 从不清除，且不校验 | `core/city/walking.ts`、`core/reducer.ts` |
| 有猫在钓鱼时 `TRAVEL_TO_FISHING_SPOT` 对所有猫拒绝，`WALK_CAT` 只拒绝钓鱼的猫     | `core/fishing/travel.ts`                  |
| 体力已满时仍发出 `EnergyRecovered` 事件                                           | `core/simulation.ts`                      |
| 金币接近上限时所有产生收入的时间推进失败，时间停止                                | `core/world.ts`                           |
| 只报告 `accelerationIncludingGravity` 的 Android 设备永远等待甩竿读数             | `view/fishing/motion.ts`                  |
| iOS 缺 `viewport-fit=cover`，安全区样式不生效                                     | `index.html`                              |
| 长按收线键可能弹出 iOS 系统菜单                                                   | `view/styles/base.css`                    |

每项修复先写复现测试。
