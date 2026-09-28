# 000 任务

每项勾选时写验证证据。基线：`8fd37e3`（Codex 原型快照），回归修复 `a703c88`。

## 0 基线

- [x] 修复池塘边出生导致的 E2E 回归（`fishing-scene.spec.ts:180`）— 该文件 4/4 通过

## 1 规格集中与魔鬼数字/字符串

- [x] 钓鱼配置与逻辑分离：`content/fishing/{spec,catalog,rules}.ts`，`minigames/angling.ts` 与 `core/fishing/*` 数值改读规格 — `485c821`，typecheck/lint/187 测试通过
- [x] View 文案（体力、罐头、垃圾、休息、鱼饵价格、等待/快进）与步行体力读取规格 — `e6e9bb7`
- [~] 休息/关系/聊天上限 → `content/care.ts`；世界上限 → `core/limits.ts`（`485c821`）。剩余：地图尺寸与起始区域（`city/map.ts`、`path.ts`、`validation.ts`）、起始金币
- [x] 错误码类型化（`ErrorCode` 联合类型），钓鱼错误提示表按类型检查，`talk()` 单列前置错误 — `e6e9bb7`、`e93e208`
- [x] 线索文案按真实遭遇规则重写并引用规格阈值；删除 `FISH[].bait` — `485c821`

## 2 删冗余、合并重复

- [x] 删除不可达 `BREED_REQUIRED`、`core/clock.ts`；`World.build/advanceTime/interact` 移到 `tests/helpers/world.ts`
- [x] 删除未使用的 `DEBUG_ADD_COINS`。`DEBUG_SPAWN_CAT` 保留：单元测试用它摆放多猫，移出生产 schema 需要调试专用 dispatch 与回放路径，收益低
- [x] 已合并已发现鱼种数（`discoveredSpecies`/`spotOpen`）、岸边判断（`onShore`）、单竿种子（`runSeed`）、RNG 流盐值（`streamSeed`），Core 与 View 共用 — `485c821`、`91cb458`。校验器种子公式也已改用 `runSeed`。View 收入推算不改：单一消费者、一行公式，去重需新增 Core 公共 API
- [x] 删除无引用 CSS（`.building-summary`、`.mini-house`、`.sun`）。`chat-page-*`、`city-panel-cats` 为动态拼接，保留。Session 构造器的运行时检查保留：`session-injection.test.ts` 验证它拒绝旧的位置参数调用

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
