# 036 关系等级

- 状态：验证中
- 后续：门槛数值、每游戏小时一次的上限与每次 +1 已由 [038 成长数值](../038-growth-numbers/requirements.md) 取代；下文记录的是本片当时的规则。
- 来源：2026-09-29 玩法评审：关系循环是[愿景](../../docs/vision.md)的核心，但 `playerBond` 只在聊天与送鱼时每游戏小时 +1，没有任何界面显示它、没有任何规则读取它；猫咪面板只有固定文案"慢慢熟悉中"。用户确认本片范围：看得见的关系等级（一个小循环）。

## 规则（数值在 `content/care.ts`、`content/mood.ts`）

| 等级 | 达到所需 `playerBond` | 心情平静点 |
| ---- | --------------------- | ---------- |
| 初识 | 0                     | 60         |
| 熟悉 | 5                     | 63         |
| 信任 | 15                    | 66         |
| 亲密 | 30                    | 69         |
| 家人 | 60                    | 72         |

- 等级由 `playerBond` 用纯函数 `bondLevel` 推导，不新增存档字段，saveVersion 不变（17）。
- 关系增长来源：聊天、送鱼、和这只猫一起钓到鱼，三者共用每游戏小时一次的上限（`rewardBond`），每次 +1。补给（罐头、金币袋）、垃圾、鱼跑了、主动收竿都不增长。
- 只奖励不惩罚：初识以上每一级把这只猫的心情平静点（`MOOD.rest`，60）提高 3（`moodRest`）。每整点仍向平静点靠拢 2、不越过；关系低与今天完全相同，任何时候都不扣关系、不扣心情。平静点最高 72（住在家旁稳定在 73），仍低于开心线 80：开心仍要靠一起做事，只是更容易到。
- 规则对话：闲聊在心情档位的那句之后，按等级加一句收尾（初识不加，与今天一致）；事实回忆不变。

## 界面

- 「猫咪」面板名册卡显示一行"♥♡♡♡ 熟悉"；「说说话」页显示爱心、等级名、到下一级的进度条和"距「信任」还差 8"，家人显示满条和"已经是一家人了"。读屏读 `关系：熟悉，距「信任」还差 8`。
- 去掉固定文案"慢慢熟悉中"；回忆文字与「共同回忆」页不变。
- 达到新等级时提示一次"和 Mochi 更熟了：信任"：跟在促成它的那条消息后面（聊天提示、送礼提示、钓鱼结果与结果卡），和心情变化的做法相同，由命令前后两个快照比较得出；读档、刷新不重播。聊天时猫咪面板盖住提示条，所以「说说话」页的进度下方同时显示这一句，下一次聊天时换掉。

## 节奏

关系每游戏小时最多 +1，1× 速度下 1 游戏小时 = 现实 1 分钟（钓鱼中固定 1×）。玩家每小时都做一件算数的事时，从零开始最快：熟悉约 4 分钟、信任约 14 分钟、亲密约 29 分钟、家人约 59 分钟（第一次不用等，所以是 `门槛 − 1` 小时）；城市里开 4× 时为四分之一。用户 2026-09-29 指出数值不能很快填满：门槛只在 `BOND_LEVELS` 一张表里，测试只读这张表、不写死数值，改表即可重新调整；最终数值由后续一片确定，本片保留 0/5/15/30/60。

## 不做

- 不新增存档字段、不做迁移；不加关系下降、离线衰减或内疚台词。
- 等级不解锁内容、不改钓鱼难度与收益；不为等级加新的 Core 事件。
- 不重构 `view/companion/journal.ts`。

## 验收

- 单测：等级门槛与名称、每级边界；钓到鱼 +1 且与聊天/送礼共用冷却；补给、垃圾、失败、取消不增长；各等级平静点、漂移不越过、不比旧规则低、分块推进等价、存档往返字段不变。
- 模拟：随机命令序列下关系每次只 +1，且只来自聊天、送礼、一竿结束。
- 界面模型：`bondBadge`、`bondNote`、`outcomeNote` 纯函数单测；View 测试台检查面板显示、三种来源的提示、重载不重播。
- 对话：每级一句且互不相同、初识与今天一致、事实回忆不随等级变化。

## 进度

- [x] Core（2026-09-29，分支 `feat/bond-levels`）：`BOND_LEVELS`、`bondLevel`（`content/care.ts`），`MOOD.restPerBondLevel`、`moodRest`（`content/mood.ts`），整点漂移按每只猫的平静点（`core/simulation.ts`）。钓到鱼调用 `rewardBond` 在基线代码里已存在（`core/fishing/commands.ts`），本片只补测试。测试：`tests/unit/bond.test.ts`、`tests/unit/angling.test.ts`（补给）、`tests/unit/fishing-failure.test.ts`（失败与垃圾）、`tests/simulation/invariants.test.ts`。
- [x] 界面：纯模型 `view/shell/bond.ts`，`toViewModel` 带 `bondBadge`；名册卡（`view/fishing/stage.ts`）、「说说话」页 `#bond-level`（`view/shell/panel.ts`）；提示接在聊天、送礼、钓鱼结果后。测试：`tests/unit/bond-view.test.ts`、`tests/view/cat-bond.test.ts`。
- [x] 对话：`DialogueContext.cat` 带 `playerBond`，`providers/rule-dialogue.ts` 的 `CLOSER_TALK`。测试：`tests/integration/rule-dialogue.test.ts`、`tests/integration/session.test.ts`。
- [ ] 完整 Gate 与 Harness（由用户统一运行）；截图 `artifacts/bond-levels/cat-panel-talk-390x844.png` 已查看。
- 已知限制：闲聊轮换取最近 5 条记忆的条数，聊满 5 条后同一档位固定在同一句（本片之前就如此），所以等级那句用"加在后面"而不是加入轮换。
