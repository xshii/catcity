# 012 View 结构整理

- 状态：进行中
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
- [ ] 钓鱼阶段与表盘：体感仍从 `data-phase`/`aria-valuenow` 读取并用一个 MutationObserver 监听——随 [030](../030-fishing-gestures/requirements.md) 重写体感与钓鱼面板时一并替换，避免做两遍。
- [ ] `fishing/panel.ts` 拆分：按 030 的新流程结构拆，不在旧流程上先拆。
- [ ] 卸载路径、tween 泄漏、换花色重绘。
