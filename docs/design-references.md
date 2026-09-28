# 设计参考

以下资料用于讨论机制与取舍，不是竞品实玩报告，也不能证明某种设计会提高留存或产生医疗/心理疗效。Cat City 的实现以[需求](game-design.md)和各玩法规则为准，不复制角色、素材或原数值。

| 讨论主题             | 参考来源                                                                                                                                                                                                                            | Cat City 的取舍                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 可见记忆与角色上下文 | [Replika 记忆说明](https://help.replika.com/hc/en-us/articles/37208679176077-How-does-Replika-s-memory-work)、[Nomi 入门指南](https://nomi.ai/nomi-knowledge/nomi-101-a-beginners-guide-to-getting-started-with-your-ai-companion/) | 区分个体身份、近期聊天、Core 共同经历和未来玩家批准的笔记                  |
| 居民生活与布置       | [Nintendo 动物森友会](https://www.nintendo.com/en-gb/Games/Nintendo-Switch-games/Animal-Crossing-New-Horizons-1438623.html)、[Neko Atsume 基础玩法](https://nekoatsume.com/games/neko/)                                             | 建筑与物品要创造可观察的生活和相处机会，猫咖只是城市一部分                 |
| 非语言陪伴           | [CASIO Moflin](https://www.casio.com/us/moflin/)                                                                                                                                                                                    | 耳尾、动作、距离与安静共处值得投入，不只增加聊天字数                       |
| 可练习的钓鱼操作     | [Stardew Valley Fishing](https://stardewvalleywiki.com/Fishing)、[Tackle](https://stardewvalleywiki.com/Tackle)                                                                                                                     | 绿区、鱼种难度、钓技/钓具成长；采用独立水平张力规则                        |
| 地点与遭遇收集       | [宝可梦 BDSP 官方指南](https://diamondpearl.pokemon.com/en-us/trainersguide/fundamentals/)、[DREDGE 官方介绍](https://www.team17.com/games/dredge/)                                                                                 | 地点和方式缩小候选，收藏带动探索；不把宝可梦写成控条遛鱼，也不引入恐怖压力 |
| 钓组与空间选择       | [Fishing Planet 教程](https://wiki.fishingplanet.com/Tutorial)、[钓组说明](https://wiki.fishingplanet.com/Building_a_balanced_tackle_setup)                                                                                         | 保留饵、方向、力度与张力，暂不加入复杂线径、许可证和装备损坏               |
| 捕鱼与经营循环       | [潜水员戴夫官方页面](https://store.steampowered.com/app/1868140/DAVE_THE_DIVER/)                                                                                                                                                    | 资源带回→出售/消费/赠送→成长→新地点；餐厅配方与装备先留在路线图            |
| 地形相邻边界         | [Wargroove 2 创作工具](https://wargroove.com/lay-down-your-swords-and-pick-up-your-hammers-weve-got-new-creator-tools/)、[Tiled Terrain](https://doc.mapeditor.org/en/stable/manual/terrain/)                                       | 相连水域与路面清晰可辨，不要求编辑器或复杂地形 DSL                         |

## 工程资料

- [TypeScript Object Types](https://www.typescriptlang.org/docs/handbook/2/objects.html)：用普通接口表达依赖端口和状态，不引入 DI 框架。
- [MDN Vibration API](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate)：浏览器调用与物理振动分开验证，始终保留视觉反馈。
- 手机 HTTPS 与 CI 的官方操作来源分别放在[本地发布](local-publication.md)和 [CI](ci.md)，避免在多篇文档重复维护命令或额度。
