# 236 RenderObject 属性 motion 执行报告

## 结果

任务 236 已实现。Task 234 尚未进入当前 HEAD，因此本次把其 authored Scene Layout 位置 motion 合同一并整合到
presentation 通用 runtime；未发现 task 235 计划、实现或可用 ref 对该 seam 产生影响。

所有受 RenderCore owner clock 管理的 `RenderObject` 现在共享 `motion.snap/animate/fadeIn/fadeOut/cancel`：

- position 支持 line / cubic path；
- opacity 严格限制在 `[0,1]`，fade 不修改 `visible`；
- x/y scale 独立插值并允许负值镜像；
- rotation 按顺时针 exact degree 数值插值，不归一化，可表达多圈；
- 单命令可并行提交多属性，先完整 preflight，再按同一 duration/easing/manual clock 采样。

direct setter、新 motion、abort、layer/slot detach、scope/spin interruption、variant/geometry replacement 与 destroy
均会确定性结束 pending transaction。owner identity 使用每个 opaque adapter 自带的 binding slot；active transaction 和 update
集合只归 instance runtime 持有，没有 shared ticker 或进程级 motion registry。

## 主要落点

- `packages/rendercore/src/presentation/render-object-motion.ts`：通用 runtime、binding、sampler、transaction 与 public types。
- `RenderObject`：新增 `setOpacity()` 与统一 `motion`；owned detached object 可原子 `snap`，await animation 需要 exact owner clock。
- `RenderObjectLayer`、PresentationScope、Spine exact-slot attachment：负责 clock lease、迁移、继承与 cleanup；先绑定的 detached
  Spine 子树在父对象挂入 layer 后也会继承父 clock。
- standard reel、grid-cell reel 和 Scene Layout package：删除 scope 内重复的位置 transaction，改为推进 shared runtime。
- authored Scene Layout object：保留 `getHomeAnchor/snap/move/reset`，新增 opacity/scale/rotation/fade/并行动画；manifest
  placement 仍是 home，position/rotation 使用 offset，scale 使用 factor，opacity 作用于 authored slot。结束位置会按目标
  scale/rotation 预补偿；既有资源节点 direct-parent 拓扑保持不变。
- reel visible-occurrence transfer 保留兼容类型/入口，但 path/easing sampler 委托 presentation primitive。
- rendercore/gameframeworks facade、README 与 shared/scene-layout 稳定规则已同步。

## 自动验收

以下 L2 验收通过：

```text
pnpm --filter @slotclientengine/rendercore typecheck
  PASS

pnpm --filter @slotclientengine/rendercore exec vitest run \
  tests/presentation/render-object-motion.test.ts \
  tests/presentation/render-object.test.ts \
  tests/presentation/render-object-layer.test.ts \
  tests/scene-layout/coordinate-space.test.ts \
  tests/scene-layout/runtime.test.ts \
  tests/scene-layout/runtime-address.test.ts \
  tests/scene-layout/render-object-factory.test.ts \
  tests/scene-layout/package-runtime.test.ts \
  tests/reel/render-reel-spin.test.ts \
  tests/reel/render-grid-cell-reel-set.test.ts
  PASS: 10 files, 124 tests

pnpm --filter @slotclientengine/gameframeworks typecheck
  PASS

git diff --check
  PASS
```

依赖使用 `CI=true pnpm install --frozen-lockfile` 准备；`pnpm-lock.yaml`、workspace 配置和 package 依赖均未修改。

## 人工验收与剩余风险

按用户安排，本轮未执行浏览器验收。建议人工重点观察：真实素材负 scale 穿零、`0→720°` 多圈旋转、低 FPS
跨结束帧、多属性并行时 pivot 观感，以及 variant/spin/slot detach 中断后是否无闪回或 stale attachment。

未修改 assets、manifest/schema、游戏 app、logiccore，也未 commit、push 或创建 PR。
