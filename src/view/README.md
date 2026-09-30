# View 导航

唯一装配入口是 [index.ts](index.ts) 的 `mountGameView(session)`，负责 Phaser 和 DOM 面板。

| 目录                               | 责任                                                      |
| ---------------------------------- | --------------------------------------------------------- |
| [city/](city/)                     | 地图场景、局部选择/操作卡、镜头与教程                     |
| [fishing/](fishing/)               | 钓鱼操作面板、图鉴/鱼篓、可选震动与音效                   |
| [fishing/motion/](fishing/motion/) | 钓鱼的可选体感：只在改传感器输入时阅读                    |
| [cats/](cats/)                     | 猫咪面板：名册与详情、邀请新伙伴、和谁生小猫              |
| [petting/](petting/)               | 撸猫画面                                                  |
| [companion/](companion/)           | 事实回忆展示                                              |
| [common/](common/)                 | 共用：地点状态与模块间接口、设置卡、文案、ViewModel       |
| [art/](art/)                       | 美工：地图/河景/猫绘制、棋盘几何、SVG 插画与鱼的配色      |
| [styles/](styles/)                 | 视觉 token 与共用基础样式；玩法样式留在所属模块           |
| [shell/](shell/)                   | 装配：页面挂载、地点导航、工具面板布局/对白分页、时钟速度 |

子目录直接引用所需文件，不堆叠互相导出的 barrel。每个 DOM 内容保留单一渲染责任。
功能模块（city、fishing、cats、petting、companion）只 import `common`、`art`、`styles` 与下层，
不 import 彼此或 shell；需要的元素和接口由 shell 传入或放在 `common`。模块表见
[modules.ts](../../harness/adapters/catcity/modules.ts)，`tests/unit/modules.test.ts` 检查每条 import。
View 读取快照，提交命令；选择、分页、镜头、传感器与动画不能修改世界或发放奖励。
手机必须单屏可达；钓鱼阶段保持画面/按钮位置，结算触摸不能穿透再开一竿。
界面要求见[布局与输入](../../docs/ui-layout.md)，状态/依赖边界见[架构](../../docs/architecture.md)。
