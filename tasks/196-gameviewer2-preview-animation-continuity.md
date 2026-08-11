# 196 gameviewer2-preview-animation-continuity 任务计划

## 1. 目标与完成定义

### 目标

修复 `apps/gameviewer2` 独立新窗口预览在关键 operation/scene 编排完成后停止推进
`SceneLayoutPackageRuntime` 的问题。流程完成只结束 scene/operation 调度，不结束预览窗口的渲染时钟：

- 最终画面中的所有 Symbol 按既有状态机回到并持续播放 stable `normal` loop；
- Gamelayout 中的背景 Spine、普通 Spine/VNI node、popup/transition 等其它 runtime-owned 动画继续遵守各自
  manifest、可见性和生命周期，不被统一暂停、重播或重置；
- Replay、失败和窗口关闭仍使用现有 generation、fail-stop 与 destroy 合同。

### 完成定义

- [ ] operation plan 处于 `running` 时，每个 live Pixi tick 仍只推进一次 package runtime，并在同一帧推进 coordinator waiter；不得 double update。
- [ ] operation plan 进入 `complete`、预览 controller 进入 `completed` 后，后续 live Pixi tick 继续调用 `SceneLayoutPackageRuntime.update(deltaSeconds)`。
- [ ] 无 operation plan 的兼容路径、尚未播放的 `ready` 阶段和 Replay reset 后也继续使用同一个宿主 ticker；只有 `destroy()` 后停止处理 tick。
- [ ] 最终 Symbol 不新增第二套“强制 normal”扫盘逻辑：现有 choreography 的 exact `normal` 终态继续成立，被 `first-cell-normal` 提前退役且仍处于 once 的格由 `RenderSymbol` 在后续 update 中按默认状态合同自然回到 `normal`。
- [ ] Gamelayout 其它动画保持当前 playhead 连续推进，不因 flow completion 调用 reset、重新创建 player、重新请求 animation 或重建 package runtime。
- [ ] 定向自动化、真实 production ZIP 浏览器验收和 UTC 中文执行报告完成。

## 2. 范围

### 包含

- `@slotclientengine/rendercore/scene-layout` 的 `createSceneOtherSceneFlowRuntime()` ticker/update ownership 修正。
- operation coordinator `running` 与非运行阶段之间的单 owner update 路由。
- local scene flow 单测对 `ready / running / completed / replay / destroyed` tick 行为和每帧一次 update 的保护。
- Game Viewer 2、rendercore README 与最小领域规则中的“流程完成不停止渲染时钟”说明。
- 使用带 stable Spine/VNI 背景或普通 node、带 loop Symbol normal 的真实 production ZIP 做独立窗口视觉验收。

### 不包含

- 不修改 scene/otherScene snapshot、choreography、completion policy、operation plan 或 launch payload schema。
- 不改变 `all-cells-normal | first-cell-normal` 的推进边界，不把第一格模式改成等待全部格完成关键编排。
- 不新增全格轮询、终态 timer、固定动画时长、强制 `requestState("normal")` sweep 或 completion 后的动画重启。
- 不修改 `SlotOperationCoordinator` 的全局 complete/idle/update 语义，也不影响 game002、game003v2 或 configured round consumer。
- 不改变 Scene Layout node/Spine/VNI/player 的 manifest playback、mode visibility、popup、transition 或资源 ownership。
- 不修改 production ZIP、Gamelayout/Symbols schema、assets、YAML、生成物、根工具链、依赖或 lockfile。

## 3. 制定计划时的基线

```text
UTC: 2026-08-11T07:09:36Z
HEAD: 152c59e2f023a5b055eda98066ccfe0b8d87c2e7
branch: (detached HEAD)
git status --short --untracked-files=all:
<clean>
```

实际读取：

```text
AGENTS.md
tasks/templates/task-plan.md
docs/agent-rules/{gameviewer2-local-flow,shared-game-runtime,scene-layout}.md
tasks/{150-gameviewer2-local-scene-flow-preview,151-gameviewer2-unified-spin-and-scene-completion,
  178-slot-operation-effect-composition-refactor,181-rendercore-awaitable-symbol-state-playback,
  192-rendercore-trusted-operation-rendering}.md
apps/gameviewer2/{README.md,package.json,src/runtime/entry.ts,tests/runtime-entry.test.ts}
packages/rendercore/{README.md,package.json}
```

