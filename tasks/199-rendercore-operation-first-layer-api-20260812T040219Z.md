# 任务 199 执行报告：RenderCore operation 渲染第一层 API

## 结果

- 新增实例级 `SymbolArea.getSymbol({x,y})`，standard `RenderReelSet`、legacy
  `RenderGridCellReelSet` 与新 `RenderCellSpin` 使用同一 `SymbolRender` 合同。
- `SymbolRender` 可直接设置/等待 state、读写 presentation value、附加通用
  `RenderNode` 和 clone；游戏不需要 Handle、Snapshot、Geometry 或 Lease。
- façade 捕获 exact occurrence generation。spin、replacement、release、pool reuse、destroy
  后旧引用显式 stale；standard cascade 搬运同一 occurrence 时 façade 保持有效。
- `RenderSymbol` 新增独立 game underlay/overlay，state player 重建与 value overlay 清理不会
  删除游戏 attachment。pool release 会 detach 临时节点并拒绝晚到 playback。
- clone 复用 registry/resource，但拥有独立 `RenderSymbol`/player identity；不复制 attachment、
  once timeline 或 pending state。reel symbol 是 borrowed，禁止 destroy；clone 由创建者 destroy。
- 新增无 public plan 的 `RenderCellSpin`：逐格 `roll/start/settle/cancel`、不同格并发、
  同格冲突、targetless rolling、target 临时 landing、AbortSignal、manual update、pool 和
  cell-level `RenderNode` attachment。`roll/settle` 在目标 symbol 可立即 `getSymbol()` 后 resolve。
- Scene Layout package runtime 新增 `getSymbolArea("main")`；unknown area、runtime 未 ready 或
  main scene 未 commit 时沿用严格失败。
- game002v2 production source、logiccore、manifest、assets、生成物与 lockfile 均未修改；既有
  GridCell plan、continuous、Nearwin、cascade 和 edge API 保持兼容。

## 实际 public 命名

- Symbol：`SymbolPosition`、`SymbolArea`、`SymbolRender`、`RenderNode`、
  `createRenderNode()`。
- Cell spin：`CellSpin`、`RenderCellSpin`、`createRenderCellSpin()`、`CellRender`、
  `CellRollTarget`、`CellRollOptions`、`CellRollStartOptions`。
- Scene Layout：`SceneLayoutPackageRuntime.getSymbolArea(reelId)`。

`createRenderNode()` 是已有/未来 typed Spine、VNI、粒子、光效和图片播放器接入第一层的
adapter seam；本任务没有新增资源 kind、schema 或 fallback。

## 自动验收

以下命令通过：

```text
pnpm --filter @slotclientengine/rendercore exec vitest run tests/symbol/symbol-render.test.ts tests/reel/symbol-area.test.ts tests/reel/render-cell-spin.test.ts tests/reel/render-reel-set.test.ts tests/reel/render-grid-cell-reel-set.test.ts tests/scene-layout/package-runtime.test.ts
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore build
pnpm --filter game002v2 test
pnpm --filter game002v2 typecheck
git diff --check
```

- RenderCore：6 个测试文件、65 个测试通过。
- game002v2：8 个测试文件、15 个测试通过。
- 第一次并行启动 game002v2 test 时，直接依赖 `platformbootstrap-leo` 尚未完成 build，导致
  import resolution 失败；依赖构建完成后串行重跑全部通过，不是代码回归。
- 搜索确认新 CellSpin source 不引用 `GridCellReelSpinPlan`、`buildGridCellSpinPlan`、
  `CellSpinPlan` 或 `RefillPlan`。

## 浏览器人工验收

按用户要求由用户执行，本报告不把自动化当作视觉结果。建议确认：

1. 两个 cell stagger/并发滚动，分别落地后立即 `getSymbol(pos).setState("appear")`。
2. held 格在其它格滚动期间保持 occurrence 与动画连续。
3. targetless `start()` 后 `settle()` 精确落地；`cancel()` 不伪造 server target。
4. symbol/cell attachment 在 state 切换和滚动期间层级稳定，remove/destroy 后无残留。
5. clone 与来源独立播放，remove 后 destroy；borrowed reel symbol destroy 明确失败且不破坏画面。
6. game002v2 BaseGame 与 Nearwin/selective refill round 的 cadence、dimming、effect、landing/
   activation edge、cascade 和 pool identity 与任务前一致。

## 计划偏差

- 实现使用 `RenderCellSpin`/`createRenderCellSpin()` 命名，与仓库现有 class/factory 风格一致。
- 第一层同时提供 `SymbolRender.setValue/getValue`，用于已确认的 symbol 上数值变化玩法；它直接
  委托现有 presentation value controller，不增加 snapshot。
- 按任务计划实现了最小 `CellRender` attachment，而不是推迟到第二层，因为 Nearwin 类效果需要
  在目标 symbol 尚未落地时取得稳定 cell anchor。
- 未设计新 ReelSpin 运动 API、第二层 helper 或第三层模板。

## 关联文档

- 计划：`tasks/199-rendercore-operation-first-layer-api.md`
- 合同：`docs/rendercore-operation-first-layer-api.md`
- 包说明：`packages/rendercore/README.md`
- 长期规则：`docs/agent-rules/shared-game-runtime.md`
