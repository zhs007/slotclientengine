# 199 rendercore-operation-first-layer-api 任务计划

## 1. 目标与完成定义

### 目标

为 `packages/rendercore` 建立由 operation handler 和游戏可直接使用的第一层渲染 API：所有转轮/棋盘区域共享
`SymbolArea.getSymbol(pos)`，返回简单、可直接改变状态、附加节点和 clone 的 `SymbolRender`；新增无 public plan 的
逐格 `CellSpin` 原子接口，让调用方用普通 `async/await` 编排 full、selective、hold、refill 和 anticipation。

game002v2 当前使用的 `grid-cell` plan、continuous、Nearwin、cascade 和 edge API 作为 legacy compatibility surface
完整保留，只 additive 接入 `SymbolArea`。当前普通 `RenderReelSet` 同样接入 `SymbolArea`，但本任务不提前设计尚未讨论的
新 `ReelSpin` 运动方法。权威 operation plan 继续属于 logiccore，新 `CellSpin` 不增加 `CellSpinPlan`、整盘 command DSL
或第二套业务状态来源。

### 完成定义

- [ ] rendercore public export 提供严格的 `SymbolPosition`、`SymbolArea`、`SymbolRender` 和通用 `RenderNode` 合同；
      游戏不需要 `Handle/Snapshot/Geometry/Lease` 才能取得和操作 symbol。
- [ ] standard `RenderReelSet`、legacy `RenderGridCellReelSet` 与新 `CellSpin` 都可按所属区域的 `(x,y)` 调用
      `getSymbol()`；越界、hole、未落地、leased 或 stale occurrence 显式失败。
- [ ] `SymbolRender` 支持 `setState()`、awaitable `playState()`、稳定 `add/remove()` attachment 和 `clone()`；
      不把内部 pooled `RenderSymbol`、Pixi children 或 animation-owned overlay 原样暴露给游戏。
- [ ] clone 共享 immutable resource、拥有独立 display/player identity，默认不复制临时 attachment 或活动时间轴；
      由创建者显式 `destroy()`，borrowed reel symbol 禁止 destroy，pool/reset/destroy 无泄漏或晚到 playback。
- [ ] 新 `CellSpin` 只提供逐格 `roll/start/settle/cancel` 和 `getSymbol`，不接受 `GridCellReelSpinPlan` 或整盘
      positions/order/activation plan；不同格可并发，同一格冲突显式失败。
- [ ] `roll/settle` Promise 只在该格 target symbol 已原子落定且 `getSymbol(pos)` 可取得后 resolve；调用方随后可直接
      `setState("appear")`。targetless start/cancel 不伪造 server landing。
- [ ] 新 `CellSpin` 复用本地公开轮带、目标临时窗口、RenderSymbol pool/player 和 manual ticker；低 FPS、abort、destroy
      以及所有 occupied symbol 每 slice 恰好 update 一次的合同成立。
- [ ] cell 在目标 symbol 落地前可通过最小 `CellRender` attachment 入口挂载通用 `RenderNode`，以普通 delay/Promise
      编排 Nearwin 类 effect；不恢复整盘 activation/effect plan。
- [ ] game002v2 当前 `GridCellReelSpinPlan`、`buildGridCellSpinPlan(stage)`、effect controller、drain edge、continuous、
      cascade 与视觉时序保持；Scene Layout runtime additive 暴露 main reel `SymbolArea`，现有生产编排不强制迁移。
- [ ] public exports、RenderCore README、第一层设计文档、最小 shared runtime 规则、定向 tests 和 UTC 中文执行报告同步。

## 2. 范围

### 包含

- rendercore `SymbolArea`/`SymbolRender`/`RenderNode`/`CellRender` public contract 与 instance-scoped accessor。
- current `RenderSymbol` 的稳定 game attachment layers、public façade、awaitable state delegation、clone factory 和严格
  borrowed/owned lifecycle。
- standard 与 grid-cell reel 从坐标到 exact visible occurrence 的共同适配；现有 `VisibleOccurrenceHandle` 保持兼容并可
  复用同一 occurrence generation/ownership guard。
- 新独立 `CellSpin` runtime：逐格 direct roll、targetless start、settle、cancel、并发 map、ticker update、pool/mask、
  target code/value、可选 landing state、per-call AbortSignal 和 instance default presentation 参数。
