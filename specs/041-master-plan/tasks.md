# 041 总体规划：任务分解

- 配套文档：[需求分析](requirements.md)、[架构设计](design.md)、[美工、界面与交互](ui-design.md)、[能玩很多年](long-life.md)
- 读者：执行任务的 Coding Agent 和验收的用户。每个任务是一个分支、一个 PR、一次发版。
- 勾选规则：任务完成并合并后，在这里勾选并写上 PR 号和证据（测试名、命令、截图路径）。没有证据不勾选。

## 执行规程

每个任务都按这个规程做。规程里的"禁止"没有例外。

### 开工前

1. 读 `AGENTS.md`、`docs/architecture.md`、本任务引用的 spec 和 design.md 的对应章节。 带界面的任务还要读 [ui-design.md](ui-design.md) 第 1–4 节和第 9 节里对应的画面章节，并按它第 8 节交验收材料。
2. 读任务的"先读这些文件"。**先读代码再下结论**：文档可能过时，以代码为准，发现不一致就在报告里写出来。
3. 建分支和 worktree：
   ```sh
   cd /Users/gakki/dev/catcity && git fetch -q
   git worktree add -b <分支名> ../catcity-wt<NN> origin/main
   ln -s /Users/gakki/dev/catcity/node_modules ../catcity-wt<NN>/node_modules
   ```
4. 如果任务要新的依赖，在主检出 `/Users/gakki/dev/catcity` 里 `npm install`（worktree 共用它的 `node_modules`）。

### 开发中

1. **先写会失败的测试，再写实现。** 看到测试因为正确的原因失败之后才写实现。
2. 规则放 Core，数值放 `src/content/`，画面决定放纯函数（`screen.ts`），DOM 只应用。
3. 只改任务需要的文件。看到无关的问题记在报告里，不要顺手改。
4. 小步提交，每个提交都能通过类型检查：
   ```sh
   git -c user.email=33135740+xshii@users.noreply.github.com -c user.name=gakki commit -m "<type>(<scope>): <一句话>

   Co-Authored-By: <当前模型名> <noreply@anthropic.com>"
   ```
5. 本地验证只跑这三条，**不要自己跑浏览器测试和完整检查**，除非任务里写了要跑哪几个 spec：
   ```sh
   npm run typecheck && npm run lint && npm run test:coverage
   ```

### 合并

