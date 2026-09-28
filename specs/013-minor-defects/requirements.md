# 013 规则与平台小缺陷

- 状态：完成（PR #3；推送前本地完整门禁通过）
- 来源：2026-09-28 代码检视

| 问题                                                                | 处理                                                                                                                        | 证据                                                     |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Pepper 按行序出生在地图左上角，常在锁定的湖边                       | 出生在离起始十字路口最近的空闲可走格，与 Mochi 规则一致                                                                     | `tests/unit/city-map.test.ts`                            |
| `currentActivity` 只写不读、语义混乱                                | 与 `relationships`、`favoritePlaces`、`dailyRoutine`、`needs.social` 同为只写占位，全部删除；saveVersion 12，v11 按旧档拒绝 | `tests/integration/save.test.ts`、`legacy-saves.test.ts` |
| 有猫在钓鱼时 `TRAVEL_TO_FISHING_SPOT` 对所有猫拒绝                  | 只拒绝正在钓鱼的猫，与 `WALK_CAT` 一致                                                                                      | `tests/unit/fishing-travel.test.ts`                      |
| 体力已满时仍发出 `EnergyRecovered`                                  | 只在体力实际增加时发出                                                                                                      | `tests/unit/cat-rest.test.ts`                            |
| 金币到上限后时间推进被拒绝，时间停止                                | 营业收入在上限处封顶，时钟照常推进                                                                                          | `tests/unit/world.test.ts`、`fishing-travel.test.ts`     |
| 只报告 `accelerationIncludingGravity` 的 Android 设备等不到甩竿读数 | 不单独修复：[030](../030-fishing-gestures/requirements.md) 改用陀螺仪角速度识别甩竿                                         | —                                                        |
| iOS 缺 `viewport-fit=cover`，安全区样式不生效                       | `index.html` 加 `viewport-fit=cover`                                                                                        | 实机待验证（020）                                        |
| 长按收线键可能弹出 iOS 系统菜单                                     | 控制键禁用 touch callout 与 contextmenu                                                                                     | 实机待验证（020）                                        |

每项规则修复先写失败测试，确认失败后再修复。
