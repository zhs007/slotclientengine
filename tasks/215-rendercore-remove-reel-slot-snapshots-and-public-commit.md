# 215 rendercore-remove-reel-slot-snapshots-and-public-commit 任务计划

## 1. 目标与完成定义

### 目标

移除 `RenderReel.getSlotSnapshots()` 和通用 `RenderReelSlotSnapshot` 合同，消除其在即时读取、occurrence 校验、transfer/drop/replace 和诊断组装中的过宽使用。

业务 scene 继续由 logiccore/round execution plan 拥有；RenderCore 只通过 allocation-free live slot view 读取当前渲染 occurrence，通过专用 state/geometry/aggregate diagnostics 在真实需要的边界复制标量状态。新版 single-call mutation API 由同步原子 `replaceSymbols()`、awaitable `transferSymbols()/dropOccurrences()` 和 runtime-owned choreography 组成，一次拥有 presentation preflight、motion、原子 finalization 和 cleanup，不向调用方暴露 prepare/commit。RenderCore 内部 finalization 不保存旧 slot 数据，也不复验 logic scene、旧 code/kind 或旧 presentation value，只维护 active operation、display ownership 和真实 owned occurrence 的生命周期。

### 完成定义

- [x] `packages/rendercore/src` 不再声明或调用 `getSlotSnapshots()`，不再导出 `RenderReelSlotSnapshot`。
- [x] 不新增另一套等价的“全 slot 数组 + display object + state”通用 snapshot API。
- [x] CellSpin、standard ReelSpin/ReelSet、legacy grid-cell 的当前 slot 读取统一使用 allocation-free live view 或更窄的 owner 方法。
- [x] 三种 spin 的正常、continuous、settle 和 idle `update()` 热路径不创建 slot snapshot。
- [x] transfer/drop/replace 不为逻辑数据校验创建 capture/snapshot；public API 不暴露 prepare/commit，内部 finalization 只验证 active operation、display ownership 和 destroy/abort 状态。
- [x] 删除仓库内无 app consumer 的 legacy `Prepared*.commit()` public surface、Scene Layout prepare passthrough，以及 `VisibleOccurrenceTransferScope.commit()`；choreography callback 正常返回后由 runtime 自动 finalization。
- [x] logic scene/target scene 是业务 code/value 的权威来源；RenderCore slot code 不成为第二份业务状态。
- [x] 必须保留的 aggregate diagnostic snapshot 只返回调用时刻的标量值，不包含 `RenderSymbol`、Pixi `Container`、layer 或其它可延长 display tree 生命周期的引用。
- [x] 当前没有 reel snapshot app consumer 的事实被测试/搜索确认；Crave、game002v2 和其它游戏代码不为本任务迁移。
- [x] RenderCore public exports、README、相关测试和 UTC 中文执行报告同步。

## 2. 范围

### 包含

- 删除 `RenderReel.getSlotSnapshots()`、`RenderReelSlotSnapshot` 及相应 public export。
- 删除 `PreparedVisibleOccurrenceReplacement`、`PreparedGridCellVisibleOccurrenceTransferBatch` 及对应 public `prepareVisibleOccurrence*` / `prepareMainReelVisibleOccurrence*` surface；内部允许保留 private preflight/finalization helper。
- 保留高级 `runVisibleOccurrenceTransfer` / `runMainReelVisibleOccurrenceTransfer` choreography，但从 `VisibleOccurrenceTransferScope` 删除 `commit()`：callback 在 `move()` 到达后正常返回即由 runtime 自动 finalization，callback reject、abort、reset、destroy 或未完成 move 时直接 reject，只清理临时 display/resource ownership，不执行旧业务状态 rollback。
- 审计并迁移当前 RenderCore 生产代码中的 42 个调用点：
  - `RenderGridCellReelSet` 17 处；
  - `RenderReelSet` 16 处；
  - `RenderCellSpin` 9 处。
