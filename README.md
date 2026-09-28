# Cat City

一座由猫咪居民生活的治愈小城。核心是 **AI 辅助的情感交流**：经营与小游戏提供共同经历，持久记忆让下一次相遇有意义。当前原型使用离线规则对话，不需要网络、API Key 或真实 LLM。

同时开发可复用的 **AI Game Dev Harness**，验证需求 → 编码 → 构建 → 操作 → 状态与截图 → 诊断 → 回归的闭环。

## 启动与验证

使用 [.nvmrc](.nvmrc) 指定的 Node 22.19.0。

```sh
npm ci
npx playwright install chromium webkit
npm run dev
npm run check
npm run harness
```

`check` 包含类型、类型感知 ESLint/格式、Knip 无用代码检查、带覆盖率的单元/模拟/集成测试、构建和 E2E。Chromium 跑完整浏览器回归，WebKit 跑代表性体感输入用例。`harness` 执行完整 Gate，再运行验收并保存证据；缺失浏览器或失败步骤不会跳过。Linux 安装浏览器时使用 `npx playwright install --with-deps chromium webkit`。

GitHub Actions 只在 Pull Request 上运行同一验收链；**禁止直接推送 main**，仓库内置的 pre-push hook 会拒绝。分支规则与 Pages 现状见 [CI](docs/ci.md)。

## 本地实机试玩

```sh
npm run harness -- publish
npm run harness -- status
npm run harness -- stop
npm run replay -- artifacts/<run-id>/commands.json
```

发布到本机 `http://127.0.0.1:4178`；同一 tailnet 的手机可使用这台 Mac 的 Tailscale 地址。发布前完整验证，失败保留证据并按条件恢复上一个已验证版本。体感需 HTTPS，按钮操作始终可用。详见[本地发布](docs/local-publication.md)。

## 从哪里开始玩

点空地购买，再选猫咖或公寓；点已有建筑可搬移。点猫选中、点目标地块安排步行，再点同猫取消选择。新世界的 Mochi 从池塘边开始，点池塘即可进入钓点；去其他水域要先走到真实岸边。鱼获可出售或送给伙伴，解锁图鉴和新水域；聊天可以回顾真实经历。体力与休息归每只猫，城市收入、步行和休息使用同一时钟。

原型存档不向后兼容。不兼容或损坏的数据会保留并阻止自动覆盖，只有显式重置才开始新世界。当前状态与规则见[需求和玩法](docs/game-design.md)。

## 文档索引

| 主题               | 文档                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| 产品方向、核心需求 | [愿景](docs/vision.md)、[需求与玩法](docs/game-design.md)                                         |
| 当前玩法           | [城市与步行](docs/city-world.md)、[钓鱼](docs/fishing-design.md)、[界面与输入](docs/ui-layout.md) |
| 工程边界           | [架构](docs/architecture.md)、[AI 与离线路径](docs/ai-architecture.md)                            |
| 验证与交付         | [测试与 Harness](docs/testing.md)、[本地发布](docs/local-publication.md)、[CI](docs/ci.md)        |
| 后续范围           | [路线图](docs/roadmap.md)、[设计参考](docs/design-references.md)                                  |
| AI 开发约定        | [AGENTS.md](AGENTS.md)                                                                            |

代码按 [src 导航](src/README.md) 逐层阅读：Core、Application、Provider/Platform 与 View 分开，纯小游戏位于 `src/minigames`。自动化见 [Harness 导航](harness/README.md)，验证层级见 [tests 导航](tests/README.md)。生成证据位于忽略提交的 `artifacts/`。