- 最小 cell-level `RenderNode` attachment，供落地前 effect 使用；节点资源/player 仍由 typed rendercore factory/adapter 创建。
- Scene Layout package runtime 对当前 `main` reel 的 `SymbolArea` additive accessor，以及 game002v2 兼容测试。
- 相关 public exports、tests、README、设计文档、领域规则与执行报告。

### 不包含

- 不删除、重命名或改写 legacy `GridCellReelSpinPlan`、`createGridCellReelSpinPlan()`、
  `buildGridCellSpinPlan(stage)`、started/landed/activation drain、effect sweep、cascade 或 game002v2 production flow。
- 不把 game002v2 迁移到新 `CellSpin`，不把现有 batch symbol state 改成可能部分启动的零散 Promise。
- 不为新 `ReelSpin` 设计整列 `roll/start/settle/cancel`；本任务仅让现有 standard reel 实现共同 `SymbolArea`。
- 不设计第二层 full/selective/held/refill/anticipation helper，也不设计第三层 operation handler template。
- 不增加 public `CellSpinPlan`、`ReelSpinPlan`、`RefillPlan`、整盘 matrix command、choreography DSL 或 renderer 业务 predicate。
- 不修改 logiccore `SlotOperationPlanV2`、operation kind/schema/finalizer；不让 rendercore 反向推导 held、remove、refill 或
  source/target 业务关系。
- 不实现新的粒子引擎、光效 schema 或资源格式；`RenderNode` 建立通用 attachment/lifecycle seam，已有 Spine/VNI/Pixi
  adapter 可接入，未来 typed node kind 不要求修改 `SymbolRender`。
- 不修改 Scene Layout manifest/YAML、正式 assets、生成物、根工具链、依赖或 lockfile。
- 不允许 raw Pixi Container、internal `RenderSymbol.destroy/reset`、Spine slot/player 或 VNI display tree 成为游戏接口。

## 3. 制定计划时的基线

```text
UTC: 2026-08-11T14:50:06Z
HEAD: 236cfe0cbd4842dee4b9423f817d57b23fbcddb2
branch: (detached HEAD)
git status --short --untracked-files=all:
?? docs/rendercore-operation-first-layer-api.md
```

- 已读取根 `AGENTS.md`、`tasks/templates/{task-discussion,task-plan}.md`、
  `docs/agent-rules/{shared-game-runtime,game002,loading-ui}.md`、
  `docs/rendercore-operation-first-layer-api.md`、`packages/rendercore/README.md`、任务 181/192/197/198 及
  rendercore/game002v2 package metadata；目标目录无补充 `AGENTS.md`。
- `docs/rendercore-operation-first-layer-api.md` 是本次讨论形成、创建任务前已存在的未跟踪需求合同；执行任务时保留并
  纳入正式 diff，不把它当成执行会话产生的意外修改。
- `packages/rendercore/src/symbol/render-symbol.ts::RenderSymbol` 已拥有 strict state machine、`requestState()`、
  `playState()`、presentation value、Spine/VNI/value controller 和 pool reset，但它继承 display object、公开内部 layers
  与 destroy/reset，不适合作为游戏直接持有的 safe surface。
- animation-owned `overlayLayer` 会由 Spine/VNI/state reset 执行 `removeChildren()`；游戏 attachment 必须使用独立稳定层，
  不能直接复用该 overlay。
- `RenderGridCellReelSet.getVisibleOccurrenceHandle()` 已有坐标解析、leased/stale generation、state playback、effect attach
  和 transfer ownership guard，可作为 `SymbolRender` façade 的内部先例，但其 Snapshot/Geometry API 不是新第一层合同。
- `RenderReelSet` 已有 state batch、replacement、cascade 与 detached occurrence factory，但没有与 grid-cell 对称的
  public occurrence façade；需要补同一 `SymbolArea` 适配而不改变 standard spin。
- `RenderGridCellReelSet` 当前只有一个全局 `#spinPlan/#continuousSpin` transaction，`spinSelective()` 仍执行整盘 plan；
  不能用它并发调用多次来伪装逐格 API。新 `CellSpin` 必须按 position 拥有独立 active transaction，并复用底层
  `RenderReel`/pool/player，而不是复制 legacy 整盘 planner。
- `RenderReel` 已提供单轴 spin/continuous/settle、detached occurrence 和 pool 能力，是新逐格 runtime 的直接 primitive。
- Scene Layout `SceneLayoutPackageRuntime` 当前只拥有 `reels.main`，并暴露 `getMainReelVisibleOccurrence()` 等 grid-cell-only
  façade；新增 accessor 要返回共同 `SymbolArea`，unknown area/reel id 精确失败，不能增加 singleton。
