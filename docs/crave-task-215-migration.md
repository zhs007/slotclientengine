# Crave 任务 215 迁移文档

## 目的

将 Crave 接入 slotclientengine 任务 215 的 RenderCore 改动：移除 reel slot snapshot、公开 prepared transaction 和调用方负责的
`commit()`，改用同步 direct mutation 或 awaitable transfer API。

本文是 Crave 的实施清单，不代表已经修改或验收 `/Users/zerro/gitee.com/pixicrave`。

## 核对基线

- slotclientengine 实现提交：`8473307 refactor(rendercore): remove reel slot snapshot transactions`。
- Crave 核对基线：`master@e726d37acf4da4238df29830b0b374fa23638d6c`。
- 核对时 Crave 工作区 clean。
- Crave 将 RenderCore 源码放在自身 `packages/rendercore` 中；当前版本仍包含 `getSlotSnapshots()`、
  `prepareMainReelVisibleOccurrenceReplacement()`、`prepareMainReelVisibleOccurrenceTransferBatch()` 和公开 `commit()`。
- Crave app 没有直接使用 `getSlotSnapshots()` 或 `RenderReelSlotSnapshot`；app 侧 breaking change 集中在
  `apps/crave/src/feature-anis.ts`。

## 迁移边界

本次需要完成：

1. 将任务 215 的 RenderCore 实现及相关测试、类型和 RenderCore 文档同步到 Crave 的 `packages/rendercore`。
2. 将 `feature-anis.ts` 中已删除的 Scene Layout prepared API 改成 direct API。
3. 删除没有调用者的旧手动 transfer helper。
4. 完成 Crave typecheck、定向测试和残留 API 搜索；浏览器验收由项目负责人执行。

本次不做：

- 不修改 LogicCore scene、服务端 scene 或 round 数据结构。
- 不迁移 Crave 的 initial/refill、cascade plan、Nearwin 或整个 grid-cell spin 流程。
- 不修改资源、manifest、YAML 或生成物。
- 不删除 Scene Layout game-mode/resource/geometry transition 的 prepare/commit；它是独立的资源原子切换合同。
- 不因为看到 `requestAnimationFrame` 就全局删除；只删除旧手动 occurrence transfer helper 内的 RAF。
- 不在 Crave 增加失败回滚或用旧 logic scene 恢复画面。

## 第一步：同步 RenderCore 任务 215

优先在两个仓库历史兼容时移植提交 `8473307`；如果不能直接 cherry-pick，则按该提交的 RenderCore diff 同步，不要只删除 public type。
实现、内部消费者和测试必须一起迁移，否则 grid-cell、CellSpin 或 standard ReelSet 仍会引用已删除的 snapshot。

任务 215 的核心合同是：

- 删除 `RenderReel.getSlotSnapshots()` 和 `RenderReelSlotSnapshot`。
- 使用 stable live render view；exact slot 查找使用 `getSlotRenderView(windowY)`。
- 删除 `PreparedVisibleOccurrenceReplacement` 和 `PreparedGridCellVisibleOccurrenceTransferBatch`。
- 删除 Scene Layout 对应的两个 `prepareMainReel...` passthrough。
- 删除 `VisibleOccurrenceTransferScope.commit()`；scoped callback 中 `move()` 完成并正常返回后自动 finalization。
- replacement 使用 `SymbolMutationArea.replaceSymbol()` 或 `replaceSymbols()`。
- transfer 使用 `await transferMainReelSymbols(...)`；Promise resolve 代表 finalization 已完成。
- 出错或 abort 时直接 reject。RenderCore 只清理未 finalization 的临时 display lease、listener、mask 和预创建资源，不恢复 logic scene，
  不撤销已经 finalization 的业务 mutation。

同步后先在 Crave 仓库确认 RenderCore 自身通过，再修改 app consumer。不要手改 `dist`、声明输出或其他生成物。

## 第二步：迁移 `feature-anis.ts`

### `chgBn`

当前位置：`apps/crave/src/feature-anis.ts:88` 附近。

当前代码在双层循环中逐格执行：

```ts
prepareMainReelVisibleOccurrenceReplacement(...);
replacement.commit();
replacement.destroy();
```

改为先收集全部 BN replacement，再执行一次：

```ts
runtime.getSymbolMutationArea("main").replaceSymbols(
  replacements.map(({ position, code, value }) => ({
    position,
    target: { code, value },
  })),
);
```

保持原有“只有 current scene 与 component scene 不同且目标是 BN 才替换”的条件。空数组时不调用 `replaceSymbols()`。

### WM → CN

当前位置：`apps/crave/src/feature-anis.ts:271` 附近。

保留 `change` 动画的 await 和现有 before/after code 数据校验。动画完成后，将 `wm2cnItems` 映射成一个
`replaceSymbols()` 批次，不再逐格 prepare/commit/destroy。

不要把 `change`、`Feature5` 等 Crave state 名放进 replacement target；这些动画仍由 Crave 编排。

### CM transfer replacement

当前位置：`apps/crave/src/feature-anis.ts:382` 附近。

每个 `applyItem` 当前有独立动画时序，因此可以保留外层顺序，在原 replacement 位置调用：

```ts
runtime
  .getSymbolMutationArea("main")
  .replaceSymbol(applyItem.transfer.position, {
    code: applyItem.transfer.afterCode!,
    value: applyItem.transfer.afterMultiplier,
  });
```

