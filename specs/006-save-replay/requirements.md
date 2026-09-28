# 006 存档、回放与旧档拒绝

- 状态：验证中
- 来源：原型需求与 AGENTS 约定；契约见 [架构 · 存档契约](../../docs/architecture.md#存档契约)

## 需求

成功操作自动保存，也可显式保存；当前版本存档精确往返，并能续玩进行中的步行、休息和钓鱼。旧版、损坏、未来版本存档被拒绝并保留原数据，只有玩家显式重置才创建新世界，不做迁移。同初始存档与命令可确定性回放。

## 验收标准与证据

| 标准                                           | 证据                                                                                                           |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 全部状态往返，续走/续钓/续休息                 | `tests/integration/save.test.ts`、`tests/integration/city-save.test.ts`、`tests/integration/cast-save.test.ts` |
| v1–v9 与伪装字段被拒绝，原数据保留到显式重置   | `tests/integration/*-save.test.ts`、`tests/unit/legacy-removal.test.ts`、`tests/e2e/game.spec.ts`              |
| 损坏存档不被覆盖且玩家可见错误                 | `tests/e2e/game.spec.ts`                                                                                       |
| 回放复现结果、检测篡改；回放窗口滚动保持可回放 | `tests/integration/replay.test.ts`                                                                             |

## 已知缺陷

- 写入失败也会显示"清除旧存档"按钮；多标签页互相覆盖；存档可伪造进行中一竿的结果。见 [010](../010-save-safety/requirements.md)。
