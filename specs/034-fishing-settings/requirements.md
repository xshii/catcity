# 034 默认体感与河畔设置

- 状态：验证中（单测、View 测试台与相关 E2E 通过；待完整门禁、Harness 与实机）
- 来源：2026-09-29 用户实机试玩后："默认体感钓鱼，加一个设置按钮吧，做一个图标就行了"

## 问题

- 手机第一次进河畔先弹一张"开启体感钓鱼 / 改用按钮"卡片，要多点一下才能开始，体感并不是真正的默认。
- 设置散在四处：水面上浮着"校准甩竿"键，河畔另有"改用体感钓鱼"快捷键，"钓具 → 补充 / 设置"里还有体感、震动与音效开关。

## 设计（已确认）

1. **手机默认体感，不再有开启卡片。** 需要授权的浏览器（iOS 的 `DeviceMotionEvent.requestPermission`）在玩家的点按里自动请求：进入河畔的那一下（「河畔」键或地图卡「进入钓点」都是真正的点击，事件冒泡到 `window` 时已在河畔、仍在这次点按内），否则是之后在河畔的第一次点按（含 `touchend`：iOS 点画布水面不一定合成 click）。请求在点按处理里同步发出；浏览器提供 `navigator.userActivation` 时，不在用户激活内就不请求，免得被当成拒绝。每次打开页面至多自动请求一次。地图上点池塘格子（Phaser 的指针事件）只选中水域、打开地图卡，不进入河畔，因此不依赖它。
   - 拒绝：改用按钮，提示"体感未获授权，已改用按钮；可在设置里重试"；每次被拒都提示（在设置卡里重试又被拒时，盖住提示的设置卡把说明换成"仍未获授权 · 请在浏览器设置里允许「运动与方向访问」后重试"）。答复到来时玩家已改选按钮的，不提示、不监听传感器。
   - 自动请求只在河畔可玩时发生：设置卡或钓具面板开着（包括打开它们的那一下点按）、页面在后台时不请求；恢复的一竿只在暂停时请求（恢复的一竿以暂停开始），进行中不请求，免得授权弹窗耽误咬钩。浏览器没有 `navigator.userActivation`（iOS 16.4 之前）时只认 `click`，不认 `touchend`（滑动结束的 `touchend` 不算手势）。请求过后不再监听点按；不需授权或细指针的设备从不监听。
   - 不支持（非 HTTPS、没有传感器事件）：直接用按钮，不提示。
   - 桌面（细指针）不自动请求，默认按钮；可在设置里改用体感。
   - 玩家明确选过的方式按设备记住（`cat-city.fishing-input`），自动请求不算选择。首竿引导不变（spec 033 F3）；自动校准被设置卡、钓具面板或切到后台打断时，回到瞄准后重新开始，直到有一次校准走完（不论成败）。
2. **河畔设置齿轮。** 水面左上角（原"校准甩竿"键的位置）一个内联 SVG 齿轮键：读屏名"设置"，44×44，颜色全用 token。位置与体感平面用同一个算式（`water-view.ts` 的 `planeBox`，按画布实际位置），叠在体感平面之上：一竿进行中点齿轮打开设置，不会当成点水提竿。点开一张小设置卡（暖纸底、细线、柔影，与其他面板同一视觉）：
   - 钓鱼方式：体感 / 按钮分段切换，按下的是正在用的方式。有一竿进行时两段都禁用，写明"这一竿结束后才能换钓鱼方式"（一竿保持抛出时的方式）；被拒时写"体感未获授权 · 点「体感」重试"，点「体感」在这一下里重新请求；不支持时「体感」禁用并写"此设备或连接不支持体感（需 HTTPS 与陀螺仪）"；想用体感、已请求但还没读数时写"等待体感读数…（需陀螺仪）"。
   - 校准甩竿：只在体感瞄准、没有一竿时出现；点下即关闭设置卡，在水面开始校准。
   - 音效 开/关、震动（不能振动时为"画面反馈"）开/关：原开关与文案移到这里，存储键不变（音效 `cat-city.sound`；震动/画面反馈与之前一样不按设备记住）。
   - 点 ✕、点卡外或按 Esc 关闭，焦点回到齿轮。设置卡是模态对话框（`aria-modal`）：打开时 Tab 只在卡内的控件间循环。设置卡像钓具面板一样盖住钓鱼：打开时暂停输入，关闭后需明确继续；离开河畔或打开钓具面板时自动关闭。