- 为当前 slot 提供一个 exact `windowY` 的 allocation-free lookup，避免 `getSlotRenderViews().find(...)`。
- 保留稳定 live view identity；明确 live getter 反映当前值，不提供历史或 snapshot isolation。
- 把 occurrence ownership、empty occurrence handle、presentation value、state 和 geometry 读取收敛到最窄 owner/API。
- 更新依赖 slot snapshot 的 RenderCore 测试，改为验证可观察结果、专用 scalar diagnostics 或 live occurrence identity。
- 把仍由 RenderCore/Scene Layout 内部调用 legacy prepared surface 的路径迁移到现有 awaitable replacement/transfer/drop API 或 private atomic helper。
- 保留 scene/layout 输入的结构、范围、空位值、资源和 render capability preflight；只删除对 logic 结果旧值的一致性复验，不能把“RenderCore 不校验业务数据”误解为接受不可渲染输入或允许半提交。
- 检查 aggregate `RenderReelSnapshot`、`RenderReelSetSnapshot`、`RenderGridCellReelSetSnapshot` 对 slot snapshot 的内部依赖并解耦。
- 记录 steady-frame allocation 回归证据；真实 profiler 仅作为建议人工验收，不用单测冒充。

### 不包含

- 不删除所有名为 `getSnapshot()` 的 API；slot-operation coordinator、animation completion、effect controller 等 snapshot 属于不同合同。
- 不删除内部原子 finalization；资源从临时 owner 切换到最终 owner 仍需明确单次边界，但不能暴露成游戏调用方的 `commit()`。
- 不删除Scene Layout game-mode/resource/geometry transition自身的prepare/commit；只移除main-reel occurrence的legacy prepared passthrough。
- 不默认删除 reel/reel-set/grid-cell 的 aggregate scalar diagnostics；本任务只移除其对通用 slot snapshot 和 display 引用的依赖。
- 不把 logic scene 复制进 RenderCore cache，也不让 RenderCore 读取、推断或保存服务器真实轮带。
- 不改变 spin plan、CellSpin planless API、continuous phase、落地时序、cascade、symbol state 或 dimming 视觉结果。
- 不修改 `apps/game002v2`、`assets/crave`、`assets/gamecfg002` 或其它游戏业务代码。
- 不新增依赖，不修改 lockfile、manifest、YAML、生成器或 server/logiccore 数据合同。
- 不以性能名义暴露 raw Pixi display tree、可变 slot 或 world transform。

## 3. 制定计划时的基线

```text
UTC: 2026-08-15T12:32:10Z
HEAD: 184224de8dfc844d8aeb1c0aee4378223c8f817f
branch: codex/rendercore-cell-spin-local-phase
git status --short --untracked-files=all: clean
```