- game002v2 的 `spin-presentation.ts` 只向 rendercore `stage.createPlan()` 注入 positions、dimming、activation、effects 和
  timing；plan 类型/通用生成/执行属于 rendercore。它当前不使用 logiccore `SlotOperationPlanV2`，本任务不改变该事实。
- 当前 legacy tests 广泛依赖 `GridCellReelSpinPlan`、continuous、edge drain 和 package runtime callback；这些测试是兼容
  保护，不应为新 API 删除或改写。
- 规划会话未运行测试或安装依赖；一次 Markdown Prettier 检查因 workspace 依赖缺失尝试下载并被沙箱拒绝，工作区无
  lockfile 或其它 tracked 改动。

## 4. 需求解释与技术决策

### 需求解释

- “第一层极其简单”表示游戏直接取得对象并调用原子方法，不表示把 Pixi、pool、ticker 或真实 reel 状态机交给游戏。
- `getSymbol(pos)` 的 owner 是具体区域实例；多个转轮区各自实现 `SymbolArea`，不存在全局 rendercore singleton。
- “CellSpin 能力看齐 grid-cell”指底层仍能完成 target injection、continuous、dimming/effect 编排所需 primitive、低 FPS、
  mask/pool 和逐格落地；不要求复制 grid-cell 的整盘 plan/callback/drain public shape。
- full、selective、hold、refill 和 activation 是跨格调用顺序：第一层通过调用哪些格、何时调用和等待哪些 Promise 表达，
  不增加对应 mode flag。
- `Plan` 作为跨层权威执行概念属于 logiccore。legacy `GridCellReelSpinPlan` 是明确兼容例外，不能成为新 API 先例。

### 关键决策

1. **以 façade 提供简单 SymbolRender，不泄露内部 RenderSymbol。**
   - façade 捕获 exact occurrence/generation，并委托 state/value/node/clone；replacement、release、pool 或 transfer 后旧引用
     失败，不按坐标重绑到后来 symbol。
   - `SymbolRender` 同时是可 attachment 的 `RenderNode`。clone 是 owned detached node，必须 destroy；区域内 symbol 是
     borrowed，destroy 明确失败。ownership 由内部 flag 实现，不增加 public Owned/Lease 类型层级。

2. **为游戏 attachment 建独立稳定层。**
   - RenderSymbol 增加 game underlay/overlay attachment roots，内部 animation/value layers 继续独占原节点。
   - `add/remove` 使用 typed `RenderNode` view 和稳定 order；duplicate mount、跨 parent、destroyed/stale node 明确失败。
   - add 不转移 node destruction ownership；remove 只 detach。owner destroy 时先 detach/cleanup，不能误 destroy borrowed host。

3. **clone 只承诺可证明的最小语义。**
   - 通过所属 symbol registry/reel factory 创建同 code 的 detached occurrence，共享资源并复制 presentation value；调用方可
     显式选择 normal 或当前 semantic state，但不复制 animation timeline、pending waiter、game attachment 或临时 effect。
   - 当前 state 无法在独立 player 上 exact 建立时原位失败；不截帧、不猜 animation progress、不静默省略请求字段。

4. **新 CellSpin 是 per-cell transaction owner。**
   - 每个 position 使用一个底层 RenderReel/slot，active map 分别保存 direct/continuous/settling transaction；不同格可并发，
     同格 active conflict 失败。
   - `roll()` 内部构造私有单轴 motion 数据并注入单格 target；它不是 public plan。`start/settle/cancel` 只操作指定格。
   - host ticker 统一调用 runtime update；每个 slice 先推进所有 active/occupied cell 恰好一次，再同步 promise edge。Promise
     continuation 不承担落地 commit。

5. **跨格编排保持普通 async/await。**
   - operation handler 使用 frame-driven `context.delay()`、立即启动的 job 与 `Promise.all()` 表达 stagger/parallel；禁止
     `setTimeout()`、固定 wall-clock completion、全盘 planner 或 start/isComplete polling。
   - `roll/settle` 完成边界建立 target occurrence；appear 等后续逻辑再调用 `getSymbol(pos)`，不内置 state-name fallback。

6. **cell-level node 只解决落地前 anchor。**
   - 最小 `CellRender.get/add/remove`（最终命名可按 style 微调）提供稳定 cell-space parent，game 可用 delay 和 node playback
     自行排 Nearwin；不在 CellSpin 接口增加 activation gate、effect schedule 数组或 drain queue。
   - node/player 失败遵循调用链 fail-stop；cleanup/destroy 释放临时 attachment，不改变已完成 symbol landing。

