# Crave RenderCore direct API 迁移说明

> 任务 215 的 Crave 精确迁移范围、实际调用点和验收清单见
> [`crave-task-215-migration.md`](./crave-task-215-migration.md)。本文继续保留任务 202 以来的分阶段 direct API 总体路线。

## 基线与边界

- Crave 只读基线：`ab86cec8a8cae7bd0c2aa6910be383295518b1b2`，branch `master`，规划检查时工作区 clean。
- 本文由 slotclientengine 任务 202 交付；任务本身没有修改 `/Users/zerro/gitee.com/pixicrave`。
- slotclientengine 任务 215 已删除 RenderCore 的通用 reel slot snapshot、公开 prepared transaction 和 consumer-owned `commit()`；本次文档更新仍未修改 Crave 代码。
- Crave 当前继续使用 grid-cell。RenderCore 已同步提供 direct mutation/transfer/drop 的基础支持；新游戏应使用 CellSpin。
- 本次建议先迁移 symbol replacement、value mutation 和 occurrence transfer；initial/refill/Nearwin plan 保持不动，以降低玩法时序风险。

## 新接口映射

| Crave 当前调用                                                                       | 新调用                                                                    | 说明                                         |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | -------------------------------------------- |
| `setMainReelSymbolPresentationValue(x,y,value)` 循环                                 | `runtime.getSymbolMutationArea("main").getSymbols(pos).setValues(values)` | 全量 preflight 后映射提交                    |
| 已删除：`prepareMainReelVisibleOccurrenceReplacement(...); commit(); destroy()`      | `runtime.getSymbolMutationArea("main").replaceSymbol(pos,{code,value})`   | 一次原子 replacement，返回新 SymbolHandle    |
| 多个 replacement 循环                                                                | `replaceSymbols(replacements)`                                            | 整批先 prepare，再提交；返回 SymbolGroup     |
| 已删除：`prepareMainReelVisibleOccurrenceTransferBatch + RAF + setProgress + commit` | `await runtime.transferMainReelSymbols({transfers,durationMs,signal})`    | runtime ticker 推进，无 RAF/manual lifecycle |
| `createGridCellCascadeDropPlan + startMainReelCascadeDrop + waitForReelActivity`     | `await runtime.dropMainReelOccurrences({movements,valueCommits,signal})`  | 仅当 Crave 已有 render-ready movement 时替换 |
| initial/refill grid-cell plan、Nearwin drain                                         | 暂不迁移                                                                  | task 202 保持 compatibility                  |

`-1` 是 RenderCore 所有 symbol area 与 spin 模型的唯一空图标标记；其它 code 必须非负。不要把 `-1` 转成 BN、空纹理或某个 registry code。`applyMainReelSnapshot()` 同样接受 `-1`，且对应 presentation value 必须是 `null`。

## `feature-anis.ts`

### 批量 value

把：

```ts
for (const item of wmData) {
  runtime.setMainReelSymbolPresentationValue(
    item.position.x,
    item.position.y,
    item.afterMultiplier,
  );
}
```

改为：

```ts
const mutations = runtime.getSymbolMutationArea("main");
mutations
  .getSymbols(wmData.map((item) => item.position))
  .setValues(wmData.map((item) => item.afterMultiplier));
```

空数组时不要调用 `getSymbols()`；保留现有 `if (wmData.length > 0)` 业务分支。

### WM/CM/AF replacement

把每格 `prepare/commit/destroy` 改成一次批量调用：

```ts
const changed = mutations.replaceSymbols(
  wm2cnData.map((item) => ({
    position: item.position,
    target: {
      code: requireCode(item.afterCode, "WM->CN output"),
      value: item.afterMultiplier,
    },
  })),
);
changed.setState("normal", "immediate");
```

CM→CN、AF→CN 使用同一形态。业务动画仍在 replacement 前由 Crave 直接 await；不要把 `Feature5/change` 名放进 RenderCore target。

## CO occurrence transfer

若现有 CO 代码只做线性批量移动，删除 `performance.now/requestAnimationFrame/setProgress`，改为：

