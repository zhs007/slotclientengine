# 任务 200 执行报告：RenderCore ReelSpin 与 game003v2 迁移

## 结果

任务 200 已完成代码与自动化验收。RenderCore 新增逐列第一层 `ReelSpin`，standard
`RenderReelSet` 直接实现 `roll/start/settle/cancel/getReel/getSymbol`；Scene Layout runtime
新增实例级 `getReelSpin("main")`。game003v2 已迁移到该接口，浏览器人工验收按用户要求留待用户完成。

## 实际实现

- 新增 `ReelSpin/ReelRollTarget/ReelRollOptions/ReelRollStartOptions/ReelRender` public contract。
- `RenderReelSet` 使用 column-keyed active transaction 驱动已有 `RenderReel` 单轴
  direct/continuous/settle primitive；不同列并发、同列冲突显式失败。
- `roll/settle` 在整列 occurrence 原子落停后 resolve，随后每个 `getSymbol({x,y})` 可立即使用。
- targeted abort/cancel 回滚未提交目标并拒绝 Promise；targetless cancel 不伪造 server landing；destroy
  拒绝 pending Promise并清理 reel attachment。
- standard reel update 对完整 delta 以 `1/60s` 上限切片；legacy batch façade继续复用同一批
  `RenderReel`、pool/player 和 update loop。
- Scene Layout 创建 standard reel 时注入 manifest-owned direction、duration、speed 和 minimum cycles；
  `getReelSpin()` 对 unknown id、grid-cell 或未准备 runtime 显式失败。
- game003v2 请求 hook 同帧启动五列；landing 为每列建立 frame-delay job，以 `x * stopDelayMs`
  错峰 `settle/roll`，最后 `Promise.all()`。
- game003v2 移除 runtime config 的 `startDelayMs`、per-round `resolvePhases/localPhasePolicy`、
  `isMainReelSpinning()` polling 和 `1/30` ticker clamp；初始 scene 的本地随机 phase 保持。
- CO value、win carousel geometry compatibility、popup 与 next-spin cleanup 未改写。

## 主要文件

- `packages/rendercore/src/reel/reel-spin.ts`
- `packages/rendercore/src/reel/render-reel-set.ts`
- `packages/rendercore/src/scene-layout/{types,package-runtime}.ts`
- `packages/rendercore/tests/reel/render-reel-spin.test.ts`
- `apps/game003v2/src/{round-adapter,round-compiler,config}.ts`
- `apps/game003v2/config/game-runtime.manifest.json`
- `docs/rendercore-operation-first-layer-api.md`

## 自动化验收

以下命令通过：

```text
pnpm --filter @slotclientengine/rendercore exec vitest run tests/reel/render-reel-spin.test.ts tests/reel/render-reel-set.test.ts tests/scene-layout/package-runtime.test.ts
结果：3 files / 35 tests passed（包含 grid-cell accessor strict failure 与 destroy rejection 断言）

pnpm --filter @slotclientengine/rendercore typecheck
结果：通过

pnpm --filter @slotclientengine/rendercore build
结果：通过

pnpm --filter game003v2 test
结果：3 files / 9 tests passed

pnpm --filter game003v2 typecheck
结果：通过

git diff --check
结果：通过
```

依赖使用 `CI=true pnpm install --frozen-lockfile` 确认，workspace 已是最新，没有 lockfile 改动。

## 人工验收

待用户在浏览器验收：首轮 direct spin、请求后五列同步 pre-spin、120ms 逐列落停、CO value、win
carousel、next spin、中断恢复和低 FPS/切后台恢复。自动化结果不替代该视觉验收。

## 计划偏差与剩余风险

- 实现没有新增独立 `render-reel-spin.ts` class；public types 独立放在 `reel-spin.ts`，运行态直接进入
  `RenderReelSet`，避免 façade 再持有第二份 active 状态。
- legacy batch façade仍保存自己的跨列 cadence bookkeeping，但所有实际 motion、target window、pool/player
  和逐帧推进均由同一 `RenderReel` owner 完成，没有复制 reel 状态机。
- 视觉上的五列同步预转和完整 delta 恢复仍需浏览器确认；这是当前唯一未完成验收项。