1. `git fetch && git merge origin/main`。`specs/README.md` 的索引表冲突时两边的行都保留。版本号冲突按 design.md 第 11 节处理。
2. 确认机器空闲（`uptime` 的负载低于 4，`pgrep -fl "harness/run.ts"` 没有输出），然后 `git push -u origin <分支名>`。推送会触发完整检查，约 5 分钟。
3. 完整检查失败：读 `artifacts/<最新目录>/checks.log` 和 `task-result.json`，找到**第一个**失败的原因，修复后重新推送。
4. 开 PR（正文末尾加 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`），等远程 CI：`gh pr checks <号> --watch`。
5. CI 通过后 `gh pr merge <号> --merge`。
6. 发测试版并核对版本号：
   ```sh
   cd /Users/gakki/dev/catcity-wt8 && git fetch -q && git checkout -q --detach origin/main && npm run harness -- publish-test
   curl -s --noproxy '*' https://gakkimac-mini.tail281095.ts.net/release.json
   ```
7. 告诉用户：版本号、这一版有什么、存档是否失效、哪些还没在真机上验证。

### 禁止

- 禁止直接推 main；禁止 `--no-verify`。
- 禁止删除或跳过失败的测试、放宽断言、调高超时、自动接受视觉基线。
- 禁止为了让模拟通过而改目标区间。区间是需求；模拟变红时改数值。确实要改区间时停下来问用户。
- 禁止在没有运行的情况下说"通过了"。报告里每个结论都要有命令和结果；没跑的写"没跑"。
- 禁止提交 `handover.md`、`artifacts/`、`dist*/`、`coverage/`。
- 禁止同时跑两个完整检查。

### 报告格式

每个任务结束时给用户：做了什么；改了哪些文件；跑了哪些命令、各通过多少；截图路径和你看到了什么；没验证的部分；和任务说明不一致的地方及原因。

### 卡住时

- 测试在高负载下超时、单独跑通过：先确认负载，机器空闲时重跑一次。连续两次空闲时失败就是真问题。
- 需求有两种读法：写出两种读法和各自的后果，问用户，不要自己挑一个。
- 任务比预想的大（超过约 400 行改动或触及任务没列出的模块）：停下来报告，建议怎么拆。

---

## 里程碑 M0：收尾

目标：把做了一半的东西做完，让"开心"这个状态拿得到。M0 的任务之间基本独立，T-01 到 T-04 可以并行开发、依次合并。

### [x] T-01 鱼篓按钮不重建（R-04）

- **完成**：PR #57（`5ee9c44`），测试版 `test-20260930-0917-5ee9c44c-31d489`。证据：`tests/view/fishing-bag.test.ts` 三条在旧代码上失败、新代码上通过；`npm run test:coverage` 74 个文件 705 条通过；推送前完整检查通过（E2E 51 条，验收 15 步），产物 `artifacts/2026-09-30T01-10-16-000Z-7137/`（`catcity-wt01`）。实现是 `catalog.ts` 的 `mountFishBag`；图鉴列表没有可点击元素，未改。
- **分支**：`fix/bag-buttons-stay`
- **依赖**：无。存档和内容版本不变。
- **先读这些文件**：`src/view/city/actions.ts`（参考实现）、`tests/view/city-panels.test.ts`（参考测试）、`src/view/fishing/catalog.ts`、`src/view/fishing/panel.ts` 里调用 `renderFishingCatalog` 的地方。
- **做什么**：`renderFishingCatalog` 现在对 `fish-inventory` 调 `replaceChildren()`。改成：按 `fish.id` 复用已有的行和按钮，只在文字或 `disabled` 变化时更新；鱼的集合或顺序变了才增删行。点击时按当时的世界取命令，不要闭包住旧的 `cat`。图鉴列表如果也有可点击元素，同样处理。
- **测试**（先写，画面测试台）：
  1. 鱼篓里有 2 条鱼，连续 5 次 `ADVANCE_TIME 10`（猫在恢复体力），"卖出"和"送给"按钮仍是同一个元素、仍在文档里。
  2. 卖掉一条后，另一条的按钮仍是原来的元素。
  3. 换一只选中的猫后，"送给 <名字>"的文字更新，点击送给的是新选中的猫。
- **验收**：三条测试在旧代码上失败、新代码上通过；`npm run test:coverage` 全绿；完整检查通过。
- **注意**：`resultNote` 和 `fish-tastes` 是纯文字，可以照旧每次写。

### [x] T-02 河畔的猫醒着（R-01）

- **完成**：PR #58（`875d128`），测试版 `test-20260930-0923-875d1286-974a27`。证据：`tests/unit/cat-look.test.ts` 河畔两条在旧代码上失败（`curled: true`）、新代码上通过；`tests/view/fishing-buttons.test.ts` 名册卡读屏不含"在休息"；推送前完整检查通过（单元与画面 709 条、E2E 51 条、验收 15 步），产物 `artifacts/2026-09-30T01-18-05-191Z-17214/`（`catcity-wt02`）；截图 `awake-after-cast.png`（390×844）与 `buttons-aim.png`（360×640）里猫坐着、睁眼。
- **分支**：`fix/awake-at-river`
- **依赖**：无。
- **先读这些文件**：`src/view/art/cat-look.ts`（`catPose`）、`tests/unit/cat-look.test.ts`、`src/view/art/river.ts` 约 513 行、`src/view/fishing/stage.ts` 约 51 行、`src/view/shell/place.ts`。
- **做什么**：给 `catPose` 加第三个参数 `{ atRiver: boolean }`。`atRiver` 为真时 `curled` 恒为假。`river.ts` 画同伴时传 `true`。`stage.ts` 的名册头像：当前地点是河畔并且这只猫是选中的同伴时传 `true`，其余传 `false`。城市场景不变。
- **测试**（先写，单元）：河畔、体力 50、没有进行中的一竿 → 不蜷睡；河畔、刚出结果 → 不蜷睡；城市、空闲、体力 50 → 蜷睡（保持现状）；城市、体力 100 → 不蜷睡。画面测试台：在河畔抛一竿之后名册头像的读屏文字不含"在休息"。
- **验收**：同上三条命令；完整检查通过；截图 390×844"抛过一竿后在瞄准"，猫是坐着的。

### [x] T-03 收获卡倒计时关闭（R-02）

- **完成**：PR #59（`3838dc9`），测试版 `test-20260930-0940-3838dc9e-32a933`。证据：`tests/unit/fishing-screen.test.ts` 的 `dismissed`/`catchCountdown` 用例与 `tests/view/catch-card.test.ts`（假定时器：3.9 秒还在、4 秒消失、点击关闭、面板或后台暂停 10 秒后续走、卡片消失不留计时器）在旧代码上失败、新代码上通过；推送前完整检查通过（单元与画面 721 条、E2E 53 条、验收 15 步），产物 `artifacts/2026-09-30T01-34-56-653Z-40579/`（`catcity-wt03`）；截图 `catch-countdown-390x844.png`、`catch-countdown-360x640.png` 为倒计时一半的收获卡。已知：360×640 上卡片压住设置齿轮一角（原有布局）；卡片不能用键盘关闭。
- **分支**：`feat/catch-card-countdown`
- **依赖**：无。
- **先读这些文件**：`src/view/fishing/view-state.ts`（事件 `said`、字段 `watched`）、`src/view/fishing/screen.ts`（`resultShown`、`noticeShown`）、`src/view/fishing/stage.ts`（`.catch-reveal`）、`src/view/fishing/panel.ts`、`tests/unit/fishing-screen.test.ts` 的"the catch card"一组、`tests/view/fishing-buttons.test.ts`。
- **做什么**：
  1. reducer 加事件 `{ type: 'dismissed' }`：没有进行中的一竿时清空 `watched`（和 `said` 效果相同）。
  2. 常量 `CATCH_CARD_MS = 4000` 放在 `screen.ts`。
  3. `panel.ts`：卡片从不显示变为显示时启动计时；到时派发 `dismissed`。工具面板、猫咪面板、设置面板打开，或 `document.hidden` 时暂停，恢复后继续剩余时间。卡片因为任何原因消失时清掉计时器。
  4. 卡片底边一条倒计时条，用 CSS 动画从满到空，时长用同一个常量（通过 CSS 变量传入）；`prefers-reduced-motion` 下不动画。
  5. 点卡片立即派发 `dismissed`。
- **测试**：reducer 单测（出现 → `dismissed` → 不显示；下一竿不受影响）；画面测试台用假定时器：4 秒后隐藏；3.9 秒时还在；点一下立即隐藏；面板打开 10 秒后关闭，卡片还在并继续倒计时。
- **验收**：三条命令；完整检查；截图"倒计时一半的收获卡"。
- **注意**：不要用 `setInterval` 每帧更新宽度；不要让计时器在卡片消失后还触发。

### [x] T-04 钓鱼时点猫有反应（R-03）

- **完成**：PR #62（`fb74c5f`），测试版 `test-20260930-1016-fb74c5f8-21e38a`。证据：`tests/unit/cat-reaction.test.ts`、`tests/view/cat-tap.test.ts` 在旧代码上失败、新代码上通过；E2E `fishing-scene.spec.ts` 遛鱼时点猫出现气泡且没有 `FISH_STRIKE`；推送前完整检查通过（单元与画面 865 条、E2E 59 条、验收 15 步），产物 `artifacts/2026-09-30T02-08-10-822Z-72530/`（`catcity-wt04`）；截图 `cat-bubble-390x844.png`、`cat-bubble-360x640.png`。与设计稿不同：气泡在猫头右侧（正上方是体感提示）；动作按任务只有三种；按钮方式遛鱼时操作条盖住猫。
- **分支**：`feat/tap-the-cat`
- **依赖**：T-02 先合并（都改 `river.ts` 的同伴）。
- **先读这些文件**：`src/view/art/river.ts`、`src/view/art/cat.ts`（`CatArt`）、`src/view/fishing/screen.ts` 的 `SCREEN_COPY`、`src/view/motion/motion-fishing.ts` 里水面层的 `pointer-events` 和首次点击请求授权的逻辑、spec 034。
- **做什么**：
  1. 纯函数 `catReaction({ band, phase, result, count })` 返回 `{ motion: 'hop' | 'tilt' | 'none', line: string }`。`phase` 是这一竿的阶段或 `null`；`result` 是刚显示的结果（钓到 / 跑了 / 无）。
  2. 台词表放在 `SCREEN_COPY` 旁：瞄准或间隙按心情四档各 2 句；等咬钩 2 句（小声）；咬钩和遛鱼 2 句（加油）；刚钓到 2 句；刚跑了 2 句（不责备）。`count` 用来轮换。
  3. 一个透明的 `<button>` 盖在猫上，可聚焦，读屏名"摸摸 <猫名>"。它不在水面层 `#motion-fishing` 里，层级在水面层之上。
  4. 触发后：猫做动作（`prefers-reduced-motion` 下不做），头上冒气泡 1.5 秒；气泡用 `aria-live="polite"`。0.5 秒内的重复点击忽略；新的点击替换旧气泡。
