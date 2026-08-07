# 181 rendercore-awaitable-symbol-state-playback 任务计划

## 1. 目标与完成定义

### 目标

在保留 Pixi/Spine/VNI 逐帧 `update(deltaSeconds)` 时间轴推进的前提下，为 rendercore symbol
状态播放提供可 `await` 的完成合同。调用方应等待“目标状态真实进入或完成自己的 once/loop
边界”，而不是保存全局 completion counter baseline 并在每帧读取 snapshot 比较。

本任务建立 rendercore 通用 awaitable API，并迁移 game002 的 WL/WM/CM/CN/CO 与 FreeGame
symbol 动画编排。Slot operation coordinator 仍在 ticker 边界推进 runtime、提交 operation 和处理
rollback；Promise 只表达 symbol presentation completion，不替代渲染循环或 transaction lifecycle。

### 完成定义

- [ ] `RenderSymbol` 提供严格的 awaitable state playback：`static/entered`、真实 once completion、目标 loop 的下一真实循环边界均有无歧义语义。
- [ ] `RenderSymbol.update()` 继续推进真实动画，并只在对应目标 playback 的完成边界 resolve；来自旧状态或被 supersede generation 的 completion 不得误完成新请求。
- [ ] reel/grid-cell reel set 提供批量 awaitable API；批量调用在开始前完整校验 position、重复项、occupied symbol、state、transition/completion 组合，并绑定请求时的 exact `RenderSymbol` identity。
- [ ] reset、return-to-default、pool release、symbol replacement/release、AbortSignal、cleanup 和 destroy 会显式终止未完成请求；不得留下 pending Promise、晚到 continuation 或未处理 rejection。
- [ ] game002 的 transform 与 FreeGame symbol 编排使用 Promise/`await` 表达顺序和 barrier，不再维护或比较 `loopCompletionCount/onceCompletionCount` baseline。
- [ ] game002 现有动画顺序、真实 loop/once 等待、同批并行、CO transfer progress、operation commit/rollback、下一轮 cleanup 和视觉结果保持不变。
- [ ] game001、game003 不接入新 API、不修改业务代码，也不作为本任务验收范围；现有 fire-and-forget API 和 snapshot counter 暂时兼容保留，避免扩大 consumer 迁移。
- [ ] public exports、rendercore README、最小领域规则、定向测试和 UTC 中文执行报告同步完成。

## 2. 范围

### 包含

- `packages/rendercore/symbol`：awaitable state playback 类型、generation/waiter、完成通知、取消与 destroy/pool lifecycle。
- `packages/rendercore/reel`：单格与批量可等待 symbol state API、全批 preflight、exact symbol identity barrier。
- rendercore public symbol/reel exports；新增独立 awaitable target contract，不强迫所有旧 `VisibleSymbolPresentationTarget` consumer 立即实现。
- `apps/game002`：`Game002ReelRuntime` 接入；BaseGame multiplier/transform 和 FreeGame AF/CO/trigger 动画改为 Promise 驱动。
- 直接保护上述合同的 rendercore/game002 tests、README、`shared-game-runtime.md` 和执行报告。

### 不包含

- 不移除 `requestState/requestVisibleSymbolStates` fire-and-forget API，也不在本任务删除 snapshot completion counter；未迁移 consumer 继续兼容。
- 不迁移 `apps/game001`、`apps/game003`，不修改其配置、runtime、测试、资源或构建产物。
- 不顺手迁移 Game Viewer、scene-layout local flow、configured adapter、symbol cascade/carousel 或当前未被 game002 使用的 choreography executor；它们后续可独立切换 awaitable contract。
- 不把整个 `SlotOperationHandler`/coordinator 改为 async-only，不在 Promise microtask 中直接绕过 coordinator commit、snapshot assertion 或 rollback。
- 不修改 symbol manifest/state preset、动画名、资源路径、时长、server component、operation payload、公开轮带或 presentation 随机策略。
- 不增加 timeout fallback、固定时长猜测、首项默认、silent supersede、unknown state fallback 或未完成时效果降级。
- 不新增第三方依赖，不修改根工具链、workspace 配置、lockfile、YAML、manifest 或生成资源。