目标目录没有补充 `AGENTS.md`。当前实现结论：

- `apps/gameviewer2/src/runtime/entry.ts::startRuntimeWindow()` 创建一次
  `createSceneOtherSceneFlowRuntime()`，立即 `play()`，只在 Replay 调用 `runtime.replay()`，只在
  `beforeunload` 调用 `destroy()`；app 没有显式停止 Pixi ticker。
- `packages/rendercore/src/scene-layout/local-scene-flow.ts::createSceneOtherSceneFlowRuntime()` 把
  `DefaultSceneOtherSceneFlowRuntime.update()` 注册到 `Application.ticker`，因此新窗口的时钟 owner 已经是 rendercore local-flow facade。
- `DefaultSceneOtherSceneFlowRuntime.update()` 当前在存在 `#operationCoordinator` 时不直接调用
  `#runtime.update()`，而始终调用 `coordinator.update()`。coordinator 只有在 plan `running` 时才调用其
  `updateRuntime` callback；plan `complete` 后 `#plan` 被清空，后续 `coordinator.update()` 立即返回。
- 因此 coordinator-backed v4 预览完成后，`SceneLayoutPackageRuntime.update()` 不再运行；其负责的
  `#layout.update()`、reel Symbol update、popup 和 active transition update 一并冻结，视觉上像整个时钟停止。
- `packages/rendercore/src/scene-layout/configured-round-adapter.ts::#onTick()` 已有正确的同类 ownership 先例：
  coordinator `running` 时由 coordinator 推进 runtime，否则直接调用 `runtime.update(deltaSeconds)`。
- `SceneLayoutPackageRuntime.update()` 会推进普通 Scene Layout Spine/VNI node、reel Symbol、popup 和 transition；
  `RenderSymbol.update()` 在 once completion 时切回 default stable state。local-flow v2 readiness 又要求可完成序列以
  exact stable `normal` 结束，因此无需新增终态修补状态机。
- 现有 `packages/rendercore/tests/scene-layout/local-scene-flow.test.ts` 只断言 plan 最终进入 `completed`，没有断言完成后的后续 ticker 是否继续推进 package runtime，也没有防止运行期 double update。
- 当前代码、测试和领域规则足以确认责任边界；定向历史只用于确认 operation coordinator 是现行 v4 路径，不需要完整 Git 历史审计。

## 4. 需求解释与技术决策

### 需求解释

- “关键编排完成”表示 local scene flow/operation plan 不再有下一个 snapshot 或 operation；不表示预览窗口、Pixi Application 或 Gamelayout runtime 完成生命周期。
- “所有 symbols 应该 normal 状态循环”沿用现有 exact `normal` 终态和 Symbol default-state 合同，不引入 completion 后覆盖每格状态的额外命令。
- `all-cells-normal` 完成时全部格已经进入最终 normal；`first-cell-normal` 仍允许按既有合同退役其它 controller，未完成格当前 once 动画只要继续得到 update，就会自然回 default normal，且不会跨 generation 发出后续旧编排请求。
- “Gamelayout 里别的动画该怎样就怎样”意味着保持原 player/playhead 和 manifest loop/once 行为连续运行；不是 completion 时把所有动画重播，也不是把所有 once 动画改成 loop。

### 关键决策

1. **把渲染时钟与 flow phase 解耦**
   - `DefaultSceneOtherSceneFlowRuntime.update()` 在对象存活期间每帧必须让 package runtime 恰好 update 一次。
   - flow 的 `ready | playing | completed` 只控制 operation/sequence 调度；`destroyed` 才终止 tick 处理。

2. **按 coordinator 是否正在运行选择唯一 update owner**
   - coordinator `getSnapshot().running === true` 时调用 `coordinator.update(deltaSeconds)`，由其现有 `updateRuntime` callback 先推进 package runtime，再推进 frame waiter。
   - coordinator idle/complete 时直接调用 `#runtime.update(deltaSeconds)`；不再把 tick 交给不会推进 runtime 的已完成 coordinator。
   - 该模式与 configured round adapter 现有实现一致，并避免同一帧先 direct update、再 coordinator update 导致动画加速两倍。