- **测试**：纯函数单测（每个阶段、每档心情、轮换）；画面测试台（按钮的名字；回车触发；气泡文字）；E2E 加进 `tests/e2e/fishing-scene.spec.ts`：遛鱼时触摸猫，出现气泡，并且没有发出 `FISH_STRIKE`。
- **验收**：三条命令；完整检查；截图"猫头上有气泡"。
- **不做**：不加心情和亲密；不从这里打开撸猫（T-05 之后再接）。

### [x] T-05 撸猫上线（R-05、R-20 – R-24）

- **完成**：PR #61（`fa3ba45`），存档 19，测试版 `test-20260930-1001-fa3ba454-3f0563`。用户 2026-09-30 决定：心情效果改为任意 8 游戏小时内最多 3 局（`CARE.pettingLifts`），R-23 两个目标都用完美玩家量（开心的竿 75% / 75%，60→80 需 3 局），实测表见 039 的"节奏"。证据：`tests/unit/petting.test.ts`、`tests/simulation/pacing.test.ts` 的撸猫玩家两条断言；推送前完整检查通过（单元与画面 851 条、E2E 57 条、验收 15 步），产物 `artifacts/2026-09-30T01-52-22-898Z-58714/`（`catcity-wt49`）；截图 `artifacts/T-05/{round,pull-away,result}-{390x844,360x640}.png`，按钮不挡脸。
- **分支**：已有 `feat/petting`，worktree `/Users/gakki/dev/catcity-wt49`，最后提交 `eca1273`。
- **依赖**：无（成长数值已在 main）。存档版本 19。
- **先读这些文件**：该分支的 `specs/039-petting/requirements.md`（全文）、design.md 第 8 节、`src/core/bond.ts`、`src/core/mood.ts`、`src/content/care.ts`、`src/view/shell/clock-speed.ts`、`tests/simulation/pacing.test.ts`。
- **做什么**（按顺序，每步一个提交）：
  1. 合入 `origin/main`。预期冲突：`src/core/schema.ts`（版本号和猫的字段）、`legacy-saves.test.ts`、`docs/architecture.md`、`specs/README.md`。存档版本取 19，补 `save-v18-content10.json` 拒绝样本。
  2. 亲密：`BOND.petting = 2`、`BOND.pettingPerDay = 3`；猫加 `pettingBond` 字段（`dailyCount`）；表现好的一局调用 `spendDaily` 和 `rewardBond`。删掉对旧的每小时亲密冷却的依赖。
  3. 心情：结算改用 `liftMood`。
  4. 时钟固定 1×：按 design.md 第 8 节加"小游戏进行中"标志。
  5. 布局：按 ui-design.md 5.5 改成"直接摸猫"：猫身上不放按钮和文字，四个部位是猫身体上的触摸区域，屏幕底部一条部位条显示已发现的喜好并作为键盘和读屏的操作目标；节奏提示固定在猫的上方，反应气泡固定在下方；猫躲开时留在屏幕内；结果页没有部位条，内容垂直居中。
  6. 节奏模拟加"会撸猫的玩家"：钓鱼为主，心情低于 80 且今天还有完整效果的局数时撸一局（知道最喜欢的部位）。断言 R-23 的两个目标。