## 3. 制定计划时的基线

```text
UTC: 2026-08-07T06:21:06Z
HEAD: 61816b10a2f7b8e5e1279f40604d7a3e22b22002
branch: (detached HEAD)
git status --short --untracked-files=all: clean
```

实际读取的规则与输入：

```text
AGENTS.md
tasks/templates/task-plan.md
docs/agent-rules/{shared-game-runtime,game002,loading-ui}.md
tasks/173-slot-operation-plan-refactor.md
tasks/178-slot-operation-effect-composition-refactor{,-260806-103800}.md
tasks/180-gameframeworks-api-ownership-boundary.md
```

当前实现结论：

- `packages/rendercore/src/symbol/render-symbol.ts::requestState()` 只发起状态；`update()` 从当前 `SymbolAni.update()` 读取 loop/once completion，累计全局 counter 后通知 `SymbolStateMachine`。
- `RenderSymbol.getAnimationCompletionSnapshot()` 和 `RenderVisibleSymbolStateSnapshot.loopCompletionCount/onceCompletionCount` 把底层完成计数暴露到 reel consumer。
- `render-reel.ts`、`render-reel-set.ts`、`render-grid-cell-reel-set.ts` 只有 fire-and-forget request 与 snapshot API；尚无原子“请求并等待此目标状态完成”的 contract。
- `apps/game002/src/game-adapter.ts` 的 transform path 保存 `#transformCompletionBaselines`，`didTransformAnimationComplete()` 每帧比较 counter；multStart → multIdle → multEnd → change、CM/CN 和 CO 均依赖该轮询。
- `apps/game002/src/freegame-operation-target.ts` 又维护一份 `#baselines`，AF feature/change、CO feature/feature2 和 trigger 采用相同模式。
- game002 ticker 已正确持续调用 runtime/coordinator `update(deltaSeconds)`；coordinator 的 public `start(plan)` 已返回整轮 Promise，但 handler 仍通过同步 `update(...).completed` 在帧边界 commit。
- `packages/rendercore/src/spine/state-controller.ts::request()` 已提供仓内先例：底层 update 报告真实完成，controller resolve Promise，destroy reject pending request。
- `resetForPoolRelease()` 在 pool `release()` 前调用；它与 `reset()`、`destroy()` 是 awaitable waiter 必须覆盖的 lifecycle 边界。
- production source 中 completion counter 还被 scene-layout local flow/choreography 使用；按用户确认，本任务只迁移 game002，因此公共 counter 暂不删除。

## 4. 需求解释与技术决策

### 需求解释

- “改成 await”指业务编排可等待 animation completion，不表示取消 Pixi ticker 或用 wall-clock timer 代替 renderer update。
- Promise 的完成对象必须是发起请求时的 symbol occurrence/player generation，而不是以后仍位于同一 `(x,y)` 的任意 symbol。
- game002 同批 symbol 继续并行；前后阶段用 `await` 串行。CO transfer 在等待 `feature2` 时仍由 ticker delta 推进，不冻结 reel、Spine/VNI loop 或其它 presentation。
- 当前任务允许兼容保留旧 counter surface，仅禁止 game002 新实现继续使用它；game001/game003 迁移不作为隐藏完成条件。

### 关键决策

1. **新增 awaitable playback，不替换 frame update**
   - `RenderSymbol.playState(state, options): Promise<void>`（最终命名可按现有 style 小幅调整）原子完成 request + waiter 注册。
   - `update(deltaSeconds)` 仍是唯一时间推进入口；它在 state machine/animation result 已确认边界后通知 waiter。
   - 不使用 `setTimeout`、animation duration 或轮询 snapshot 实现 Promise。

