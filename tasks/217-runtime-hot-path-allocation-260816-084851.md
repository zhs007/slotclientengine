# 217 runtime hot path allocation 任务报告

## 1. 结果摘要

任务 217 已完成 RenderCore/VNI 剩余可静态确认的 ticker 热路径优化，并保持现有状态、事件、视觉和低 FPS
完整 elapsed-time 语义：

- Symbol state snapshot 按变化失效，animation 同步使用 RenderSymbol 内部语义 state 比较；稳定 update result 和 ani completion result 可复用，不暴露 revision API。
- official Spine 无事件帧不再复制空数组/结果；真实 event 仍按调用独立冻结。
- standard ReelSet 不再逐 slice 创建 Set、排序 started axes、构造完整 reel snapshot 或中间 frozen result；
  start/landing/completion edge 与一次大 delta parity 有测试保护。
- coordinator 增加 `isRunning/getPhase`，直接迭代 waiter Set，并用 update epoch 保持帧内新增 waiter 延后一帧。
- game002v2 与 configured scene-layout ticker 一次提交完整 non-negative delta，切片只由 RenderCore owner 执行。
- VNIPlayer 使用 stable main/auxiliary project sampler、animation-order cache 和 mask scratch；pure sampler fresh identity 不变。
- production Popup 使用轻量 Core `update(): void` 与 phase query；完整 snapshot 只由复用同一 Core 的 editor wrapper 提供。Cascade/符号值 presentation 复用结果并移除 overlapping collect 临时数组链。
- Crave 外部仓库零修改；新增完整共享 runtime + app 手工迁移文档。

## 2. 主要修改

### RenderCore

- `packages/rendercore/src/symbol/**`：snapshot cache、RenderSymbol内部语义state同步/result cache、ani常量结果。
- `packages/rendercore/src/spine/runtime-player.ts`：空事件帧共享结果和 event buffer 原位清空。
- `packages/rendercore/src/reel/{render-reel,render-reel-set,render-cell-spin}.ts`：direct phase/currentY query、
  ReelSet scratch/cached axis results和完整 delta 内部切片。
- `packages/rendercore/src/slot-operation/**` 与 scene-layout consumers：无分配 phase query及 waiter epoch。
- coordinator最终只保留`isRunning/getPhase`，删除无人消费的snapshot类型与方法。
- `packages/rendercore/src/popup/**`、`scene-layout/package-runtime.ts`：单一Core、production void update/query与editor snapshot wrapper。
- `packages/rendercore/src/symbol-cascade/**`、`symbol-value-presentation/**`：共享结果和 stable scratch。

### VNI 与 apps

- `packages/vnicore/src/core/{basic-animation,animation-sampler,project-sampler}.ts`：internal `*Into` target、稳定 internal runtime sampler、可失效的排序缓存；mutable API不从core barrel导出。
- `packages/vnicore/src/pixi/vni-player.ts`：主/辅助 sampler、mask Map/Set scratch、无 filter visible count。
- `apps/game002v2/src/round-adapter.ts`：删除 0.25 秒截断和 app 层 1/30 循环。
- `apps/game003v2/src/round-adapter.ts`：coordinator direct running query。
- README 记录稳定 hot-path/public snapshot 合同。

### 文档

- `docs/crave-task217-manual-performance-migration.md`：列出 Crave 同名 RenderCore/VNI 文件、精确 app ticker diff、
  迁移顺序、测试和 profiler 验收；没有写入 `/Users/zerro/gitee.com/pixicrave`。
- `tasks/217-runtime-hot-path-allocation.md`：计划与完成清单。

## 3. 关键决策与计划偏差

1. public pure sampler 仍提供 immutable/fresh value；只有 VNIPlayer 内部使用可变 stable buffer，runtime sampler/target helper 不进入 public barrel。
2. 宿主提交完整 delta，standard ReelSet 继续在内部用 `1/60` slice 保证运动确定性；没有通过截断 elapsed time 换性能。
3. waiter Set 改为直接迭代后加入 eligible epoch，复现旧 `[...waiters]` 的“本 update 新增项不推进”边界。
4. 计划预计 Crave 文档重点说明 round adapter；只读核对发现 Crave 还复制了完整 RenderCore/VNI，因此文档扩大为同名共享
   runtime 全量迁移清单，但仍未修改外部仓库。
5. 定向测试暴露既有 RenderSymbol children 断言漏掉早已存在的 game underlay/overlay；只更新该错误期望，生产结构未改变。
6. follow-up按架构复核收回了新增的Symbol revision与VNI mutable sampler public surface；Popup不再提供并列`tick/update`，而是game Runtime与editor wrapper两套类型包装同一Core。

## 4. 自动验收