3. **修 local-flow consumer，不扩大 coordinator public contract**
   - `SlotOperationCoordinator.update()` 继续只服务 active plan；complete 后不承担长期 renderer clock。
   - 修改 coordinator 为“无 plan 也 update runtime”会改变所有 consumer 的 owner 假设，且可能与 app 自己的 idle update 重复，不符合本任务窄范围。

4. **复用 Symbol 状态机，不做 completion sweep**
   - final normal 已由 strict project/readiness 和 sequence runner保证；once 自动回 default normal 已由 `RenderSymbol.update()` 保证。
   - completion sweep 会截断 first-cell 模式中其它格的当前 once、覆盖 player continuity，并复制状态机职责，因此不采用。

5. **测试 clock routing，不伪造视觉通过**
   - fake runtime 单测精确证明每个 phase 的 update 次数、operation waiter 和 completion 后持续 tick。
   - Spine/VNI 背景 playhead 与 normal loop 是否肉眼连续，必须用真实 ZIP 在浏览器验证，不能由 mock counter 代替。

## 5. 职责与合同

- **gameviewer2 runtime entry**：拥有窗口 DOM、一次性 launch、viewport、Replay 按钮和 unload destroy；不拥有 Pixi/reel/node 更新分派。
- **rendercore local scene flow**：拥有独立 Pixi Application ticker、flow phase、operation coordinator 与 package runtime 之间的每帧单 owner 路由。
- **operation coordinator**：只在 active plan 内按顺序执行 handler、推进 runtime 和 frame waiter；complete 后退出 plan ownership。
- **SceneLayoutPackageRuntime**：持续推进 layout node、reel Symbol、popup 和 transition，并保持各自 manifest/lifecycle 语义。
- **Symbol state machine**：负责 once completion 回 default stable normal；local flow 只负责关键 choreography 与 generation barrier。
- **资源生命周期**：flow completion 不 destroy、不 reset package resource/player；Replay 只按现有合同 reset reel/flow generation；窗口关闭才 destroy Application/runtime/resource。
- **失败策略**：update、animation 或 operation failure 继续显式 fail-stop；不得因保持时钟而吞错、重启 runtime 或降级动画。
- **禁止行为**：double update、completion 后 ticker stop、全格 normal sweep、player 重建、playhead reset、wall-clock timer、animation fallback 或跨 consumer 修改 coordinator。

## 6. 文件范围

### 预计新增

```text
tasks/196-gameviewer2-preview-animation-continuity-<utctime>.md
```

### 预计修改

```text
packages/rendercore/src/scene-layout/local-scene-flow.ts
packages/rendercore/tests/scene-layout/local-scene-flow.test.ts
packages/rendercore/README.md
apps/gameviewer2/README.md
docs/agent-rules/gameviewer2-local-flow.md
```

若 README 现有说明加入一句即可，不新增独立设计文档。测试原则上并入现有 local scene flow test，不另建重复 fixture。

### 原则上不应修改

```text
apps/gameviewer2/src/{model,ui,runtime/entry.ts}/**
packages/rendercore/src/{slot-operation,symbol,reel,scene-layout/package-runtime.ts}/**
packages/rendercore/tests/{slot-operation,symbol,reel}/**
packages/{logiccore,gameframeworks,slotoperationauthoring}/**
apps/{game002,game002v2,game003,game003v2,gameviewer,gamelayouteditor}/**
assets/**
pnpm-lock.yaml
AGENTS.md
```

若实现发现必须改变 coordinator public API、Symbol 状态机、project/schema 或 package runtime lifecycle，属于明显范围扩大，必须先停止说明，不能修改计划来事后合理化。

## 7. 实施步骤

1. **确认执行基线与 characterization**
   - 重新核对 HEAD/status、local flow update 分支、coordinator `running` snapshot 和 configured adapter 的单 owner tick 先例。
   - 在现有 test fake 上记录 ready、active plan、plan complete、Replay 和 destroy 时的 `runtimeUpdate` 基线。

