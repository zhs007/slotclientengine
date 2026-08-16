# 217 runtime-hot-path-allocation 任务计划

## 1. 目标与完成定义

### 目标

在不改变 Symbol 状态、Spine/VNI 视觉、reel 时序、Popup/Cascade 阶段和 public snapshot
语义的前提下，移除 RenderCore/VNI production ticker 热路径中可静态确认的重复对象、数组、
Set、排序和完整快照构造。game002v2 宿主把完整 elapsed delta 一次交给 runtime；Crave 外部项目
不修改，另提供逐项手工迁移文档。

### 完成定义

- [x] SymbolStateMachine 状态未变化时复用同一 immutable snapshot；RenderSymbol 不再逐帧拼 animation key，
      无完成/无切换 update 复用稳定结果。
- [x] official Spine 无 event/loop/complete 边界时不复制空事件数组或创建结果对象；真实 event 顺序和隔离不变。
- [x] standard RenderReelSet update 不调用完整 reel/set snapshot，不创建 per-frame Set，不对历史 started axes
      每 slice 重复展开排序；低 FPS 仍消费完整 delta并保留确定性 start/landing/completion。
- [x] SlotOperationCoordinator 提供无分配 running 查询，生产 ticker 不再每帧构造 coordinator snapshot；waiter
      推进不复制 Set且保持本帧边界语义。
- [x] game002v2 和 configured scene-layout adapter 不 clamp 或在 app 层重复推进整个 runtime；切片职责留在
      RenderCore motion/reel owner。
- [x] VNI player 使用 runtime-owned stable sample buffers、缓存稳定 animation order，并复用 mask lookup/set；public
      pure sampler 每次调用仍返回独立值，Pixi preview采样语义不变。
- [x] Award/Spine Popup 的 production package ticker 不为未消费 snapshot 分配；Cascade completed result使用共享常量，
      overlapping collect不做可避免的filter/map临时数组。
- [x] `/Users/zerro/gitee.com/pixicrave/**` 零修改；新增 Crave 手工迁移文档，精确说明 round-adapter ticker 修改和验收。

## 2. 范围

### 包含

- `packages/rendercore` 的 symbol、Spine、standard ReelSet、slot-operation、Popup、Cascade、Scene Layout ticker。
- `packages/vnicore` 的 core runtime sampler和Pixi player hot path。
- `apps/game002v2` 的宿主 tick，以及直接受 SlotOperationCoordinator public API 影响的仓库内 consumers。
- 定向 identity/低FPS/事件边界测试、RenderCore/VNI README最小性能合同和Crave迁移文档。

### 不包含

- 不修改 Crave 外部仓库、production assets、manifest/YAML、生成资源或lockfile。
- 不改变VNI公式、粒子/效果池上限、Popup阶段、symbol state equivalence、reel运动曲线或业务编排。
- 不引入启发式LRU、资源降级、draw-call atlas重打包、renderer/DOM bridge或新的依赖。
- 不把public diagnostic snapshot改成mutable对象；只让热路径改用无分配内部状态和缓存的immutable值。

## 3. 制定计划时的基线

```text
UTC: 2026-08-16T08:25:17Z
HEAD: abe1a814c66902871b869d9e39cb9592fed3004e
branch: detached HEAD
git status --short --untracked-files=all: clean
```

- 已读取根`AGENTS.md`、`tasks/templates/task-plan.md`、
  `docs/agent-rules/{shared-game-runtime,game002,vni-runtime}.md`；目标目录无补充AGENTS。
- task 213已移除rolling完整Symbol churn，task 214/215已移除grid-cell/slot snapshot逐帧分配，task 216已保留
  跨mode资源；本任务只处理剩余steady ticker hot path。
- `RenderSymbol.update()`每帧多次读取新建state snapshot并拼字符串key；official Spine每帧复制event数组。
- `RenderReelSet.update()`每次创建两个Set、每slice frozen result并调用完整`getSnapshot()`；grid-cell已有scratch/static result先例。
- game002v2与外部Crave当前均在app ticker按`1/30`切片并截断`0.25s`；用户明确只允许修改game002v2。
- VNI pure sampler每layer/frame创建对象并对animations复制排序；Pixi player每帧创建mask Map/Set。
- 任务213/215/216未提供真实浏览器Profiler数据；本任务自动验收锁定source-level identity和行为，不宣称真实FPS/GC结果。

## 4. 需求解释与关键决策

1. “全部处理”覆盖前序审计列出的六类确定热点，不扩展到尚无Profiler证据的资源驻留和atlas重打包。
2. public snapshot保留immutable值语义；状态变化时创建新snapshot，稳定状态重复查询返回同一对象。
3. public `update()`兼容返回snapshot/result；production owner增加或使用void tick/无分配query，避免为了未消费返回值分配。
4. standard reel继续在RenderCore内部消费完整delta。优化内部slice聚合，不由app clamp，也不通过丢时间换性能。
5. VNI public pure sampler保持fresh identity；仅VNIPlayer使用独立stable mutable buffer，不把runtime buffer暴露给consumer。
6. Crave文档只描述外部手工diff、依赖前提和验证，不写入或检查外部仓库生成物。