- **测试**：更新 `tests/unit/petting.test.ts`（每日 3 局计亲密、第 4 局不计；开心时 +3；高位减半）；`pacing.test.ts` 新增两条断言；画面测试台"撸猫时时钟速度按钮被锁定"；`tests/e2e/petting.spec.ts` 重跑。
- **验收**：三条命令；完整检查；三张新截图（一局进行中、猫躲开、结果页），按钮不挡脸。
- **注意**：R-23 的目标达不到时改撸猫的心情数值或每小时局数，不改区间。模拟里的节奏要在每竿 30 和 60 游戏分钟两种下都断言。
- **已知弱点**（不在本任务解决，合并后请用户试玩再决定）：发现太快；两个"一般"的部位没有存在感；可以摸一下就等 12 秒。

---

## 里程碑 M1：个体的猫

目标：让世界里可以有 10 只各不相同的猫（伙伴猫上限，用户 2026-09-30 从 8 只改为 10 只）。M1 内部有严格顺序：T-10 → T-11 → T-12，T-13 可以和 T-12 并行。

### [x] T-10 猫的身份属于实例（R-10、R-11）

- **完成**：PR #68（`5bf8345`），存档 20，测试版 `test-20260930-1308-5bf83452-9ba1b3`。证据：`tests/integration/save-safety.test.ts`（每个新字段的篡改被拒绝）、`legacy-saves.test.ts`（v19 被拒绝）、`tests/unit/cat-identity.test.ts`（`catStage` 边界）；推送前完整检查通过（单元与画面 917 条、E2E 64 条、验收 15 步），产物 `artifacts/2026-09-30T04-58-50-212Z-32197/`（`catcity-wt10`）。`definitionId` 改可空推迟到 T-22（见本节第 1 步）。玩家看不到变化。
- **分支**：`feat/cat-identity`
- **依赖**：T-05 合并（都改猫的 schema，先后合并可以少一次冲突）。存档 20。
- **先读这些文件**：design.md 第 3 节；`src/core/schema.ts`（`catSchema`、`assertTemplate`）；`src/core/cats.ts`；`src/content/cats.ts`；`tests/unit/companionship.test.ts`；`tests/integration/save-safety.test.ts`。
- **做什么**：
  1. `catSchema` 加字段：`sex`、`bornMinute`、`generation`、`parents`、`neutered`、`talent`、`lastBredMinute`。`definitionId` 暂不改为可空（2026-09-30 调整：这时 Core 造不出没有模板的猫，枚举本身就拒绝 `null`；改可空会让画面模块为不存在的猫写兜底，挪到 T-22）。
  2. `CAT_DEFINITIONS` 每个模板加 `sex`（Mochi `F`，Pepper `M`）。
  3. `instantiateCat` 填初代的默认值。
  4. `assertTemplate` 改成 design.md 3.3 的两条分支。初代猫那一支完整实现。出生的猫那一支在本任务里**直接拒绝**（任何 `definitionId === null` 的猫都不合法），因为这时还没有能创建它们的命令；T-22 实现遗传后再放开，并接入"重算遗传并比较"。不要写一个"暂时不检查"的占位。
  5. 纯函数 `catStage(world, cat)`（content 里 `KITTEN_MINUTES = 2 × 1440`）。
- **测试**：每个新字段的篡改都被拒绝（初代猫 `generation: 2`、`parents` 非空、性别与模板不符、`talent: 1`）；存档往返；旧档 v19 被拒绝；`catStage` 的边界。
- **验收**：三条命令；完整检查。这一步玩家看不到变化，报告里说明。
- **不做**：不加任何命令和界面。

### [x] T-11 初代猫名单与邀请（R-12、R-13）

