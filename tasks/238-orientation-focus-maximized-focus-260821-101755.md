# 任务 238 执行报告

- 执行时间（UTC）：2026-08-21 10:17:55
- 任务计划：`tasks/238-orientation-focus-maximized-focus.md`
- 基线状态：detached HEAD `f3520395`，工作区干净
- 工具链：Node.js `v24.19.0`、pnpm `11.19.0`
- 浏览器验收：待用户执行（按用户要求，本次不代为操作浏览器）

## 完成内容

### 适配算法

- 新增 `calculateMaximizedResponsiveArtViewport()`：只按宿主原始 page 宽高选择 landscape/portrait variant，再把该 variant 的 actual `focusRect` 与显式 `minMargin` 作为 required focus，按 contain 取得最大等比 scale。
- 逻辑 viewport 由 `pageSize / focusScale` 反推，允许超出有限 art；没有显式 margin 时，focus 映射到 CSS page 后必有一轴与 page 相等。
- 新增 instance-local `createMaximizedResponsiveArtViewportPolicy()`：非正方形页面更新当前方向；正方形沿用上一个方向；首次正方形固定为 landscape。variant 缺失、非法 square variant、非法尺寸或 margin 均显式失败。
- 保留 generic `calculateResponsiveArtViewport()` 和 legacy frame helper，避免扩大到非 Scene Layout consumer；任务只迁移 Scene Layout orientation frame 目标。

### Scene Layout 与 Editor

- `resolveSceneLayoutFrameViewport()` 和 `createSceneLayoutFramePolicy()` 的 orientation 分支改为共享的 focus 最大化算法，不再使用 `frameFocusRect` 的“最大设计尺寸/最低容纳”规则。
- runtime、local scene flow 与 Game Layout Editor preview 传递上一 variant，保证 raw page 方向与正方形连续性一致；场景裁切显式映射 `minFocusMargin`。
- layout25 的 `299×466` 回归固定为：portrait、逻辑 viewport 约 `1056×1645.806`、CSS focus 约 `299×406.312`，focus 宽度贴合 page。

### 文档

- 更新 rendercore README、背景适配文档和 Scene Layout 领域规则，明确 raw page 选方向、actual focus contain 最大化、正方形连续性以及 legacy `frameFocusRect` 的边界。

## 自动化验收

- rendercore 定向测试：通过，`4` files / `46` tests。
- 额外 rendercore runtime 定向组合：通过，`4` files / `38` tests。
- gamelayouteditor preview 测试：通过，`1` file / `16` tests。
- `@slotclientengine/rendercore`、`gamelayouteditor`、`@slotclientengine/gameframeworks`、`game003v2` typecheck：全部通过。
- `git diff --check`：通过。

曾额外执行 rendercore 全量 `tests/scene-layout`。其中 `24` files / `217` tests 通过，另有 `14` 个与本任务无关的既存 fixture 失败：`configured-round-adapter.test.ts` 的旧 fixture 缺少非空 `manifest.nodes`，`manifest-upgrade.test.ts` 仍期望 latest version `3` 而当前 parser 返回 `4`。本任务没有修改这些文件，也未扩大范围修复它们。

## 浏览器验收交接

状态：**待用户验收**。本次没有启动或操作浏览器。

建议导入 `/Users/zerro/Downloads/minecart2/layout25.zip` 后确认：

1. 页面设为 `299×466` 时选择 portrait，逻辑尺寸约为 `1056×1645.806`。
2. 绿色 focus guide 完整显示，左右边与页面贴合，背景没有非等比拉伸。
3. 连续切换 landscape、portrait、near-square 和 square，确认 square 不发生方向抖动，背景、node 与 reel 使用同一 variant。
4. 切换 BaseGame、FreeGame、BonusGame，确认 geometry 稳定且 mode 资源与 placement 不串用。

## 计划偏差与剩余风险

- 实现按计划完成；额外补充了 local scene flow 的上一 variant 传递，以及策略创建时的 eager 参数校验。
- 浏览器视觉结果尚未执行，真实 ZIP 的最终画面由用户验收。
- 历史 package 若依赖旧逻辑画布尺寸，会观察到预期的缩放变化；未配置 margin 时 focus 必有一轴贴 page，显式 margin 则作为安全边界一起最大化。