2. **completion mode 显式且严格匹配 playback**
   - public options 表达 `entered | once-complete | next-loop-complete`，并保留 `boundary | immediate` transition mode。
   - `entered` 在目标 semantic state 真正生效后完成；pending boundary request 不能在旧状态仍播放时提前完成。
   - `once-complete` 只接受 once state；在目标 once 真实完成、state machine 执行既有 return-to-default 边界时完成。
   - `next-loop-complete` 只接受 loop state；必须先进入目标 semantic state，再等待该目标的下一真实 loop，不能把 outgoing loop 的完成误算给目标。
   - completion/state playback 不匹配在画面变化前显式失败；不自动猜测调用者想等 entered 还是 loop。

3. **每个 RenderSymbol 使用 generation 隔离晚到完成**
   - waiter 保存 request generation、目标 requested/resolved state 和 completion mode；animation continuity 可保留 timeline，但不能丢失 semantic target identity。
   - 对同一 symbol 的冲突 awaitable request 或外部 fire-and-forget request 不 silent overwrite：按合同显式 reject 被取代请求；重复同请求是否共享只在能证明相同 generation/语义时允许。
   - Promise resolve/reject 只发生一次；同步 validation error 不创建 waiter。

4. **批量 reel API 先 preflight，再同时启动**
   - 新建 additive awaitable presentation target/type，旧 target interface 不被强制扩展。
   - 批量入口规范化并拒绝重复 position，解析全部 occupied `RenderSymbol`、state capability、completion mode 和并发占用后才开始任何请求。
   - barrier 等待请求时捕获的 symbol object；symbol 在画面内合法移动时继续等待该 occurrence，release/replacement/pool reset/destroy 则 reject，不重新绑定坐标上的新 symbol。
   - 部分 start 意外失败时取消本批已建立 waiter，并传播原始/cleanup error；不得留下半批 pending。

5. **取消和 ownership 使用现有生命周期**
   - API 支持可选 `AbortSignal`，供 game002 operation generation/cleanup 主动中止；已 aborted signal 在 request 前失败。
   - `reset()`、`returnToDefaultState()`、`resetForPoolRelease()`、`destroy()` 与非 awaitable supersede 都以明确错误终止 pending waiter。
   - abort/reject 只终止等待合同，不擅自 destroy borrowed symbol/display tree；画面回滚仍由 reel/operation owner 执行。

6. **Game002 使用 async runner，coordinator 仍在帧边界提交**
   - transform 与 FreeGame target 启动 generation-scoped async runner，用 `await`/`Promise.all` 编排 symbol 阶段；runner 立即挂接 rejection 并将 settled/failure 状态交回同步 handler。
   - target `update(deltaSeconds)` 继续驱动 reel、CO transfer progress、cascade/win amount，并只读取 runner settled/failure，不再读取 symbol completion snapshot。
   - operation handler 的 `update(...).completed`、commit/rollback/destroy 与 output assertion 顺序不变；async continuation 不直接提交 operation。
   - cleanup abort 当前 runner，先阻止晚到 continuation，再按现有顺序 rollback prepared replacement/transfer、清理 player 和状态。

7. **兼容边界明确，不制造永久第二套业务实现**
   - `requestState()` 与 completion counter 为未迁移 consumer 暂留；game002 helper、baseline map 和 counter comparison 全部删除。
   - 新 API、错误和测试属于 rendercore 通用 contract，不出现 game002 symbol/state 名。
   - 后续迁移 game001/game003/scene-layout 时复用同一 API，不在本任务预改它们。

## 5. 职责与合同

