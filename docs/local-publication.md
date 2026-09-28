# 本地构建与实机发布

统一入口在 Harness。发布到本机网络，不上传公网，不改 GitHub 可见性或 Tailscale 权限。

```sh
npm run harness -- publish       # 完整门禁 + 生产烟测后发布
npm run harness -- publish-test  # 试玩用快速发布：只构建，不跑门禁与烟测
npm run harness -- status
npm run harness -- stop
```

## 发布与恢复契约

`publish` 执行完整 `check` → 测试构建验收/Debug Bridge/回放 → 复制固定生产构建 → 启动后台服务 → 健康检查 → 手机尺寸生产烟测 → 写入发布结果。任一步失败返回非零，留下对应日志与已取得的证据。

新 Gate 通过后才替换服务。新版本启动、就绪或生产烟测失败时，停止属于该次发布的进程，并自动尝试恢复替换前**正在健康运行且已验收通过**的固定版本。恢复核对 release marker，状态写回 `current.json`；无符合条件的旧版本就不恢复。手动停止或未验收版本不会自动复活。

发布记录必须包含 `launch.executable` 和 `launch.args`，恢复使用原记录的启动方式，不猜测项目命令、不提供缺字段兼容默认值。恢复成功仍是本次发布失败；恢复失败及清理异常也写入失败 `result.json`，保留原始失败原因。

`publish-test` 只做生产构建、固定副本、启动和健康检查（约数秒），用于实机试玩。它同样受 `status`/`stop` 管理，但 `result.json` 与 `status` 标记 `verified: false`，之后的正式发布失败时**不会**恢复它。正式发布前无需手动停止，发布流程会先停掉当前受管理进程。

`status` 核对进程命令中的唯一版本目录和 HTTP release marker。`stop` 只停止匹配该目录的受管理进程，不按端口批量杀进程。源码或 `dist` 的后续修改不会改变固定发布副本。当前进程管理面向 macOS/Linux；不安装开机自启。

## 地址与证据

生产预览监听 `0.0.0.0:4178`。本机使用 `http://127.0.0.1:4178`；同一 tailnet 的设备使用这台 Mac 的 Tailscale IP 加端口，IP 可从 `tailscale ip -4` 获取。Harness 列出检测到的 IPv4 地址，网络可达性取决于现有路由/防火墙。实机测试时 Mac 需要保持开机、唤醒。

| 位置                                                                | 内容                                                               |
| ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `artifacts/<verification-run>/`                                     | Gate、任务结果、seed、初始存档、命令、回放、World 快照、截图/trace |
| `artifacts/publications/current.json`                               | 当前受管理服务及必填启动命令、地址、版本、证据路径                 |
| `artifacts/publications/<release-id>/site/`                         | 固定生产副本与 `release.json`                                      |
| 同目录 `server.log` / `result.json`                                 | 启动日志、成功/失败、清理与 rollback 结果                          |
| 同目录 `city.png` / `fishing-scene.png` / `catch.png` / `atlas.png` | 生产交互阶段截图，依实际到达步骤采集                               |
| 同目录 `mobile.png` / `console.json` / `save.json`                  | 烟测成功和失败都会尝试取得的最终证据                               |
| 同目录 `evidence-errors.json`                                       | 证据取得失败的详情；不能掩盖首个玩法错误                           |

生产包无 Debug Bridge。烟测以真实触摸/键盘、页面和隔离浏览器 localStorage 验证；`save.json` 只来自合成操作，不读取玩家设备的真实存档。存储不可读时保存 `null` 并记录采集问题；不能把证据缺失当作通过。启动前失败没有可截图的浏览器时，以发布结果和服务日志定位。

配置在 [local-preview.ts](../harness/tasks/local-preview.ts)，玩法验收在 [production-smoke.ts](../harness/adapters/catcity/production-smoke.ts)，通用进程/恢复在 [local-publication.ts](../harness/runner/local-publication.ts)。

## 手机体感需要 HTTPS

手机访问 Tailscale IP 的 HTTP 页面不能作为传感器安全上下文。账户开启 HTTPS Certificates/Serve 后，可使用只在 tailnet 内可见的 HTTPS 代理；不需要 Funnel。参见 [Serve 文档](https://tailscale.com/docs/features/tailscale-serve)与 [HTTPS 设置](https://tailscale.com/docs/how-to/set-up-https-certificates)。

在忽略于 Git 的 `.env.local` 设置 `CAT_CITY_PREVIEW_HOST=本机完整.ts.net主机名`，Vite 只增加该 Host。重新按正常流程发布，再执行：

```sh
tailscale serve --bg --https=443 http://127.0.0.1:4178
tailscale serve status
```

从返回的 HTTPS 地址访问，在河畔体感入口或“钓具 → 补充/设置”主动授权。拒绝、无硬件或无读数时仍可手动完成钓鱼。Serve 和预览服务独立管理，`harness -- stop` 只停止预览源服务。

自动化不证明真实手机的传感器方向、Safari 弹窗、触摸手感、GPU、振动或 tailnet 连通性。这些需要实机验证，不能用模拟事件或 API 调用成功代替。
