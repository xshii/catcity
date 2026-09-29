# 工程架构

**Game Core 是真相；Phaser 负责呈现；AI 提交建议。** 世界只通过验证后的命令改变。实现使用 TypeScript strict、Phaser、Vite、Vitest 与 Playwright，单一 npm 工程，不引入 ECS、依赖注入容器、通用事件溯源框架或空 Provider 注册表。

## 目录与责任

| 位置                                     | 责任与边界                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| `src/core/`                              | World、命令/状态 schema、统一时钟、RNG、模拟与关系规则；纯 TypeScript          |
| `src/core/city/`                         | 地图、建设、寻路、行走、城市状态校验                                           |
| `src/core/fishing/`                      | 钓鱼命令、旅行资格、结果结算、持久状态与校验                                   |
| `src/content/`                           | 定义与调参：`fishing/{spec,catalog,rules}`、`city`、`care`、`cats`；与实例分离 |
| `src/minigames/angling.ts`               | 独立纯钓鱼模拟：输入状态和整数 tick，输出下一状态，不访问主世界                |
| `src/application/`                       | GameSession、依赖端口、存储协调、命令记录、对话 Provider 编排与提案校验        |
| `src/providers/`、`src/platform/`        | 规则/Mock 对话；浏览器保存、新世界种子和可选实机调试日志适配                   |
| `src/view/city/`、`src/view/fishing/`    | 城市和钓鱼交互、面板与只读状态呈现                                             |
| `src/view/motion/`                       | 可选体感：权限、倾斜预瞄、甩竿、二维提竿与姿态解缠                             |
| `src/view/art/`                          | 美工：城市地图、河景、猫的 Phaser 绘制与 SVG 插画、鱼的配色                    |
| `src/view/shell/`、`src/view/companion/` | 应用装配、导航、布局/ViewModel；事实回忆                                       |
| `src/view/styles/base.css`               | 共用视觉基础；玩法布局样式留在对应 View 模块                                   |
| `src/debug/`                             | 仅开发/测试存在的观察桥与验证后调试命令                                        |
| `harness/runner/`、`adapters/`、`tasks/` | 通用执行/证据/发布；游戏适配；验收契约，入口 `harness/run.ts`                  |
| `tests/`                                 | 按 unit / simulation / integration / e2e 分层，旧存档仅作拒绝 fixture          |

`src/main.ts` 注入具体依赖并连接 View、Debug 与平台时间。`src/view/index.ts` 的 `mountGameView(session)` 封装 Phaser/面板装配。Core/content 不依赖 DOM、Phaser、网络、真实时钟、模型 SDK、全局单例或 `Math.random()`。View 不拥有可变世界引用；快照不能写回世界。

## 公共入口与依赖反转

跨层使用 `core/index.ts`、`core/city/index.ts`（只读地图查询）、`application/index.ts` / `ports.ts` 与 `view/index.ts` 的小入口。显式导出实际消费者需要的 API，不使用 `export *` 堆积内部实现，不为旧路径保留转发。View 子目录直接引用明确文件，避免层层 barrel 带来的装配循环；目录导航见 [src/README](../src/README.md)。

`application/ports.ts` 定义保存和对话接口。`GameSession` 通过必填 `{ repository, dialogue, fallbackDialogue, seed }` 注入依赖，不导入或创建规则 Provider，也不默认决定种子。`main` 选择浏览器存储、规则/Mock/未来实现；测试注入受控实现。只使用普通 TypeScript 接口与构造参数，不引入反射、Singleton 或 DI 框架。

## 状态与数据流

玩家输入 → GameSession → 命令 schema/规则校验 → Core 修改实例并生成结构化事件 → 快照 → ViewModel/Phaser/DOM。

`WorldState` 保存金币、地图格子、建筑实例、猫实体、游戏分钟、种子/ID 计数及钓鱼进度；只存事实，可推导的值（营业余数、体力恢复时刻）不入档。`map.tiles` 是地形、土地归属和路面的唯一依据。猫的身份、位置、体力、住所、路线、首钓记忆、赠鱼与聊天事实均在 Core。`fishingSpotId` 提供已到达地点上下文，开钓仍检查实际岸边坐标、路线和解锁条件。