- 已读取根 `AGENTS.md`、`tasks/templates/task-plan.md`、`docs/agent-rules/{shared-game-runtime,scene-layout}.md`、相关reel/scene-layout源码测试和RenderCore README；目标目录无补充`AGENTS.md`。
- `RenderReel.getSlotSnapshots()` 每次创建并冻结数组和每个 slot 对象；标量字段是调用时刻值，但 `symbol/container/emptySymbolLayer` 仍是真实 display 引用，并非深快照。
- 长期持有 snapshot 可能滞留 display tree；短期调用不会自动泄漏，但会产生 allocation/GC churn。
- 当前生产调用共 42 处，全部位于 `packages/rendercore/src/reel`；搜索未发现游戏 app 直接调用 reel/grid-cell snapshot 类型。
- 新版 CellSpin/ReelSpin single-call mutation API 不向调用方暴露 commit；当前 `RenderReelSet`、legacy grid-cell 和 Scene Layout 仍保留 `PreparedVisibleOccurrenceReplacement`、`PreparedGridCellVisibleOccurrenceTransferBatch` 与 `prepareMainReelVisibleOccurrence*` compatibility surface，仓库内没有 app 直接 consumer。
- 高级 `runVisibleOccurrenceTransfer` / `runMainReelVisibleOccurrenceTransfer` 仍通过 `VisibleOccurrenceTransferScope.commit()` 要求 consumer 显式提交；它不是 snapshot API，但与本任务“public API 无 commit”的目标冲突，必须一并迁移为 callback 正常返回后的 runtime-owned finalization。
- `packages/rendercore/docs/visible-occurrence-transfer.md`、RenderCore README 以及 grid-cell/symbol 定向测试仍描述或调用旧 commit surface；它们是本任务的直接文档/测试 consumer。
- `apps/game003v2` 使用的 `coordinator.getSnapshot()` 是 slot-operation 运行状态合同，与本任务的 reel slot snapshot 无关。
- 当前三个spin实现的常规逐帧update已不调用`getSlotSnapshots()`；剩余调用集中在occurrence handle、legacy prepared surface、transfer/drop/replace、dimming mutation、state capability和aggregate diagnostics。
- 多数调用立即 `.find()` 后只读取 `symbol/code/kind`，不需要 snapshot isolation。
- 少数legacy prepared调用当前跨异步边界保留旧symbol identity/value并在commit复验；在现有串行awaitable owner流程中，这属于待移除的重复数据校验。真正发生detach/transfer时active operation持有真实occurrence，不需要另存slot snapshot。
- `getSlotRenderViews()` 已提供创建时一次分配、之后反映当前 code/kind/symbol 的 live view；当前缺少 exact window lookup，部分非热路径仍重复 `.find()`。
- `getVisibleSymbolStateSnapshot()`、`getVisibleSymbolGeometrySnapshot()` 已是专用 scalar snapshot，可承担状态/几何诊断，不应回退到 generic slot snapshot。
- 当前 reel aggregate diagnostics 主要服务 RenderCore 测试和内部状态定位；没有证据支持为未来假想 app 调试保留 raw display 引用。

## 4. 需求解释与技术决策

### 需求解释

- 已确认`RenderReel.getSlotSnapshots()`在当前架构中没有不可替代职责：即时读取由live view承担，业务数据由logiccore拥有，异步边界由awaitable operation ownership保证，状态/几何/诊断由专用标量API承担。它不得因调用方便、测试方便或假想调试需求继续保留。
- “按现在的 await 流程不需要以前数据”理解为：业务阶段由单一 coordinator/owner 串行推进，调用方不执行 prepare/commit；RenderCore 不保存历史 scene，也不在内部 finalization 复验 logic 数据。
- “移除 snapshot”特指 generic slot snapshot，不表示禁止所有调用时刻的标量诊断结果。
- logic scene 与 render slot code 在停止态可能相等，这是结果一致性，不代表 RenderCore 应拥有第二份权威 scene。
- live view 是当前渲染事实；它只用于即时 presentation 操作，不作为旧值、业务校验或错误恢复数据。

### 关键决策

1. **删除 generic snapshot，不以重命名方式保留。**
   - 删除 `getSlotSnapshots()` 和 `RenderReelSlotSnapshot`。
   - 禁止新增 `getAllSlotsSnapshot()`、`debugSlots()` 等返回相同宽数据的替代接口。

2. **当前读取使用 exact live lookup。**
   - 在既有 stable live views 上提供 exact `windowY` lookup；非法或缺失 slot 显式失败，不返回首项、不猜 visible row。
   - dimming、render order、capability、symbol identity 和 reset 遍历使用 live view，不创建对象。

3. **single-call mutation API内部不保存slot数据。**
   - public `replaceSymbols/transferSymbols/dropOccurrences`一次调用完成render capability/resource preflight；异步动作由唯一owner建立active operation，不返回prepared handle，不要求调用方commit。
   - detach/transfer 后，active operation 直接拥有真实 `RenderReelVisibleOccurrence`；内部 finalization 消费该 occurrence；错误路径只结束临时 display lease 并释放未提交资源，不创建旁路 capture record，也不恢复旧 logic scene。
   - internal finalization 只确认 operation 仍 active、owner 未 destroy、signal 未 abort、owned occurrence 未被非法转移；不读取 logic scene 或比较旧/新 code/value。
   - 删除 legacy `Prepared*.commit()` interface 和 Scene Layout passthrough；如批量 replacement 需要“全量 preflight 后一次提交”，以 private helper 保持原子性。
   - `runVisibleOccurrenceTransfer` 的 choreography scope 继续提供 `moving/target/delay/move`，但不再提供 `commit()`；callback 只有在 `move()` 已到达后正常返回才触发一次 runtime-owned finalization，未 move、未到达、throw/reject、abort、reset 或 destroy 均直接 reject 并清理临时 ownership。

