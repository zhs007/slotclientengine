# 200 rendercore-reel-spin-game003v2 任务计划

## 1. 目标与完成定义

### 目标

在任务 199 已完成的第一层 `SymbolArea/SymbolRender/CellSpin` 之上，为 standard reel 增加无 public plan 的逐列
`ReelSpin`：游戏直接调用某列的 `roll/start/settle/cancel`，落停后继续统一通过 `getSymbol({ x, y })` 操作 symbol。

以 game003v2 作为第一个正式 consumer，将当前 batch standard spin、targetless pre-spin、落停轮询和 app-owned
`localPhaseYs` 迁移到 `ReelSpin`；保留现有视觉方向、速度、minimum cycles、列间落停 cadence、CO value 和 win carousel，
同时让完整 ticker delta 进入 runtime，避免低帧率下丢时。

### 完成定义

- [ ] rendercore public export 提供 `ReelSpin/ReelRollTarget/ReelRender`，接口只包含逐列原子操作和已有
      `SymbolArea.getSymbol()`，不存在 public `ReelSpinPlan` 或整盘 command DSL。
- [ ] `roll/settle` 只在整列 target symbols 已原子落定、该列所有 `getSymbol()` 均可使用后 resolve；不同列可并发，
      同列冲突和非法 target 显式失败。
- [ ] `start` 在没有 server target 时只使用本地公开轮带；`settle` 注入明确 scene/value；abort、cancel、失败和 destroy
      不留下半提交目标、pending Promise、pool/player 泄漏或伪造 landing。
- [ ] Scene Layout runtime 按实例暴露 `getReelSpin("main")`；unknown area、非 standard reel 或未准备状态显式失败。
- [ ] standard legacy batch spin/continuous 方法保留兼容，但与 ReelSpin 共用唯一 per-reel transaction owner 和 update loop，
      不出现两套状态机或两次 symbol player update。
- [ ] game003v2 使用 ReelSpin 完成 direct spin 和 request-time pre-spin/response-time settle，不再传每轮
      `localPhaseYs/finalY`、不再轮询 `isMainReelSpinning()`。
- [ ] game003v2 的五列 pre-spin 在请求 hook 中同步启动；response landing 继续按配置的 stop cadence 错峰，最终以
      `Promise.all()` 形成 operation barrier。
- [ ] game003v2 ticker 不再把 delta clamp 到 `1/30` 并丢弃时间；ReelSpin 内部切片保证低 FPS motion/player 推进稳定。
- [ ] game003v2 的 CO value、win state/carousel、popup、next-spin cleanup 和现有 local public strip 规则保持；浏览器验收由
      用户执行，执行报告明确记录为待用户验收。
- [ ] public exports、RenderCore README、第一层合同、最小 shared/game003 规则、定向测试和 UTC 中文执行报告同步。

## 2. 范围

### 包含

- rendercore `ReelSpin`、`ReelRollTarget`、`ReelRender` public contract 与 instance-scoped accessor。
- standard reel 的 per-column direct roll、targetless continuous start、target injection settle、cancel、AbortSignal、destroy、
  low-FPS slicing、atomic commit 和 Promise completion。
- `RenderReel` 单轴 motion/pool/player primitive 的复用，以及 legacy `RenderReelSet` batch façade 到同一 owner 的适配。
- Scene Layout package runtime 的 `getReelSpin("main")`，并保持现有 legacy standard API 可用。
- game003v2 round adapter、presentation config、相关 compiler/tests/source-boundary 的 ReelSpin 迁移。
- game003v2 完整 delta 传递、pre-spin 同步启动、response landing frame-driven stagger 和失败 cleanup。
- rendercore/game003v2 定向 tests、README、长期合同、领域规则与执行报告。

### 不包含

- 不修改 `CellSpin` 第一层合同，不迁移 game002v2，不扩展 legacy `grid-cell` plan、Nearwin、effect 或 cascade。
- 不增加第二层 full/held/anticipation helper、第三层 operation template、`ReelSpinPlan`、matrix command 或 stagger 数组。
- 不实现部分格 hold、refill、drop、cascade、symbol transfer、扩展 symbol 或 feature reel；这些使用 CellSpin 或后续原语。
- 不重做 game003v2 win carousel，不把 `SymbolGeometry/Snapshot` 加回 `SymbolRender`；现有 geometry API 只保兼容。
- 不修改 logiccore operation schema/finalizer，不把 presentation phase/timing 写入 logiccore plan。
- 不修改 Scene Layout YAML/schema、正式 assets、生成物、根工具链、第三方依赖或 lockfile。
- 不迁移其它 standard reel consumer；兼容测试只证明它们没有因唯一状态机重构而破坏。

