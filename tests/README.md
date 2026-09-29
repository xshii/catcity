# 测试导航

按验证层级组织，避免把全部规则推到浏览器。

| 目录                         | 重点                                            |
| ---------------------------- | ----------------------------------------------- |
| [unit/](unit/)               | Core 行为、内容规则、边界与原子拒绝             |
| [simulation/](simulation/)   | 多游戏日不变量、时间分块等价                    |
| [integration/](integration/) | 存档续玩、对话/端口、回放、进程/发布恢复        |
| [view/](view/)               | 真实页面面板（happy-dom）：显示、流程、设置记忆 |
| [e2e/](e2e/)                 | 实际输入、单屏布局、保存刷新、生产/Pages 子路径 |
| [fixtures/](fixtures/)       | 可复现输入；旧存档专用于拒绝测试                |

改 Core 前写行为测试；不删失败用例、不弱化断言、不自动接受视觉基线。
浏览器测试通过控件/画布操作，Debug Bridge 用于观察；不能注入赢得鱼获的结果。
`npm run test:coverage` 一次执行三个 Headless 层级与 View 测试台，检查门槛并写入 `coverage/`。
只看面板状态与控件流程的用例写进 View 测试台，不开浏览器；何时用哪层见[测试策略](../docs/testing.md#三层测试与-view-测试台)。
执行 `npm run check` 完成强 Gate；可玩循环和证据链改变再执行 `npm run harness` 并看截图。
测试命令、证据和实机限制见[测试策略](../docs/testing.md)，规则见[需求总览](../docs/game-design.md)。