4. **Display ownership 留在 RenderReel。**
   - 上层需要 empty occurrence、Anchor 或 SymbolRender 时，由 RenderReel/area owner 返回窄 capability，不通过通用 snapshot 取得 `container/emptySymbolLayer` 后自行拼装生命周期。
   - exact live view 不得为迁移而扩宽出 `container`、`emptySymbolLayer`、requested state 或其它 raw slot 字段；empty facade 的创建与 stale/generation 校验由 owner 内部完成。
   - public handle 的 stale/destroy、active operation mismatch 和非法 ownership transfer 继续显式报错；不把逻辑数据不一致作为 RenderCore finalization 校验。

5. **诊断只保留 scalar aggregate。**
   - `RenderReelSnapshot` 等只描述 phase、current/final/start y、elapsed、visible scene 等调用时刻标量。
   - grid-cell aggregate 可保留 clip、dimming、requested/resolved state、visible code/value 等故障定位字段，但直接从 owner/live state组装，不嵌套 generic slot snapshot。
   - 这些 diagnostics 不用于业务决策、不逐帧持久化、不承载 RenderSymbol/Container。

6. **测试验证行为，不依赖 raw display escape。**
   - symbol state 使用专用 state snapshot；geometry 使用专用 geometry snapshot。
   - slot positioning/visibility/render order 优先通过对外几何或最终 Pixi 行为验证；只有现有能力无法证明稳定合同且确属 public diagnostics 时才增加窄 scalar API。
   - 不为测试重新开放 raw Container getter。

7. **业务校验与 presentation preflight 分离。**
   - logiccore/round plan 负责业务 scene、code/value 语义和结果一致性；RenderCore finalization 不拿旧 scene/snapshot 做 compare-and-commit。
   - RenderCore public 边界仍必须校验 shape、坐标、重复位置、合法 symbol/hole 组合、资源/capability 可用性，并在 mutation 前完成整批 preflight；这些是安全渲染合同，不是重复业务校验。
   - Scene Layout `applyMainReelSnapshot` 的多格 replacement 在 occupancy 不变时仍需全量 preflight 和 all-or-nothing finalization；不能退化为逐格 `replaceSymbol()` 后半途失败。

## 5. 职责与合同

- **logiccore/round plan**：拥有服务器结果解析、scene/value 业务语义和不可变 execution plan。
- **RenderReel**：拥有 slot、buffer occurrence、RenderSymbol、empty occurrence 和 display lifecycle；提供当前 live read、owned occurrence 和窄 capability。
- **CellSpin/ReelSpin/grid-cell**：编排当前 occurrence mutation、transfer、drop、state 和 presentation，不缓存权威 scene，不跨 owner 操作 slot display tree。
- **aggregate diagnostics**：只表达当前运行状态的标量副本，面向测试、debug overlay 或故障日志；不是业务 API、历史记录或 replay 数据。
- **资源生命周期**：awaitable operation 只持有内部 active state 和真正归其所有的 occurrence；finalize、error、abort 或 destroy 后释放 listener/handle/owned resource。cleanup 不是业务 rollback，不撤销已 finalization 的 mutation。
- **Scene Layout main-reel bridge**：只转接 single-call mutation 和 runtime-owned choreography；不再暴露 prepared transaction。game-mode/resource/geometry transition 的 prepare/commit 是另一套资源原子切换合同，保持不变。
- **失败策略**：unknown windowY、stale public handle、destroyed owner、active operation mismatch、非法 render input 和 ownership violation 显式失败；logic scene/旧 code/value 一致性不在 RenderCore finalization 重复校验。
- **禁止行为**：不通过 `as` 暴露 mutable slot，不返回 raw Container，不让 live view冒充历史 snapshot，不用 logic scene 替代滚动中的公开轮带 occurrence。

