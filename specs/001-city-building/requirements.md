# 001 城市地图与建设

- 状态：验证中
- 来源：原型需求（`docs/game-design.md`、`docs/city-world.md`）；池塘边出生来自用户 2026-09-28
- 规则细节：[城市与步行](../../docs/city-world.md)

## 需求

种子生成的 10×10 城市，玩家从 1000 金币起步：买地、铺土路/升级石路、建造与搬移猫咖和猫公寓、为猫登记住所；猫咖按游戏时间产生收入。新世界的 Mochi 出生在池塘岸边的未购买草地，可直接进入钓点。

## 验收标准与证据

| 标准                                                      | 证据                                                          |
| --------------------------------------------------------- | ------------------------------------------------------------- |
| 同种子地图可复现；起始土地干燥、所有水域可达              | `tests/unit/city-map.test.ts`                                 |
| 先买地后建设；建筑自动连路，失败整次回滚不扣费            | `tests/unit/city-loop.test.ts`                                |
| 公寓最多 2 只猫登记；道路铺设/升级只扣一次                | `tests/unit/city-loop.test.ts`                                |
| 每家猫咖独立累计收入，搬移保留收入进度与住所引用          | `tests/unit/city-loop.test.ts`、`tests/unit/world.test.ts`    |
| 新世界 Mochi 在未购买的池塘岸边（种子 0–127），可立即钓鱼 | `tests/unit/city-map.test.ts`、`tests/e2e/city-input.spec.ts` |
| 真实格子点击完成购地、铺路、建造、搬移                    | `harness/tasks/city-loop.ts`、`tests/e2e/game.spec.ts`        |

## 未完成 / 限制

- 没有建筑拆除、升级和路面降级。
- 有效存档没有"新开一城"入口，见 [024](../024-new-city/requirements.md)。