## 5. 职责与合同

- **RenderCore**：拥有ticker切片、reel/symbol/player状态、snapshot缓存、Popup/Cascade推进和事件边界。
- **VNI core/player**：pure API继续独立返回；player独占mutable sample buffer、mask scratch和animation-order cache。
- **game002v2/Crave**：宿主每帧只提交完整finite non-negative delta，不复制RenderCore子步进。
- **失败策略**：非法delta、player失败、state/resource错误继续原位显式抛出；优化不得吞错或fallback。
- **生命周期**：所有scratch/cache随owner存在，不跨player共享mutable state，destroy行为不变。

## 6. 文件范围

### 预计新增

```text
docs/crave-task217-manual-performance-migration.md
tasks/217-runtime-hot-path-allocation-<utctime>.md
```

### 预计修改

```text
packages/rendercore/src/{symbol,spine,reel,slot-operation,popup,symbol-cascade,scene-layout}/**
packages/rendercore/tests/{symbol,background,reel,slot-operation,popup,symbol-cascade,scene-layout}/**
packages/rendercore/README.md
packages/vnicore/src/core/{basic-animation,animation-sampler,project-sampler}.ts
packages/vnicore/src/pixi/vni-player.ts
packages/vnicore/tests/core/**
packages/vnicore/tests/pixi/vni-player.test.ts
packages/vnicore/README.md
apps/game002v2/src/round-adapter.ts
apps/game002v2/tests/source-boundary.test.ts
apps/game003v2/src/round-adapter.ts
```

### 原则上不应修改

```text
/Users/zerro/gitee.com/pixicrave/**
assets/**
pnpm-lock.yaml
docs/agent-rules/**
```

## 7. 实施步骤

1. 缓存Symbol snapshot/revision与steady update result，复用Spine/ani无事件结果。
2. 将standard ReelSet slice改为内部scratch聚合和direct phase query，加入no-event identity与低FPS事件测试。
3. 增加coordinator `isRunning()`并迁移仓库consumer；移除game002v2/configured adapter的app层clamp/全runtime切片。
4. 增加VNI runtime sampler、stable buffers、animation-order cache及mask scratch，保留pure sampler fresh identity测试。
5. Popup增加void tick并由package runtime调用；Cascade用共享结果和in-place active compaction。
6. 更新README、Crave手工迁移文档和定向测试，生成UTC执行报告。

## 8. 测试与验收

### 验收级别

L2：修改RenderCore/VNI public API与game consumer，但不涉及schema、资源或根工具链。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore exec vitest run <task217-related-files>
pnpm --filter @slotclientengine/vnicore typecheck
pnpm --filter @slotclientengine/vnicore exec vitest run <task217-related-files>
pnpm --filter game002v2 typecheck
pnpm --filter game003v2 typecheck
pnpm --filter @slotclientengine/rendercore build
pnpm --filter @slotclientengine/vnicore build
git diff --check
```

定向测试命令可按实际修改文件合并；不运行根级全仓test/build。

### 人工验收

- 建议在game002v2与手工迁移后的Crave执行idle、连续spin、cascade/Popup和低FPS Performance/Memory profile。
- 记录p95/p99帧耗时、minor GC、heap slope；自动测试不冒充真实Profiler。

### 独立验收建议

建议：重点复验低FPS完整delta、Spine event隔离和VNI逐帧视觉parity。

## 9. 环境与依赖

- 使用仓库Node 24与pnpm；不新增依赖、不修改lockfile。
- 依赖已存在时不运行install。

## 10. 生成物、文档与规则

- 本任务不修改YAML或生成物。
- README只记录稳定hot-path合同；具体命令和结果进入执行报告。
- 架构职责不变，默认不修改领域规则。

## 11. 风险与假设

- cached immutable result不能包含随后会被owner修改的数组；真实事件数组仍按调用边界独立冻结。
- runtime VNI buffer只能在同一player同步帧内消费；主采样与particle异时采样使用独立buffer。
- Set直接迭代期间的新增waiter必须延后到下一次update，保持原snapshot迭代语义。
- 无浏览器Profiler，收益以消除源码级分配和定向identity测试证明。

## 12. 完成清单

- [x] 六类hot path均实现并有定向测试。
- [x] game002v2消费完整delta，Crave零修改且文档完整。
- [x] RenderCore/VNI与直接consumer验收通过。
- [x] diff/格式检查通过并生成UTC中文执行报告。