## 6. 文件范围

### 预计新增

```text
tasks/215-rendercore-remove-reel-slot-snapshots-and-public-commit-<utctime>.md
```

定向回归优先放入现有测试文件，不为数量新建无必要 fixture。

### 预计修改

```text
packages/rendercore/src/reel/types.ts
packages/rendercore/src/reel/render-reel.ts
packages/rendercore/src/reel/render-reel-set.ts
packages/rendercore/src/reel/render-grid-cell-reel-set.ts
packages/rendercore/src/reel/render-cell-spin.ts
packages/rendercore/src/scene-layout/types.ts
packages/rendercore/src/scene-layout/package-runtime.ts
packages/rendercore/tests/reel/render-reel.test.ts
packages/rendercore/tests/reel/render-reel-set.test.ts
packages/rendercore/tests/reel/render-grid-cell-reel-set.test.ts
packages/rendercore/tests/reel/grid-cell-continuous-spin.test.ts
packages/rendercore/tests/reel/render-cell-spin.test.ts
packages/rendercore/tests/symbol/symbol-render.test.ts
packages/rendercore/tests/scene-layout/package-runtime.test.ts
packages/rendercore/README.md
packages/rendercore/docs/visible-occurrence-transfer.md
docs/crave-rendercore-direct-api-migration.md
```

其它直接相关 reel 测试仅在搜索确认实际调用 generic snapshot 时纳入。

### 原则上不应修改

```text
apps/game002v2/**
assets/crave/**
assets/gamecfg002/**
apps/game003v2/**
packages/logiccore/**
packages/gameframeworks/**
docs/agent-rules/game002.md
package.json
pnpm-lock.yaml
```

若发现真实 app/public consumer 依赖 `RenderReelSlotSnapshot`、必须新增 raw display API、改变 logic scene 合同或扩大到其它 snapshot 家族，执行会话必须先停止说明。

## 7. 实施步骤

1. **确认执行基线和调用分类**
   - 重核 HEAD/status，搜索 `getSlotSnapshots`、`RenderReelSlotSnapshot` 和相关 public imports。
   - 把每个调用归类为 current read、iteration、重复数据校验、active operation ownership、display capability、state/value diagnostics 或仅测试使用。

2. **建立 exact live/awaitable owner API**
   - 在 RenderReel 中增加 exact window live lookup，复用创建时建立的 view，不在调用时分配。
   - presentation value、empty occurrence、Anchor/handle 等即时需求由最窄 owner method/capability解决；active operation直接持有owned occurrence，不扩宽live view为raw slot/display tree。

3. **迁移三种 reel consumer 与 choreography**
   - CellSpin、RenderReelSet 和 grid-cell 的即时读取/遍历改用 live view。
   - 删除旧 slot 字段捕获和 code/value 复验；awaitable operation 的 finalization/error cleanup 只消费其持有的 owned occurrence。
   - 删除public prepared handle/commit和Scene Layout prepare passthrough；内部批量原子替换使用private preflight/finalization helper。
   - 从 `VisibleOccurrenceTransferScope` 删除 `commit()`；把 callback 正常返回定义为 finalize 请求，并在 runtime 内确认 motion 已到达后原子切换 ownership。callback 未完成 move 或异常退出一律直接 reject，仅清理临时 ownership。
   - Scene Layout 多格 apply 继续先完成整批 presentation preflight，再通过 private batch helper 一次 finalization；保留 shape/hole/resource 校验，不保留旧 scene compare-and-commit。
   - aggregate diagnostics 直接组合标量 owner API；删除对 generic snapshot 的中间依赖。