Core 派生资源消耗、奖励和关系变化，不接受客户端自报鱼种、价格、分数或亲密度。命令拒绝必须保持金币、地图、实体、计数器和 RNG 完全不变。诊断轨迹在 Application，不能用事件日志代替存档。

场景选择、当前面板、分页、镜头、预瞄、按住状态、输入暂停、动画、传感器权限属于 View。钓鱼画面的可切换状态集中在 `view/fishing/view-state.ts`（纯 reducer，不变量由随机事件序列单测守护），显示由纯函数 `view/fishing/screen.ts` 决定，DOM 只应用它，任何状态或世界变化都走同一次渲染（spec 015）；城市画面同样由 `view/city/view-state.ts` 与 `view/city/screen.ts` 组成。View 模块不在 document 上按 id 查找别的模块的元素，只在自己创建或被传入的元素内查找（lint 强制，例外见 spec 015）。当前场景由 `view/shell/place.ts` 的地点状态统一持有，模块订阅它或调用 `Tools`（关闭面板、打开聊天），不通过点击别的模块的按钮或观察其样式类通信。它们只能转换为已知命令；硬件读数与动画不能决定奖励。每个 DOM 内容有单一渲染责任，例如对白分页由 shell 布局管理，事实回忆由 companion 管理。

## 时间与确定性

- 一个整数 `world.minute` 推动营业、行走与空闲猫的体力恢复。到期步行按目标格耗时安排；时间一次推进和分块推进必须等价。
- 浏览器前台每现实秒提交一次 `ADVANCE_TIME`，分钟数为时钟旁选择的速度（1/2/4，View 本地设置，不入档）；隐藏时不提交，不补离线时间。测试构建关闭此真实时间适配，显式推进时钟。
- 钓鱼使用独立整数输入 tick；View 以 20 Hz 提交命令，暂停不等于停止城市时钟。
- 地图生成流、玩法 RNG、单竿随机及失败垃圾抽取各有明确种子来源。各随机流由世界种子与 ID 序号推导（`core/random.ts`），不存可变 RNG 状态；存档保留种子与 ID 计数即可复现。渲染、预览和聊天不消耗玩法随机。
- 同初始存档与命令应重现相同结果。未来在线生成文本需记录已接受输出，不承诺仅凭 seed 复现服务原文。

## 存档契约

当前信封为 **saveVersion 14 / contentVersion 8**。运行时严格验证字段与语义，包括地图、位置、路线、引用、时间、鱼池及记录一致性；读档不重新生成地形或个体。当前版本必须精确往返并能继续未完成操作，包括体感遛鱼的累计进度。

原型不向后兼容，不保留旧命令别名、迁移层或缺字段默认补全。旧、损坏及未来版本拒绝读取，浏览器保留原数据并阻止自动覆盖；显式重置才创建新世界。写入失败只提示重试，不提供重置；其他标签页写入新存档后，本页停止保存并提示刷新。校验会按种子与抛竿输入重新推导进行中一竿的遭遇，猫的身份与喜好必须与模板一致。存储键 `cat-city.save.v1` 是固定位置，信封版本决定格式。

## 可观察与扩展

Dev/test 的 `window.CAT_CITY_DEBUG` 提供世界/实体/种子/诊断/回放、只读格子屏幕坐标及验证后的测试操作；生产包无此入口。GameSession 保存初始 checkpoint 和有序命令结果，每 1000 条滚动到精确的新 checkpoint，确保保留窗口可回放。

Provider 边界见[AI 架构](ai-architecture.md)。新小游戏继续采用独立输入/结果，经 Core 验证结算；第二种真正需要时才抽通用框架。发布器只管理命令、进程、固定构建与证据，猫咪语义留在适配器。验收、失败证据和回退规则分别见[测试](testing.md)与[本地发布](local-publication.md)。
