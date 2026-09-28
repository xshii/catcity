# 000 任务

每项勾选时写验证证据。基线：`8fd37e3`（Codex 原型快照），回归修复 `a703c88`。

## 0 基线

- [x] 修复池塘边出生导致的 E2E 回归（`fishing-scene.spec.ts:180`）— 该文件 4/4 通过

## 1 规格集中与魔鬼数字/字符串

- [x] 钓鱼配置与逻辑分离：`content/fishing/{spec,catalog,rules}.ts`，`minigames/angling.ts` 与 `core/fishing/*` 数值改读规格 — `485c821`，typecheck/lint/187 测试通过
- [ ] View 中的体力消耗、罐头恢复、垃圾回收、休息恢复等文案读取规格
- [~] 休息/关系/聊天上限 → `content/care.ts`；世界上限 → `core/limits.ts`（`485c821`）。剩余：地图尺寸与起始区域（`city/map.ts`、`path.ts`、`validation.ts`）、起始金币
- [ ] 错误码类型化；View 错误提示表按类型检查
- [x] 线索文案按真实遭遇规则重写并引用规格阈值；删除 `FISH[].bait` — `485c821`

## 2 删冗余、合并重复

- [~] 已删不可达 `BREED_REQUIRED`（`485c821`）。剩余：`core/clock.ts`、`World.build/advanceTime/interact`
- [ ] 调试命令移出生产命令 schema
- [~] 已合并已发现鱼种数（`discoveredSpecies`/`spotOpen`）、岸边判断（`onShore`）、单竿种子（`runSeed`）、RNG 流盐值（`streamSeed`），Core 与 View 共用 — `485c821`、`91cb458`。剩余：`fishing/validation.ts` 两处种子公式、View 收入推算
- [ ] 删除无引用 CSS；Session 构造器中重复的运行时类型检查

## 3 目录归位

- [ ] 体感 → `src/view/motion/`
- [ ] 美工 → `src/view/art/`（城市/河景/猫绘图与调色板）
- [ ] `MockDialogueProvider` → `tests/helpers/`

## 4 存档冗余字段（saveVersion 11）

- [ ] 先写测试：v10 存档被拒绝；v11 精确往返
- [ ] 删除 `rngState` 与可推导字段，校验改为推导

## 5 测试瘦身与提速

- [ ] 旧存档拒绝用例合并为表驱动测试
- [ ] 体感模式映射下沉到单元测试，E2E 每条路径保留一例
- [ ] `game.spec.ts` 解锁用例从预制存档起步
- [ ] Playwright 并行；去掉重复构建

## 6 收尾

- [ ] `npm run check`、`npm run harness`，查看截图
- [ ] 文档与代码一致（architecture、testing、fishing-design、src/README）
