# 003 钓鱼小游戏

- 状态：验证中
- 来源：原型需求；规则见 [钓鱼设计](../../docs/fishing-design.md)，数值见 `src/content/fishing/spec.ts`

## 需求

到真实岸边才能开钓。一竿：选饵和两轴落点 → 蓄力抛投 → 绿区提竿 → 张力遛鱼 → 结算。8 种鱼覆盖 0–5 星，4 处水域按钓技与图鉴逐步解锁；鱼获可出售或赠送，失败可能得到垃圾，面包轻抛可能钓到补给。

## 验收标准与证据

| 标准                                                         | 证据                                                                   |
| ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| 结果只由输入与种子推导，拒绝伪造结果；每竿只扣一次体力和鱼饵 | `tests/unit/angling.test.ts`、`tests/unit/cast-input.test.ts`          |
| 取消、超时、断线不给鱼；失败垃圾只结算一次                   | `tests/unit/fishing-failure.test.ts`                                   |
| 各水域鱼池、品种资格、体长范围与纪录                         | `tests/unit/fish-catalog.test.ts`、`tests/unit/fishing-travel.test.ts` |
| 解锁由经验和图鉴推导；饵和方向改变鱼种                       | `tests/unit/angling.test.ts`、`tests/e2e/game.spec.ts`                 |
| 收线结束的触摸抬起不会穿透开下一竿                           | `tests/e2e/fishing-landing.spec.ts`                                    |
| 30 游戏日钓/卖/休循环无异常值，可回放                        | `tests/simulation/angling.test.ts`                                     |