## 3. 制定计划时的基线

```text
UTC: 2026-08-12T04:25:35Z
HEAD: 28a5fe38b5a7c2b429014e4f7ecbce39766e4496
branch: codex/task-199-rendercore-first-layer-api
git status --short --untracked-files=all:
(clean)
```

- 已读取根 `AGENTS.md`、`tasks/templates/{task-discussion,task-plan}.md`、
  `docs/agent-rules/{shared-game-runtime,game003,loading-ui}.md`、第一层合同、任务 199 计划/报告，以及 rendercore/game003v2
  直接实现与测试；目标目录无补充 `AGENTS.md`。
- 任务 199 已实现 `SymbolArea/SymbolRender/RenderNode/CellSpin`。standard `RenderReelSet` 已可 `getSymbol()`，但尚无新
  `ReelSpin` public methods；Scene Layout runtime 也没有 `getReelSpin()`。
- `RenderReel` 已有单轴 spin/continuous/settle、公开轮带、临时 target、pool/player 和 manual ticker primitive；新能力应
  复用它，而不是从 game003v2 或 legacy batch planner 复制运动状态机。
- game003v2 `round-adapter.ts` 当前调用 `startMainReelContinuousSpin()`、`settleMainReelContinuousSpin()` 或
  `spinMainReels()`，再通过 `isMainReelSpinning()` frame polling 完成 landing。
- game003v2 当前为每轮 landing 计算 `resolvePhases()` 并传 `localPhaseYs`；server scene/value 已足以成为 ReelSpin target，
  phase 和临时 target window 应由 rendercore 私有处理。
- game003v2 manifest 当前 standard 配置为 backward、minimumSpinCycles 8、baseDurationMs 1300、speed 44、
  `startDelayMs: 80`、`stopDelayMs: 120`。用户已确认第一版 pre-spin 同步启动，landing 继续使用 120ms frame delay。
- game003v2 ticker 当前以 `MAX_DELTA_SECONDS = 1 / 30` clamp runtime update，长帧时间被丢弃；ReelSpin 需要内部 timeline
  slicing，而 consumer 传递完整非负 delta。
- game003v2 win carousel 仍使用 visible occurrence state/geometry compatibility API；本任务只迁移 spin，不改变其坐标能力。
- 规划会话不实施代码、不安装依赖、不运行测试；只创建任务 200 文档并检查 Markdown/diff。

## 4. 需求解释与技术决策

### 需求解释

- ReelSpin 第一层的原子单位是“一列”，不是“一盘”。full spin 是调用全部列，held reel 是不调用对应列，跨列 cadence
  使用 operation context 的 frame delay 和普通 Promise 编排。
- “最后都能 getSymbol”表示 ReelSpin landing commit 与 Promise resolve 是同一完成边界；调用方无需 snapshot、finalY 或
  completion polling 才能操作结果 symbol。
- request-time targetless pre-spin 必须在同步 hook 中立即生效。当前 hook 没有 awaitable frame context，因此第一版同时启动
  五列，不复制 app scheduler 来保留 80ms start stagger。
- game003v2 的 120ms stop cadence 是跨列 presentation 顺序，留在 operation handler 编排；单列 motion、落停和 low-FPS
  slicing 属于 ReelSpin。

### 关键决策

1. **ReelSpin 只提供逐列 atomic API。**
   - public shape 固定为 `roll/start/settle/cancel/getReel/getSymbol`；target 是一列 symbol/value/state。
   - 不增加 full/selective/held flag、整盘 plan、stagger 参数、回调 edge 或 `isComplete()`。

2. **standard reel 只有一个 transaction owner。**
   - `RenderReelSet` 内部以 column keyed active transaction 推进 direct/continuous/settling motion，并复用 `RenderReel`。
   - legacy batch API 只负责严格校验、逐列启动和 aggregate completion；不能保留独立 batch motion/update 状态机。

