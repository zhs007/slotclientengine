# Crave 首轮预转 phase 接线说明

## 当前状态

RenderCore 已具备请求开始时的逐格本地 phase 随机化能力，但本次没有修改
`apps/game002v2` 或 `assets/crave`。因此 Crave 当前仍保持旧行为：刷新后的第一次
targetless pre-roll 会沿用 initial snapshot 的规则 phase；服务器响应后的落停阶段才会生成逐格
随机 phase。

本文记录后续 Crave 接线范围。接线完成前，不应把 RenderCore 能力落地误判为游戏问题已经修复。

## RenderCore 已提供的合同

- `RenderReel.startContinuous({ localPhaseY })`：单格原子起转时应用精确本地公开轮带 phase，保持
  边界前可见 code/value，不读取服务器目标。
- `CellSpin.start(position, { localPhaseY })`：新 grid 游戏的正式逐格入口，直接复用上述原子能力。
- `createShuffledGridCellReelPhaseMatrix()`：按列对完整公开轮带执行 partial Fisher–Yates，同列各格
  phase 无重复；只洗 phase，不洗 symbol 顺序。
- legacy `RenderGridCellReelSet.startContinuous({ cellLocalPhaseYs })`：Crave 迁移到 CellSpin 前的基础
  兼容入口；已起转和响应过早时尚未起转的格都使用各自预抽取 phase。
- `SceneLayoutPackageRuntime.startMainReelContinuousSpin({ random })`：可选 facade 接线；提供 random 时
  由 RenderCore 生成 phase 矩阵，省略时保持旧 consumer 行为。

## Crave 后续最小修改

只修改 `apps/game002v2/src/round-adapter.ts` 的预转启动接线：调用
`startMainReelContinuousSpin()` 时，在现有 `createGame002v2ContinuousSpinInput(...)` 结果上增加
`random: secureRandom`。

概念形态如下，实际修改时仍应按当前类型和格式落地：

```ts
runtime.startMainReelContinuousSpin({
  ...createGame002v2ContinuousSpinInput(
    inputScene,
    spinCodes,
    reelPresentation,
    freeGame,
  ),
  random: secureRandom,
});
```

不要把 random 放进 manifest、server request、logic 数据或 `createGame002v2ContinuousSpinInput()` 的
业务 symbol 判断中。`secureRandom` 继续使用 Web Crypto，并与 CN presentation random、服务器
`randomNumbers`、测试服 `lstrand` 完全独立。

## 保持不变的行为

- manifest direction、speed、`startStepMs`、landing cadence、bounce 和 dimming 不变。
- BaseGame 仍全盘预转；FreeGame 仍只启动非 WL/CN 格，被 hold 的 occurrence 不重新 phase。
- response scene/value 只在 settle 边界注入临时 landing window，不进入或改写公开轮带。
- 每个 framework spin request 仍只有一个 continuous transaction，第一个 landing 消费它。
- Nearwin activation、effect 和落停顺序不由 phase random 改写。

## 接线后的验收

1. 刷新页面后的第一次 BaseGame spin，在 response 到达前即可看到同列各转动格来自无重复 phase，
   不再呈现规则连续轮带。
2. 第一次和第二次 spin 的预转离散程度一致；不能依赖上一轮 settled phase 才变自然。
3. response 早于全部格启动时，pending 格保留 manifest cadence，并在真实 start edge 使用预抽取 phase，
   不二次起转、不闪回。
4. FreeGame WL/CN held 格的 code、value、player identity 和 phase 均保持不变。
5. 自动测试注入固定 random，证明每次请求只生成一份 pre-roll phase 矩阵、同列 phase 无重复，且
   server random、CN random、`Math.random` 均未被消费。
6. 浏览器人工复验首轮预转、响应边界连续性、Nearwin、FreeGame held 和下一轮 spin。