2. **修正 local-flow tick ownership**
   - 在 `DefaultSceneOtherSceneFlowRuntime.update()` 中先保持 destroyed/failure guard，再根据 coordinator 当前是否 running 选择 coordinator update 或 direct runtime update。
   - 保持 active plan 中 `updateRuntime -> frame waiter -> operation completion` 的现有帧内顺序；完成后只停止 flow 调度，不停止 package runtime。

3. **保护完成态与单帧一次语义**
   - 扩展 `local-scene-flow.test.ts`：验证 coordinator-backed flow 完成后多个 ticker 仍逐次增加 `runtimeUpdate`。
   - 验证运行中的 tick 不因 direct/coordinator 两条路径重复 update；ready 与 Replay/reset 后继续 update；destroy 后 callback 幂等返回。
   - 保留现有 spin landing、once completion、first-cell generation 退役、operation failure 和 resource cleanup 测试。

4. **同步稳定行为文档**
   - 在 rendercore/Game Viewer 2 README 说明 flow completion 与 renderer lifetime 分离，最终 normal 和 layout 动画继续由同一 ticker 推进。
   - 在 `gameviewer2-local-flow.md` 增加稳定规则：完成编排不得暂停 package runtime；不得通过重播/重建其它 layout 动画伪装修复。

5. **定向验收与报告**
   - 运行 L1 命令，失败先在 local scene flow test 最小化复现，不扩大到整仓。
   - 使用真实 production ZIP 在新窗口观察完成前后背景/普通 node/normal Symbol playhead，复验 Replay 与关闭窗口。
   - 生成 UTC 中文报告，记录自动化、人工视觉结果、实际文件范围和任何小幅偏差。

## 8. 测试与验收

### 测试原则

- 用 `runtimeUpdate` 调用次数证明时钟路由：每个 live tick 恰好一次，不能只断言 `phase: completed`。
- operation-backed 测试必须等待 Promise/microtask 进入 complete 后再发送额外 ticker，避免把最后一帧 operation update 误算为完成态持续更新。
- 保持无 coordinator 路径、Replay generation、first-cell stale controller、failure 和 destroy 的既有断言。
- 不通过在 test fake 中自动重播 background 或强制写 normal 来迎合期望；生产合同是持续 update 已存在的 player。

### 验收级别

采用 `L1`：实现只修改 rendercore 单一 local scene-flow facade 的内部 ticker 路由和直接测试，不改变 public API、schema、生成物或依赖。Game Viewer 2 build 作为直接 consumer 集成检查；不因共享包目录本身升级到 L2。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/local-scene-flow.test.ts
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter gameviewer2 build
git diff --check
```

失败时先运行具体 test name 最小化复现；不默认运行 rendercore 全量 coverage、根级 typecheck/lint/test/build/format。

### 人工验收

必须使用至少一个包含 stable loop 背景或普通 Spine/VNI node、且 Symbols `normal` 为可观察 loop 的真实 production ZIP：

1. 打开独立预览窗口，确认关键 Spin/settled 编排正常完成，最终 snapshot、completion policy 和 operation 顺序不变。
2. 完成后持续观察不少于两个清晰 loop 周期：所有 Symbol 最终处于 normal 语义并继续循环；背景和其它可见 Gamelayout loop 动画 playhead 连续，没有定格、跳回首帧或重新播放。
3. 若布局含合法 once node/popup/transition，确认它仍按自身合同完成或停留，不被本修复强制改成 loop。
4. 点击 Replay，确认流程从 initial snapshot 重走且非流程动画没有因 double update 加速；关闭窗口后无残留 ticker、console error 或资源更新。

若仓库没有同时满足全部观察点的单个 ZIP，可用两个现有 production ZIP 分别覆盖 layout node 与 Symbol normal，但不得用 mock runtime 标记视觉验收通过。

### 独立验收建议

`建议`。不涉及 public contract、credential、服务器数据、schema、ZIP 或新资源 ownership，但涉及长期 ticker 与动画时间连续性。独立复验重点是完成后持续 update 和 active plan 每帧不 double update。最多复验：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/local-scene-flow.test.ts
pnpm --filter gameviewer2 build
git diff --check
```