- **完成**：PR #70（`1b5635e`），内容 11，测试版 `test-20260930-1402-1b5635ec-2bdbff`。证据：`tests/unit/invite.test.ts`（每个拒绝条件、价格序列、出生点、回放）与画面测试台；推送前完整检查通过（单元与画面 945 条、E2E 66 条、验收 15 步），产物 `artifacts/2026-09-30T05-54-02-572Z-62760/`（`catcity-wt11`）；截图 `artifacts/T-11/invite-list-{390x844,360x640}.png`。
- **分支**：`feat/invite-cats`
- **依赖**：T-10。内容 11。
- **先读这些文件**：design.md 第 4 节；`src/core/fishing/commands.ts` 里的 `INVITE_PEPPER`；`src/content/city.ts` 的 `buildingPrice`；`src/view/` 里出现"邀请"的地方（`grep -rn "INVITE_PEPPER" src tests harness`）；`harness/adapters/catcity/browser.ts`。
- **做什么**：
  1. content：再定义 4 只初代猫（两公两母）。每只的喜欢的鱼从不同水域取，不要和 Mochi、Pepper 重复。名字、性格标签用中文玩家读得懂的词。
  2. 命令 `INVITE_CAT { definitionId }` 取代 `INVITE_PEPPER`；把它从 `fishing/commands.ts` 移到 `src/core/cats.ts` 或新的 `src/core/family.ts`（邀请不是钓鱼）。
  3. 规则：未邀请过、伙伴猫 < `MAX_COMPANIONS`、有空床位、金币够。错误码新增 `NO_BED`、`COMPANION_LIMIT`。费用函数 `invitePrice(已邀请数)`。
  4. 新猫入住空床；出生点取离住所最近的可走格子，平局按 `y`、`x`。
  5. 界面：猫咪面板里"邀请新伙伴"入口，列出还没邀请的猫（头像、品种、性别、性格、喜欢的鱼、价格），不满足条件时写明原因。
  6. 更新 harness 适配器和所有引用旧命令的测试。
- **测试**：每个拒绝条件一条单测，拒绝后世界不变；价格序列；出生点确定性；回放；画面测试台（名单、禁用原因、邀请后名单少一只）。
- **验收**：三条命令；完整检查；截图"邀请名单"。
- **注意**：旧流程里 Pepper 免费且不需要床位，新手引导和测试存档点（`tests/helpers/fishing-progress.ts`）依赖它，要一起改。

### [ ] T-12 猫咪面板重组（R-14）

- **分支**：先 `refactor/cats-panel-move`，再 `feat/cats-panel`（两个 PR）
- **依赖**：T-11。
- **先读这些文件**：design.md 10.1、10.2；`src/view/fishing/stage.ts`（名册）；`src/view/shell/panel.ts`、`src/view/shell/model.ts`、`src/view/companion/journal.ts`、`src/view/shell/bond.ts`、`src/view/shell/mood.ts`；spec 015；`tests/view/cat-bond.test.ts`。
- **做什么**：
  - PR 1（搬迁，行为不变）：建 `src/view/cats/`，把名册和详情的代码搬进去，拆成 `view-state.ts`、`screen.ts`、`roster.ts`、`detail.ts`。现有测试一条不改地通过。
  - PR 2（新内容）：名册纵向滚动，容纳 10 只；每行头像、名字、世代徽标、性别、心情、亲密；详情分区"现在 / 喜好 / 家人"；按 10.2 的规则复用元素。
- **测试**：PR 1 只跑现有测试。PR 2：`screen.ts` 单测；画面测试台（10 只猫的存档、选中切换、5 次时钟推进后行元素不变）；E2E 在 390×844 和 360×640 检查名册不产生横向滚动、最后一只猫可以滚动到。
- **验收**：三条命令；完整检查；两个尺寸的截图。
- **注意**：10 只猫的存档用 Core 命令预制，不要在浏览器里一只只邀请。

### [x] T-13 花色与品种画得出区别（R-15）

- **完成**：PR #71（`7a800d2`），存档 21、内容 12，测试版 `test-20260930-1517-7a800d2b-49e02b`。证据：`cat-look` 单测（8 种组合、token 一致、对比度 ≥ 3:1，用户决定调浅橘与灰）、存档往返与篡改；推送前完整检查通过（单元与画面 970 条、E2E 69 条、验收 15 步），产物 `artifacts/2026-09-30T07-07-43-757Z-88554/`（`catcity-wt13`）；截图 `artifacts/T-13/coats.png` 与两个尺寸的地图、名册。外观之后由 T-14 改为分层五项。
- **分支**：`style/cat-coats`
- **依赖**：T-10。可与 T-12 并行。
- **先读这些文件**：`src/view/art/cat-look.ts`（`CAT_COLOURS`、`CAT_ART`）、`src/view/art/cat.ts`、`src/view/styles/tokens.css`、`tests/unit/cat-look.test.ts`。
- **做什么**：花色从 2 种扩到 4 种（首批：奶油、灰、橘、黑白），schema 的 `coat` 枚举同步（存档格式变化：如果 T-10 还没合并就并入它的版本 20，否则再升一版）；品种用耳朵和尾巴的轮廓区分（布偶：毛茸尾；英短：圆脸短耳）。颜色值进 `tokens.css` 并由单测核对和 TS 常量一致。
- **验收**：三条命令；完整检查；一张 4 花色 × 2 品种的对照截图。

---

### [ ] T-14 捏猫：外观五项与流浪猫开局（R-17）

