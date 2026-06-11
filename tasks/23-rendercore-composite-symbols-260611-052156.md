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
