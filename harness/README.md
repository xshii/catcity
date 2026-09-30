# AI Game Dev Harness

从 [run.ts](run.ts) 进入 CLI；`npm run harness` 验证，`publish/status/stop` 管理本机试玩版本。

| 目录                                     | 责任                                                 |
| ---------------------------------------- | ---------------------------------------------------- |
| [runner/contract.ts](runner/contract.ts) | Goal、验收、命令、预期状态、视觉证据和回归契约       |
| [runner/](runner/)                       | 通用进程、Gate、浏览器证据、源码标识与发布恢复       |
| [adapters/catcity/](adapters/catcity/)   | 猫城真实输入、状态断言、Replay、生产烟测与源码模块表 |
| [tasks/](tasks/)                         | 当前任务及启动/发布配置                              |

runner 不导入猫咪、鱼或城市玩法语义；新游戏替换 adapter/task，复用执行与证据链。
缺失浏览器、超时、断言或证据采集错误保持失败，不以 skip 掩盖。
每次保留 seed、初始状态、命令、结果、快照、截图/trace 和 Console；使用合成数据。
发布失败按记录的必填 launch 恢复合格旧版本，本次结果仍失败。
完整操作见[测试](../docs/testing.md)与[本地发布](../docs/local-publication.md)。
