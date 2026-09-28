# 008 Harness、CI 与本地发布

- 状态：进行中
- 来源：原型需求（AI Game Dev Harness）；CI 分支规则与许可证来自用户 2026-09-28
- 细节：[测试与 Harness](../../docs/testing.md)、[本地发布](../../docs/local-publication.md)、[CI](../../docs/ci.md)

## 需求

- 通用 runner 与游戏 adapter 分离；每次验证保存 seed、初始存档、命令、快照、截图、Console 与 trace，并可回放。
- `harness -- publish` 通过完整 Gate 后发布到本机 4178，失败恢复上一个已验收版本。
- 推送前 pre-push hook 本地运行完整 Gate；远端 CI 只在 Pull Request 跑静态检查与 Headless 测试；严禁直接推送 main（分支保护 + hook）。
- 仓库公开，许可证 AGPL-3.0-only。

## 验收标准与证据

| 标准                                                              | 证据                                                |
| ----------------------------------------------------------------- | --------------------------------------------------- |
| 进程超时/失败不被当作成功                                         | `tests/integration/process.test.ts`                 |
| 发布只停止自己的进程、失败不复活未验收版本、记录回滚失败          | `tests/integration/publication.test.ts`             |
| 生产包无 Debug Bridge；`/catcity/` 子路径可加载                   | `tests/e2e/game.spec.ts`、`tests/e2e/pages.spec.ts` |
| main 分支保护：必需 PR 与 `Static checks and headless tests` 检查 | GitHub API 2026-09-28                               |

## 未完成

- [ ] 本机 4178 仍是旧版（不含池塘边出生）；需完整 Gate 后重新 `publish`。
- [ ] Harness 合约的 `expectedState` / `visualEvidence` / `regressionTests` 只写入文件、不被校验。
