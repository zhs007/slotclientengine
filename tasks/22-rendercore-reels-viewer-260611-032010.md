# 22 rendercore reels viewer 任务报告

## 完成摘要

已在 `packages/rendercore` 新增可复用 reel 模块，并新增 `apps/reelsviewer` 作为 5 轴 5 行 reels 验证工具。核心库只处理通用 registry、layout、spin plan、reel window、`RenderReel` 和 `RenderReelSet`，具体 `game2.json`、`assets/symbols`、`reels01`、GMI fixture 和 `Spin` 按钮都放在 `apps/reelsviewer`。

同步补齐 `SC`、`RS`、`X2`、`X5`、`X10` 的 `spinBlur` / `disabled` 状态贴图和 manifest，并更新 `apps/symbolsviewer` 测试与 README。

## 新增和修改文件

新增：

- `packages/rendercore/src/reel/*`
- `packages/rendercore/tests/reel/*`
- `apps/reelsviewer/*`
- `assets/symbols/SC.spinBlur.png`、`SC.disabled.png`
- `assets/symbols/RS.spinBlur.png`、`RS.disabled.png`
- `assets/symbols/X2.spinBlur.png`、`X2.disabled.png`
- `assets/symbols/X5.spinBlur.png`、`X5.disabled.png`
- `assets/symbols/X10.spinBlur.png`、`X10.disabled.png`

修改：

- `packages/rendercore/src/index.ts`
- `packages/rendercore/package.json`
- `packages/rendercore/README.md`
- `apps/symbolsviewer/tests/symbol-assets.test.ts`
- `apps/symbolsviewer/README.md`
- `assets/symbols/symbol-state-textures.manifest.json`
- `pnpm-lock.yaml`

## 新增公开 API 和类型

`@slotclientengine/rendercore/reel` 新增导出：

- `createReelSymbolRegistry()` / `ReelSymbolRegistryModel`
- `createReelLayout()` / `assertLayoutMatchesReels()`
- `createReelSpinPlan()`
- `createReelWindowSnapshot()`
- `RenderReel`
- `RenderReelSet`
- `ReelError` / `ReelAssetError`
- `ReelSymbolRegistryOptions`、`ReelSpinPlanOptions`、`ReelAxisSpinPlan`、`RenderReelSnapshot`、`RenderReelSetSnapshot` 等类型

`packages/rendercore/package.json` 保留 `.` 和 `./symbol` export，并新增 `./reel` export。

## 空图标实现

`ReelSymbolRegistry` 显式区分 `textured` 和 `empty`：

- `BN` 由 `apps/reelsviewer/src/reels-config.ts` 的 `emptySymbols = ["BN"]` 显式传入。
- paytable 中缺少普通图的 symbol 会进入 `missingAssetEmptySymbols`。
- 空图标占据 reel cell，但 `createRenderSymbolByCode()` 返回 `null`，状态切换是 no-op。
- 有普通图的 symbol 如果缺少必需 `spinBlur`，会抛 `ReelAssetError`，不会静默回退普通图。

## Cell 尺寸

`ReelSymbolRegistry.getCellSize()` 只统计当前 paytable 中非空且可渲染的普通图：

- 不统计 `BN`。
- 不统计缺普通图而成为空图标的 symbol。
- 不统计 `CO.png`、`SX.png` 等 orphan 图片。
- 不统计 `spinBlur`、`disabled` 状态贴图。

`RenderReel` 将每个 slot container 放在 cell 中心，非空 symbol 的主 sprite anchor 保持 `0.5, 0.5`。

## Spin Plan 示例

默认配置位置：`apps/reelsviewer/src/reels-config.ts`。

默认值：

- `reelsName = "reels01"`
- `visibleRows = 5`
- `emptySymbols = ["BN"]`
- `direction = "forward"`
- `minimumSpinCycles = 10`
- `baseDurationMs = 1600`
- `speedSymbolsPerSecond = 42`
- `startDelayMs = 90`
- `stopDelayMs = 180`

实际计算结果：

