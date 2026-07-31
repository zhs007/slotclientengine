# 任务 149 执行报告

- 执行时间（UTC）：2026-07-31 10:49:01
- 任务计划：`tasks/149-popupeditor-vni-once-playback.md`
- 基线提交：`206d026`
- 基线工作区：干净
- 工具链：Node.js `v24.14.0`、pnpm `10.0.0`
- 浏览器验收：待用户执行（用户明确接手）

## 完成内容

### rendercore

- Popup v1 VNI layer playback 改为严格判别 union：既有
  `mode="segmented"` 保持三段式语义，新增 canonical
  `{ "mode": "once" }`。
- once 进入时显式 `setLoop(false)` 并播放完整 timeline；金额阶段结束、跨档或普通
  dismiss 不再调用 `requestSegmentedPlaybackEnd()`，因此不会另起 authored tail。
- once timeline 自然完成后，tier container 不因 transport completion 隐藏；非粒子画面保持
  VNI 终点采样，直到 tier 生命周期切换或 Popup 清理。现有 particle drain 与
  `dismissImmediately()` 语义保留。
- parser、资源 prepare、transport 和 award player 增加 strict schema、无 loop 字段、
  non-loop 调用、最后一帧保持及 segmented 兼容测试。

### popupeditor

- VNI 图层增加“分段循环 / 完整单次”选择。
- once 模式隐藏并移除 loop start/end 和 keep-particles 字段，显示完整 timeline 与最后一帧
  保持说明；切回 segmented 使用显式默认值并继续经过项目校验。
- manifest preview、项目 model 与 UI 测试证明 once 输出不残留分段字段。

### gamelayouteditor 与所有游戏消费链

- 按用户后续要求扩大直接消费者验收：gamelayouteditor popup ZIP 导入、scene-layout
  runtime 和 gamelayoutpkgcli content-addressed reference rewrite 均增加 once 保真测试。
- gamelayouteditor 不复制 Popup schema 或播放状态机，只通过 rendercore strict parser 和
  runtime 消费；README 补充该 ownership。
- 游戏 app 不需要逐个修改。所有游戏经 `@slotclientengine/gameframeworks` 使用共享
  rendercore Popup runtime；该门面已通过 typecheck。

## 计划偏差

- 用户在执行阶段明确要求覆盖 gamelayouteditor、rendercore、所有游戏和可能使用 Popup
  的编辑器，因此增加了 `apps/gamelayouteditor`、`apps/gamelayoutpkgcli` 和
  scene-layout 测试，超出原计划的最小文件范围。
- 没有在 gamelayouteditor 或游戏 app 增加第二套播放实现；共享行为仍由 rendercore
  单点拥有。
- 新增内部 `packages/rendercore/src/popup/vni-playback.ts`，集中 once/segmented transport
  分支，未扩大 vnicore public API。

## 自动化验收

- `pnpm --filter @slotclientengine/rendercore test`：通过，`75` files / `585` tests。
- `pnpm --filter popupeditor test`：通过，`4` files / `17` tests。
- `pnpm --filter gamelayouteditor test`：通过，`22` files / `167` tests。
- `pnpm --filter gamelayoutpkgcli test`：通过，`6` files / `17` tests。
- rendercore、popupeditor、gamelayouteditor、gamelayoutpkgcli 的 `typecheck`：通过。
- `pnpm --filter @slotclientengine/gameframeworks typecheck`：通过。
- rendercore、popupeditor、gamelayouteditor、gamelayoutpkgcli 的 `lint`：通过。
- rendercore、popupeditor、gamelayouteditor、gamelayoutpkgcli 的 `format:check`：通过。
- rendercore 与 popupeditor `build`：通过；仅保留已有 Vite chunk-size warning。
- `git diff --check`：通过。

## 真实 ZIP 与浏览器验收

- 输入：`/Users/zerro/Downloads/award-celebration-popup (2).zip`
- SHA-256：
  `372874982de48438f6f03e4d8995133cd2070a8aec39816195ab1aa17bcaeeff`
- 已静态确认三档 count 和 VNI duration 均为 `5.6s`；bigwin/superwin 的 segmented tail
  为 `1.0s`，megawin 为 `0.9s`。
- 浏览器人工验收未记为通过。用户明确表示由其执行，应按任务计划第 8 节确认三档切换
  once、`5.6s` 无尾段、count 大于动画时保持最后一帧，以及导出重导后 once 保真。

## 结论与剩余风险

- 根因确定为 Popup runtime 固定三段 transport，并在 transition/dismiss 请求 segmented
  end；不是 VNI 自身额外循环。
- 代码层已提供显式 once 修复，且共享运行时和编辑器消费链自动化验收通过。
- 唯一未完成项是用户接手的真实浏览器视觉、时序和 ZIP round-trip 验收。
- VNI 终点若由美术 authored 为不可见，runtime 会保持真实终点采样，不会伪造前一帧；
  timeline 完成后的粒子 drain 也不属于 segmented tail。