4. **删除 public generic snapshot**
   - 删除方法、类型、barrel export、README及 transfer 设计文档中的旧合同和所有生产/测试调用。
   - Crave migration 文档可保留旧名称作为明确标注“已删除 API”的历史迁移源项，但不得把它描述成仍可调用的当前 surface；不修改 Crave 代码。
   - 搜索确保没有同义替代 API、raw display escape 或遗留类型断言。

5. **测试与收尾**
   - 更新定向测试，覆盖 live view identity、exact lookup、awaitable operation ownership、error cleanup/destroy、empty occurrence 和 aggregate scalar diagnostics。
   - 验证三个update steady path不调用snapshot allocator，public exports不再包含prepared/commit surface，internal finalization不创建逻辑数据capture；真实profiler结果与自动化测试分开记录。
   - 运行 L2 验收并生成 UTC 中文报告。

## 8. 测试与验收

### 测试原则

- 用行为和明确 public contract 验证，不因测试方便恢复 generic slot inspection。
- 覆盖 textured/empty occurrence、visible/buffer windowY、awaitable operation 成功、reentry/ownership mismatch、error cleanup、abort/destroy。
- 验证 choreography 正常完成 move 后自动 finalize，未 move/未到达/throw/reject/abort/reset/destroy 时直接 reject 并清理临时 ownership；scope 上不存在 public commit，也不存在 public rollback。
- 验证 public API 没有 prepare/commit，internal finalization 不保存或比较旧 scene/code/kind/presentation value；ownership 测试只围绕 active operation/owned occurrence。
- 验证非法 shape/坐标/重复位置/symbol-hole value/resource 在 mutation 前失败，多格 replacement 任一 preflight 失败时零格提交。
- 事件帧允许创建不可变结果；steady frame不创建slot/diagnostic对象。

### 验收级别

`L2`：删除 RenderCore public API/type，并迁移三个直接 consumer 实现。只验证 RenderCore 和实际直接编译 consumer，不运行整仓 L3。

### 执行会话必须运行

```bash
rg -n "getSlotSnapshots|RenderReelSlotSnapshot|PreparedVisibleOccurrenceReplacement|PreparedGridCellVisibleOccurrenceTransferBatch|prepare(MainReel)?VisibleOccurrence" packages apps docs
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore exec vitest run tests/reel/render-reel.test.ts tests/reel/render-reel-set.test.ts tests/reel/render-grid-cell-reel-set.test.ts tests/reel/render-cell-spin.test.ts tests/reel/grid-cell-continuous-spin.test.ts tests/symbol/symbol-render.test.ts tests/scene-layout/package-runtime.test.ts --coverage=false
pnpm --filter @slotclientengine/rendercore build
pnpm --filter game002v2 typecheck
git diff --check
```

第一条最终只允许任务/历史报告，以及明确标成“已删除 API”的 migration source 名称命中；生产 public API、测试、当前用法文档和 declaration 不得残留 generic slot snapshot 或 prepared surface。另需在 `types.ts`/API declaration 中确认 `VisibleOccurrenceTransferScope` 不含 `commit()`，并由测试证明 callback-return auto-finalization。若直接 consumer 搜索发现不止 `game002v2`，只追加真实受影响 consumer 的定向 typecheck。

### 人工验收

- 建议在可运行 grid-cell/CellSpin demo 中使用浏览器 Performance/Memory profiler 对比 steady spin；确认无 `RenderReelSlotSnapshot`、slot array 或 per-cell Map 热点。
- profiler 是性能证据，不能由 identity 单测或编译结果替代。

### 独立验收建议

建议。涉及 RenderCore public API 删除、异步 occurrence operation 和 display ownership。独立复验重点：

1. awaitable operation、owned occurrence、error cleanup/destroy 是否仍保持唯一 owner，且没有业务 rollback；
2. aggregate diagnostics 是否只含标量且不参与业务决策；
3. steady frame 是否没有以其它名字重新引入 generic slot allocation。

## 9. 环境与依赖

- 使用仓库要求的 Node.js 24 和 pnpm。
- 缺依赖时只运行 `CI=true pnpm install --frozen-lockfile`。
- 本任务不新增依赖、不修改 lockfile；如执行中出现依赖需求，视为范围异常并先说明。