7. **legacy grid-cell 只 additive 适配。**
   - 现有 GridCell plan、effect controller、edge drain、cascade 与 Scene Layout method 全部保留；新 `getSymbolArea("main")`
     façade 内部可复用 occurrence guard，但不把 game002v2 改走 CellSpin。
   - compatibility tests 同时证明旧行为与新 `getSymbol` 可共存；未来新能力只加到 CellSpin/ReelSpin surface。

## 5. 职责与合同

- **logiccore/app producer**：拥有 operation order/output、held/参与坐标、source-target/refill 业务事实；本任务不改 schema。
- **rendercore SymbolArea/SymbolRender**：拥有区域坐标解析、exact occurrence identity、state/node/clone façade 和 stale failure。
- **rendercore RenderNode**：拥有 stable view、typed player delegation、mount/detach/destroy；不允许游戏改内部 children/player。
- **rendercore CellSpin**：拥有单格公开轮带、临时 target、movement、mask、pool、atomic land、abort/cancel/destroy 和 Promise。
- **legacy grid-cell**：继续拥有 game002v2 当前整盘 plan/runtime compatibility，不承接新 public gameplay feature。
- **Scene Layout/game002v2**：package runtime 只路由 area instance；game002v2 继续解释 WL/CN/Nearwin 与当前 round 顺序。
- **失败策略**：unknown area/position/state/node kind、hole、not-landed、stale/leased/destroyed、同格并发、无 active settle、
  缺资源/player、invalid target/timing/signal 都显式失败；不 fallback normal、首项资源、placeholder 或坐标重绑。
- **资源生命周期**：area/reel owns visible occurrence；clone/node creator owns detached object；attachment 不转移 destroy ownership；
  pool reset、replacement、remove、abort 和 destroy 必须拒绝 pending playback 并清理临时 parent/listener。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/symbol/render-node.ts