- **分支**：`feat/cat-looks`（两个 PR）
- **依赖**：T-13。存档 +1，内容 +1。
- **先读这些文件**：[cat-looks.md](cat-looks.md)（全文）、ui-design.md 2.2 与 6.1、`src/view/art/cat-look.ts`、`src/view/art/cat.ts`、`src/view/art/illustrations.ts`、`src/content/cats.ts`、`src/content/breeds.ts`、`src/core/schema.ts`（`appearance`、`assertTemplate`）、`src/core/world.ts`（新世界怎么建）。
- **做什么**：
  - PR 1（画法与画面）：外观五项的分层画法（三种品种轮廓上叠脸型、毛色、花纹、白斑、眼色），深色毛用浅色描线；捏猫画面模块（纯模型 + DOM 应用，能不能选品种由输入决定），🎲 随机用注入的随机源；一张"所有选项"的对照图。这一步不改存档。
  - PR 2（开局）：`DOMESTIC` 田园猫品种；外观五项入档取代 `coat`；新游戏开场"捡到一只流浪猫"，进入捏猫画面选品种与外观，确认后开始；校验按 cat-looks.md 第 2 节（外观不再和模板比）；三种开局品种下节奏与平衡模拟都达标。
- **测试**：见 cat-looks.md 第 5 节。截图 390×844、360×640（捏猫画面默认、随机后）与对照图。
- **不做**：自动起名；每只猫的随机差异；美容院（T-15）。

### [ ] T-15 猫咪美容院（R-18）

- **分支**：`feat/cat-salon`
- **依赖**：T-14。存档可能 +1（新建筑类型），内容 +1。
- **做什么**：建筑 `CAT_SALON`（价格由经济模拟定标）；命令 `RESTYLE_CAT { catId, appearance }`，每次收 `RESTYLE_PRICE`（先定 50），错误码 `NO_SALON`、`INSUFFICIENT_COINS`、`APPEARANCE_UNCHANGED`；点美容院选一只伙伴猫，复用 T-14 的捏猫画面（不能选品种）。
- **测试**：每个拒绝条件世界不变；收费；外观改后名册和地图同步；画面测试台走一遍；截图。

---

## 里程碑 M2：家庭

顺序：T-20、T-21 可并行 → T-22 → T-23、T-24 可并行。

### [ ] T-20 绝育（R-30）

- **分支**：`feat/neuter`。依赖 T-12。内容 12。
- **做什么**：命令 `NEUTER_CAT { catId }`；content `NEUTER_PRICE = 100`；错误码 `ALREADY_NEUTERED`、`CAT_TOO_YOUNG`；猫详情"家人"分区里的按钮，点了先出确认框，写明"不可撤销"。
- **测试**：成功扣费并置位；重复、幼猫、金币不足被拒且世界不变；确认框取消不发命令。
- **验收**：三条命令；完整检查；截图确认框。

### [ ] T-21 生育条件（R-31）

- **分支**：`feat/breed-check`。依赖 T-10。
- **做什么**：`src/core/family.ts` 的 `related`、`breedBlocks`（design.md 5.1）；content `family.ts`：`BREED_BOND_LEVEL = 2`（信任）、`BREED_COOLDOWN_MINUTES = 3 × 1440`；界面：在猫详情选"和谁生小猫"，列出其他猫，每只下面逐条显示未满足的条件（中文文案放 `screen.ts`）。
- **测试**：每个条件单独不满足时恰好返回那一条；多条不满足时全部返回；同胞和父母—子女被判定为亲属，表亲不算。
- **验收**：三条命令。这一步没有命令，存档格式不变；伙伴猫上限改为 10（用户 2026-09-30）是内容数值变化，内容版本升到 13，并补 `save-v21-content12.json` 拒绝样本。

### [ ] T-22 生育与遗传（R-32 – R-35）

- **2026-09-30 更新**：后代属性改为三项（钓感、耐力、亲人）加家族传承，参考《中国式家长》，见 design.md 5.4；外观按 T-14 的五项逐层遗传。

- **分支**：`feat/breed`。依赖 T-20、T-21。存档 21；内容 12（与 T-20 同一版，后合并的不再升）。
- **先读这些文件**：design.md 5.2 – 5.4；`src/core/random.ts`；`src/minigames/angling.ts` 和 `angling-motion.ts` 里 `happy` 加成的读法；`tests/simulation/fight-balance.test.ts`。
- **做什么**：
  1. `inherit(seed, kittenId, mother, father)`。
  2. 命令 `BREED_CATS`。
  3. 放开 T-10 里对出生的猫的拒绝：`definitionId` 改为可空（T-10 推迟到这里），接入"重算遗传并比较"的校验；画面里按模板取的地方（`view/shell/model.ts` 的性格标签、`view/petting/screen.ts` 的撸猫台词）改为读猫自己的字段。
  4. 天赋：开一竿时把猫的 `talent` 读进这一竿的状态（这一竿的 schema 加一个字段，**存档升到 21**）。
  5. 界面：确认框复用 T-25 的起名框（输入或点选推荐名）；成功后出庆祝卡，选中小猫。如果 T-25 还没做，先在本任务里做起名框，T-25 只剩改名。
