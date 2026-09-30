# 测试、Harness 与完成标准

使用锁定依赖与 [.nvmrc](../.nvmrc) 的 Node 版本。先 `npm ci`，再执行 `npx playwright install chromium webkit`；Linux 使用 `npx playwright install --with-deps chromium webkit`。缺失浏览器是失败，不允许跳过。

## 测试金字塔与命令

| 命令                       | 覆盖边界                                                             |
| -------------------------- | -------------------------------------------------------------------- |
| `npm run typecheck`        | strict TypeScript 与纯 Core 编译边界                                 |
| `npm run lint:code`        | 类型感知 ESLint、异步处理、联合类型穷尽与架构依赖边界                |
| `npm run lint:unused`      | Knip 检查无用文件、导出和依赖                                        |
| `npm run lint`             | 上述静态检查与 Prettier 格式                                         |
| `npm test`                 | 经济、建设、地图、移动、猫咪、时间、RNG、钓鱼、原子拒绝              |
| `npm run test:simulation`  | 30 游戏日不变量、有限状态、时间分块等价                              |
| `npm run test:integration` | 保存/续玩、Provider 回退、事实回忆、回放、进程与发布失败             |
| `npm run test:view`        | View 测试台：真实页面面板、按钮与体感流程、设备设置记忆              |
| `npm run test:coverage`    | 一次运行单元/模拟/集成与 View 测试台并检查 V8 覆盖率门槛             |
| `npm run test:e2e`         | 画布/触摸输入、刷新续玩、单屏布局、生产隔离及 Pages 子路径           |
| `npm run build`            | HTML5 生产构建                                                       |
| `npm run check`            | 类型 → 静态检查/格式 → Headless 测试与覆盖率 → 构建 → E2E            |
| `npm run harness`          | Gate（E2E 按改动挑选，见下节），再启动验收浏览器、采集证据并验证回放 |

Core 行为先写测试，绝大多数规则在 Headless 层验证。E2E 用真实格子点击、按钮、键盘和触摸，不能注入获胜结果。测试构建（`--mode test`）把纯等待（等咬钩、传感器启动期限）按 `src/view/fishing/time-scale.ts` 加速，提竿、遛鱼和甩竿窗口保持真实速度；Debug Bridge 的 `stepFishing` 可逐 tick 推进钓鱼以消除短窗口竞态，输入仍是真实按键。生产构建始终 1×。截图是观察证据，当前没有强制像素基线；不得自动接受新快照来通过测试。

每个检出目录的测试服务使用自己的端口（测试构建、生产构建、验收预览三个相邻端口，由目录路径推导，`CAT_CITY_TEST_PORT` 可指定起始端口，见 [test-ports.ts](../harness/runner/test-ports.ts)），因此多个 worktree 的门禁与 E2E 可同时运行；实机试玩预览固定为 4178。E2E 以 2 个 worker 并行（测试相互独立：各自的浏览器上下文与存储）；测试构建把 Phaser 限到 15 帧（无头浏览器用软件渲染，测试只需画出来，不需要流畅动画），生产构建不受影响。[Playwright 配置](../playwright.config.ts) 中 Chromium 执行全量 E2E，WebKit 仅执行带 `@motion-smoke` 标记的代表性体感输入与延迟恢复用例，二者都属于 `check`。体感 E2E 用触屏上下文（`hasTouch`；不设 `isMobile`：WebKit 的手机模拟把竖屏页面报成屏幕角 90°）与 iOS 式授权替身，记录每次请求时的 `navigator.userActivation.isActive`（[motion-phone.ts](../tests/helpers/motion-phone.ts)）。可用 `npm run test:e2e -- --project=webkit-motion` 定向验证；自动化注入读数用于验证浏览器适配，仍需 Safari 实机确认权限弹窗、传感器和手感。