3. **移除被取代的部分：** 浮动"校准甩竿"键、河畔的"改用体感钓鱼"快捷键与体感开关、"钓具 → 补充 / 设置"里的震动与音效开关（分页改名"补充"）。指向旧位置的文案改为新位置（校准失败："没感到两次一致的下甩，打开设置点「校准甩竿」再试一次"）。
4. **全部由纯状态与画面模型决定（spec 015）：** `view-state.ts` 新增 `settingsOpen`（只在河畔且没有钓具面板时为真；打开时不可玩；开始校准会关闭它）与 `motion.asked`（本页已请求过传感器）；`screen.ts` 的 `fishingScreen(...).settings`（齿轮、是否打开、两种方式的按下/禁用与说明、是否提供校准）、`askSensors`（这次点按是否该自动请求）与 `permissionNotice`（每次被拒的提示，按 `motion.refusals` 计数）。`view/fishing/settings.ts` 只应用模型、上报点按。

## 验收

- 纯模型与 reducer 单测：默认体感无卡片、手机在河畔的点按才请求且只一次、恢复的体感局要再请求、桌面不自动请求；设置卡或钓具面板开着、恢复的一竿进行中不请求；每次被拒都提示、已改选按钮则不提示；自动校准被打断后重来、走完后不再来；`planeBox`；设置卡各状态的按下、禁用与说明；齿轮只在河畔；设置卡盖住钓鱼；开始校准关闭设置卡；随机 2 万步事件下"设置卡只在河畔且无钓具面板时打开""`asked` 不回退"。
- View 测试台：手机进入河畔的那一下点按里请求两种传感器各一次（记录请求时 `navigator.userActivation.isActive`）；拒绝 → 按钮 + 提示，设置卡说明并可在点按里重试；非 HTTPS → 按钮、不请求、设置卡说明；按钮偏好的手机在设置卡里改用体感；刷新后恢复的一竿在第一次点水时再请求；齿轮开关（✕、卡外、Esc，焦点回到齿轮）；一竿进行时锁定方式、暂停这一竿；从设置卡校准；被设置卡打断的自动校准在关闭后重来；重试再被拒时设置卡换说明；答复晚于改选按钮时不提示、不监听；恢复的一竿只在暂停时点河面才请求；没有 `userActivation` 时只有 click 请求；请求后不再监听点按；设置卡内 Tab 循环；音效/震动在设置卡里切换并记住；钓具"补充"页不再有这些开关。
- E2E（Chromium 与 WebKit，`@motion-smoke`）：触屏上下文与 iOS 式授权替身，点「进入钓点」即在手势内请求、没有卡片，体感整竿与首竿引导照常；刷新后第一次点水再请求（Chromium）；一竿咬钩时点齿轮打开设置卡、不提竿（Chromium）。`river-layout`：390×844 的河畔场景不能被横向滚动（河面画布比手机宽）；390×844 与 375×667 齿轮在屏内、不小于 44×44、在水面上，不与"落点圈变绿＝对准了鱼影"标注和提示重叠，按钮模式下不与抛竿键重叠；设置卡在手机单屏内。
- 截图（390×844）：瞄准画面的齿轮、体感与按钮模式下打开的设置卡。

## 不做

- 不改 Core 与存档；不加依赖和图片。
- 震动/画面反馈开关仍不按设备记住（维持现状）。
- 真实 iPhone 上授权弹窗出现的时机、点水面的 `touchend` 是否算手势、齿轮位置的手感，需实机确认（020）。