- **测试**：遗传的确定性和分布（1000 个种子里每项特征确实来自父母之一）；取消不消耗 id；篡改小猫的任何遗传特征被拒绝；天赋上限 4；平衡模拟：天赋 4 让新手 4★ 上鱼率提升不超过 10 个百分点。
- **节奏模拟**：从新游戏到第一只小猫的实际时间在 1.5–2.5 小时；到五代目至少 5 小时。
- **验收**：三条命令；完整检查；截图起名框和小猫详情。

### [ ] T-25 起名与快捷选名（R-16）

- **分支**：`feat/cat-names`。依赖 T-12（猫详情）。可以在 T-22 之前做：先上线"改名"，T-22 的起名框直接复用。内容版本 +1（新增名字表）；存档格式不变。
- **先读这些文件**：design.md 5.2.1；ui-design.md 5.4 的"起名的交互"；`src/core/random.ts`；`src/core/schema.ts` 里猫的 `name`；`src/providers/rule-dialogue.ts` 和 `src/view/companion/journal.ts` 里用到名字的地方。
- **做什么**：
  1. `src/content/names.ts`：约 60 个名字。
  2. 纯函数 `suggestNames(world, salt, page)`。
  3. 命令 `RENAME_CAT { catId, name }`，错误码 `NAME_UNCHANGED`。名字的校验写成一个 schema，`RENAME_CAT`、之后的 `BREED_CATS` 和存档共用。
  4. 起名框做成一个独立的画面模块（`src/view/cats/name-dialog.ts` 加它的纯模型），输入：标题、确认按钮文字、初始名字、`salt`；输出：确认时的名字或取消。
  5. 猫详情里名字旁的铅笔按钮。
- **测试**：
  - 单元：推荐名确定、6 个互不相同、不含城里已有的名字、换页不重复直到名字表用完；校验的边界（空、1、12、13 个字符、只有空白、含换行）；改名成功后对话和回忆显示新名字；名字没变被拒且世界不变；居民不能改名。
  - 画面测试台：打开时预填第一个推荐名且输入框没有焦点；点推荐名填入并选中；换一批不改输入框；清空后提交用第一个推荐名；只用键盘完成改名；重名时出现提醒且仍可确认。
  - E2E（390×844，触摸）：点铅笔、点一个推荐名、确认，名册里的名字变了，刷新后还在；输入框聚焦时确认按钮在可视区域内。
- **验收**：三条命令；完整检查；截图起名框（默认状态、键盘弹出状态）。
- **注意**：键盘弹出时的布局只能在真机上确认，报告里写明没验证。名字是玩家输入的文字，显示时一律用 `textContent`，不要拼进 HTML。

### [ ] T-23 幼猫期（R-36）

- **分支**：`feat/kitten`。依赖 T-22。
- **做什么**：幼猫对 `FISH_BEGIN`、`TRAVEL_TO_FISHING_SPOT`、`BREED_CATS`、`NEUTER_CAT` 报 `CAT_TOO_YOUNG`；`catPose` 返回 `small: true`，画得小一号；详情显示"还有 N 小时长大"。
- **测试**：边界时刻（差 1 分钟、正好到）；分块推进等价；N-1 的模拟加入幼猫。

### [ ] T-24 家谱（R-34、R-37）

- **分支**：`feat/family-tree`。依赖 T-22。
- **做什么**：纯函数 `familyOf(world, catId) → { mother, father, children[] }`；详情"家人"分区；名册行的世代徽标（"二代目"）；点名字切换选中的猫。

---

## 里程碑 M3：居民

顺序：T-30 → T-31 → T-32。

### [ ] T-30 居民楼与居民到来（R-40 – R-42、R-46）

- **分支**：`feat/residents`。存档 22，内容 13。
- **先读这些文件**：design.md 第 6 节；`src/core/simulation.ts`；`src/core/city/building.ts`；`src/content/city.ts`。
- **做什么**：建筑 `CAT_LODGE`（容量 4，价格 `250 × 1.6^(n−1)`，起始值由 T-31 的模拟定标）；`world.residents`；每个游戏日开始时到来一只；`residentIdentity(seed, id)` 推导名字、品种、花色、性别；校验（`home` 存在且是居民楼、每座不超过 4、`arrivedMinute ≤ minute`、总数 ≤ 16）。
- **测试**：到来的节奏、分块推进等价、住满后不再来、搬移居民楼后居民跟着；存档往返；篡改被拒绝。

### [ ] T-31 居民是客人，经济重新定标（R-43）

- **分支**：`feat/resident-customers`。内容 14。
- **做什么**：`cafeAssignment` 纳入居民；`tests/simulation/economy.test.ts` 的满城改为 8 伙伴 + 16 居民、4 公寓 + 4 居民楼 + 5 猫咖；重跑四个目标，调价格参数直到达标。
- **验收**：报告里给出新旧数值和四个目标的实测；给出两组备选。

### [ ] T-32 地图上的居民（R-44、R-45）

- **分支**：`feat/residents-on-map`。
- **做什么**：`residentPlace`；`src/view/art/residents.ts` 绘制（比伙伴猫小，错开半格，沿用 `walkGlide` 的滑行）；点居民显示名字和一句招呼。
- **测试**：`residentPlace` 的纯函数单测（周期、相位、无猫咖时在家）；居民不出现在 `isWalkable` 的障碍里；E2E：点居民出现招呼，点同一格的地块操作不受影响。
- **性能**：16 只居民时每帧的绘制不做寻路；路线按世界快照缓存。