本任务不要求顺带重写 `setMainReelSymbolPresentationValue()` 循环；它不是任务 215 删除的 API。若另行改成 group
`setValues()`，应作为独立、可验收的行为变更处理。

### CO

当前位置：`apps/crave/src/feature-anis.ts:572` 附近。

- 现有 `await runtime.transferMainReelSymbols(...)` 已是目标 API，保留。
- 保留 `sourceReplacementCode: -1` 与 `sourceReplacementPresentationValue: null` 的配对。
- 删除 `:596` 附近已经注释的旧 prepare/commit 示例。
- 将 `coPoint` 的 `coReplacement` 改成 `replaceSymbol(coPoint, target)`。
- await 成功后不要再调用 commit，也不要轮询 reel activity。

### 删除未使用的手动 transfer helper

当前位置：`apps/crave/src/feature-anis.ts:624` 附近的 `playOneSymbolTransferAni()`。

当前 Crave 源码中没有调用者。删除整个 private method，包括：

- `prepareMainReelVisibleOccurrenceTransferBatch()`；
- `batch.start()` / `batch.setProgress()` / `batch.commit()` / `batch.destroy()`；
- `performance.now()` 和该 helper 内的 `requestAnimationFrame()`；
- transfer 后的第二段 prepared replacement。

不要删除 `round-adapter.ts` 或其他流程中的 RAF；它们不是任务 215 的 prepared transfer lifecycle。

如果未来重新引入单图标移动，应直接调用 `await transferMainReelSymbols(...)`，并先确认旧 helper 的特殊语义：它会让 source
replacement 和 target replacement 最终都写入 `item.code/item.multiplier`。不得未经业务确认照搬这个双写行为。

### AF → CN

当前位置：`apps/crave/src/feature-anis.ts:700` 附近。

保留逐个 `Feature4`、`change` 和 `delayTime(0.1)` 的现有时序。在每个 `change` await 后，用 `replaceSymbol()` 替代
`valueUpdate.prepare/commit/destroy`。

## API 对照

| 删除的调用                                                                             | Crave 迁移目标                                                                |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `prepareMainReelVisibleOccurrenceReplacement()` + `commit()` + `destroy()`             | `getSymbolMutationArea("main").replaceSymbol()`                               |
| 多个逐格 replacement                                                                   | `getSymbolMutationArea("main").replaceSymbols()`                              |
| `prepareMainReelVisibleOccurrenceTransferBatch()` + RAF + `setProgress()` + `commit()` | `await transferMainReelSymbols()`                                             |
| scoped transfer callback 中的 `tx.commit()`                                            | `await tx.move()` 后正常返回                                                  |
| `getSlotSnapshots()`                                                                   | RenderCore 内部按用途使用 stable live view / exact lookup；Crave app 无迁移点 |

## 错误与 ownership 合同

- direct mutation 是单次调用；调用方不持有 prepared object，也不负责 destroy。
- awaitable transfer resolve 后才可读取最终 target；reject 时让错误继续向上传递。
- Crave 不缓存旧 logic scene 用于 renderer rollback，不在 `catch` 中逆向写回 symbol。
- Crave 自己创建的 fireworks、overlay 等临时对象仍由 Crave 按原 ownership 清理；这不属于业务 rollback。
- 不保留移动前取得的旧 `SymbolRender` handle；完成后需要对象时重新通过 mutation area 查询。

## 自动验收

在 Crave 仓库执行其实际 package scripts。最低验收为：

```bash
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore build
pnpm --filter crave typecheck
pnpm --filter crave test
```

执行残留搜索：

```bash
rg -n "getSlotSnapshots|RenderReelSlotSnapshot" packages/rendercore/src packages/rendercore/tests
rg -n "prepareMainReelVisibleOccurrenceReplacement|prepareMainReelVisibleOccurrenceTransferBatch|setProgress\(|\.commit\(" apps/crave/src
rg -n "playOneSymbolTransferAni" apps/crave/src
```

预期：

- 前两条 breaking API 搜索无生产代码命中；注释中的旧示例也应删除。
- `playOneSymbolTransferAni` 无命中。
- 不以全局 `.commit()` 搜索结果作为删除 Scene Layout transition commit 的依据。
- `git diff --check` 通过。

## 浏览器验收清单

由项目负责人执行：

1. 首次刷新后的第一次 spin 与连续 spin，确认每格起步相位随机性没有回退。
2. `chgBn`：仅目标格变 BN，code/value 正确。
3. WM：`Feature5`、`change`、WM→CN 以及 multiplier 正确。
4. CM：收集动画、CN value 更新、transfer replacement 和烟花时序正确。
5. CO：被收集图标移动路径、source 变空、target 与 CO 最终 code/value 正确。
6. AF：逐格动画、AF→CN 和 delay 顺序不变。
7. abort/reset/error：错误可见且没有残留 moving display、mask、listener 或 overlay；不要期待 logic scene 回滚。
8. Performance/Memory：steady frame 不再出现 `getSlotSnapshots()`、snapshot `Object.freeze` 或相关逐帧临时数组热点。

## 完成定义

- Crave 的 RenderCore 完整同步任务 215，而不是只删除类型声明。
- `feature-anis.ts` 不再依赖已删除的 prepared replacement/transfer API 或 consumer-owned commit。
- 没有新增 renderer 对 logic scene 的校验或回滚。
- 自动验收通过，浏览器验收结果由项目负责人补充。
