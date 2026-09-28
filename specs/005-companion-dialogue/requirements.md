# 005 伙伴关系与规则对话

- 状态：验证中
- 来源：原型需求；边界见 [AI 与离线路径](../../docs/ai-architecture.md)

## 需求

Mochi（布偶）与可邀请的 Pepper（英短）各自保存身份、喜好与记忆。离线规则对话引用真实事实：首条共同钓获、最近赠鱼、最近 50 条聊天。聊天不能创造资源或活动事实，不同猫的记忆隔离；亲密度每游戏小时最多增长一次。

## 验收标准与证据

| 标准                                                    | 证据                                                                               |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 回忆首钓与赠鱼，玩家的陈述不被当作事实                  | `tests/integration/rule-dialogue.test.ts`、`tests/unit/companionship.test.ts`      |
| Provider 超时、非法提案、错误目标回退；重置后旧回答作废 | `tests/integration/session.test.ts`、`tests/integration/session-injection.test.ts` |
| 首钓记忆刷新后仍可回忆                                  | `tests/integration/companionship.test.ts`、`tests/e2e/game.spec.ts`                |
| 长对白分页、刷新后仍分页                                | `tests/e2e/river-layout.spec.ts`                                                   |

## 未完成 / 限制

- 没有真实 LLM，见 [023](../023-optional-ai/requirements.md)。
- 回应的情感自然度需要真人试玩判断，测试数量不能替代。
