# 215 RenderCore reel slot snapshot 与 public commit 移除执行报告

## 结果

- 删除 `RenderReel.getSlotSnapshots()` 与 `RenderReelSlotSnapshot`，生产源码和测试不再取得包含 Pixi display object 的通用 slot snapshot。
- `getSlotRenderViews()` 保持创建期一次分配和 stable identity；新增 exact `getSlotRenderView(windowY)`，即时读取不创建数组、对象或 `.find()` callback。
- empty `SymbolRender` 的 display layer 创建收回 `RenderReel` owner，standard ReelSet、grid-cell 和 CellSpin 不再取得 raw slot container/layer。
- 删除 `PreparedVisibleOccurrenceReplacement`、`PreparedGridCellVisibleOccurrenceTransferBatch`、对应 reel/Scene Layout prepare passthrough，以及 `VisibleOccurrenceTransferScope.commit()`。
- replacement、direct transfer/drop 和 scoped choreography 均由 single-call/awaitable API 自动 finalization。错误直接 reject；RenderCore 不读取旧 logic scene、不执行业务 rollback，只清理未 finalization 的临时 display lease、listener、mask 和预创建资源。
- Scene Layout `applyMainReelSnapshot()` 改用整批 `replaceSymbols()`，保留 shape、hole/value、resource/capability preflight 和零半提交合同。
- Scene Layout game-mode/resource/geometry transition 的 prepare/commit 未修改。
- Crave 源码和 assets 未修改；更新迁移文档，明确旧 prepared API 已删除、scoped choreography 不再调用 `tx.commit()`。

## 回归覆盖

- stable live view identity、exact lookup、presentation value live getter。
- standard ReelSet、grid-cell、CellSpin replacement 整批 preflight 失败时零格提交。
- direct transfer exact hole、自动 finalization、abort/error cleanup。
- scoped choreography 自动 finalization、未完成 move 直接 reject、reset cleanup、occurrence/effect identity。
- Scene Layout package runtime 与 game002v2 直接消费链编译。

## 自动化验收

- `pnpm --filter @slotclientengine/rendercore typecheck`：通过。
- RenderCore 7 个定向测试文件：101 项通过。
- `pnpm --filter @slotclientengine/rendercore build`：通过。
- `pnpm --filter game002v2 typecheck`：通过。
- public legacy surface 搜索：仅 Crave 迁移文档中明确标注“已删除”的历史源项命中；`prepareVisibleOccurrenceMotion()` 是无 lifecycle 的纯 path/easing 计算 helper，不属于 prepared transaction。
- `git diff --check`：通过。

## 人工验收

- 浏览器视觉、Performance 和 Memory profiler 未执行，按用户要求由用户验收。
- 建议确认 Crave 首次/连续 spin、WM/CM/AF replacement、CO transfer、abort/reset 后画面，以及 steady frame 中无 slot snapshot/per-cell Map 分配热点。

## 剩余风险

- 本次删除 RenderCore public type/API；仓库内没有 app consumer，仓库外 consumer 如存在需按 breaking change 迁移。
- 人工浏览器性能证据待用户补充。
