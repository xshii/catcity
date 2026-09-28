# 测试、Harness 与完成标准

使用锁定依赖与 [.nvmrc](../.nvmrc) 的 Node 版本。先 `npm ci`，再执行 `npx playwright install chromium webkit`；Linux 使用 `npx playwright install --with-deps chromium webkit`。缺失浏览器是失败，不允许跳过。

## 测试金字塔与命令

| 命令                       | 覆盖边界                                                    |
| -------------------------- | ----------------------------------------------------------- |
| `npm run typecheck`        | strict TypeScript 与纯 Core 编译边界                        |
| `npm run lint:code`        | 类型感知 ESLint、异步处理、联合类型穷尽与架构依赖边界       |
| `npm run lint:unused`      | Knip 检查无用文件、导出和依赖                               |
| `npm run lint`             | 上述静态检查与 Prettier 格式                                |
| `npm test`                 | 经济、建设、地图、移动、猫咪、时间、RNG、钓鱼、原子拒绝     |
| `npm run test:simulation`  | 30 游戏日不变量、有限状态、时间分块等价                     |
| `npm run test:integration` | 保存/续玩、Provider 回退、事实回忆、回放、进程与发布失败    |
| `npm run test:coverage`    | 一次运行单元/模拟/集成测试并检查 V8 覆盖率门槛              |
| `npm run test:e2e`         | 实际输入、持久化、单屏布局、生产隔离及 Pages 子路径资源加载 |
| `npm run build`            | HTML5 生产构建                                              |
| `npm run check`            | 类型 → 静态检查/格式 → Headless 测试与覆盖率 → 构建 → E2E   |
| `npm run harness`          | 完整 Gate，再启动验收浏览器、采集证据并验证回放             |

Core 行为先写测试，绝大多数规则在 Headless 层验证。E2E 用真实格子点击、按钮、键盘和触摸，不能注入获胜结果。截图是观察证据，当前没有强制像素基线；不得自动接受新快照来通过测试。

[Playwright 配置](../playwright.config.ts) 中 Chromium 执行全量 E2E，WebKit 仅执行带 `@motion-smoke` 标记的代表性体感输入与延迟恢复用例，二者都属于 `check`。可用 `npm run test:e2e -- --project=webkit-motion` 定向验证；自动化注入读数用于验证浏览器适配，仍需 Safari 实机确认权限弹窗、传感器和手感。

静态检查在执行前发现未处理 Promise、错误异步回调、不必要的类型断言、遗漏的联合类型分支及违反模块边界的导入。运行时验证由行为测试、模拟不变量、覆盖率和浏览器断言承担；覆盖率不代替结果正确性。Knip 的公共入口显式列在 [knip.json](../knip.json)，仅为实际使用的 API 保留入口，不批量忽略问题。

V8 覆盖 Core、Application、Content、Minigames、Providers 和 Harness runner；浏览器 View 与 E2E 不计入这份 Headless 覆盖率。门槛由 [vitest.config.ts](../vitest.config.ts) 强制执行：

| 范围        | 语句 | 行  | 分支 | 函数 |
| ----------- | ---- | --- | ---- | ---- |
| 全局        | 80%  | 85% | 85%  | 85%  |
| Core        | 90%  | 90% | 85%  | 95%  |
| Application | 85%  | 90% | 80%  | 75%  |

报告保存在 `coverage/index.html`、`coverage/coverage-summary.json` 和 `coverage/lcov.info`。CI 与测试证据一同上传，覆盖率不足保持失败，不通过删除用例或排除未覆盖业务来过关。

## 必须保持的回归

- 同 seed/初始状态/命令得到同状态；拒绝不改变资源、RNG、ID 或半成品；一次结算/消费；无 NaN、重叠和无界事件循环。
- 地形与路网有效，最短耗时路线、障碍重排、多猫碰撞、逐格体力与公寓休息；到真实岸边才能开钓。
- 每个鱼池、0–5 星、品种资格、体长范围/纪录、饵/力度、失败垃圾、补给、卖/赠、解锁和独立体力。
- 当前存档精确往返，中途行走/休息/钓鱼可继续；旧/未来/损坏存档及伪装为当前格式的旧字段被拒绝，原数据保留直至明确重置。
- 首钓与赠鱼来自 Core，聊天不能伪造事实；不同猫隔离；非法/超时/错误目标/过期 Provider 响应回退或拒绝。
- 390×844、360×640 和桌面单屏，长对白与有内容的分页可达；导航/暂停不重置用户页面，水面和操作键阶段稳定。
- 最后一次收线触摸抬起不得激活新准备键、再次扣 8 体力或奖励；新的指针/键盘输入能正常再开一竿。
- 从池塘进入钓鱼界面仍处于预瞄，明确准备后才扣资源；已授权但暂无读数时继续等待，晚到读数能恢复体感，手动操作始终可用。
- 体感甩竿读数有效时，明确开始新一竿才开启 4 秒动作识别；续玩、恢复界面或迟到读数不会自动开启，已有蓄力阶段需主动重试。关闭或重新校准必须取消识别，不得意外抛竿。
- 连续姿态跨越 beta ±180° 和 gamma 换支时不突然反向，预瞄/校准不改变 World；二维体感提竿必须连续留在目标圈内，由 Core 判断命中，离圈清零、手动输入接管。真实抛投到提竿后继续按键收线，关闭体感仍能完成同一竿；360/390 视口保留阶段尺寸与截图证据。
- 生产无 Debug Bridge；真实 `/catcity/` 静态子路径加载资源、建设、保存并刷新成功。体感权限、禁用/无读数/不支持路径保留手动玩法；模拟事件不能证明真实手机振动、传感器方向和触摸手感。

## Harness 契约与证据

任务声明 Goal、Acceptance Criteria、Commands、Expected State、Visual Evidence、Regression Tests。通用 runner 只负责执行、启动和证据；游戏 adapter 负责输入与断言，见 [Harness 导航](../harness/README.md)。

当前任务 `m5-city-walk-fish` 使用真实输入购地、铺路升级、建公寓/入住、建造搬移猫咖、获取收入、猫咪步行、岸边钓鱼、图鉴/赠售、事实聊天、休息、保存/刷新和回放。具体预期以 [city-loop.ts](../harness/tasks/city-loop.ts) 为准，不在文档复制易漂移的最终金币公式。

每次运行保存：任务与通过/失败结果、命令日志、build/source 标识、seed、初始 save/fixture、操作轨迹、World 快照、截图、Console/pageerror 和 Playwright trace。失败保持非零并保留已取得的证据；截图/存档采集失败也记录，不能覆盖首个玩法错误。

```sh
npm run replay -- artifacts/<run-id>/commands.json
```

回放使用初始 checkpoint、有序命令及结果比较最终状态；当前只支持同格式/实现的记录，不承诺跨版本重放。证据使用合成测试数据，不能上传真实玩家私人聊天。

## 发布回归与 Definition of Done

发布集成覆盖固定构建副本、进程归属、健康 marker、失败 Gate、启动/就绪/烟测失败、已验证旧版本恢复以及恢复失败。恢复使用必填保存的 `launch`，只恢复替换前正在运行且已通过验收的版本；本次仍失败。生产烟测成功/失败都尝试采集该测试会话的 save、Console 与截图，见[发布契约](local-publication.md)。

每任务默认命令超时 5 分钟；组合 `check` 允许 15 分钟，CI 总预算 20 分钟。超时仍是失败，不放宽验收。可玩循环、Bridge 或证据链改变必须通过 `check` 和 Harness，并检查截图、更新相关文档、报告证据路径与限制。某次通过只能由该次产物证明。
