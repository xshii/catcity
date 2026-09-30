# Headless Core

外部消费者从 [index.ts](index.ts) 使用 World、命令与状态类型；只读地图查询从 [city/index.ts](city/index.ts) 进入。

| 主题       | 实现入口                                                                                                                                |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 世界与存档 | [world.ts](world.ts)、[schema.ts](schema.ts)                                                                                            |
| 命令分发   | [commands.ts](commands.ts)、[reducer.ts](reducer.ts)                                                                                    |
| 城市       | [city/](city/)：地图、建设、路径、步行和语义校验                                                                                        |
| 钓鱼       | [fishing/](fishing/)：资格、命令、结算、鱼影、持久状态校验                                                                              |
| 时间与随机 | [simulation.ts](simulation.ts)、[random.ts](random.ts)、[limits.ts](limits.ts)                                                          |
| 居民与关系 | [cats.ts](cats.ts) 由模板创建猫实例、改名；[names.ts](names.ts) 名字 schema 与推荐名；[bond.ts](bond.ts)；个体事实保存在严格状态 schema |
| 家庭       | [family.ts](family.ts)：生育条件 `breedBlocks` 与亲属 `related`（R-31）、生小猫 `breedCats`（R-32）、绝育 `neuterCat`（R-30）           |
| 遗传       | [inheritance.ts](inheritance.ts)：遗传 `inherit`、家传 `familyMarks`、出生的猫的存档校验 `assertBorn`（spec 041 R-33 – R-35）           |
| NPC 居民   | [residents.ts](residents.ts)：每天搬来一只、由种子推导身份、存档校验（spec 041 T-30）                                                   |
| 心愿       | [wishes.ts](wishes.ts)：游戏日开始时想到心愿、只从现在做得到的事里选、对应命令结算时实现、存档校验（spec 041 T-40）                     |

所有修改经过验证命令，拒绝保持整个世界不变；快照只读、存档精确往返。
同初始状态与命令应复现相同结果；不得引用 Phaser、DOM、网络、真实时钟或不可控随机。
新增规则先写行为测试，不在 Core 填充旧命令别名或旧档迁移默认值。
需求见[城市](../../docs/city-world.md)/[钓鱼](../../docs/fishing-design.md)，验证见[测试](../../docs/testing.md)。
