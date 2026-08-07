# 183 game002 runtime/plan consolidation 执行报告

## 结论

本次完成了 Task 183 的核心 runtime ownership 与 WM/CM/CO presentation 收敛，但没有把原计划中的
single-pass `Game002RoundFacts` 和 FreeGame target 全部迁移完，因此本报告不把任务标记为完整完成。
浏览器人工验收按用户要求交由用户执行。

## 已完成

- game002 stage 只挂一个完整 Scene Layout package root；删除 app 手工 `worldLayer` 装配。
- full package runtime 显式支持 deferred/uncommitted initial main reel、ownership-transferred grid-cell reel、
  host-driven reel update、typed cascade overlay attach，以及 symbol/value/replacement/transfer/progress facade。
- `game-demo.ts` 的 production controller 迁为 `game002-reel-controller.ts`；
  `scene-layout-presentation.ts` 由 full runtime 的 `game002-scene-runtime.ts` 取代。
- WM/CM/CO/WL aggregate transform session 与二十多个 transform activity 分支删除，production 直接执行
  `wl-increment | wild-multiplier | wm-to-cn | coin-multiplier | cm-to-cn | co-collect` 最小 payload。
- 删除 synthetic transform step、deprecated `coReplacements` payload 和 mutable
  `operationPayloads/getOperationPayload` cache；settled compiler 一次返回 draft 与 payload。
- rendercore 新增 await/commit/progress transaction runner，具备全量 preflight、AbortSignal、late-settlement
  隔离、rollback/destroy 和并行 animation barrier；旧 counter choreography executor及其测试删除。
- logiccore 新增通用 exact scene/otherScene/result/matrix/position/occurrence/safe-integer 校验。
- gameframeworks facade 导出 transaction runner；README、game002/shared runtime/scene-layout 领域规则和
  source-boundary 同步更新。

## 保留项与偏差

- 尚未建立计划中的唯一 deep-frozen `Game002RoundFacts`。`game002-operation-compiler.ts` 仍直接组合
  `GameLogic` 与 app-owned raw decoder；`operation-data.ts`、`wl-wm-multiplier-plan.ts`、
  `co-collection-plan.ts`、`freegame-plan.ts` 仍承担现有 strict 协议校验。
- `Game002FreeGameOperationTarget` 仍保留其 AF/CO state machine，尚未迁入共享 transaction runner。
- reel controller 仍包含 game002 anticipation/Nearwin/public-strip/cascade 业务状态；本次只删除重复 display
  root/ownership forwarding，没有以拆文件冒充删除。
- 未执行独立 agent 验收；当前执行环境规则禁止未由用户明确要求的 sub-agent。浏览器验收待用户完成。

## 生产改动统计

基线 `e6a1020a7a035e6a01b4e7c671a86c9427302a94`，detached HEAD。

- tracked diff：`1197 insertions, 3537 deletions`。
- 上述 tracked 统计未计入尚未暂存的新文件；其中 `game002-reel-controller.ts` 1324 行对应删除的
  `game-demo.ts` 1322 行，`game002-scene-runtime.ts` 146 行对应删除的旧 presentation wrapper 132 行。
- 新增共享实现：logiccore exact-data 165 行；rendercore transaction runner 406 行。
- `game-adapter.ts`：2368 行降为 1853 行；transform 测试 906 行降为 455 行，并保留最终行为断言。
- `assets/**`、game002 config、manifest/schema、`pnpm-lock.yaml`、根 package/tooling 均无修改。

## 自动验收

### 通过

- 四目标 L2 typecheck：通过。
- gameframeworks test：13 files / 87 tests 通过，coverage threshold 通过。
- game002 test：24 files / 177 tests 通过，coverage threshold 通过。
- rendercore 定向 transaction + Scene Layout：2 files / 18 tests 通过。
- 四目标 build：通过。
- `game002 release:check`：通过。
- `git diff --check`：通过。

### 未全绿的既有环境门槛

- logiccore：15 files / 105 tests 全部通过；全局 branch coverage 为 77.65%，低于仓库 80% threshold，
  因 coverage gate 返回失败。新增 `exact-data.ts` 本身 branch coverage 为 97.95%。
- rendercore：87 files / 703 tests 通过，5 tests 失败；失败均因当前 Crave `assets.map` 缺少
  `h1.json` 或 `symbol-state-textures.manifest.json` fixture，另 1 suite 在加载 fixture 时提前失败。
  本任务未修改 assets/map/config。

## 浏览器验收交接

用户需验证：defaultScene 前无 placeholder 闪现；普通/anticipation cascade；WL/WM/CM/CO 组合；
BaseGame→FreeGame→BaseGame reel identity；popup/transition 层级；横竖屏/resize；播放失败后的 scene 恢复。

## 后续建议

继续 Task 183 时应单独完成两项，不恢复旧轨：

1. 将 raw component selection 集中为 immutable `Game002RoundFacts`，再删除四个分散 decoder/plan 文件。
2. 将 FreeGame AF/CO target 映射为同一个 transaction program，删除剩余专用 phase state machine。
