# GitHub Actions CI

配置入口为 [ci.yml](../.github/workflows/ci.yml)。本地与云端使用同一 Gate 和 Harness，不额外维护一套较弱的 CI 验收。

## 执行流程

- main 推送、Pull Request 与手动触发。
- `check` 使用 `ubuntu-24.04`：checkout → 按 `.nvmrc` 配置 Node/npm cache → `npm ci` → 安装 Chromium、WebKit 与系统依赖 → `npm run harness`。
- Harness 内执行一次完整 `check`，覆盖类型、静态检查、带覆盖率的 Headless 测试、构建与 E2E，随后运行游戏验收和证据收集。
- `check` 超时 20 分钟；同一分支/PR 新运行取消旧运行。缺失依赖、检查失败和超时均保持失败。
- 检查任务只有 contents 读取权限，checkout 不持久化凭据；Actions 固定到提交 SHA。
- 无论成功或失败，上传 `artifacts/` 和 `coverage/`，保留 3 天。云端成功必须检查实际运行和产物，不能从本地结果推断。

## 费用与发布边界

工程不需要付费 runner、API Key 或外部模型。工作流不修改账户计费或购买额度；私有仓库的 Actions 使用仍受拥有者套餐与账户预算控制，免费上限应由账户设置管理。额度政策以 [GitHub 官方计费说明](https://docs.github.com/en/billing/concepts/product-billing/github-actions) 为准，不把某个固定额度写成工程保证。

CI 不启动开发 Mac 上的长期预览。实机版本通过[本地发布流程](local-publication.md)管理；提交、推送和外部发布遵守仓库授权边界。

## GitHub Pages 条件

Pages 支持作为静态 HTML5 发布目标。`xshii/catcity` 当前为私有仓库，Pages 尚未启用，账户套餐未确认，因此不能把工作流支持视为已经上线。

[GitHub 官方说明](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)：公开仓库可使用 GitHub Free 的 Pages；私有仓库需要支持该能力的套餐，例如 GitHub Pro。工程不会自动公开仓库、购买套餐或绕过账户限制。配置满足条件、启用 Pages 并成功部署后，候选地址为 `https://xshii.github.io/catcity/`。

满足账户条件后，在仓库 Settings → Pages 将 Source 设为 **GitHub Actions**，并在 Actions 的 repository variables 中设置 `PAGES_ENABLED=true`。

同一工作流只在 **main 分支、非 Pull Request、变量已启用** 时上传通过完整验收的 `dist`，再由依赖 `check` 成功的 `deploy` 任务发布。main 推送或手动触发均可进入该流程；其他运行只验证，不部署。部署任务限时 10 分钟，仅它获得 `pages: write` 与 `id-token: write`，使用 `github-pages` environment。无需再跑一套 Gate 或重建待发布产物。

[子路径 E2E](../tests/e2e/pages.spec.ts) 把生产构建直接挂到 `/catcity/`，检查资源加载、实际建设、保存刷新和生产 Bridge 隔离。静态服务器不提供根路径资源别名或 SPA 回退，以暴露路径错误；构建保留相对资源路径。只有部署任务成功后的 environment URL 才是已发布地址。

存档由浏览器 origin 隔离，本地 HTTP、Tailscale HTTPS 与 GitHub Pages 不共享 localStorage，也不自动迁移。URL 路径本身不构成 origin 隔离；同一 `github.io` 域下的其他项目使用相同存储键时仍可能冲突。当前存档恢复/重置规则见[架构](architecture.md)。
