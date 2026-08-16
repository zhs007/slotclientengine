# Crave 手工迁移：任务 217 runtime hot path 优化

本文只描述 `/Users/zerro/gitee.com/pixicrave` 的手工修改。任务 217 **没有写入 Crave 仓库**。
只读核对时 Crave 工作区为 clean，且同时存在 `apps/crave`、`packages/rendercore`、
`packages/vnicore` 的旧实现；因此不能只改 app ticker，需按下列顺序同步共享 runtime。

## 1. 前置条件

1. 先确认 Crave 使用的 RenderCore/VNI 源码仍位于本仓库列出的同名路径；若已升级到包含任务 217 的版本，
   不要重复手改。
2. 保留 Crave 自己的业务资源、manifest、YAML、lockfile 和 app 专属逻辑。本迁移不修改这些内容。
3. 每一组修改后先跑对应 package 定向测试；不要等全部手改完才发现语义偏差。

## 2. RenderCore 源码同步清单

以下路径在两个仓库中同名。建议以 slotclientengine 任务 217 完成后的文件为参照逐项合并，
不要整目录覆盖 Crave 的其它提交。

### Symbol 与 Spine

- `packages/rendercore/src/symbol/state-machine.ts`
  - 缓存 immutable `SymbolStateSnapshot`，只有 requested/resolved/default/pending 真正变化时失效。
  - 相同 state request/default set 必须保持 no-op。
- `packages/rendercore/src/symbol/render-symbol.ts`
  - 用内部保存的 requested/resolved state 比较替代每帧 `${requested}->${resolved}` 字符串 key；不要向 state machine 增加 revision API。
  - 按 snapshot 和 loop/once completion 位缓存 immutable update result；状态切换 edge 仍返回本次真实结果。
  - value/reset 强制刷新通过 revision sentinel 触发，不能漏掉 ani 重建。
- `packages/rendercore/src/symbol/ani.ts`
  - 复用 frozen empty、loop-complete、once-complete 三种结果常量。
- `packages/rendercore/src/spine/runtime-player.ts`
  - `play/reset/destroy` 使用 `events.length = 0`，不替换数组。
  - 无真实 Spine event 时返回共享 running/completed/loop-completed result；有 event 时仍复制并冻结独立数组，
    保持事件顺序与调用隔离。
- `packages/rendercore/src/symbol-value-presentation/render-symbol-value-controller.ts`
  - 复用 active player 的四种 completed/loopCompleted 结果组合。

### Standard ReelSet

- `packages/rendercore/src/reel/render-reel.ts`
  - 增加无分配 `getPhase()`、`getCurrentY()`；完整 `getSnapshot()` 继续只用于诊断。
- `packages/rendercore/src/reel/render-reel-set.ts`
  - `update()` 继续在 RenderCore 内按 `1/60` slice 消费调用方提交的**完整** delta。
  - 使用 owner-owned `stoppedAxes` scratch；不得每 slice 新建 started/stopped `Set` 或冻结中间结果。
  - stopped edge 只读取 `reel.update(...).landed`；completion 直接读取 `reel.getPhase()`。
  - `startedAxes` 仅在轴真正加入时标脏，按需排序并缓存 frozen 数组。
  - 无 completion/landing edge 且 started/spinning 未变时复用 update result；有 edge 时才创建对外 immutable 数组。
  - cancel 时用 `getCurrentY()`，不要为 currentY 构造 reel snapshot。
- `packages/rendercore/src/reel/render-grid-cell-reel-set.ts`
  - 增加轻量 `isSpinning()`；Scene Layout 只判断 spinning 时不得构造完整 ReelSet snapshot。
- `packages/rendercore/src/reel/render-cell-spin.ts`
  - 只检查 phase 的位置改用 `getPhase()`。

低 FPS 验收必须确认：一次 `update(0.2)` 没有丢时间，所有到期轴按确定顺序启动，真实 landing 只上报一次，
最终 scene 与多次小 delta 推进一致。

### Slot operation、Scene Layout、Popup 与 Cascade

- `packages/rendercore/src/slot-operation/types.ts`、`coordinator.ts`
  - public coordinator 增加 `isRunning()`、`getPhase()`。
  - update 直接迭代 waiter Set，不创建 `[...waiters]`；为 update 中新建的 waiter 记录 eligible epoch，
    强制从下一帧开始，保持原 snapshot-iteration 边界。
- 将以下 hot path 的 `coordinator.getSnapshot().running/phase` 改为 direct query：
  - `packages/rendercore/src/scene-layout/configured-round-adapter.ts`
  - `packages/rendercore/src/scene-layout/local-scene-flow.ts`
- `configured-round-adapter.ts` 的 ticker 必须把 `Math.max(0, deltaMS / 1000)` 完整交给 coordinator/runtime，
  删除 `1/30` clamp；内部 ReelSet 已拥有切片职责。
- `packages/rendercore/src/popup/types.ts`、`award-player.ts`、`spine-player.ts`
  - 每类 Popup 只维护一份 Core 状态。
  - 游戏 Runtime 的 `update(deltaSeconds): void` 只推进状态，并提供 `getPhase()` / `isPlaying()` query；不公开 snapshot。
  - Editor player wrapper 从独立 `@slotclientengine/rendercore/popup/editor` 入口导入，委托同一个 Runtime，额外提供 `update() -> snapshot` 与 `getSnapshot()`；production popup入口不导出editor factory。
  - award player 复用 tier update scratch，替代逐帧 spread Set。