3. **target 不包含 presentation phase。**
   - `ReelRollTarget.symbols` 必须与可见 rows 等长；可选 `values/states` 存在时同样等长。
   - local public strip phase、temporary landing window 和 finalY 由 ReelSpin 内部生成；game003v2 不再 `resolvePhases()`。

4. **Promise 是 landing barrier。**
   - 每列完成时一次性提交全部可见 occurrence，再同步完成 Promise edge；continuation 运行时 `getSymbol()` 已稳定。
   - 不允许调用方通过 ticker polling、固定 duration 或读取内部 reel phase 猜完成。

5. **game003v2 直接编排，不引入第二层。**
   - targetless pre-spin 同步循环 `start(x)`；若中途失败，按已启动列逆序 `cancel(x)` rollback。
   - response handler 使用 `context.delay(stopDelay)` 后启动每列 `settle/roll` job，最后 `Promise.all()`；共享 abort 在失败或
     cleanup 时终止未完成 targeted motion。

6. **低 FPS 不丢时。**
   - game003v2 将完整非负 ticker delta 交给 Scene Layout runtime；ReelSpin 将较大 delta 拆成有上限的内部 timeline slice。
   - 每个 slice 内每个 occupied symbol/player 恰好 update 一次，Promise completion 只在最终 commit 后发出。

7. **兼容 geometry 与 legacy 方法不扩大新合同。**
   - win carousel 暂留当前 occurrence geometry façade；它不是 ReelSpin/SymbolRender 新依赖。
   - legacy standard methods 与新 API 共用 owner；兼容期结束另开任务移除，不在本任务顺手删除。

## 5. 职责与合同

- **logiccore/server operation**：拥有 scene/value 和 operation 顺序；不拥有 local phase、speed、duration 或 reel motion plan。
- **game003v2 operation adapter**：解释何时 pre-spin、列间 start/stop cadence、并发 barrier、next-spin cleanup 和业务 state。
- **ReelSpin/RenderReelSet**：拥有逐列公开轮带、target window、motion、pool/player、atomic commit、abort/destroy 和 completion。
- **SymbolArea/SymbolRender**：继续拥有落停 occurrence 的严格坐标访问、state/value/node/clone façade 和 stale failure。
- **Scene Layout runtime**：只按 reel/area id 路由实例，不成为 singleton，不重新解释 game003 业务 target。
- **失败策略**：unknown reel/column、target 长度、symbol/value/state、同列并发、无 active settle、重复 start、invalid timing、
  aborted signal、missing resource/player 都显式失败；不 fallback、截断、补 normal state 或按当前画面伪造 landing。
- **资源生命周期**：runtime owns reel occurrence/pool 和 active transaction；targeted abort 回滚未提交 target并拒绝 Promise；
  targetless cancel 只停止本地 rolling；destroy 拒绝全部 pending 并释放临时 target/attachment/listener。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/tests/reel/render-reel-spin.test.ts
