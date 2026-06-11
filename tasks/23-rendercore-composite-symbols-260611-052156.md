# rendercore composite symbols 任务报告

## 结果

已完成 `tasks/23-rendercore-composite-symbols.md` 计划中的实现与严格验收，未做浏览器验收。

## 主要变更

- `packages/rendercore` 支持单图 normal source 和 layered normal source。
- `RenderSymbol` 新增 `baseLayer`、`layers`、`stateSprite`，多层 symbol 按 layer index 升序渲染；`spinBlur` / `disabled` 使用合成后的单张状态贴图。
- `createNamedSymbolAnimationResolver()` 支持用动画名和参数配置绑定 state 动画，并内置：
  - `layerBounceScale`
  - `layerShineScale`
  - `layerStaggeredShineScale`
  - `singleSpriteAppear`
  - `singleSpriteWinShine`
- 状态贴图生成脚本支持 `--composites`，对复合 symbol 先合成完整图标，再生成 `spinBlur` / `disabled`。
- 新增 `assets/symbols/symbol-composites.json`。
- 更新 `assets/symbols/symbol-state-textures.manifest.json`，`SC`、`RS`、`X2`、`X5`、`X10` 的 `normal` 均为 layered object。
- `apps/symbolsviewer` 读取 layered manifest，新增 `src/symbol-animation-config.ts` 配置 5 个特殊 symbol 的 layer 动画。
- `apps/reelsviewer` 同步读取共享 layered manifest，reel registry 支持 layered normal source 和 layered cell size。
- 更新 `packages/rendercore/README.md`、`apps/symbolsviewer/README.md`、`apps/reelsviewer/README.md`。

## agents.md 判断

本任务只新增 rendercore API、viewer 配置、资源 manifest 和 package 内脚本参数，没有改变仓库协作规则、目录规范或根级基础脚本，因此未更新 `agents.md`。

## 验收命令

已通过：

```bash
pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --symbols S00,S0,S1,S5,S10,SC,RS,X2,X5,X10 --composites assets/symbols/symbol-composites.json
pnpm --filter @slotclientengine/rendercore lint
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore build
pnpm --filter symbolsviewer lint
pnpm --filter symbolsviewer test
pnpm --filter symbolsviewer typecheck
pnpm --filter symbolsviewer build
pnpm --filter reelsviewer lint
pnpm --filter reelsviewer test
pnpm --filter reelsviewer typecheck
pnpm --filter reelsviewer build
pnpm lint
pnpm test
pnpm typecheck
pnpm build
git diff --check
```

`pnpm --filter @slotclientengine/rendercore test` 覆盖率：

```text
Statements: 93.91%
Branches:   81.99%
Functions:  98.93%
Lines:      93.82%
```

补充检查已通过：

```bash
rg -n '"normal": "\./(SC|RS|X2|X5|X10)\.png"' assets/symbols/symbol-state-textures.manifest.json
rg -n '"sharp"|from "sharp"|node:fs|node:path|generate-symbol-state-textures' packages/rendercore/dist apps/symbolsviewer/dist apps/reelsviewer/dist
```

以上两个命令均无输出；第一个确认特殊 symbol 未回退旧单图 normal，第二个确认 `sharp` 和 Node-only generator 未进入浏览器相关 dist。

## 浏览器验收

按本次要求未执行浏览器验收。

## 补充修复

后续检查发现 `reelsviewer` 虽已使用 layered normal，但没有接入 named animation profile，仍走 rendercore 默认 `appear/win`；默认动画操作 `context.sprite`，而 layered symbol 的兼容 `sprite` 指向 layer `0`，因此特殊 symbol 在 reelsviewer 中会出现 layer `0` 动画。

已补充：

- `apps/reelsviewer/src/symbol-animation-config.ts`
- `apps/reelsviewer/src/reels-demo.ts` 接入 `createNamedSymbolAnimationResolver()`
- `apps/symbolsviewer/src/symbol-animation-config.ts` 和 `apps/reelsviewer/src/symbol-animation-config.ts` 的特殊 symbol `win` 配置改为只驱动上层，layer `0` 不动
- `apps/reelsviewer/tests/reels-demo.test.ts` 增加 `appear` / `win` 下 layer `0` 不动的回归测试
- `apps/reelsviewer/README.md` 补充 reelsviewer 特殊 symbol 动画约定

## 补充修复 2

后续检查发现特殊 symbol 在 reelsviewer 中整体偏小，需要按 symbol 配置缩放，并且 cell 尺寸必须按缩放后的实际尺寸计算，避免只视觉放大但布局仍按旧尺寸。

已补充：

- `packages/rendercore/src/reel/types.ts` 新增 `ReelSymbolRegistryOptions.symbolScales`
- `packages/rendercore/src/reel/symbol-registry.ts` 使用 `texture width/height * scale` 计算 cell 最大宽高，并在创建 `RenderSymbol` 时把 scale 应用到根容器
- `symbolScales` 对未知 paytable symbol、非正数或非有限数会直接抛 `ReelAssetError`
- `apps/reelsviewer/src/reels-config.ts` 默认配置 `SC`、`RS`、`X2`、`X5`、`X10` 为 `1.5`
- `apps/reelsviewer/src/reels-demo.ts` 把 `config.symbolScales` 传入 reel registry
- `packages/rendercore/tests/reel/symbol-registry.test.ts` 增加缩放后 cell size、RenderSymbol 根容器缩放和非法配置测试
- `apps/reelsviewer/tests/reels-demo.test.ts` 增加默认特殊 symbol `1.5` 缩放和 cell size 回归测试
- `packages/rendercore/README.md`、`apps/reelsviewer/README.md` 补充 symbol scale 规则