## 10. 生成物、文档与规则

- 无 YAML、manifest 或生成物变化。
- 更新 `packages/rendercore/README.md` 与 `packages/rendercore/docs/visible-occurrence-transfer.md`，明确 logic scene、live slot view、callback-return auto-finalization、private atomic finalization 与 aggregate scalar diagnostics 的边界。
- 更新 `docs/crave-rendercore-direct-api-migration.md` 的版本状态：旧 prepare/commit 名称只能作为迁移来源，当前目标 API 不要求 consumer commit；不修改 Crave runtime 代码。
- 当前职责与 `shared-game-runtime.md` 一致；只有执行发现稳定规则缺口时才最小更新该领域规则，不修改根 `AGENTS.md`。
- 不把 42 个调用点清单复制到长期规则；最终实际迁移与验证记录进入任务报告。

## 11. 执行报告

执行完成后创建：

```text
tasks/215-rendercore-remove-reel-slot-snapshots-and-public-commit-<utctime>.md
```

报告简要记录最终 API、迁移调用分类、实际测试、profiler 是否完成、计划偏差和剩余风险。

## 12. 风险、假设与待确认

### 风险

- 若删除数据复验和 public commit 但没有唯一 active operation/ownership gate，外部重入可能破坏 display mutation；应由 awaitable owner 拒绝重入，而不是恢复 slot snapshot。
- 若把 choreography callback return 直接等同提交却不检查 move 已到达，可能提交未完成 motion；auto-finalization 必须保留 arrived/active/abort/ownership gate。
- 若把“无 logic 校验”扩大为删除 presentation preflight，Scene Layout 多格 apply 可能产生半提交；结构、资源、hole/value 和整批 capability 校验必须保留。
- empty occurrence 当前依赖 container/layer identity；必须把 capability/ownership下沉给 owner，不能为了迁移扩大 live view。
- aggregate diagnostics 或测试可能隐式依赖 buffer slot/display字段；应改为专用标量合同或行为断言，不能恢复 raw display引用。
- public type 删除可能影响仓库外 consumer；仓库内搜索不能证明外部不存在，需要按版本策略明确 breaking change。

### 假设

- 当前串行await流程不需要保存历史scene，也不需要public prepare/commit；真实detach/transfer由awaitable operation直接拥有occurrence。
- 仓库内游戏没有直接消费 reel slot snapshot；执行基线变化时重新搜索。
- `getSlotRenderViews()` 的 stable identity/current-value语义继续保留。

### 待确认

- 若该 package 对仓库外发布，执行前需确认本次 public API 删除是否要求 major version；仓库当前没有可验证的外部 consumer 清单。

## 13. 完成清单

- [x] generic slot snapshot 方法、类型和调用全部移除。
- [x] 三种 reel consumer 使用 live read/awaitable operation ownership，prepared、public commit 与 public rollback 均移除，error cleanup/destroy 行为保持。
- [x] logic scene 与 render current occurrence 职责清晰，无第二份业务 scene。
- [x] aggregate diagnostics 只含必要标量，不含 display object。
- [x] steady frame allocation合同和定向测试通过。
- [x] public exports、README、自动化/人工验收状态同步。
- [x] Crave/game app、assets、依赖和 lockfile 未修改。
- [x] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、`docs/agent-rules/shared-game-runtime.md`、`docs/agent-rules/scene-layout.md` 和本计划；
2. 核对 Git 基线与工作区，重新统计真实 consumer；
3. 先分类调用，再建立exact live/awaitable operation ownership API，不做机械替换；
4. 移除 public prepare/commit/rollback 和 choreography scope commit，保留 private atomic finalization、error cleanup/destroy、presentation preflight 和 display ownership 边界；
5. 重大 public/外部 consumer 范围扩张时先停止说明；
6. 只运行本计划规定的 L2 验收；
7. 完成后生成 UTC 中文执行报告；
8. 除非用户明确要求，不 commit、不 push、不创建 PR。