---

## 里程碑 M4：心愿与长线

### [ ] T-40 心愿 Core（R-50 – R-53）

- **分支**：`feat/wishes-core`。存档 23，内容 15。
- **做什么**：design.md 第 7 节。首批五种心愿。
- **测试**：候选只含做得到的事；每种心愿的完成路径；没有期限；完成当天不生成新的；N-1 的模拟（有未完成的心愿不影响心情）。
- **节奏模拟**：心愿占亲密来源的 15–30%；到"家人"的总鱼数仍在 500–800。

### [ ] T-41 心愿界面

- **分支**：`feat/wishes-ui`。依赖 T-40、T-12。
- **做什么**：名册行的小图标；详情"现在"分区显示心愿和"怎么完成"的一句话；完成时的提示和猫的一句话；河畔选鱼饵时如果同伴的心愿是某种鱼，给一句提示。

### [x] T-42 图鉴评星（R-54）

- **完成**：PR #60（`90a1aa6`，图鉴评星）与 PR #65（`d6f65f5`，金星动画），测试版 `test-20260930-1234-d6f65f56-043ac4`。证据：`tests/unit/atlas-stars.test.ts`、`tests/simulation/atlas-stars.test.ts`（按真实体长公式枚举每个重量核对概率）、`tests/view/atlas-stars.test.ts`；推送前完整检查通过（PR #60：单元与画面 737 条、E2E 55 条；PR #65：877 条、E2E 60 条；验收 15 步）；截图 `atlas-stars-390.png`、`atlas-stars-360.png`（`catcity-wt42`），`gold-catch-glint.png`、`gold-catch.png`（`catcity-wt43`）。另按用户决定：没钓到的鱼只显示星级和出没地点（PR #63）。
- **分支**：`feat/atlas-stars`。存档不变。
- **做什么**（用户 2026-09-30 决定，取代原来的"体长范围的 50% / 75% / 95%"）：几种典型的铜 / 银 / 金概率（`STAR_ODDS`）按鱼的星级套用，星级越高金星越难、铜星不是钓到过就有；每种鱼的毫米门槛由体长公式推导；纯函数 `lengthStar(speciesId, bestLengthMm)`。图鉴只显示钓到过的鱼三颗星各自有没有，不显示门槛和还差多少；三颗都有的插画围金色细线。新鱼种和首次达到某颗星时，收获卡附注说一句，由前后快照比较得出。见 [ui-design.md](ui-design.md) 5.9。图鉴评星由 PR #60 完成；金星的一竿收获卡带金光动画（用户"金星钓上来带一点动画效果吧"）由分支 `feat/gold-catch` 的 PR 完成。
- **测试**：逐个枚举重量、用实际体长公式核对每种鱼三颗星的概率和目标差不超过 1 个百分点；分布的单调性；`lengthStar` 边界；图鉴只给钓到过的鱼显示星；新鱼种的附注（画面测试台）。

---

## 里程碑 M5：能玩很多年

猫历、四季、天气、节日、回忆相册、摆件、当季的鱼。需求、设计与任务 T-60 到 T-70 见 [long-life.md](long-life.md) 第 10 节；依赖 M1，部分依赖 M2、M3。

## 里程碑 M6：内容（按需取用，每项单独立 spec）

- T-80 品种扩到 4 个，各有一种专属鱼（需要新鱼种和平衡模拟）。
- T-81 公园：范围内猫的心情回落点 +3。
- T-82 新开一城（spec 024）。
- T-83 可关闭的真实 AI 对话（spec 023）。用相册（T-63）作为猫的记忆来源。

---

## 依赖图

```
M0:  T-01   T-02 ─→ T-04   T-03   T-05
                                    │
M1:                               T-10 ─→ T-11 ─→ T-12 ─→（M2 的界面）
                                    └────→ T-13
M2:            T-12 ─→ T-25（起名框，T-22 复用）
                       T-10 ─→ T-21 ─┐
                       T-12 ─→ T-20 ─┴→ T-22 ─→ T-23
                                          └────→ T-24
M3:  T-30 ─→ T-31 ─→ T-32          （与 M2 无依赖，可在 M1 之后并行）
M4:  T-40 ─→ T-41                  （T-41 依赖 T-12）
     T-42                          （无依赖）
```

## 每个里程碑结束时的验收

| 里程碑 | 用户在手机上应该能做到                                             |
| ------ | ------------------------------------------------------------------ |
| M0     | 钓鱼间隙摸摸猫让它开心，看到经验加成；收获卡自己消失；点猫有回应   |
| M1     | 花金币邀请第三、第四只猫；在名册里区分它们                         |
| M2     | 让两只开心的猫生一只小猫，给它起名，两天后带它去钓鱼；看到"二代目" |
| M3     | 建一座居民楼，几天后看到陌生的猫在路上走，猫咖收入上涨             |
| M4     | 看到 Mochi 想要一条鲫鱼，钓到送给它，得到一句具体的感谢            |