- **rendercore symbol**：拥有目标 state generation、playback 边界识别、waiter resolve/reject、supersede/reset/pool/destroy 语义；不认识坐标或游戏动画名。
- **rendercore reel**：拥有 position 到当前 symbol identity 的解析、全批 preflight、批量 start/barrier 与 reel lifecycle error；不解释业务顺序。
- **game002**：拥有 multStart/multIdle/multEnd/change、AF、CN、CO 等动画顺序、并行分组、formatter 和 operation blocking 边界；不再复制 completion counter 状态机。
- **slot-operation coordinator**：继续拥有 operation preflight、prepare/start/update/commit/rollback/destroy 和帧边界 snapshot assertion；不因 Promise resolve 在 microtask 中被旁路。
- **数据/API**：state、transition mode、completion mode 必须 exact；unknown state、phase mismatch、duplicate position、empty/replaced symbol、并发冲突和 aborted signal 显式失败。
- **资源生命周期**：RenderSymbol owner 管 waiter；reel/pool 触发 reset/release；game002 operation owner 管 AbortController/runner；cleanup/destroy 幂等且无 late mutation。
- **禁止行为**：wall-clock completion、counter polling 的新 consumer、坐标重绑定、silent supersede、吞 rejection、默认 loop 次数、动画 fallback、game002 分支进入 shared package。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/symbol/state-playback.ts（若独立 controller 能保持 RenderSymbol 职责清晰）
packages/rendercore/tests/symbol/state-playback.test.ts（也可并入现有 render-symbol.test.ts）
tasks/181-rendercore-awaitable-symbol-state-playback-<utctime>.md
```

### 预计修改

```text
packages/rendercore/src/symbol/{types,render-symbol,index}.ts
packages/rendercore/src/reel/{types,render-reel,render-reel-set,render-grid-cell-reel-set,index}.ts
packages/rendercore/tests/symbol/render-symbol.test.ts
packages/rendercore/tests/reel/{render-reel,render-reel-set,render-grid-cell-reel-set}.test.ts
packages/rendercore/{README.md,src/index.ts}
apps/game002/src/{game-demo,game-adapter,freegame-operation-target}.ts
apps/game002/tests/{game-adapter,game002-round-transform,source-boundary}.test.ts
apps/game002/README.md（仅在 public workflow 说明需要同步时）
docs/agent-rules/shared-game-runtime.md
```

测试 fixture/interface 因新增 `Game002ReelRuntime` 方法可在同目录小幅适配。若实现发现必须修改
`slot-operation` handler/coordinator public interface、scene-layout runtime 或 gameframeworks facade，属于明显范围扩大，
必须先说明原因，不能只为方便 async 编排顺手改动。

### 原则上不应修改

```text
apps/{game001,game003,gameviewer,gameviewer2}/**
packages/{logiccore,gameframeworks,uiframeworks,netcore,slotoperationauthoring}/**
packages/rendercore/src/{scene-layout,symbol-cascade,symbol-win-carousel,slot-operation}/**
assets/**
pnpm-lock.yaml
AGENTS.md
docs/agent-rules/{game002,game003,gameviewer2-local-flow,loading-ui}.md
```

## 7. 实施步骤

1. **确认执行基线并冻结现有行为**
   - 重新核对 HEAD/status、RenderSymbol state/animation lifecycle、pool release 顺序和 game002 两套 baseline path。
   - 先用现有 tests 固定 once/loop completion、equivalent animation continuity、transform/FreeGame event order、CO progress 与 cleanup 结果。

2. **建立 awaitable symbol playback contract**
   - 在 symbol types/controller/RenderSymbol 中实现 completion options、generation waiter、atomic validation/request 和 update-boundary notification。
   - 覆盖 immediate/boundary、static entered、once auto-return、loop target boundary、equivalent continuity，以及旧状态 completion 不误完成新目标。

3. **闭合取消、pool 与 destroy 生命周期**
   - 将 abort、fire-and-forget supersede、return-to-default、reset、pool release 和 destroy 接入统一 settle-once rejection。
   - 验证重复 cleanup/destroy 幂等、无 pending waiter、无 late resolve/reject 和无 unhandled rejection。

4. **提供 reel/grid-cell 批量 awaitable facade**
   - 在 reel 层捕获 exact symbol，完成全批 position/state/completion/concurrency preflight 后启动，并以 all-symbol barrier 返回 Promise。
   - 覆盖 duplicate/empty/partial failure、移动 occurrence 继续等待、replacement/release 拒绝和不同 cell 并行完成顺序。

5. **接入 Game002 runtime 与 transform 编排**
   - `Game002ReelRuntime` 转出 awaitable batch API，生产 runtime 委托 rendercore reel set；更新测试 doubles。
   - 将 WL appear、WM multStart/Idle/End/change、CM feature/change、CN featureChange、CO feature/feature1/feature2 改为 generation-scoped async runner；同批使用 `Promise.all`，跨阶段使用 `await`。
   - 删除 `requestGame002TransformStates()` counter baseline 返回、`#transformCompletionBaselines` 与 `didTransformAnimationComplete()`，保持原 operation phase/commit 边界。

6. **迁移 Game002 FreeGame 并强化 cleanup**
   - AF feature→change、CO mixed feature→feature2、trigger win 使用同一 awaitable API；CO transfer 等待期间继续按 delta 推进 progress。
   - 删除 `#baselines/captureBaselines/animationComplete`；cleanup abort runner 后 rollback replacement/transfer，failure 在下一 coordinator update 显式抛出。
   - 测试 next-spin/fatal/destroy、动画 rejection 与中途 replacement，确保旧 generation 不影响下一 operation。

7. **同步 public surface、文档和边界检查**
   - 更新 symbol/reel exports、RenderCore README 和 shared runtime 规则，说明 frame-driven update + awaitable completion 的分层。
   - 搜索 game002 production source，确认不存在 completion counter/baseline polling；确认 game001/game003 和排除目录无 diff。

8. **定向验收并生成报告**
   - 按 L2 命令验证 rendercore public API 和 game002 consumer；失败先最小化复现，不扩大到整仓。
   - 记录实际文件、API 命名小幅偏差、自动化结果、人工验收状态和剩余未迁移 consumer。

## 8. 测试与验收

### 测试原则

- RenderSymbol 单测使用可控 manual ani，但 completion 必须由 `update()` 的真实 result 驱动，不直接调用私有 resolve。
- 覆盖正常 once/loop/static、boundary pending、continuity、并发冲突、AbortSignal、reset/pool/destroy 和 stale generation。
- reel tests 覆盖批量 preflight 无部分启动、exact identity、all barrier 与 rejection cleanup。
- game002 tests 固定动画 request/event 顺序、真实 loop 一次、并行 barrier、WM/CM/CO commit 时点、FreeGame AF/CO、cleanup/rollback 和下一 operation generation。
- 测试不得通过恢复 counter polling、假定固定 animation duration 或吞 Promise rejection 来迁就旧 fixture。

### 验收级别

采用 `L2`：rendercore 新增跨包公共 symbol/reel API，并迁移直接 consumer game002；同时涉及异步 waiter、pool/destroy 和 operation cleanup。无需 L3，因为不修改根工具链、lockfile、schema、资源或全部 app，用户也明确排除 game001/game003。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore build
pnpm --filter @slotclientengine/rendercore test
pnpm --filter game002 typecheck
pnpm --filter game002 test
pnpm --filter game002 build
git diff --check
```

失败时先运行具体 Vitest 文件最小化复现；不因此自动升级到根级 typecheck/lint/test/build。

### 人工验收

建议在具备可控 game002 server/fixture 时复验一轮包含 WM、CM、CN、CO 和 FreeGame AF/CO 的实际播放：

- 动画顺序、真实 loop 次数和视觉 timing 与改动前一致；ticker 未因 await 停止。
- 中途触发 next-spin/fatal/destroy 时无残留动画、晚到 mutation 或 console unhandled rejection。
- 若执行环境没有可控 round，报告中明确标为未完成；单测/build 不能冒充真实资源视觉验收。

### 独立验收建议

`建议`。原因是跨包 public contract 且涉及 Promise cancellation、pool identity 和 destroy。独立复验重点：目标 loop 不被 outgoing loop 误完成、cleanup 后无 late continuation、game002 mutation 仍只在原 operation 边界提交。最多复验：

```bash
pnpm --filter @slotclientengine/rendercore test
pnpm --filter game002 test
git diff --check
```

## 9. 环境与依赖

- Node.js 使用仓库要求的 Node 24。shell 没有 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 统一使用该环境的 Node 和 pnpm，不切换 npm/yarn。
- 依赖缺失时使用 `CI=true pnpm install --frozen-lockfile`；只有下载实际失败后才设置仓库约定代理并重试原命令。
- 本任务不新增依赖、不修改 `pnpm-lock.yaml`；`Promise`、`AbortSignal` 和现有 TypeScript/Pixi runtime 足以实现。

## 10. 生成物、文档与规则

- 本任务不修改 YAML、manifest、资源或生成 TypeScript，不应运行 symbol/scene-layout/game-static 生成器。
- 更新 `packages/rendercore/README.md`，说明 `update()` 与 awaitable completion 的职责分离、completion mode 和取消语义。
- 在 `docs/agent-rules/shared-game-runtime.md` 最小补充稳定合同：runtime 必须持续逐帧 update；consumer 等待 symbol completion 使用 rendercore awaitable boundary，不复制 counter polling；cleanup/destroy 必须 settle pending。
- game002 规则只有业务顺序或稳定职责变化时才更新；本任务默认不改变其现有动画顺序合同。
- 不修改根 `AGENTS.md`，不把 task-specific API 名、测试证据或当前 consumer 清单写入长期规则。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/181-rendercore-awaitable-symbol-state-playback-<utctime>.md
```

UTC 使用 `date -u +%y%m%d-%H%M%S`。报告简要记录：最终 API/语义、实际修改文件、计划偏差、六条验收结果、人工验收状态、未迁移 consumer 和剩余风险；不收集无关 coverage、整仓统计或历史矩阵。

## 12. 风险、假设与待确认

### 风险

- Promise microtask 在 ticker call stack 结束后继续执行；若未用 operation generation/AbortSignal 隔离，可能在 cleanup 后请求下一状态或修改旧 transaction。
- boundary transition 时 outgoing loop 与 target loop 都会产生 completion；只依赖全局 counter 会提前完成，必须由目标 semantic generation 区分。
- symbol pool 复用同一 `RenderSymbol` object；若 pool release 不先 reject/advance generation，旧 waiter 可能被下一 occurrence 的动画错误 resolve。
- 批量请求中途同步失败可能造成部分 symbol 已进入状态；必须全批 preflight 或可靠取消，不得只用裸 `Promise.all(requests.map(...))`。
- game002 CO transfer 同时依赖 animation completion 和 delta progress；纯 async 改写若停止同步 update 会改变速度或永不完成。

### 假设

- 用户确认 game001、game003 本任务可以不处理；兼容保留旧 API/counter 是有意的范围控制，不表示推荐新 consumer 继续轮询。
- game002 所需 state capability、playback kind 和真实动画资源继续由现有 manifest/config 严格预检，本任务不增加第二份动画状态表。
- 当前 coordinator 的 ticker update 与 transaction lifecycle 足以承载 async runner settlement，无需改变 logiccore V2 operation IR。

### 待确认

无。

## 13. 完成清单

- [ ] awaitable symbol/reel contract 与目标 state completion 语义已实现。
- [ ] frame-driven update、animation continuity 和 coordinator commit/rollback 保持。
- [ ] abort/reset/pool/replacement/destroy 无 pending、late continuation 或 unhandled rejection。
- [ ] game002 transform/FreeGame 已删除 completion baseline polling 并通过定向测试。
- [ ] game001/game003 和排除目录没有任务相关修改。
- [ ] public exports、README 和 shared runtime 规则已同步。
- [ ] 六条 L2 自动化验收已通过，人工验收状态已明确。
- [ ] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、本计划、`shared-game-runtime.md`、`game002.md` 和 `loading-ui.md`；
2. 核对 Git 基线、工作区及 tasks 178/180 后续是否已改变相关 public surface；
3. 先冻结 completion/timing/cleanup characterization，再实现 rendercore waiter 和 reel batch；
4. 只迁移 game002，不顺手接入 game001、game003 或 scene-layout consumer；
5. 保持 coordinator 帧边界 transaction，不以 async continuation 直接 commit；
6. 小幅 API/file 命名调整在报告记录，若需修改 coordinator/logiccore/manifest/lockfile 则先停止说明；
7. 只运行计划规定的 L2 验收，完成后生成 UTC 中文报告；
8. 除非用户明确要求，不 commit、不 push、不创建 PR。