```ts
await runtime.transferMainReelSymbols({
  transfers: routes.map((route) => ({
    source: route.from,
    target: route.to,
    sourceReplacementCode: route.sourceOutputCode ?? -1,
    sourceReplacementPresentationValue: route.sourceOutputValue ?? null,
  })),
  durationMs: config.transferDurationMs,
  signal,
});
```

`sourceReplacementCode: -1` 必须同时传 `sourceReplacementPresentationValue: null`。Promise 成功时 source/target 已原子 finalization；失败/abort 时直接 reject，RenderCore 只结束临时 display lease 并释放未提交的 replacement，不执行旧业务 scene rollback。之后通过 `getSymbol()` 取得新 target，不保留旧 handle。

如果 CO 在移动前后还要对 moving/target occurrence 播放不同 effect，当前继续使用已有 scoped
`runMainReelVisibleOccurrenceTransfer()`；direct batch 是基础线性路径，不替代复杂 choreography。scoped callback 只调用
`delay()/move()` 和 occurrence/effect API；`move()` 完成后正常返回即由 runtime 自动 finalization，不再调用 `tx.commit()`。

## Cascade

Crave 当前的 `createGridCellCascadeDropPlan()` 同时负责把 LogicCore facts 转成具体 timing movement。task 202 没有把这段业务/时序推导塞进
direct API。可采用两步迁移：

1. 暂时保留 builder，只把最终 `plan.movements/valueCommits` 交给 direct Promise；
2. 之后让 Crave 自己从 operation output 生成中性 movement，再删除 builder。

过渡代码：

```ts
const legacy = createGridCellCascadeDropPlan(input);
await runtime.dropMainReelOccurrences({
  movements: legacy.movements,
  valueCommits: legacy.valueCommits,
  signal,
});
```

这样先删除 `waitForReelActivity()`，不同时改动 occurrence matching/timing。不得在调用后轮询 `isMainReelSpinning()` 作为 Promise completion。

## Spin 与 Nearwin

Crave 当前 `spin-presentation.ts` 的 initial、FreeGame hold、anticipation refill、effect scheduling 和 nearwin landed/activation drain 暂时不改。
这些是 grid-cell 独有成熟流程，任务 202 保持兼容。新 `CellSpinSession` 用于后续重写：

```ts
const session = createCellSpinSessionController(cellSpin).start(positions);
for (const entry of landingOrder) {
  const spinning = session.getCell(entry.position);
  // spinning.overlay 可挂固定 Nearwin 节点
  const symbol = await spinning.land(entry.target, entry.options);
  await symbol.playState("appear");
}
```

迁移到 CellSpin 时，Nearwin gate 由 Crave 在 `for/await` 中根据已落停 symbol 决定，后续 pending cell 的 effect/cadence 由游戏编排；不再生成
activation plan 或 drain renderer edge。该迁移应独立验收，不能和 feature-anis direct mutation 一次性合并。

## 建议应用顺序

1. 只迁移 `feature-anis.ts` replacement/value，typecheck并验收 WM/CM/AF。
2. 迁移 CO 的简单 batch transfer；复杂 effect choreography 暂留 scoped transfer。
3. 将 cascade completion 改为 direct Promise，暂保留 movement builder。
4. 稳定后另开任务把 Crave grid-cell spin/Nearwin 改为 CellSpin session。
5. Crave 不再引用 grid-cell 后，slotclientengine 才删除 legacy plan/drain/polling surface。

## Crave 验证命令

在 Crave 仓库按其实际 package filter 执行：

```bash
pnpm --filter crave typecheck
pnpm --filter crave test
rg -n "prepareMainReelVisibleOccurrenceReplacement|prepareMainReelVisibleOccurrenceTransferBatch|setProgress\(|requestAnimationFrame" apps/crave/src
```

人工浏览器验收：WM→CN、CM→CN、AF→CN 的动画后 code/value；CO moving/target/source replacement；normal/anticipation cascade；Spin/Nearwin
保持原行为。本文未在 Crave 仓库执行这些修改或验收。