实机问题先用[实机调试日志](local-publication.md#实机调试日志)记录，再用 `npm run device-trace` 切成 `tests/fixtures/device/` 下的夹具；[device-traces.test.ts](../tests/unit/device-traces.test.ts) 按设备送来的顺序，把每个夹具经与 `motion-fishing.ts` 相同的纯函数（姿态连续化、竿尖、屏幕轴角速度、甩竿识别、校准）重放，结果必须等于夹具的 `expect`。重放不含 DOM 与 View 状态，窗口需落在同一阶段内（瞄准、等咬钩/提竿或校准）。

静态检查在执行前发现未处理 Promise、错误异步回调、不必要的类型断言、遗漏的联合类型分支及违反模块边界的导入。运行时验证由行为测试、模拟不变量、覆盖率和浏览器断言承担；覆盖率不代替结果正确性。Knip 的公共入口显式列在 [knip.json](../knip.json)，仅为实际使用的 API 保留入口，不批量忽略问题。

V8 覆盖 Core、Application、Content、Minigames、Providers 和 Harness runner；View 测试台随之运行，但 View 代码与 E2E 不计入这份覆盖率。门槛由 [vitest.config.ts](../vitest.config.ts) 强制执行：

| 范围        | 语句 | 行  | 分支 | 函数 |
| ----------- | ---- | --- | ---- | ---- |
| 全局        | 80%  | 85% | 85%  | 85%  |
| Core        | 90%  | 90% | 85%  | 95%  |
| Application | 85%  | 90% | 80%  | 75%  |

报告保存在 `coverage/index.html`、`coverage/coverage-summary.json` 和 `coverage/lcov.info`。CI 与测试证据一同上传，覆盖率不足保持失败，不通过删除用例或排除未覆盖业务来过关。

## 推送前检查：按模块挑 E2E，每天全量兜底

用户 2026-09-30 决定：E2E 按改动的模块挑选，每天全量兜底，取代此前"推送前跑全部 E2E"的规则。`.githooks/pre-push` 运行 `npm run harness`：类型、Lint/格式/Knip、带覆盖率的 Headless 测试与 View 测试台、生产构建和游戏验收每次都跑，只有 E2E 按下面的规则挑选；`npm run harness -- publish`（正式发布）始终跑全部 E2E，`npm run check` 也照旧跑全部。

- **每天全量**：本机当天还没有一次**通过**的全量检查时，跑全部 E2E。记录在主检出的 `artifacts/full-checks.jsonl`（经 git 的 common dir 找到，所有 worktree 共用同一份），每次跑了全部 E2E 的检查（不论因为什么）追加一行 `{"date":"2026-09-30","commit":"<sha>","ok":true}`，失败的也记，只有 `ok` 为真的算数。
- **按改动挑选**：当天已有通过的全量后，取与 `origin/main` 的 merge-base 以来改动的文件（已提交、暂存、未暂存与未跟踪；移动的文件两头都算），逐个判断后取并集：

| 改动的文件                                                                                                                                              | 跑哪些 E2E                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `docs/`、`specs/`、任何 `*.md`                                                                                                                          | 不跑                         |
| `tests/unit/`、`tests/view/`                                                                                                                            | 不跑（vitest 照跑）          |
| 登记过的 `tests/e2e/x.spec.ts`                                                                                                                          | 它自己与两个冒烟             |
| 功能模块（city、fishing 含 `fishing/motion/`、cats、petting、companion）的代码                                                                          | 登记在该模块下的 spec 与冒烟 |
| 功能模块的 `.css`                                                                                                                                       | 同上，再加全部布局类 spec    |
| 其余：共享画面（common、art、styles）、装配（shell、`view/index.ts`）、规则层、应用层、`src/main.ts`、harness、测试辅助与夹具、依赖与配置、没列到的路径 | 全部                         |

登记表是 [e2e.ts](../harness/adapters/catcity/e2e.ts) 的 `E2E_SPECS`：每个 spec 覆盖哪些功能模块；冒烟是 `game.spec.ts` 与 `city-input.spec.ts`，布局类是 main-page、notice-layer、pages、river-layout、settings-gear。模块沿用 [modules.ts](../harness/adapters/catcity/modules.ts) 的表。挑选是纯函数 `chooseE2E`，[e2e-choice.test.ts](../tests/unit/e2e-choice.test.ts) 覆盖每条规则，新 spec 没登记或登记了不存在的模块时失败。runner 只接收要跑的浏览器测试文件（`BrowserTestChoice`），模块到 spec 的映射与规则都在猫城适配器。每次运行的 `checks.log` 开头写 merge-base、改动文件、每个文件的理由与选中的 spec，`manifest.json` 的 `browserTests` 记下选择（`all` 或文件列表）；没有选中 E2E 时单独构建验收用的测试构建。

## 三层测试与 View 测试台

| 层          | 位置                                                  | 环境                  | 验证什么                                                                   |
| ----------- | ----------------------------------------------------- | --------------------- | -------------------------------------------------------------------------- |
| Headless    | `tests/unit`、`tests/simulation`、`tests/integration` | Node                  | Core 规则、存档、Provider；View 的纯状态 reducer 与画面模型                |
| View 测试台 | `tests/view`                                          | Vitest + happy-dom    | 真实页面：面板显示/隐藏、文案、由按钮/键盘/传感器事件驱动的流程、设置记忆  |
| E2E         | `tests/e2e`                                           | Playwright 真实浏览器 | 画布与格子点击、触摸、布局与视口、刷新后存档续玩、多标签、生产构建与子路径 |

测试台（[view-rig.ts](../tests/helpers/view-rig.ts)）按 `main.ts` 的方式装配真实 `GameSession`（浏览器存储、规则对话、seed 42）与 `mountGameView`；`vi.mock` 把 Phaser 换成不绘制的替身，页面 CSS 照常加载，可见性按 `hidden` 与计算样式判断。时间由 `vi.useFakeTimers` 控制：`wait(ms)` 让计时器到期，`tick(n)` 每 tick 先过 50 ms 再经 View 自己的钓鱼时钟推进（与 Bridge 的手动时钟相同）。倾斜与陀螺仪读数以合成 `deviceorientation`/`devicemotion` 事件派发；手机粗指针、传感器权限、HTTPS、震动、替身 Web Audio 与预置 localStorage 由 `openGame` 参数给出（`click`/`touchEnd` 分发期间 `navigator.userActivation.isActive` 为真，授权替身记下每次请求是否在点按里），`reload()` 在同一存储上重新装配页面。操作词汇在 [view-player.ts](../tests/helpers/view-player.ts)，与 Harness 适配器一致（`enterRiver`、`castOnce`、`catchFish`、`showBagFish`、`swing`、`lift`…），下拉框与滑杆用 `choose` 选值（只接受可用的字段与选项）。每例几十到几百毫秒；CI 经 `test:coverage` 运行，那里一竿完整钓获约需 2.5 秒，而单例默认超时 5 秒（不得调高），所以每例在页面里最多钓一竿，之前的进度用 Core 命令预制存档后以 `openGame({ storage })` 加载。

断言只涉及 DOM/面板状态、文案、可见性、设备设置，或由按钮、键盘、传感器事件驱动的流程时，写在测试台。需要真实布局（尺寸、视口、滚动）、画布坐标、浏览器合成的触摸与点击、刷新后的存档续玩、`storage` 事件、生产构建、真实浏览器 API（权限弹窗、WebKit）或截图证据时，留在 E2E；拿不准时保留 E2E。测试台没有布局与像素，不替代截图检查。E2E 需要一段已玩出的进度时，同样用 Core 命令预制存档再加载（`fishing-landing.spec.ts` 的收线前一刻、`game.spec.ts` 的钓鱼进度），浏览器里只做需要真实浏览器的最后几步。钓鱼进度的存档点由 [fishing-progress.ts](../tests/helpers/fishing-progress.ts) 一次 Core 通关给出（差一竿解锁、芦苇河湾已开放、已走到河湾、钓到鲈鱼并建好一座公寓）；[fishing-progress.test.ts](../tests/view/fishing-progress.test.ts) 各从一个存档点起步，在页面里只做一步（最后一竿解锁河湾、选河湾步行抵达、换蚯蚓钓到鲈鱼、从邀请名单请来 Pepper 并赠鱼），`game.spec.ts` 只验证真实点击后的进度经刷新保留、解锁仍在。

## 必须保持的回归

- 同 seed/初始状态/命令得到同状态；拒绝不改变资源、RNG、ID 或半成品；一次结算/消费；无 NaN、重叠和无界事件循环。
- 地形与路网有效，最短耗时路线、障碍重排、多猫碰撞、逐格体力、空闲恢复与公寓旁加速；到真实岸边才能开钓。
- 每个鱼池、0–5 星、品种资格、体长范围/纪录、饵/力度、失败垃圾、补给、卖/赠、解锁和独立体力。
- 当前存档精确往返，中途行走/钓鱼可继续；旧/未来/损坏存档及伪装为当前格式的旧字段被拒绝，原数据保留直至明确重置。
- 首钓与赠鱼来自 Core，聊天不能伪造事实；不同猫隔离；非法/超时/错误目标/过期 Provider 响应回退或拒绝。
- 390×844、360×640 和桌面单屏，长对白与有内容的分页可达；导航/暂停不重置用户页面，水面和操作键阶段稳定。
- 最后一次收线触摸抬起不得激活新准备键、再次扣 8 体力或奖励；新的指针/键盘输入能正常再开一竿。
- 按钮版：从池塘进入钓鱼界面仍处于预瞄，明确准备后才扣资源。体感版：挥出甩竿时才创建一竿并扣一次资源；没有读数或关闭体感时按钮流程完整可用。
- 连续姿态跨越 beta ±180° 和 gamma 换支时不突然反向；体感假咬口、提竿窗口、鱼圈路径与累计衰减由 Core 按种子与 tick 判定，分块推进等价、存档可续玩。
- 生产无 Debug Bridge；真实 `/catcity/` 静态子路径加载资源、建设、保存并刷新成功。体感权限、禁用/无读数/不支持路径保留手动玩法；模拟事件不能证明真实手机振动、传感器方向和触摸手感。

## Harness 契约与证据

任务声明 Goal、Acceptance Criteria、Commands、Expected State、Visual Evidence、Regression Tests。通用 runner 只负责执行、启动和证据；游戏 adapter 负责输入与断言，见 [Harness 导航](../harness/README.md)。

当前任务 `m5-city-walk-fish` 使用真实输入购地、铺路升级、建公寓/入住、建造搬移猫咖、获取收入、猫咪步行、岸边钓鱼、图鉴/赠售、事实聊天、空闲恢复、保存/刷新和回放。具体预期以 [city-loop.ts](../harness/tasks/city-loop.ts) 为准，不在文档复制易漂移的最终金币公式。

每次运行保存：任务与通过/失败结果、命令日志、build/source 标识、seed、初始 save/fixture、操作轨迹、World 快照、截图、Console/pageerror 和 Playwright trace。失败保持非零并保留已取得的证据；截图/存档采集失败也记录，不能覆盖首个玩法错误。

```sh
npm run replay -- artifacts/<run-id>/commands.json
```

回放使用初始 checkpoint、有序命令及结果比较最终状态；当前只支持同格式/实现的记录，不承诺跨版本重放。证据使用合成测试数据，不能上传真实玩家私人聊天。

## 发布回归与 Definition of Done

发布集成覆盖固定构建副本、进程归属、健康 marker、失败 Gate、启动/就绪/烟测失败、已验证旧版本恢复以及恢复失败。恢复使用必填保存的 `launch`，只恢复替换前正在运行且已通过验收的版本；本次仍失败。生产烟测成功/失败都尝试采集该测试会话的 save、Console 与截图，见[发布契约](local-publication.md)。

每个命令默认超时 5 分钟；E2E 允许 15 分钟。超时仍是失败，不放宽验收。可玩循环、Bridge 或证据链改变必须通过 `check` 和 Harness，并检查截图、更新相关文档、报告证据路径与限制。某次通过只能由该次产物证明。