## 进展

- [x] 2026-09-29，分支 `feat/fishing-settings`：
  - 实现：`src/view/fishing/view-state.ts`（`settingsOpen`、`motion.asked`、`settings`/`ask` 事件）、`src/view/fishing/screen.ts`（`settings`、`askSensors`、`permissionNotice`，删去 `motionCard`/`quick`/`toggle`/`calibrateButton` 及其文案）、新模块 `src/view/fishing/settings.ts` 与 `settings.css`、`src/view/motion/motion-fishing.ts`（点按请求、去掉卡片/快捷键/开关/校准键）、`panel.ts`、`layout.ts`（分页"补充"）、`template.ts`。设置卡与遮罩放在钓具面板同一层（`#angling`）：场景 `#fishing-stage` 自成层叠上下文，放在里面会被提示消息盖住。体感遛鱼的累计进度条与"跳过引导"让出齿轮的位置。
  - 测试：`tests/unit/fishing-view.test.ts`、`tests/unit/fishing-screen.test.ts`；`tests/view/fishing-motion.test.ts`、`tests/view/fishing-buttons.test.ts`；`tests/e2e/motion-fishing.spec.ts`、`tests/e2e/river-layout.spec.ts`；手机上下文与授权替身在 `tests/helpers/motion-phone.ts`（不设 `isMobile`：WebKit 的手机模拟把竖屏页面报成屏幕角 90°，合成倾斜会转向）。
  - 被有意替换的旧用例：一次性开启卡片（单测 "offers a phone that has not chosen only the motion card"、测试台 "a phone that has not chosen yet sees the motion card"、E2E "after a reload mid-run, phones are asked to re-enable motion"）→ 默认体感在点按里请求、刷新后第一次点按再请求；快捷键与钓具开关（"in button mode keeps the manual cast and offers the way back"、"labels the settings switch…"、"a phone in button mode can switch to motion right from the river"）→ 设置卡的方式说明与切换；浮动校准键（"shows the calibrate button while motion is ready to aim…"）→ 设置卡的校准。
  - 证据：`artifacts/s1/river-aim-gear.png`（体感瞄准与齿轮）、`settings-motion.png`、`settings-buttons.png`（两种模式下打开的设置卡）、`river-buttons-gear.png`、`river-denied-notice.png`、`settings-denied.png`（被拒的提示与说明）。
  - 限制：较长的提示消息在 390 宽时折成两行（`#notice` 从屏幕中线起排，可用宽度只有半屏，原有问题；已在 031 的 2026-09-29 修正中改为整宽居中）；提交时只运行了类型检查、lint、`test:coverage` 与 Chromium 上的 `river-layout`、`game`、`motion-fishing` 三个 E2E 文件；完整门禁（`npm run harness`）在推送前由 pre-push 运行，结果不在本文记录。恢复的体感一竿若玩家先点「继续钓鱼」，这一竿进行中不会请求传感器（可点水提竿、手指拖动遛鱼），暂停后点河面或这一竿结束后的下一次点按才请求。
- [x] 2026-09-29 门禁失败与代码评审后的修正：
  - 齿轮位置：原来用画布盒的百分比，体感平面用画布实际位置；进入河畔时 Phaser 晚一帧才把画布从 390 放大到 546，平面按旧画布摆放后无人重摆（只观察了画布盒），与齿轮错位。现在两者都经 `src/view/fishing/water-plane.ts` 的 `followWaterPlane`（同时观察画布盒与画布）按 `planeBox` 摆放。
  - 横向偏移：`.game-screen .map-card` 是 `overflow: hidden` 的滚动容器，而河面画布比手机宽 78px；浏览器或测试为显示某个控件而滚动时，整个场景被横移。改为 `overflow: clip`。
  - 其余见上文设计各条（齿轮层级、自动请求的时机、每次被拒的反馈、自动校准重来、答复晚到、模态与 Tab、监听的移除）。