## 9. 环境与依赖

- Node.js 使用仓库要求的 Node 24。shell 没有 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 统一使用该环境的 Node 和 pnpm，不切换 npm/yarn，不强制调版本。
- 依赖缺失时执行 `CI=true pnpm install --frozen-lockfile`。
- 只有下载实际失败后才设置仓库约定代理并重试原命令。
- 本任务不新增依赖、不修改 workspace 配置或 `pnpm-lock.yaml`。

## 10. 生成物、文档与规则

- 本任务不修改 YAML、manifest、production ZIP 或生成 TypeScript，无生成器/parity checker。
- 同步 `packages/rendercore/README.md` 与 `apps/gameviewer2/README.md` 的完成态播放说明。
- 更新 `docs/agent-rules/gameviewer2-local-flow.md`，因为“flow complete 不等于 renderer clock complete”是稳定、跨未来任务的 viewer runtime 边界。
- 不更新根 `AGENTS.md` 或无关领域规则。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/196-gameviewer2-preview-animation-continuity-<utctime>.md
```

UTC：

```bash
date -u +%y%m%d-%H%M%S
```

报告简要记录：

1. 最终 tick routing 和实际修改文件；
2. active/complete 每帧一次 update 的测试证据；
3. 自动化命令及结果；
4. 真实 ZIP、观察动画类型和视觉验收结果；
5. 计划偏差、剩余风险和未完成项。

不收集无关 coverage、完整历史矩阵、整仓统计或 profiler 数据。

## 12. 风险、假设与待确认

### 风险

- 若错误实现为 direct runtime update 后再调用 active coordinator，同一帧会推进两次，所有 reel、Symbol、Spine/VNI 动画都会加速。
- `first-cell-normal` 可能在其它格 once 尚未结束时完成 flow；必须依赖持续 runtime update 让它们回默认 normal，不能恢复已退役 controller 的后续请求，否则会破坏 generation 隔离。
- mock 只能证明 `SceneLayoutPackageRuntime.update()` 被持续调用；真实 Spine/VNI/normal loop 的 playhead continuity 仍需浏览器和实际资源确认。
- 继续更新 completed runtime 会让原先被 bug 掩盖的真实 animation/resource update 错误显式暴露；应保留 fail-stop 并修真实问题，不得重新冻结或吞错。

### 假设

- Game Viewer 2 的最终 stable Symbol 语义继续是 strict exact `normal`；本任务不支持可配置的其它终态。
- flow completion 后预览窗口应保持活动，直到用户 Replay 或关闭窗口；这是本任务的核心产品语义。
- Gamelayout 动画是否 loop/once、何时可见和何时完成继续由现有 manifest 与 runtime owner 决定。

### 待确认

无。需求、责任边界和可验收行为均可从当前代码、测试与领域规则确认。

## 13. 完成清单

- [ ] 完成后 package runtime 继续逐帧 update，active plan 每帧没有 double update。
- [ ] Symbol 最终 normal 与 first-cell generation 语义保持，不新增强制 sweep。
- [ ] Gamelayout 其它动画保持原 playhead 与 manifest 行为，不重启、不重建、不统一 loop。
- [ ] Replay、failure、destroy 和资源 ownership 保持。
- [ ] 实际修改未超范围，或偏差已在报告说明。
- [ ] README 与领域规则已同步，无无关 schema/生成物/依赖修改。
- [ ] 指定自动化已通过，真实 ZIP 人工验收与自动化明确区分。
- [ ] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、本计划列出的三份领域规则和本计划；
2. 核对 Git 基线与工作区，保留用户无关修改；
3. 按“coordinator running 时由 coordinator update，否则 direct runtime update”的单 owner 方案实现；
4. 不重新设计 Symbol normal、completion policy、coordinator public contract 或 Gamelayout player lifecycle；
5. 小幅适配当前实现时在报告记录，重大范围扩张时先停止说明；
6. 只运行本计划规定的 L1 验收和真实 ZIP 浏览器验收；
7. 完成后生成 UTC 中文执行报告；
8. 除非用户明确要求，不 commit、不 push、不创建 PR。
