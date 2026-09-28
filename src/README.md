# 代码入口

从 [main.ts](main.ts) 看装配：注入保存/对话/seed，挂载 View、开发桥与浏览器时间输入。

| 目录                 | 下一步阅读                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------- |
| Core                 | [core/README](core/README.md)：世界事实与验证命令                                                       |
| Application          | [application/index.ts](application/index.ts)：Session；[ports.ts](application/ports.ts)：保存与对话端口 |
| Content              | [content/](content/)：建筑、猫、品种、鱼和水域定义                                                      |
| Providers / Platform | [providers/](providers/)、[platform/](platform/)：注入的具体实现                                        |
| Mini-games           | [minigames/angling.ts](minigames/angling.ts)：纯整数 tick 模拟                                          |
| View                 | [view/README](view/README.md)：城市、钓鱼、外壳与伙伴呈现                                               |
| Debug                | [debug/bridge.ts](debug/bridge.ts)：仅 dev/test 的观察桥                                                |

跨域从小公共入口读取 API，内部实现按明确文件引用，不增加兼容转发或全量导出。
Core 不依赖 UI/网络/真实时间；Application 不创建具体 Provider，装配入口负责选择。
完整边界和状态约定见[架构](../docs/architecture.md)，AI 修改前读 [AGENTS](../AGENTS.md)。