以下均通过：

```text
pnpm --filter @slotclientengine/vnicore typecheck
pnpm --filter @slotclientengine/vnicore exec vitest run \
  tests/core/animation-sampler.test.ts tests/core/project-sampler.test.ts tests/pixi/vni-player.test.ts
  => 3 files / 120 tests passed

pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore exec vitest run <12 个任务 217 相关测试文件>
  => 12 files / 139 tests passed
pnpm --filter @slotclientengine/rendercore exec vitest run tests/reel/render-reel-set.test.ts
  => 1 file / 18 tests passed（含新增一次 0.5s delta parity）

pnpm --filter game002v2 exec vitest run tests/source-boundary.test.ts
  => 1 file / 2 tests passed

pnpm --filter @slotclientengine/gameframeworks \
  --filter game002v2 --filter game003v2 --filter popupeditor typecheck

pnpm --filter @slotclientengine/vnicore --filter @slotclientengine/rendercore build

pnpm --filter @slotclientengine/rendercore --filter @slotclientengine/vnicore \
  --filter game002v2 --filter game003v2 format:check
pnpm exec prettier --check docs/crave-task217-manual-performance-migration.md \
  tasks/217-runtime-hot-path-allocation.md
git diff --check
```

源边界搜索确认 game002v2/game003v2/scene-layout hot path 无 `getSnapshot().running`、ticker delta clamp、
`remainingSeconds` 或 `sliceSeconds`；VNIPlayer 无 pure `sampleProjectAtTime` 调用。

## 5. 环境记录

- 初始 HEAD：`abe1a814c66902871b869d9e39cb9592fed3004e`，detached，clean。
- 系统 PATH 没有 Node；验收显式使用 Codex bundled Node 24。
- worktree 缺少完整依赖，按仓库规则执行 `CI=true pnpm install --frozen-lockfile`。首次 Sharp lifecycle 因 PATH
  未包含 Node 失败，随后加入 bundled Node path 重跑成功；依赖全部来自本机 content-addressable store。
- pnpm wrapper 无法联网核验项目声明的 pnpm 10 时，使用已安装 pnpm 11.19.0 的 `pmOnFail=ignore` 完成离线验收。
- 没有新增依赖，`pnpm-lock.yaml` 无变化。

## 6. 未完成人工验收与剩余风险

- 未运行真实浏览器 Performance/Memory profiler，因此不声称具体 FPS、GC 或 heap 数值提升。
- 建议在 game002v2 以及手工迁移后的 Crave 分别复验 idle、连续 spin、cascade、Popup、tab 恢复大 delta，记录
  p95/p99 frame time、minor GC 和 heap slope。
- VNI runtime buffer 只能在同一 sampler 的下一次 `sample()` 前消费；当前主/auxiliary 双 buffer 和测试已保护内部调用，
  后续新增 consumer 不得把 runtime sample 跨帧保存。
- Crave 外部仓库只读状态最终仍为 clean；其代码优化需用户按迁移文档手工执行并单独验收。

自动化范围内无未完成项。

## 7. API 收口 follow-up

根据后续架构复核，最终边界调整为“一份 canonical state / 一个 Core / 两类消费包装”：

- game Runtime 只提供 command、`update(): void`、标量 query 与 edge drain；业务数据仍由 LogicCore 提供。
- Popup Editor 从独立 `@slotclientengine/rendercore/popup/editor` 入口使用 snapshot player wrapper；wrapper 委托同一个 Runtime，不复制状态机。
- `gameframeworks` 只导出 `createSpinePopupRuntime` / `SpinePopupRuntime`，不导出 editor player/snapshot。
- Symbol revision 和 VNI mutable target/runtime sampler 均从 public surface 移除；VNIPlayer继续内部复用 stable buffer。
- Scene Layout 的 Popup ticker、Prelude phase、award phase 与 ReelSet spinning 判断均改用 Core command/query；完整award snapshot迁到`scene-layout/editor` inspector，不为游戏布尔判断构造snapshot。
- SlotOperationCoordinator删除无人消费的snapshot类型与方法，只保留`isRunning/getPhase`；12个coordinator定向测试通过。

follow-up 定向验收通过：RenderCore/VNI typecheck，RenderCore Popup/Scene Layout/Symbol/Reel 相关 9 个文件 124 个测试，VNI sampler 2 个文件 56 个测试，gameframeworks source-boundary 5 个、game003v2 source-boundary 3 个、Popup Editor preview 5 个、Game Layout Editor相关14个测试，以及 game002v2/game003v2/popupeditor/gamelayouteditor/gameframeworks 直接依赖链 typecheck。Crave 仍未修改，手工迁移文档已同步为最终 API。
