# 012 View 结构整理

- 状态：验证中
- 来源：2026-09-28 代码检视（View）

## 问题

- 模块之间通过伪造 click、读取对方 DOM 属性和 3 个 MutationObserver 通信，挂载顺序脆弱。
- `view/fishing/panel.ts`（约 570 行）同时负责模板、渲染、按住输入、20 Hz 循环和抛竿守卫。
- 没有卸载路径：Phaser 实例、定时器、全局监听不释放；无限循环 tween 在对象销毁时不停止。
- 城市画面中猫的花色改变后不重绘。

## 验收标准

- 一个小的 View 状态对象承载地点、面板、暂停、按住和阶段；模块通过返回的函数或订阅交互。
- `fishing/panel.ts` 拆出输入控制器与模板。
- 所有 E2E 与截图保持一致。

## 进展

- [x] PR #4：`view/shell/place.ts` 的地点状态（`get`/`set`/`subscribe`）取代读取 `is-river` 类与城市侧的 MutationObserver；`Tools`（`close`/`openTalk`）与注入的 `talk()` 取代伪造 click（工具面板关闭、打开聊天、回城、发送回忆消息）。`is-river` 只剩样式用途。
- [x] 钓鱼阶段与表盘：030 重写体感时已改为读取 run 与注入的函数，MutationObserver 已移除。
- [x] 瞄准状态：`shell/place.ts` 的 `AimControl`（`get`/`set`/`subscribe`）由钓鱼面板持有；城市画布点水瞄准、体感倾斜预览都调用 `set`，河面画布订阅重绘，不再按 id 读取表单或派发伪造 `input`/`change` 事件。
- [x] `fishing/panel.ts` 拆分（634 → 约 470 行）：`fishing/template.ts`（标记、错误文案、按钮版阶段文案）、`fishing/controls.ts`（按住输入、暂停、抛竿点击守卫、20 Hz 钓鱼时钟）。
- [x] tween 泄漏：`catArt` 销毁时停止自身的循环 tween（河边同伴在 Mochi/Pepper 间切换时会销毁重建）。
- 不做：卸载路径——应用从不卸载，Vite 对入口做整页刷新，写了也没有调用方。
- 不做：换花色重绘——010 起花色由模板校验固定，运行中不会改变。

未采用"一个状态对象装下全部"：地点与瞄准是跨模块状态，各自一个小对象；暂停与按住只属于钓鱼控制器，经函数暴露；阶段直接来自快照。