tasks/200-rendercore-reel-spin-game003v2-<utctime>.md
```

实现可将 ReelSpin façade 放入现有 `render-reel-set.ts` 或职责单一的新文件；若新增文件，推荐
`packages/rendercore/src/reel/render-reel-spin.ts`，不得复制 RenderReel 状态机。

### 预计修改

```text
packages/rendercore/src/reel/{types,render-reel,render-reel-set,index}.ts
packages/rendercore/src/scene-layout/{types,package-runtime}.ts
packages/rendercore/src/index.ts
packages/rendercore/tests/reel/render-reel-set.test.ts
packages/rendercore/tests/scene-layout/package-runtime.test.ts
packages/rendercore/README.md
apps/game003v2/src/{round-adapter,round-compiler}.ts
apps/game003v2/config/game-runtime.manifest.json
apps/game003v2/tests/*.test.ts
apps/game003v2/README.md
docs/rendercore-operation-first-layer-api.md
docs/agent-rules/{shared-game-runtime,game003}.md
```

### 原则上不应修改

```text
packages/logiccore/**
packages/rendercore/src/reel/render-cell-spin.ts
apps/game002v2/**
assets/**
docs/agent-rules/{game002,scene-layout,loading-ui}.md
AGENTS.md
pnpm-lock.yaml
```

若必须修改 logiccore/schema/assets、迁移 game002v2、重做 win carousel 或增加第二层 helper，属于重大范围扩大，先停止说明。

## 7. 实施步骤

1. **确认基线与 legacy 行为**
   - 核对 HEAD/status、第一层合同、RenderReel/RenderReelSet motion owner、Scene Layout façade 和 game003v2 current tests。
   - 补充 standard direct/continuous 兼容断言，固定 scene/value、direction、minimum cycles、completion 和 player update 边界。

2. **建立 ReelSpin public contract 与唯一 owner**
   - 定义 ReelSpin/ReelRender/target/options exports，在 RenderReelSet 建 per-column active transaction。
   - 实现严格 target validation、direct roll、targetless start、settle、cancel、same-column conflict 和 concurrent columns。
   - 让 legacy batch methods 翻译到同一 owner，删除或收拢重复 batch motion 状态；不改变其 public 签名。

3. **完成 atomic completion、低 FPS 与 lifecycle**
   - 在 internal update 中切片完整 delta，保证 occurrence/player 每 slice 一次更新。
   - 覆盖 target window prepare/commit/rollback、Promise resolve/reject、AbortSignal、partial start rollback、destroy 和 pool reuse。
   - 验证 `await roll/settle` 后整列 `getSymbol()`、state/value 均立即正确。

4. **接入 Scene Layout instance accessor**
   - 增加 `getReelSpin("main")`，只对已准备的 standard reel 返回同一实例；unknown/grid-cell/not-ready 显式失败。
   - 保留旧 standard façade并证明与新 accessor 同 owner；不增加全局 rendercore singleton。

5. **迁移 game003v2**
   - request hook 同步启动全部列并处理 partial failure；landing 依据是否 pre-spin 选择 `settle` 或 `roll`。
   - 使用 operation context delay 启动错峰 landing jobs并 `Promise.all()`；移除 spin polling 和 per-round phase resolution。
   - 传递完整 ticker delta；删除不再生效的 `startDelayMs`，保留明确属于 game orchestration 的 stop cadence。
   - 保持 CO value、win carousel geometry、popup、cleanup和local public strip，不复制rendercore内部motion。

6. **同步测试、文档和规则**
   - 增加 ReelSpin direct/continuous/concurrency/strict failure/low-FPS/abort/destroy 测试与 Scene Layout accessor 测试。
   - 更新 game003v2 source-boundary/round tests，禁止 legacy spin polling、`resolvePhases/localPhaseYs` 和 public ReelSpinPlan。
   - 更新 README、第一层合同状态和最小 shared/game003 规则。

7. **L2 验收与报告**
   - 运行第 8 节命令，失败先最小化到 rendercore 或 game003v2 direct consumer。
   - 生成 UTC 中文执行报告；浏览器视觉验收标记为待用户执行，不以单测代替。

## 8. 测试与验收

### 测试原则

- ReelSpin 测试覆盖不同列并发、同列冲突、direct/continuous/settle/cancel、严格 target 长度、value/state、低 FPS、abort、
  destroy、pool reuse，以及 Promise 后立即 `getSymbol()`。
- legacy standard tests 证明旧 batch façade与新 ReelSpin 共享结果和 owner，不能出现双 update、重复 completion 或 phase 分叉。
- game003v2 tests 使用 manual ticker/frame context，不使用 `setTimeout()`、duration sleep 或 production 私有字段完成 Promise。
- source-boundary 明确禁止 game003v2 调 legacy spin polling、计算 finalY/localPhaseYs 或创建 public ReelSpin plan。
- 自动化验证业务数据与 transaction 边界；真实方向、cadence、CO value、win carousel 和低 FPS 观感由用户浏览器验收。

### 验收级别

采用 `L2`：任务新增 rendercore public API、重构 standard shared motion owner，并迁移直接 consumer game003v2。无需 L3，因为
不改根工具链、lockfile、schema、YAML、生成物或全仓 consumer。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/reel/render-reel-spin.test.ts tests/reel/render-reel-set.test.ts tests/scene-layout/package-runtime.test.ts
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore build
pnpm --filter game003v2 test
pnpm --filter game003v2 typecheck
git diff --check
```

### 人工验收

由用户在浏览器验收 game003v2：首轮 direct spin、请求后立即 pre-spin、五列同时开始、120ms 逐列落停、CO value、win
carousel、next spin、切后台或低 FPS 后恢复，以及中断/重新开始。执行报告必须列为待用户结果，不能以编译或单测冒充。

### 独立验收建议

`建议`。本任务涉及跨包 public contract、共享 reel transaction owner、异步 commit/rollback 和低 FPS update。重点复验同列
冲突、targeted abort不半提交、legacy façade不双更新，以及 game003v2 不再传 phase。最多运行：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/reel/render-reel-spin.test.ts tests/reel/render-reel-set.test.ts
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter game003v2 test
```

## 9. 环境与依赖

- 使用仓库要求的 Node.js 24 和 pnpm；依赖缺失时运行 `CI=true pnpm install --frozen-lockfile`。
- 只有下载实际失败后才按仓库约定设置代理并重试原命令；不切换 npm/yarn。
- 本任务不新增第三方依赖、不修改 lockfile；复用 rendercore 当前 Pixi、symbol registry、pool/player 和 manual ticker。

## 10. 生成物、文档与规则

- 本任务无 YAML、schema 或生成文件变化，不运行无关 generator。
- 更新 `packages/rendercore/README.md`、game003v2 README、第一层合同和最小 shared/game003 领域规则。
- 精确 motion 参数继续以 game003v2 manifest 为权威；不复制到根 `AGENTS.md` 或 shared runtime。

## 11. 执行报告

执行完成后创建：

```text
tasks/200-rendercore-reel-spin-game003v2-<utctime>.md
```

报告简要记录最终 API、唯一 transaction owner、game003v2 迁移、实际文件、自动化结果、待用户浏览器验收和计划偏差。

## 12. 风险、假设与待确认

### 风险

- legacy RenderReelSet 当前 batch 状态若未完全收拢，可能与 per-column owner 双推进或双提交 occurrence。
- pre-spin 改为五列同时启动会改变原 80ms start stagger；这是已确认的第一版行为，浏览器仍需确认观感。
- targeted abort 或某列 strict failure 若只停止单列，可能留下其它列继续滚动；game adapter 必须使用共享 abort/cleanup。
- 完整 delta 若只在 consumer 取消 clamp、ReelSpin 未正确切片，可能穿越 landing edge或让 player 瞬跳。
- win carousel 与 spin 共用 occurrence/pool；迁移不能让 geometry compatibility façade持有已回池 occurrence。

### 假设

- 当前 RenderReel primitive 足以支持逐列 owner，无需 logiccore、资源或 manifest schema 变化。
- game003v2 当前只有 standard 5x5 main reel，没有 partial-cell hold/cascade/mode transition 需要进入 ReelSpin。
- `stopDelayMs` 可继续作为 game003v2 operation cadence 配置使用；不要求 ReelSpin 接受 stagger 参数。

### 待确认

无。第二/第三层、其它 consumer 迁移、win carousel 新坐标原语和 legacy API 移除均另开任务。

## 13. 完成清单

- [ ] ReelSpin/ReelRender public contract、唯一 per-column owner 与 strict lifecycle 完成。
- [ ] Scene Layout instance accessor 与 legacy standard compatibility 完成。
- [ ] game003v2 direct/pre-spin/settle/delta 迁移完成，business效果保持。
- [ ] 无 public plan、phase计算、completion polling 或第二套 reel状态机。
- [ ] tests、README、长期合同和领域规则同步。
- [ ] L2自动化通过，用户浏览器验收状态明确。
- [ ] 实际修改未超范围，UTC中文执行报告已生成。

## 14. 执行会话交接

执行会话先读取根 `AGENTS.md`、本计划、第一层合同及 shared/game003/loading 规则，核对当前 HEAD/status 后实施。小幅
文件或命名适配记入报告；若必须修改 logiccore/schema/assets、迁移 game002v2、重做 win carousel 或新增第二层，先停止
说明。只运行本计划 L2 验收；浏览器由用户验收。除非用户明确要求，不 commit、不 push、不创建 PR。
