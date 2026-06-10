# rendercore symbol state textures 任务报告

## 完成摘要

- `packages/rendercore` 增加状态贴图集合能力：`normal` 保持普通贴图，`states` 可提供 `spinBlur`、`disabled` 等状态贴图。
- `spinBlur` / `disabled` 仍保持 `requestedState -> resolvedState` 的等价语义，默认静态 ani 按 `requestedState` 选择贴图。
- `apps/symbolsviewer` 改为读取状态贴图 manifest，递归加载普通图和状态图，并对可展示 symbol 启用 required state texture policy。
- 生成并提交当前 viewer 所需的 `spinBlur` / `disabled` PNG 与 `symbol-state-textures.manifest.json`。
- 按用户要求未做浏览器验收。

## 新增和修改文件

- `packages/rendercore/src/symbol/types.ts`
- `packages/rendercore/src/symbol/catalog.ts`
- `packages/rendercore/src/symbol/render-symbol.ts`
- `packages/rendercore/src/symbol/ani.ts`
- `packages/rendercore/scripts/generate-symbol-state-textures.mjs`
- `packages/rendercore/tests/symbol/ani.test.ts`
- `packages/rendercore/tests/symbol/animation-resolver.test.ts`
- `packages/rendercore/tests/symbol/catalog.test.ts`
- `packages/rendercore/tests/symbol/render-symbol.test.ts`
- `packages/rendercore/tests/symbol/texture-variants.test.ts`
- `packages/rendercore/package.json`
- `packages/rendercore/eslint.config.cjs`
- `packages/rendercore/README.md`
- `apps/symbolsviewer/src/main.ts`
- `apps/symbolsviewer/src/symbol-assets.ts`
- `apps/symbolsviewer/tests/symbol-assets.test.ts`
- `apps/symbolsviewer/README.md`
- `assets/symbols/*.spinBlur.png`
- `assets/symbols/*.disabled.png`
- `assets/symbols/symbol-state-textures.manifest.json`
- `pnpm-lock.yaml`

## 新增公开 API 和类型

- `SymbolTextureSet<TTexture = Texture | string>`
- `SymbolAssetInput`
- `SymbolTexturePolicy`
- `SymbolAssetMap` 支持旧写法 `Texture | string` 和新写法 `{ normal, states }`
- `SymbolAnimationContext.stateTextures`
- `SymbolAnimationContext.requiredStateTextures`
- `RenderSymbolOptions.stateTextures`
- `RenderSymbolOptions.requiredStateTextures`
- `CreateSymbolCatalogOptions.texturePolicy`
- `CreateCatalogRenderSymbolOptions.stateTextures`
- `SymbolCatalog.getTextureSet(symbol)`
- `resolveSymbolTextureForState(context, state?)`

## 生成的状态贴图

- `assets/symbols/S00.spinBlur.png`
- `assets/symbols/S00.disabled.png`
- `assets/symbols/S0.spinBlur.png`
- `assets/symbols/S0.disabled.png`
- `assets/symbols/S1.spinBlur.png`
- `assets/symbols/S1.disabled.png`
- `assets/symbols/S5.spinBlur.png`
- `assets/symbols/S5.disabled.png`
- `assets/symbols/S10.spinBlur.png`
- `assets/symbols/S10.disabled.png`
- `assets/symbols/symbol-state-textures.manifest.json`

## 图片实现方式

- `spinBlur`：Node 脚本用 `sharp.ensureAlpha().convolve().png()` 生成纵向 box blur。manifest 记录 `kernelHeight: 21`；实际 sharp convolution 使用 `3 x 21`、仅中间列有权重的 kernel，以规避 `sharp@0.34.5` 拒绝 `1 x 21` kernel 的限制，同时保持纵向模糊语义。
- `disabled`：Node 脚本用 `sharp.ensureAlpha().grayscale().modulate({ brightness: 0.72 }).png()` 生成灰色降亮贴图。
- `sharp` 只在 `packages/rendercore/scripts/generate-symbol-state-textures.mjs` 和脚本测试中使用，未进入 `packages/rendercore/src/**` 或 `apps/symbolsviewer/src/**`。

## agents.md

未更新 `agents.md`。本任务只增加 package 内脚本、状态贴图资源、README 和局部实现，没有改变仓库级协作规则、目录规范或基础脚本。

## rendercore coverage

`pnpm --filter @slotclientengine/rendercore test` 结果：

- Statements: `93.2%`
- Branches: `81.81%`
- Functions: `96.69%`
- Lines: `93.11%`

四项均大于 `80%`，未降低现有阈值。

## 验收命令结果

- `pnpm install`：通过。
- `pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --symbols S00,S0,S1,S5,S10`：通过。
- `pnpm --filter @slotclientengine/rendercore lint`：通过。
- `pnpm --filter @slotclientengine/rendercore test`：通过。
- `pnpm --filter @slotclientengine/rendercore typecheck`：通过。
- `pnpm --filter @slotclientengine/rendercore build`：通过。
- `pnpm --filter symbolsviewer lint`：通过。
- `pnpm --filter symbolsviewer test`：通过。
- `pnpm --filter symbolsviewer typecheck`：通过。
- `pnpm --filter symbolsviewer build`：通过。
- `pnpm lint`：通过。
- `pnpm test`：通过。
- `pnpm typecheck`：通过。
- `pnpm build`：通过。
- `git diff --check`：通过，无输出。
- `rg -n "\"sharp\"|from \"sharp\"|node:fs|node:path|generate-symbol-state-textures" packages/rendercore/dist apps/symbolsviewer/dist`：无输出。`rg` 返回码为 `1`，符合无匹配预期。
- `git status --short`：只包含任务相关源码、测试、README、资源、锁文件、任务计划和本报告；未出现 `dist/` 或 `coverage/` 改动。

## 浏览器验收

未执行浏览器验收。用户明确要求“不需要你做浏览器验收”。

未人工确认以下浏览器项目：

- Pixi canvas 非空。
- `spinBlur` 在真实浏览器中显示纵向模糊图。
- `disabled` 在真实浏览器中显示灰色图。
- `appear` / `win` 后回到 `spinBlur` / `disabled` 默认状态时，真实画面贴图正确。

## 已知风险和后续建议

- 当前 state texture manifest 只为 `S00`、`S0`、`S1`、`S5`、`S10` 声明状态图；未来新增可展示 symbol 时，必须先运行生成脚本补齐 `spinBlur` / `disabled`，否则 viewer 会 fail-fast。
- `SX.png` 仍作为孤儿普通图进入 asset map，用于 catalog validation 的 `ignoredAssetsWithoutPaytable`；它没有状态图，也不会进入展示列表。
