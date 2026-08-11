# 192 rendercore trusted operation rendering 执行报告

## 结果

任务于 `2026-08-11T04:38:10Z` 完成实现与 L2 自动化验收，基线 HEAD 为
`c401d4656e145f257955839a5c847aeb2a14181f`。

- 新增 logiccore `compileSlotCascadeFacts()` 与 `deriveSlotCascadeDropdownValues()`，统一证明
  dropdown/refill occurrence relation、held、hole closure、carried value 和目标 value commit。
- rendercore cascade plan 现在只包含 movement、value commit、尺寸和动画时序；不再携带
  source/settled/target scene/value shadow matrix、refill positions 或业务 predicate。
- standard/grid-cell reel 删除 source/target matrix、movement code/value continuity 复核；refill
  只按显式 output code/value 创建 occurrence，existing 只按坐标取得 display occurrence。
- `assertSelectiveTargetContinuity()` 与 local flow 的
  `assertOperationPlanMatchesFlow()` 已删除；selective spin 只执行 plan 选择的格。
- terminal remove 改为只消费上游最终 positions，删除 `canRemoveOccurrence` 和
  removed/retained 业务返回值；动画完成后只确认 occurrence ownership，没有 code/value 比较。
- replacement 删除 `expectedCode/inputCode`；transfer 删除
  `expectedSourceCode/expectedTargetCode`。prepare/commit/rollback/destroy、冲突位置和 display
  occurrence ownership 仍严格检查。
- dropdown 必须存在 exact animation capability 且 resolver 可创建动画；删除 normal fallback。
  standard/grid-cell cascade 在 detach 前完整 prepare 动画和 refill occurrence，失败会恢复 state、
  释放已创建 occurrence，不留下半提交。
- profile operation handler 直接读取 producer/finalizer 已证明的 step/output，不再复核 spin effect 或
  payload.step presence；缺 target presentation capability 仍显式失败。
- game002 在 operation-data/compiler 阶段保存 `cascadeFacts`，handler 只把 facts 变成 render timing；
  game002v2 在 app 边界完成 WL held、remove holes 和 cascade facts 编译。

## assertion ledger

对 `packages/rendercore/src` 的 88 个包含 guard 的 TypeScript 文件进行了名称与语义联合审计：

```text
assert*/validate* symbol/call hits: 1251
assert*/validate* helper definitions: 187
explicit throw sites: 1375
```

审计不是按名称机械删除，结论如下。

| 分类                                   | 结论          | 代表性位置与理由                                                                                                                                                             |
| -------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| raw schema / manifest / package parser | keep          | symbol/reel/background/popup/scene-layout manifest 的 record、known key、path、version、reference closure 是 rendercore 首个 raw 输入 owner                                  |
| resource / asset / decoder             | keep          | texture、Spine/VNI、font、image-string glyph、runtime resource kind、exact animation binding 只能在实际消费点证明                                                            |
| geometry / timing / numeric domain     | keep          | reel layout、viewport、mask、cell order、animation delta、cascade motion 属于 presentation 合同                                                                              |
| runtime phase / ownership              | keep          | destroyed/active/stopped、occupied display slot、symbol identity、transfer collision、mask/layer attachment 防止 display tree 损坏                                           |
| async transaction lifecycle            | keep          | playback preflight、AbortSignal、prepared state、commit/rollback/destroy、detached occurrence cleanup 防止泄漏或半提交                                                       |
| public presentation input              | keep          | symbol cascade/carousel/win amount 的 group、position、amount、capability 校验面对的是独立 public presentation API，不是 finalized operation shadow validation               |
| logical plan continuity                | remove / move | selective held target、cascade source/target matrix、occurrence relation、code/value、remove retained、replacement/transfer expected code 全部移到 logiccore 或 app producer |
| duplicate operation schema checks      | remove        | profile handler effect 与 payload.step presence、local operation-plan/project equality 已由 compiler/finalizer 证明                                                          |
| visual fallback                        | remove        | dropdown 缺失时请求 normal 的分支删除；缺 exact animation/resource 原位失败                                                                                                  |

移除或迁移的精确 guard/API 包括：

- `assertSelectiveTargetContinuity`
- `assertOperationPlanMatchesFlow`
- `assertCascadeMatrixEqual` / `assertCascadeMatrix`
- rendercore `deriveGridCellCascadeSettledValues` 与 cascade matrix parser/relation validator
- terminal remove `canRemoveOccurrence`、`GridCellTerminalRemoveCandidate`、
  `GridCellTerminalRemoveResult` 和完成后的 code/value equality
- replacement `expectedCode` / `inputCode`
- transfer `expectedSourceCode` / `expectedTargetCode`
- profile handler spin-effect guard 与 `requireStep` presence guard
- game002 render 完成后的 dropdown/refill scene equality

残留搜索确认上述 symbol/field 在目标 source 中为零；`GridCellCascadeDropPlan` 仅保留
`columns/rows/movements/valueCommits/totalSeconds`。

## 主要文件

- `packages/logiccore/src/slot-operation/cascade-facts.ts`：producer-owned cascade strict facts。
- `packages/rendercore/src/reel/grid-cell-cascade-plan.ts`：纯 presentation timing builder。
- `packages/rendercore/src/reel/render-grid-cell-reel-set.ts`、
  `render-reel-set.ts`：trusted movement 执行、exact animation preflight 与 runtime ownership。
- `packages/rendercore/src/scene-layout/package-runtime.ts`、
  `local-scene-flow.ts`、`slot-operation/profile-round-handlers.ts`：删除重复 operation 逻辑校验。
- `apps/game002/src/operation-data.ts`、`game-adapter.ts`：在 compiler 阶段生成并消费 facts。
- `apps/game002v2/src/round-adapter.ts`、`spin-presentation.ts`：direct consumer 在 app 边界决定
  remove/held/cascade 事实。
- `docs/agent-rules/shared-game-runtime.md`：固化 trusted render boundary。

## 验收证据

通过：

```text
@slotclientengine/logiccore
  16 files / 113 tests passed
@slotclientengine/rendercore
  93 files / 769 tests passed
game002v2
  8 files / 15 tests passed
game002 task-related targeted
  5 files / 42 tests passed

@slotclientengine/logiccore + rendercore + gameframeworks
game002 + game002v2 + game003v2 typecheck passed

@slotclientengine/logiccore + rendercore + gameframeworks build passed
@slotclientengine/rendercore lint passed
@slotclientengine/logiccore lint passed
@slotclientengine/gameframeworks lint passed
git diff --check passed
```

完整 game002 测试为 `126/129` 通过。剩余 3 项失败均可在 HEAD 原文件中复现其输入：

- `source-boundary.test.ts` 两项既有静态字符串约束与 HEAD 冲突：HEAD rendercore 已有
  `columnIndex + rowIndex`，HEAD game002 adapter 已有 completion counter snapshot 字段。
- `freegame-plan.test.ts` 的既有 crave sample 在 step[0] 提供 CN value `0`，被现有
  `readFinalValues()` 的正值合同拒绝；本任务未修改该分支或 fixture。

额外 lint 中 game002v2 的唯一失败是 HEAD 已存在的
`cancelSpinPresentation(_error: Error)` unused parameter；任务相关 typecheck 和全量 15 项测试均通过。

安装缺失 workspace 依赖时使用 frozen lockfile；未修改 lockfile、`assets/**` 或生成物。
