# 000 任务

每项勾选时写验证证据。基线：`8fd37e3`（Codex 原型快照），回归修复 `a703c88`。

## 0 基线

- [x] 修复池塘边出生导致的 E2E 回归（`fishing-scene.spec.ts:180`）— 该文件 4/4 通过

## 1 规格集中与魔鬼数字/字符串

- [ ] 新建 `src/content/fishing-spec.ts`，迁移 `minigames/angling.ts`、`core/fishing/*`、`content/fish.ts` 中的数值
- [ ] View 中的体力消耗、罐头恢复、垃圾回收、休息恢复等文案读取规格
- [ ] 城市/休息/关系/世界上限数值集中（`content/city.ts` 与 Core 常量）
- [ ] 错误码类型化；View 错误提示表按类型检查
- [ ] 修正与规则矛盾的鱼类/鱼饵线索文案；删除未使用的 `FISH[].bait`

## 2 删冗余、合并重复

- [ ] 删除 `core/clock.ts`、`World.build/advanceTime/interact`、不可达的 `BREED_REQUIRED`
- [ ] 调试命令移出生产命令 schema
- [ ] 合并：已发现鱼种数、岸边判断、单竿种子公式、View 的到岸判断与收入推算
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