packages/rendercore/src/symbol/symbol-render.ts
packages/rendercore/src/reel/symbol-area.ts
packages/rendercore/src/reel/render-cell-spin.ts
packages/rendercore/tests/symbol/symbol-render.test.ts
packages/rendercore/tests/reel/symbol-area.test.ts
packages/rendercore/tests/reel/render-cell-spin.test.ts
tasks/199-rendercore-operation-first-layer-api-<utctime>.md
```

若职责更清晰，可将 public types 留在现有 `symbol/types.ts`、`reel/types.ts`，但不得复制定义或新增第二套 façade。

### 预计修改

```text
packages/rendercore/src/{index}.ts
packages/rendercore/src/symbol/{types,render-symbol,index}.ts
packages/rendercore/src/reel/{types,render-reel,render-reel-set,render-grid-cell-reel-set,index}.ts
packages/rendercore/src/scene-layout/{types,package-runtime}.ts
packages/rendercore/tests/symbol/render-symbol.test.ts
packages/rendercore/tests/reel/{render-reel-set,render-grid-cell-reel-set,render-symbol-pool}.test.ts
packages/rendercore/tests/scene-layout/package-runtime.test.ts
packages/rendercore/README.md
apps/game002v2/tests/{source-boundary,spin-presentation}.test.ts
docs/rendercore-operation-first-layer-api.md
docs/agent-rules/shared-game-runtime.md
```

### 原则上不应修改

```text
packages/logiccore/**
packages/{gameframeworks,uiframeworks,netcore,slotoperationauthoring}/**
apps/game002v2/src/**
apps/{game002,game003,gameviewer,gameviewer2}/**
assets/**
docs/agent-rules/{game002,game003,scene-layout,loading-ui}.md
AGENTS.md
pnpm-lock.yaml
```

若实现必须修改 logiccore operation schema、Scene Layout manifest、game002v2 production flow、正式资源或 lockfile，属于
重大范围扩大，先停止说明。

## 7. 实施步骤

1. **确认执行基线并固定 legacy 行为**
   - 重新核对 HEAD/status、设计文档、RenderSymbol layer ownership、两种 reel occurrence/pool lifecycle 和 game002v2
     GridCell plan/continuous/Nearwin/cascade tests。
   - 先补兼容断言：legacy plan 输出/edge 顺序不变，standard/grid-cell settled occurrence identity 与 pool release 可观察。

2. **建立 RenderNode 与 SymbolRender façade**
   - 定义最小 public types、typed internal adapter、borrowed/owned destroy 和 stale generation guard。
   - 在 RenderSymbol 增加独立 game attachment roots；实现 set/play/add/remove，并覆盖 state切换、value player、reset/pool、
     duplicate mount、detach、abort、destroy。
   - 接入 registry/detached occurrence clone factory，覆盖 normal/current semantic state、value copy、独立 player 和 cleanup。

3. **让现有 reel 实现共同 SymbolArea**
   - standard 与 grid-cell 使用同一 façade builder，从不可变坐标快照捕获 exact visible occurrence；不复制 state/node逻辑。
   - grid-cell 复用 generation/lease guard；standard 增加对等 ownership generation，在 replacement/release/cascade/pool 边界失效。
   - 保留 `VisibleOccurrenceHandle` public compatibility，可内部委托共同 façade primitive，但不改变其现有签名和语义。

4. **实现无 plan 的逐格 CellSpin**
   - 基于 RenderReel、registry、pool 和 cell geometry 创建独立 runtime/container；构造时绑定公开轮带与默认 motion参数。
   - 实现 roll/start/settle/cancel、per-position active map、target code/value/state、private axis motion、atomic landing和 Promise。
   - 实现统一 update/destroy，覆盖 concurrent cells、same-cell conflict、selective/held（未调用格）、refill hole、低FPS切片、
     abort、cancel、pool和下一次roll；禁止 public整盘plan。

5. **补 cell attachment 与直接 async 编排验证**
   - 提供 stable cell-space RenderNode parent；验证 effect 可在 target symbol不存在时播放并在 landing 后清理/保留按显式调用决定。
   - 用测试中的 operation-style delay runner证明 stagger overlap、Promise.all barrier、activation格落地后改变后续cadence，以及
     `await roll -> getSymbol -> setState("appear")` 顺序，不实现第二层 helper。

6. **接入 Scene Layout compatibility accessor**
   - package runtime additive 暴露当前 `main` 的 SymbolArea（最终 accessor 名按现有 `getMainReel*` style确定），standard和
     grid-cell 均可用；unknown id、not-ready、hole/not-landed失败。
   - game002v2 tests 证明其现有 plan/callback/drain/effect/cascade未变，同时可以取得 settled/held/landed symbol并调用新 façade；
     production source保持不动。

7. **同步文档、规则与 public surface**
   - 更新 exports、RenderCore README、设计文档状态和 shared runtime规则，明确Plan owner、legacy exception、无plan CellSpin、
     borrowed/owned lifecycle及新游戏不得使用legacy grid-cell。
   - 搜索禁止项：新 CellSpin 不出现 GridCellReelSpinPlan/buildPlan/业务 symbol 名；game002v2 src无diff。

8. **L2 定向验收并生成报告**
   - 按第8节运行 rendercore public contract和game002v2直接consumer命令；失败先最小化到新增测试文件。
   - 完成可控浏览器人工验收后生成UTC中文报告；无法运行真实资源时明确未完成，不能以单测冒充视觉结果。

## 8. 测试与验收

### 测试原则

- SymbolRender tests 捕获 exact occurrence，不允许 replacement/release后按同坐标重绑；borrowed destroy、owned clone destroy、
  state waiter、attachment与pool reset全部覆盖。
- attachment tests必须证明内部 Spine/VNI/value overlay清理不会删除game node，game node也不能重写内部layer。
- CellSpin使用包内最小公开轮带和自包含symbol资源；测试并发不同格、同格冲突、direct/continuous、targetless cancel、
  target injection、hole/refill、低FPS、abort/destroy以及landing后立即getSymbol。
- async编排测试使用manual ticker/frame delay推进，不使用setTimeout或直接调用私有resolve。
- legacy tests继续以现有GridCellReelSpinPlan和game002v2 builder为输入，确保additive API不改变任何edge/timing/scene/value。
- 不为测试引入game002资源或business symbol分支，不通过fallback/placeholder绕过缺资源与非法state。

### 验收级别

采用 `L2`：新增rendercore跨consumer public API、共享occurrence/clone/node ownership与异步CellSpin runtime，并由
Scene Layout/game002v2直接消费。无需L3，因为不改根工具链、lockfile、schema、YAML、生成物或全仓consumer。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/symbol/symbol-render.test.ts tests/reel/symbol-area.test.ts tests/reel/render-cell-spin.test.ts tests/reel/render-grid-cell-reel-set.test.ts tests/scene-layout/package-runtime.test.ts
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore build
pnpm --filter game002v2 test
pnpm --filter game002v2 typecheck
git diff --check
```

### 人工验收

建议使用包内或最小 demo 画面验证两个并发 cell stagger 滚动、target落地后立即appear、held格持续播放、clone与附加
Spine/VNI node；再运行一轮game002v2 BaseGame及含Nearwin/selective refill的可控round，确认现有cadence、dimming、effect、
landing/activation edge、cascade和pool identity无变化。没有可控server round时，报告明确game002v2真实视觉未完成。

### 独立验收建议

`建议`。本任务涉及public contract、pooled occurrence identity、clone ownership、manual ticker Promise、abort/destroy以及
legacy game002v2兼容。独立复验重点是stale façade不重绑、不同格并发不重复update、旧GridCell plan行为不变。最多复验：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/symbol/symbol-render.test.ts tests/reel/render-cell-spin.test.ts tests/reel/render-grid-cell-reel-set.test.ts
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter game002v2 test
```

## 9. 环境与依赖

- 使用仓库要求的 Node.js 24 和 pnpm；缺依赖时运行 `CI=true pnpm install --frozen-lockfile`。
- 只有下载实际失败后才按仓库约定设置代理并重试原命令；不切换 npm/yarn。
- 本任务不新增第三方依赖、不修改 lockfile；RenderNode、clone和CellSpin复用Pixi及rendercore现有player/reel/pool。

## 10. 生成物、文档与规则

- 本任务无YAML、manifest schema或生成文件变化，不运行无关generator。
- 更新 `packages/rendercore/README.md`、`docs/rendercore-operation-first-layer-api.md` 和
  `docs/agent-rules/shared-game-runtime.md`；不把具体API清单复制到根 `AGENTS.md`。
- 执行时若发现需要新resource kind/schema才能实现通用RenderNode，只建立typed adapter seam并停止扩大资源范围，不能
  猜路径、复用首项资源或加入placeholder。

## 11. 执行报告

执行完成后创建：

```text
tasks/199-rendercore-operation-first-layer-api-<utctime>.md
```

报告简要记录实际API命名、legacy兼容证据、修改文件、验收结果、人工视觉状态和计划偏差，不收集无关coverage或全仓矩阵。

## 12. 风险、假设与待确认

### 风险

- 当前RenderSymbol内部layer和pool lifecycle复杂，错误attachment owner可能被state reset误删或在回池后泄漏。
- current grid-cell用整盘transaction推进；共享primitive时若错误复用其global active状态，可能破坏game002v2 timing/edge。
- per-cell并发若每个transaction各自update全部symbol，会造成Spine/VNI倍速；必须由单一runtime按slice去重推进。
- clone若错误复制active player或attachment，会形成资源双释放、晚到Promise或不可重现的timeline。
- game002v2真实Nearwin依赖正式Spine资源和server round，自动化不能完全替代视觉验收。

### 假设

- 新CellSpin可直接复用当前RenderReel、registry、pool和manual-update能力，无需logiccore/schema/asset变化。
- Scene Layout当前仅main reel；本任务的instance-scoped accessor不预建多reel manifest schema，但合同不使用singleton。
- RenderNode首版可以通过现有rendercore-created player/view adapter覆盖attachment合同；新增具体particle/light资源留给后续任务。

### 待确认

无。新ReelSpin方法、第二/第三层和未来node资源种类均明确不在本任务，不构成本任务实施阻塞。

## 13. 完成清单

- [ ] SymbolArea/SymbolRender/RenderNode/CellRender合同与严格生命周期完成。
- [ ] standard、legacy grid-cell和新CellSpin都支持getSymbol，legacy行为保持。
- [ ] 无public plan的CellSpin逐格direct/continuous/并发/abort/destroy完成。
- [ ] game002v2 production source、GridCell plan、Nearwin/cascade/edge行为未迁移且兼容测试通过。
- [ ] public exports、README、设计文档和shared规则同步。
- [ ] L2自动化通过，人工验收状态明确。
- [ ] 实际修改未超范围，UTC中文执行报告已生成。

## 14. 执行会话交接

执行会话应先读取根 `AGENTS.md`、本计划、`docs/rendercore-operation-first-layer-api.md` 和计划列出的领域规则，核对
未跟踪设计文档与当前HEAD后实施。小幅文件/命名适配在报告记录；若必须修改logiccore/schema/assets、迁移game002v2、
设计ReelSpin或新增第二层，先停止说明。只运行本计划L2验收；除非用户明确要求，不commit、不push、不创建PR。