- `packages/rendercore/src/scene-layout/package-runtime.ts`
  - production popup 使用 `createAwardCelebrationRuntime()` / `createSpinePopupRuntime()` 并调用 void `update()`；阶段分支使用 query。
  - `isMainReelSpinning()` 调 ReelSet `isSpinning()`，不取完整 snapshot。
  - 游戏轮询award只调用`getActiveAwardCelebrationPhase()`；完整snapshot迁到`@slotclientengine/rendercore/scene-layout/editor` inspector，供Game Layout Editor使用。
- `packages/rendercore/src/symbol-cascade/create-symbol-cascade-player.ts`
  - 复用 `{completed:false}` / `{completed:true}` frozen 常量。
  - overlapping collect 使用 owner scratch 与原位 compact，删除逐帧 `filter/map/filter` 临时数组。

同步 public interface 后，Crave 中 production fake 实现 `SpinePopupRuntime`（void `update` + `getPhase`）；只有 Popup Editor 测试继续使用 snapshot player wrapper。所有 coordinator consumer 必须通过类型检查，不能用 cast 掩盖遗漏。

## 3. VNI 源码同步清单

- `packages/vnicore/src/core/basic-animation.ts`
  - public `sampleBasicAnimationAtTime(layer, time)` 始终返回 fresh value。
  - 另设不从core barrel导出的internal `sampleBasicAnimationAtTimeInto(layer, time, target)`。
- `packages/vnicore/src/core/animation-sampler.ts`
  - public `sampleLayerAnimationsAtTime(...)` 始终返回 fresh value；internal `sampleLayerAnimationsAtTimeInto(...)` 原位写 transform/opacity/visualRotation且不从barrel导出。
  - 以 animations 数组 identity 缓存 startTime 排序；缓存命中前校验长度、元素 identity 和 startTime，
    authoring 数据原位变化时必须重建，不能返回陈旧顺序。
- `packages/vnicore/src/core/project-sampler.ts`
  - 保留 `sampleProjectAtTime` / `sampleLayerAtTime` 的 fresh identity。
  - internal `createRuntimeProjectSampler(project)` 为每 layer 持有稳定 basic/animation/state transform buffer，每次 `sample()` 原位更新；VNIPlayer可直接模块内引用，但`core/index.ts`不得导出它。
- `packages/vnicore/src/pixi/vni-player.ts`
  - player 持有一个主 sampler 和一个 auxiliary sampler；particle layer time 与主 time 不同时使用 auxiliary，
    避免同一 mutable buffer 覆盖主帧结果。
  - mask layer lookup Map、native/precomposed active target Set 改为 player-owned scratch，并在每帧 clear 后复用。
  - visible layer 计数用 loop，不用 `filter(...).length`。

重要：runtime sampler/`*Into`只供VNIPlayer内部使用，不能暴露给宿主或跨帧保存。外部需要保留值时必须使用public pure sampler。

## 4. Crave app 的精确修改

文件：`apps/crave/src/round-adapter.ts`。只读核对时旧代码位于约 438–442 行：

```ts
let remainingSeconds = Math.min(this.#app.ticker.deltaMS / 1000, 0.25);
while (remainingSeconds > 0) {
  const sliceSeconds = Math.min(remainingSeconds, 1 / 30);
  runtime.update(sliceSeconds);
  remainingSeconds -= sliceSeconds;
}
```

替换为一次完整提交：

```ts
runtime.update(Math.max(0, this.#app.ticker.deltaMS / 1000));
```

不要保留 `0.25s` 截断，也不要在 app 层循环整个 runtime。这样 tab 恢复/低 FPS 时不会静默丢失 elapsed time，
同时避免一次浏览器 frame 重复推进与 reel 无关的 Popup、VNI、symbol 和 coordinator。

## 5. 必须补的测试

- Symbol：未变化 snapshot identity 相同；相同 steady update result identity 相同；state/default/pending 变化仍准确。
- Spine/ani：无 event 结果复用；真实 event 数组互相隔离；loop/once edge 不丢失。
- ReelSet：idle result identity；staggered axes；一次大 delta 与等量小 delta 的最终 scene/edge parity。
- Coordinator：`isRunning/getPhase` 生命周期；waiter callback 内新增 waiter 不在同一次 update 被推进。
- Popup/Cascade：package runtime 使用Core void `update`与phase query；Runtime无snapshot方法，editor wrapper snapshot完整；完成/未完成结果 identity与阶段、amount/collect顺序不变。
- VNI：pure sample fresh identity；public barrel不含runtime sampler/`*Into`；内部 runtime sample/state/transform stable identity；animation startTime 修改能使排序缓存失效；
  主/auxiliary sampler 不互相覆盖。
- Crave source boundary：断言 round adapter 包含一次完整 `runtime.update(Math.max(0, ...))`，且不再出现
  `remainingSeconds`、`sliceSeconds` 或针对 ticker delta 的 `Math.min`。
- game consumer source boundary：只出现award phase query，不出现`getActiveAwardCelebrationSnapshot()`。

## 6. 建议验收命令

按 Crave 实际 package 名调整 filter；不要修改 lockfile：

```bash
pnpm --filter @slotclientengine/vnicore typecheck
pnpm --filter @slotclientengine/vnicore test
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/gameframeworks typecheck
pnpm --filter crave typecheck
pnpm --filter crave test
git diff --check
```

最后在浏览器分别验证 idle、连续 spin、cascade、Popup 和 tab 恢复后的大 delta。Performance/Memory 记录
p95/p99 frame time、minor GC 次数和 heap slope；源码级 identity 测试不能替代真实 profiler。