- `finalYs = [1, 1, 4, 0, 27]`
- `startYs = [21, 9, 43, 0, 33]`
- `travelSymbols = [68, 80, 93, 105, 118]`
- `stopAtMs = [1600, 1870, 2140, 2410, 2680]`

每轴 `travelSymbols >= minimumSpinCycles * visibleRows = 50`。

## Viewer 实现

`Spin` 按钮位置：`apps/reelsviewer/src/main.ts`，`data-testid="spin-button"`。

点击流程：

1. `bindReelsControls()` 防止 spinning 中重复触发。
2. `ReelsDemo.spin()` 调用 `createReelSpinPlan()`。
3. `RenderReelSet.spin(plan)` 开始编排。
4. Pixi ticker 调用 `demo.update(deltaSeconds)`，内部推进 `RenderReelSet.update()`。
5. 全部轴完成后按钮恢复可用。

## GMI Scene 验证

默认 GMI 来源：`packages/logiccore/tests/fixtures/gamemoduleinfo-basic.json`。

默认 scene：

```text
[
  [2, 0, 3, 0, 4],
  [2, 0, 3, 0, 4],
  [0, 4, 0, 5, 0],
  [1, 1, 1, 1, 1],
  [9, 0, 6, 0, 6]
]
```

`apps/reelsviewer/tests/reels-demo.test.ts` 已验证默认静态 scene 和 spin 完成后的 `RenderReelSet.getVisibleScene()` 均等于该 GMI scene。

## rendercore 边界检查

命令：

```bash
rg -n "game2\\.json|assets/symbols|gamemoduleinfo-basic|reels01|spin-button|document\\.createElement|addEventListener" packages/rendercore/src
```

结果：无匹配，返回码 1，符合预期。`rendercore` 未写死 viewer 资源、GMI、`reels01` 或按钮逻辑。

## Coverage

`pnpm --filter @slotclientengine/rendercore test` 实际结果：

- statements: `94.73%`
- branches: `83.85%`
- functions: `98.52%`
- lines: `94.65%`

四项均大于 80%。

## 验收命令结果

已通过：

```bash
pnpm install
pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --symbols S00,S0,S1,S5,S10,SC,RS,X2,X5,X10
pnpm --filter @slotclientengine/rendercore lint
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore build
pnpm --filter reelsviewer lint
pnpm --filter reelsviewer test
pnpm --filter reelsviewer typecheck
pnpm --filter reelsviewer build
pnpm --filter symbolsviewer lint
pnpm --filter symbolsviewer test
pnpm --filter symbolsviewer typecheck
pnpm --filter symbolsviewer build
pnpm lint
pnpm test
pnpm typecheck
pnpm build
git diff --check
```

额外检查：

```bash
rg -n "\"sharp\"|from \"sharp\"|node:fs|node:path|generate-symbol-state-textures" packages/rendercore/dist apps/reelsviewer/dist apps/symbolsviewer/dist
```

结果：无匹配，返回码 1，符合预期。浏览器 bundle 未包含 `sharp`、`node:fs`、`node:path` 或生成脚本。

## 浏览器验收

未执行浏览器验收。用户明确说明“不需要你做浏览器验收”。

未验证项目包括：

- 实际浏览器 canvas 非空。
- `Spin` 点击后的肉眼动画节奏。
- 一轴一轴启动/停止的视觉表现。
- `spinBlur`、回弹、`appear` 的真实画面效果。
- 移动/桌面视口下 UI 是否有视觉重叠。

## agents.md

未更新 `agents.md`，因为本任务没有改变仓库级协作规则、目录规范或基础脚本语义。

## 已知风险和后续建议

- 本次没有做浏览器视觉验收，动画力度、mask 裁剪和真实图片缩放仍建议后续在浏览器中复核。
- `apps/reelsviewer` 和 `apps/symbolsviewer` 当前都会把 `assets/symbols` 的图片打入构建产物，包括 orphan 图片；后续如需控制 bundle 体积，可在 app 层按 paytable/manifest 做更精确的 import 过滤。
