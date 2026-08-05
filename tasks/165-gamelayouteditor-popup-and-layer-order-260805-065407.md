# 165 Game Layout Editor 转场 Popup 与图层 order 执行报告

## 结果

任务已完成代码、文档与自动化 L2 验收。每条 Spine 有向转场现在都可独立选择“无”或一个普通
Spine Popup；不同 `from -> to` 边可以选择不同 package。配置 Popup 后，runtime 保持 source mode
当前画面并先执行 Popup `start -> loop -> end`，用户点击只请求结束，等 complete 后才启动已准备的
Spine overlay，并继续在既定 event 边界切换状态。转场 Popup 不创建独立 scene，而是在当前 scene 的
顶层 Popup root 中渲染。

普通图层与 main reel 的 order 现在都可输入安全整数。普通图层允许高于默认 `999` 的 main reel，
有效的稀疏 authored order 不会再被无关编辑事务压缩。node、main reel 和 Popup root order 全局不允许
重复；Popup 默认从 `2000` 开始分配且必须高于全部 node/main reel，其 order 可从 Popup 工作区或引用
它的转场编辑。

## 主要修改

- `packages/rendercore/scene-layout`：Popup binding 新增 canonical `order`；旧单 Popup v1 缺失时规范化为
  `2000`，重复 order 或 Popup 不在最上层时 strict failure。runtime 按 binding order 排序 Popup
  children，并保留现有 source-mode prelude 生命周期。
- `apps/gamelayouteditor`：新增集中式 layer-order command/诊断；普通图层、main reel 与 Popup order
  修改原子检查冲突，新增资源跳过已占用值；有效的 authored 稀疏顺序在 store transaction 中保持。
- 转场 Inspector：直接选择该 exact edge 的普通 Spine Popup，并显示所选 binding 的 order 与每个
  variant 的 viewport-center placement；不再暗示必须先做 programmatic registration。
- Popup 工作区：新增 root order 输入，保留 placement、preview 与高级 programmatic registration；
  award-celebration 和普通 Spine Popup 仍保持 strict 类型边界。
- production ZIP、重导与 CLI rewrite 保留 Popup order；Scene Layout、Editor、CLI、rendercore README
  和三份领域规则已同步。

## 自动化验收

- 四个目标 package `typecheck`：通过。
- 四个目标 package `build`：通过；Vite 仅报告既有 dynamic-import 与大 chunk warning。
- rendercore：85 files、668 tests 通过。
- Game Layout Editor：23 files、177 tests 通过。
- Game Layout Package CLI：6 files、19 tests 通过。
- gameframeworks：13 files、87 tests 通过。
- 合计 127 test files、951 tests 通过。
- Game Layout Editor、CLI、gameframeworks 全包 `lint`：通过；rendercore 本次修改的 6 个源/测试文件
  定向 lint：通过。
- 四个目标 package `format:check`：通过。
- `git diff --check`：通过。

rendercore 全包 lint 仍被未修改的 `packages/rendercore/src/popup/manifest.ts` 三条既有
`no-redeclare`（函数 overload）错误阻断；该文件不在本任务 diff 中，本任务没有借机修改无关基线。

## 浏览器验收交接

用户明确表示浏览器验收由用户执行，因此本报告不把 build、happy-dom 或 fake player 测试记为真实
视觉验收。建议人工确认：

1. 创建至少两条 Spine 转场，分别选择不同的普通 Spine Popup；另留一条不选 Popup。
2. 触发带 Popup 的转场，确认仍显示 source mode；循环中点击后完整播放 end，之后才出现 overlay 并
   切换状态。连续点击不应跳过 end。
3. 清空某条边的 Popup，确认只影响该边且恢复直接转场；导出、重导后各边选择保持不变。
4. 把普通图层 order 设为 `1000`（main reel 保持 `999`），确认图层实际显示在转轮上方；做 placement
   等无关编辑后数值仍为 `1000`。
5. 尝试重复 node/reel/Popup order，以及把 Popup order 设到普通图层之下，确认编辑失败且原值保留；
   再把 Popup 改为例如 `2005`，确认显示与导出/重导一致。
6. 确认背景与 main 仍在大纲中作为特殊项显示，普通图层按数值 order 排列。

## 范围说明

- 没有修改 Popup package 内部 layer/prompt/animation/tier authoring、video transition prelude 合同、
  game002/game003 业务触发、production assets、lockfile 或根工具链。
- 依赖恢复使用 frozen lockfile 且跳过 install scripts；`pnpm-lock.yaml` 未变化。
- 基线 HEAD：`4e9705610c2fe17a1987b3d490b15a27a71325dd`（detached worktree）。未 commit、未 push。
