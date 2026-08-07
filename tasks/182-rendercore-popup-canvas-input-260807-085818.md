# 182 rendercore-popup-canvas-input 执行报告

## 结果

已在 `packages/rendercore` 建立共享 Popup native input 合同，并接入 game002、Game Layout Editor 与
Popup Editor。Popup 可交互时，canvas 任意位置的 `pointerdown` 或 window 上任意非 repeat
`keydown` 会同步分派一次当前主操作；idle 不消费输入，destroy/rebuild 会解除监听。

Scene Layout runtime 统一拥有 phase 分派：prelude popup 请求 dismiss、award 请求 advance、
`awaiting-video-start` 在原始输入调用栈中启动 video。启用 DOM binding 时关闭 Pixi pointer fallback，
解绑后恢复，避免同一 pointer 双触发并保留未迁移 consumer 的兼容路径。

## 主要改动

- 新增 `rendercore/popup/input-binding.ts`：handled gating、repeat 过滤、同步 throw/异步 rejection 报告、
  幂等 disposer。
- Scene Layout package runtime/presentation surface 新增 `bindPopupInput()` 与
  `requestPrimaryPopupInteraction()`。
- game002 在 mount 时绑定真实 app canvas/window，移除 win-amount 专用 canvas pointer listener。
- Game Layout Editor 的 preview 与 Inspector 按钮改用统一主操作；runtime 替换和 destroy 会解绑旧目标。
- Popup Editor 的 award/Spine production preview 分别适配 advance/dismiss，并共用 rendercore helper。
- 同步 RenderCore、三个 app README、Scene Layout manifest 文档与三份稳定领域规则。
- 未修改 assets、manifest/schema、game003、依赖声明或 lockfile。

## 自动化验收

- `pnpm --filter @slotclientengine/rendercore --filter game002 --filter gamelayouteditor --filter popupeditor typecheck`：通过。
- `pnpm --filter @slotclientengine/rendercore --filter game002 --filter gamelayouteditor --filter popupeditor build`：通过；仅有既有大 chunk/dynamic import 警告。
- rendercore 本次相关 4 个测试文件：19/19 通过。
- game002 全量：24 files、180/180 通过，branch coverage 80.02%，达到门槛。
- Popup Editor 全量：4 files、24/24 通过。
- Game Layout Editor：22 files、184/185 通过；唯一失败为既有 Crave fixture map 缺少
  `symbol-state-textures.manifest.json`，本次相关测试均通过。
- rendercore 全量：87 files、703/708 通过；5 个失败及 1 个 suite 初始化失败均由 Crave fixture map
  缺少 `h1.json` / `symbol-state-textures.manifest.json` 导致，与本次输入代码无关。
- `git diff --check`：通过。
- 范围检查：assets、game003、logiccore、gameframeworks、uiframeworks、vnicore、package manifests 与
  `pnpm-lock.yaml` 无 diff。

## 计划偏差

- 共享 helper 直接放在 `popup/input-binding.ts` 并由 popup barrel 导出，没有修改既有 popup player types；
  其余 API/ownership 与计划一致。
- 浏览器人工验收按用户要求未由本会话执行，下面清单保持待验收。

## 浏览器验收交接

1. game002 使用 `assets/crave` 往返触发 BaseGame/FreeGame：分别测试 canvas 四角、中心、reel/透明区
   点击，以及字母键、方向键、Space/Enter；确认一次只推进一档，长按不连续推进。
2. Game Layout Editor 打开 crave layout，并启用 guides/selection/symbol overlay：重复 pointer/key 矩阵；
   idle 后确认原编辑器点击/按键仍可用，重导 preview 后旧 runtime 不再响应。
3. Popup Editor 分别预览 award 与普通 Spine Popup：确认任意 canvas 点/任意键各触发一次
   advance/dismiss。
4. 对带 video 的 prelude 额外确认第二次 pointer 与第二次 keydown 都能在目标浏览器启动有声视频，且
   play rejection 会显示错误。这一项涉及真实 user activation，单测不能替代。

## 剩余风险

自动化已覆盖 native event、exact-once、idle passthrough、repeat、错误转发和 disposer。剩余风险仅是目标
浏览器对 keydown media user activation 的平台差异，以及真实 Pixi overlay/event-system 组合，需以上人工
矩阵确认。
