# GitHub Actions CI

配置入口为 [ci.yml](../.github/workflows/ci.yml)。本地与云端使用同一 Gate 和 Harness，不额外维护一套较弱的 CI 验收。

## 执行流程

- **推送前本地跑门禁**：`.githooks/pre-push`（`npm ci`/`npm install` 经 `prepare` 启用）在每次推送分支前运行 `npm run harness`——类型、Lint/格式/Knip、带覆盖率的 Headless 测试、构建、E2E（Chromium 与 WebKit 体感用例）与游戏验收；失败即拒绝推送。E2E 每天第一次推送跑全部，当天有过通过的全量后按改动的模块挑选（用户 2026-09-30 决定，规则见[测试](testing.md#推送前检查按模块挑-e2e每天全量兜底)）。
- **远端 CI 只跑静态检查**：仅在 Pull Request 触发，`ubuntu-24.04` 上 `npm ci` 后运行类型、Lint/格式/Knip、带覆盖率的 Headless 测试与生产构建（10 分钟限时），任务名 `Static checks and headless tests` 是分支保护要求的检查。
- 浏览器 E2E 与验收只在本地强制；`git push --no-verify` 能绕过钩子，服务端无法替代这层检查，因此不得使用。
- 同一分支/PR 新运行取消旧运行；检查任务只有 contents 读取权限，checkout 不持久化凭据；Actions 固定到提交 SHA。上传覆盖率保留 3 天。

## 费用与发布边界

工程不需要付费 runner、API Key 或外部模型。工作流不修改账户计费或购买额度；Actions 用量受拥有者账户设置约束。额度政策以 [GitHub 官方计费说明](https://docs.github.com/en/billing/concepts/product-billing/github-actions) 为准，不把某个固定额度写成工程保证。

CI 不启动开发 Mac 上的长期预览。实机版本通过[本地发布流程](local-publication.md)管理；提交、推送和外部发布遵守仓库授权边界。

## 分支规则

- **严禁直接推送 main**：新分支 → Pull Request → CI 通过 → 合并。
- 服务端：main 已启用分支保护——必须经 PR 合并、`Static checks and headless tests` 检查通过且分支基于最新 main；管理员同样受限，禁止 force push 与删除。PR 审批数为 0，因为个人仓库作者不能批准自己的 PR。
- 本地：仓库内置 [`.githooks/pre-push`](../.githooks/pre-push)，拒绝推向 `main`，并在推送其他分支前运行门禁。

## GitHub Pages

构建保留相对资源路径，[子路径 E2E](../tests/e2e/pages.spec.ts) 把生产构建挂到 `/catcity/`，检查资源加载、实际建设、保存刷新和生产 Bridge 隔离。当前没有 Pages 部署工作流：CI 只在 PR 运行，Pages 也未开通（仓库已公开，可免费开通）。需要时另建"合并到 main 后部署"的工作流，作为新需求处理。

存档由浏览器 origin 隔离，本地 HTTP、Tailscale HTTPS 与 GitHub Pages 不共享 localStorage，也不自动迁移。URL 路径本身不构成 origin 隔离；同一 `github.io` 域下的其他项目使用相同存储键时仍可能冲突。当前存档恢复/重置规则见[架构](architecture.md)。
