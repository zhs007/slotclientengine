# rendercore symbol render priority 任务计划

## 1. 任务目标

本任务为 `packages/rendercore` 的 symbol manifest 增加“渲染叠放优先级”能力，解决 symbol 美术尺寸超过格子后互相遮挡的问题。

需求合同：

- 每个 symbol 可在 `symbol-state-textures.manifest.json` 的 symbol 条目里声明可选字段 `renderPriority`。
- `renderPriority` 缺省为 `0`，所有未配置 symbol 都按当前行为处理。
- 只支持非负整数优先级：`0, 1, 2...`。不支持负数、小数、`NaN`、`Infinity`、字符串或其它类型；遇到非法值必须显式失败。
- 优先级更大的 symbol 必须压住优先级更小的 symbol。
- 优先级相同的 symbol 必须保持当前默认叠放顺序：下面压住上面，右边压住左边。
- `renderPriority` 只影响 Pixi 渲染叠放，不改变服务器 scene、reel stop、win result 顺序、symbol state、中奖金额 overlay 或点击逻辑。
- `game003` 中 `SC`、`CL`、`WL` 为当前最高优先级，其它 symbol 默认 `0`。

本计划必须能独立落地，不依赖任何聊天上下文。执行者只需要阅读本文件，即可完成实现、测试、验收、文档同步和最终任务报告。

任务完成后必须新增中文任务报告：

```text
tasks/83-rendercore-symbol-render-priority-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/83-rendercore-symbol-render-priority-260706-123456.md
```

## 2. 仓库和环境约束

仓库根目录：

```text
/Users/zerro/github.com/slotclientengine
```

基础工具链：

- Node.js：`>=24.0.0`
- 包管理器：`pnpm`
- 构建编排：`turbo`
- 前端构建：`vite`
- 测试框架：`vitest`
- lint：`eslint`
- format：`prettier`

执行前必须确认工作区，不要回滚用户已有改动：

```bash
git status --short --untracked-files=all
git diff --stat
```

如果依赖下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

本任务原则上不需要新增第三方依赖。若确实新增或调整依赖，必须执行：

```bash
pnpm install
```

并在任务报告中记录 `pnpm-lock.yaml` 是否变化。依赖安装失败时用上面的代理环境变量重试。

如果 `pnpm --filter ...` 在非 TTY 环境出现 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，先用同一命令加 `CI=true` 重试，例如：

```bash
CI=true pnpm --filter @slotclientengine/rendercore test
CI=true pnpm --filter game003 test
```

如果是测试导致一些奇怪写法，就修改测试，不要改不该改的生产逻辑，以免后续出现问题难查。

本任务要求显式失败，不做不必要的兜底。有些逻辑 bug 越早暴露越好。非法 manifest 字段、非法优先级、生成物不同步、配置漏传都必须尽早报错，不能静默退回到普通渲染。

`apps/game003/src/generated/game-static.generated.ts` 和 `apps/game003/src/generated/game-loading.generated.ts` 由 `apps/buildgamestatic` 生成，禁止手改；修改 YAML 后必须同步执行生成和 `--check` 校验。只改 manifest 内容时也要运行 game003 的静态配置检查，确认生成入口没有被破坏。

## 3. 当前实现事实

执行本计划时必须重新盘点，不要只信任本节快照。

### 3.1 关键文件

rendercore manifest 和 symbol：

```text
packages/rendercore/src/index.ts
packages/rendercore/src/symbol/manifest.ts
packages/rendercore/src/symbol/index.ts
packages/rendercore/src/symbol/types.ts
packages/rendercore/src/symbol/render-symbol.ts
packages/rendercore/src/symbol/catalog.ts
packages/rendercore/src/symbol/standalone-catalog.ts
packages/rendercore/scripts/generate-symbol-state-textures.mjs
packages/rendercore/tests/symbol/manifest.test.ts
packages/rendercore/tests/symbol/state-texture-generator.test.ts
packages/rendercore/tests/symbol/texture-variants.test.ts
packages/rendercore/README.md
```

rendercore reel 渲染：

```text
packages/rendercore/src/reel/types.ts
packages/rendercore/src/reel/symbol-registry.ts
packages/rendercore/src/reel/render-reel.ts
packages/rendercore/src/reel/render-reel-set.ts
packages/rendercore/src/reel/render-grid-cell-reel-set.ts
packages/rendercore/tests/reel/symbol-registry.test.ts
packages/rendercore/tests/reel/render-reel.test.ts
packages/rendercore/tests/reel/render-reel-set.test.ts
```

game003 接入：

```text
assets/game003-s1/symbol-state-textures.manifest.json
apps/game003/src/assets.ts
apps/game003/src/skin-config.ts
apps/game003/src/symbol-animation-config.ts
apps/game003/src/game-demo.ts
apps/game003/src/game-adapter.ts
apps/game003/tests/assets.test.ts
apps/game003/tests/static-config.test.ts
apps/game003/tests/symbol-animation-config.test.ts
apps/game003/tests/game-demo.test.ts
apps/game003/tests/source-boundary.test.ts
apps/game003/README.md
```

symbolsviewer 接入：

```text
apps/symbolsviewer/src/symbol-assets.ts
apps/symbolsviewer/src/symbol-set-config.ts
apps/symbolsviewer/src/main.ts
apps/symbolsviewer/tests/symbol-assets.test.ts
apps/symbolsviewer/tests/symbol-set-config.test.ts
apps/symbolsviewer/README.md
```

协作规则：

```text
agents.md
```

注意：本仓库实际协作规则文件是小写 `agents.md`。如果实现中确认此 manifest 字段成为仓库长期规则，必须同步更新 `agents.md`。

### 3.2 当前默认叠放来源

当前 `RenderReel` 在 `createSlots()` 中按 `windowY = -bufferRowsBefore ... visibleRows + bufferRowsAfter` 的顺序创建 slot container，并依次 `addChild(container)`。Pixi 同级 child 默认后添加的压住先添加的，所以同一列内默认表现是下面压住上面。

当前 `RenderReelSet` 按 `x = 0 ... reelCount - 1` 创建 `RenderReel` 并依次 `addChild(reel)`。因此不同列之间默认表现是右边压住左边。

本任务不能破坏这个默认顺序。所有 symbol priority 都是 `0` 时，静态显示、spin 中显示、落停后显示都必须和当前实现一致。

### 3.3 当前 manifest schema

`packages/rendercore/src/symbol/manifest.ts` 的 symbol 条目当前只允许：

```text
normal
scale
animations
spinBlur / disabled 等 states 中声明的状态贴图字段
```

未知字段会通过 `assertOnlyKnownKeys(...)` 显式失败。因此新增 `renderPriority` 必须在 parser、类型和 generator 的保留逻辑中一起处理，不能只手改 `assets/game003-s1/symbol-state-textures.manifest.json`。

`packages/rendercore/scripts/generate-symbol-state-textures.mjs` 会重写 `symbol-state-textures.manifest.json`，当前已保留 `animations`。本任务必须让 generator 也保留已手写的 `renderPriority`，否则下一次生成状态贴图会把优先级悄悄删掉。

## 4. 字段合同

推荐 manifest 字段名：

```json
{
  "symbols": {
    "SC": {
      "normal": "./SC.png",
      "spinBlur": "./SC.spinBlur.png",
      "disabled": "./SC.disabled.png",
      "scale": 1,
      "renderPriority": 1
    }
  }
}
```

字段规则：

- 字段名固定为 `renderPriority`，含义是“渲染叠放优先级”。
- 字段位于每个 symbol 条目内，不放在 manifest 顶层、不放在 `settings`、不放在 YAML。
- 缺省值是 `0`。缺字段和显式 `renderPriority: 0` 行为一致。
- 解析后公开为 `ParsedSymbolManifestSymbol.renderPriority`。
- 新增 helper `createSymbolRenderPriorityMapFromManifest(...)`，形态与 `createSymbolScaleMapFromManifest(...)` 类似。
- `renderPriority` 不要求每个 symbol 显式声明；game003 只需要给 `WL`、`CL`、`SC` 声明同一个正整数，其它 symbol 缺省 `0`。
- 不要因为测试方便而允许非法值。非法值必须在 parser 或 registry 归一化阶段显式失败。

## 5. 实施步骤

### 5.1 manifest parser 和 helper

修改 `packages/rendercore/src/symbol/manifest.ts`：

- 在 `ParsedSymbolManifestSymbol` 中增加 `readonly renderPriority: number`。
- 在 symbol allowed keys 中加入 `renderPriority`。
- 新增 `parseManifestRenderPriority(value, symbol)`：
  - `undefined` 返回 `0`。
  - 只接受 `Number.isSafeInteger(value) && value >= 0`。
  - 非法时抛 `SymbolAssetError`，错误信息包含 symbol 名和 `renderPriority`。
- 新增 `CreateSymbolRenderPriorityMapFromManifestOptions` 和 `createSymbolRenderPriorityMapFromManifest(...)`：
  - 参数支持 `manifest`、`displaySymbols`、`requiredStates`。
  - 对 `displaySymbols` 中不存在于 manifest 的 symbol 显式失败。
  - 返回 `Readonly<Record<string, number>>`，包含 displaySymbols 全量条目，未配置值为 `0`。
- 从 `packages/rendercore/src/symbol/index.ts` 继续导出新增类型/helper。
- 确认 `packages/rendercore/src/index.ts` 通过 `export * from "./symbol/index.js"` 能继续导出新增 helper；如果导出结构变化，必须同步主入口和 package subpath 类型。

修改 `packages/rendercore/tests/symbol/manifest.test.ts`：

- 增加正向用例：缺字段默认 `0`，显式 `renderPriority: 3` 可被 parse/helper 读取。
- 增加反向用例：`-1`、`1.5`、`NaN`、`Infinity`、`"1"`、`null` 都显式失败。
- 保持未知字段仍失败；不要为了 `renderPriority` 放宽其它字段。

### 5.2 generator 保留 `renderPriority`

修改 `packages/rendercore/scripts/generate-symbol-state-textures.mjs`：

- 将当前只保留 `animations` 的逻辑扩展为保留 symbol metadata，至少包含：
  - `animations`
  - `renderPriority`
- 读取旧 manifest 时，`assertOnlyKnownKeys(...)` 允许 `renderPriority`。
- `renderPriority` 用和 runtime parser 一致的规则校验：非负安全整数；非法直接失败。
- 重新生成 manifest 时：
  - 新 manifest 默认不主动写 `renderPriority: 0`。
  - 旧 manifest 中显式写过合法 `renderPriority` 的 symbol，在该 symbol 仍被选中时必须保留原值，包括显式 `0`。
  - 未被本次 `--symbols` 选中的 symbol 不保留。
- 不要用“如果旧 manifest parse 失败就忽略”的兜底；旧 manifest 有非法字段或非法 priority 时必须失败，让维护者修正源文件。

修改 generator 测试：

- 在 `packages/rendercore/tests/symbol/state-texture-generator.test.ts` 的“preserves manifest animation specs”附近增加 `renderPriority` 保留断言。
- 在 `packages/rendercore/tests/symbol/texture-variants.test.ts` 中保持 deterministic manifest 断言：全新生成的 manifest 不应无故写入 `renderPriority: 0`。
- 增加非法旧 manifest priority 导致生成失败的测试。

### 5.3 rendercore 类型和 registry

修改 `packages/rendercore/src/symbol/types.ts`：

- `RenderSymbolOptions` 增加可选 `renderPriority?: number`。
- `RenderSymbol` 类增加只读属性 `readonly renderPriority: number`。
- `CreateCatalogRenderSymbolOptions` 增加可选 `renderPriority?: number`，允许 catalog/standalone 入口在创建单个 `RenderSymbol` 时显式覆盖或透传 priority。
- `CreateSymbolCatalogOptions` 增加可选 `symbolRenderPriorities?: Readonly<Record<string, number>>`，覆盖普通 paytable catalog 入口。
- `CreateStandaloneSymbolCatalogOptions` 增加可选 `symbolRenderPriorities?: Readonly<Record<string, number>>`。

修改 `packages/rendercore/src/symbol/render-symbol.ts`：

- constructor 中归一化 `options.renderPriority ?? 0`。
- 非负安全整数以外的值抛 `SymbolAnimationError` 或更合适的现有错误类型。
- `resetForPoolRelease()` 不能把 `renderPriority` 重置成 `0`，因为 pooled symbol 的 symbol code 不变，优先级也应保持不变。
- 不要依赖 `RenderSymbol.zIndex` 作为跨格/跨轴排序的唯一载体；symbol pool release 当前会重置 display 属性，真正的 reel 叠放应由 slot/cell 容器在每次换 symbol 后重新计算。

修改 `packages/rendercore/src/reel/types.ts`：

- 增加 `ReelSymbolRenderPriorityMap = Readonly<Record<string, number>>`。
- `ReelSymbolRegistryOptions` 增加 `symbolRenderPriorities?: ReelSymbolRenderPriorityMap`。

修改 `packages/rendercore/src/reel/symbol-registry.ts`：

- 类似 `normalizeSymbolScales(...)` 新增 `normalizeSymbolRenderPriorities(...)`。
- 只允许 paytable 中存在的 symbol；否则显式失败。
- 只允许非负安全整数；非法显式失败。
- `NormalizedTextureSet` 或并行 map 中保存每个 textured symbol 的 render priority。
- `createRenderSymbolByCode(...)` 创建 `RenderSymbol` 时传入该 symbol 的 priority；未配置传 `0`。
- 空 symbol 不创建 `RenderSymbol`，优先级视为 `0`。

修改 `packages/rendercore/src/symbol/catalog.ts` 和 `standalone-catalog.ts`：

- `SymbolCatalogModel` 支持 `symbolRenderPriorities`，只允许 paytable/displaySymbols 中存在的 symbol，值必须是非负安全整数。
- `SymbolCatalogModel.createRenderSymbol(...)` 可透传 `renderPriority`，默认取 `options.renderPriority ?? symbolRenderPriorities[symbol] ?? 0`。
- `createStandaloneSymbolCatalog(...)` 支持 `symbolRenderPriorities`，用于 symbolsviewer 或其它无 reel 的预览入口。
- `createStandaloneSymbolCatalog(...).createRenderSymbol(...)` 的优先级同样遵守 `renderOptions.renderPriority ?? symbolRenderPriorities[symbol] ?? 0`。
- 不要把 visual priority 塞进 `logiccore` 的 paytable；这是 rendercore 的视觉合同。

新增或更新测试：

- `packages/rendercore/tests/symbol/catalog.test.ts`：
  - 普通 paytable catalog 能从 `symbolRenderPriorities` 创建带 priority 的 `RenderSymbol`。
  - `createRenderSymbol(symbol, { renderPriority })` 单次 override 优先于 catalog map。
  - 非 paytable symbol、负数、小数、字符串等非法值显式失败。
- `packages/rendercore/tests/reel/symbol-registry.test.ts`：
  - registry 会把 priority 传到 `RenderSymbol.renderPriority`。
  - 未配置 priority 默认为 `0`。
  - 非 paytable symbol、负数、小数、字符串等非法值显式失败。
- `packages/rendercore/tests/symbol/standalone-catalog.test.ts`：
  - standalone catalog 可以传入 priority 并在 `createRenderSymbol()` 后读到。

### 5.4 reel 叠放排序

这是本任务最容易遗漏的部分：只给 `RenderSymbol` 设置 `zIndex` 不足以解决跨 reel 遮挡，因为不同 reel 当前是不同父容器。必须确认高优先级 symbol 能跨列压住低优先级 symbol。

实现原则：

- 同优先级保持当前默认顺序。
- 不改变 `RenderReel` 的公开状态 API、spin plan、visible scene、geometry snapshot。
- spin 中仍保留每轴裁切；停止态仍取消裁切，允许大 symbol 超出格子。
- 不在 `apps/game003` 私有代码里硬编码 `SC/CL/WL` 排序。

建议实现路径：

1. 在 `RenderReel` 的 `ReelSlot` 中记录稳定 `renderOrder`。
2. 使用统一公式计算 slot container 的 `zIndex`：

   ```text
   zIndex = renderPriority * renderOrderStride + renderOrder
   ```

   其中 `renderOrder` 是当前默认顺序编号，`renderOrderStride` 必须大于最大 `renderOrder`，保证任何更高 priority 都压住任何更低 priority；同 priority 时仍按默认顺序。

3. `RenderReel` 单独使用时，`renderOrder` 仍按本 reel 内 slot 创建顺序。
4. `RenderReelSet` 使用时，需要让参与排序的 visible slot container 处于同一个可排序父容器，才能跨列排序：
   - 在 `RenderReelSet` 中创建共享 symbol slot layer。
   - 共享 layer 或参与排序的父容器必须设置 `sortableChildren = true`，或在更新 `zIndex` 后显式调用等价排序；否则 Pixi 的 `zIndex` 不会改变实际绘制顺序。
   - 创建每个 `RenderReel` 时传入共享 slot parent、全局 `renderOrderOffset` 和 `renderOrderStride`。
   - 共享 slot layer 的默认 child 添加顺序必须等价于当前实现：reel 0 从上到下，再 reel 1 从上到下，直到最右列。
   - 共享 slot layer 下的 slot container 坐标必须仍等价于旧的 `RenderReel` 局部坐标叠加 `reel.x / reel.y / bounce y / pixelOffsetY` 后的位置；不能因为换父容器导致 `getVisibleSymbolGeometrySnapshot(...)` 和实际画面偏移。
   - 所有 priority 为 `0` 时，渲染顺序必须与旧实现一致。
5. 每次 `syncSlot(...)` 换 symbol 后必须重新同步该 slot container 的排序值；spin 过程里同一个 slot 的 symbol code 可能变化，不能只在初始化时算一次。
6. 如果实现共享 slot layer 会影响 reel mask，需要把每轴 clip mask 也放到正确的父容器或对 slot container 应用相同 mask。不能为了排序牺牲 spin 中裁切。
7. `getSlotSnapshots()` 返回的 `container` 仍应是对应 slot 的实际 display container，测试和上层调试不能拿到已经脱离渲染树或坐标不一致的对象。
8. `RenderGridCellReelSet` 也要做二次检查：
   - 它的 cell root 已经是同一父容器的 child，落停后大 symbol 也可能越格。
   - 若 grid-cell 未来也应支持 manifest priority，则按当前 cell 可见 symbol priority 更新 cell root `zIndex`，同 priority 保持 `orderIndex` 默认顺序。
   - grid-cell 父容器同样需要 `sortableChildren = true` 或显式排序，且每个 cell 落停、reset、spin target 换 symbol 后都要重算 cell root 排序。
   - 若实现时决定本轮只支持普通 `RenderReelSet`，必须在任务报告中写清楚原因，并确保 `agents.md`/README 不宣称 grid-cell 已支持。

测试要求：

- `packages/rendercore/tests/reel/render-reel.test.ts`：
  - 同一列中，下方低优先级和上方高优先级时，高优先级 slot 的 `zIndex` 更大。
  - 同 priority 时，slot `zIndex` 顺序等价于当前默认创建顺序。
- `packages/rendercore/tests/reel/render-reel-set.test.ts`：
  - 构造 2 列 x 2 行 scene，左列某 symbol priority 高于右列 symbol，断言共享 layer 或 slot container 的排序信息能让左列高优先级压住右列低优先级。
  - 所有 priority 为 `0` 时，右列仍压住左列、下行仍压住上行。
  - spin start、update、land 后 priority 排序仍正确，且 mask 状态不被破坏。
- 如支持 grid-cell，增加 `render-grid-cell-reel-set.test.ts` 覆盖落停后的 cell root priority 排序。

## 6. game003 接入

修改 `assets/game003-s1/symbol-state-textures.manifest.json`：

- 为 `WL`、`CL`、`SC` 加同一个最高优先级，例如：

  ```json
  "renderPriority": 1
  ```

- 其它 symbol 不需要写 `renderPriority: 0`，让默认值生效。
- 保持每个可展示 symbol 的 `scale: 1` 不变。
- 不改变 display set：仍为 `WL,H1,H2,H3,H4,H5,L1,L2,L3,L4,L5,CO,CL,SC`。
- 不改变 `assets/gamecfg003/gameconfig.json`、live `gamecode`、server URL、reel stop 或服务器协议。

修改 `apps/game003/src/assets.ts`：

- 增加 `createGame003SymbolRenderPriorityMapFromManifest(...)`。
- 默认 displaySymbols 使用 `GAME003_DISPLAY_SYMBOLS`。
- 调用 rendercore 新 helper，不在 app 内维护第二份 hardcoded priority 表。

修改 `apps/game003/src/symbol-animation-config.ts`：

- 现有 `GAME003_SYMBOL_SCALES` 是 game003 默认 reel config 的 manifest-derived scale 入口；本任务应在同一文件或等价默认配置入口新增 `GAME003_SYMBOL_RENDER_PRIORITIES`。
- `DEFAULT_GAME003_REEL_CONFIG` 不能因为只从 `getGame003SkinConfig("1")` 读取 scale 而漏掉默认 priority；测试必须覆盖默认 config 和 skin config 一致。

修改 `apps/game003/src/skin-config.ts`：

- `Game003SkinConfig` 增加 `symbolRenderPriorities`。
- 从 manifest 创建 priority map。
- `bgBar` 默认可以不接 priority；如果为了类型统一接入，也必须从它自己的 manifest 读取，不能复用主转轮 manifest。

修改 `apps/game003/src/game-demo.ts`、`apps/game003/src/game-adapter.ts`：

- 创建 `createGame003ReelRuntime(...)` / `createReelSymbolRegistry(...)` 时传入 `symbolRenderPriorities`。
- 不在这些文件里写 `if symbol === "SC"`、`WL/CL/SC` 数组或其它 app 私有排序逻辑。

修改测试：

- `apps/game003/tests/assets.test.ts`：
  - 断言 game003 asset helper 能从主 manifest 读到 `WL/CL/SC` 的 priority，未配置 symbol 默认 `0`。
  - 断言非法 manifest priority 会显式失败。
- `apps/game003/tests/static-config.test.ts`：
  - 断言 `skin.symbolRenderPriorities.WL === 1`、`CL === 1`、`SC === 1`。
  - 断言至少一个普通 symbol 如 `H1` 或 `L1` 为 `0`。
  - 断言 YAML/生成配置没有第二份 priority 表；priority 来自 manifest。
- `apps/game003/tests/symbol-animation-config.test.ts`：
  - 断言 `GAME003_SYMBOL_RENDER_PRIORITIES` 与 `getGame003SkinConfig("1").symbolRenderPriorities` 一致。
  - 保持现有 animation resolver 断言不被 priority 逻辑污染。
- `apps/game003/tests/game-demo.test.ts` 或相关 runtime 测试：
  - 断言传给 registry/runtime 的 `symbolRenderPriorities` 存在。
- `apps/game003/tests/source-boundary.test.ts`：
  - 防止 `apps/game003/src/game-adapter.ts`、`game-demo.ts`、`skin-config.ts` 中出现硬编码排序分支，例如直接判断 `SC|CL|WL` 来决定 zIndex。

game003 视觉验证：

- 本任务的自动验收必须跑非浏览器检查。
- 用户会用 game003 做最终视觉测试。若执行者没有实际浏览器截图或用户确认，任务报告只能写“已完成非浏览器验收，game003 视觉叠放交由用户实测”，不能写成视觉已验收。

## 7. symbolsviewer 接入

修改 `apps/symbolsviewer/src/symbol-assets.ts`：

- 增加 `createSymbolRenderPriorityMapFromManifest(...)` wrapper。

修改 `apps/symbolsviewer/src/symbol-set-config.ts`：

- 在 symbol set config 中保存 `symbolRenderPriorities`。
- 从 manifest 读取，不维护第二份表。

修改 `apps/symbolsviewer/src/main.ts`：

- 若当前 UI 已展示每个 symbol 的 manifest scale，可在同一信息区展示 `renderPriority`。
- 创建 `game003-s1` 的 paytable catalog 和 `game003-bg-bar` 的 standalone catalog 时都要传入 `symbolRenderPriorities`。当前 `game003-s1` 不是 standalone 入口，不能只修 standalone catalog。

修改测试：

- `apps/symbolsviewer/tests/symbol-assets.test.ts`：
  - 缺字段默认 `0`。
  - `SC/CL/WL` 可从 game003 manifest 读到正 priority。
  - 非法 priority 显式失败。
- `apps/symbolsviewer/tests/symbol-set-config.test.ts`：
  - `game003-s1` config 暴露 priority map。
  - `game003-bg-bar` config 暴露全 `0` priority map，且不复用主转轮 priority。

## 8. 文档和协作规则

必须更新：

```text
packages/rendercore/README.md
apps/game003/README.md
apps/symbolsviewer/README.md
agents.md
```

文档要写清楚：

- `renderPriority` 是 manifest symbol 字段。
- 默认值是 `0`，不要求每个 symbol 显式写。
- 只支持非负整数，不支持负数。
- 更大值压住更小值，同值沿用当前默认顺序。
- game003 当前 `WL/CL/SC` 为最高优先级，其它默认 `0`。
- priority 不改变 reel stop、server scene、win result、金额 overlay、symbol animation 合同。
- generator 重新生成状态贴图时会保留合法 `renderPriority`。

`agents.md` 需要补充长期协作规则，因为本任务改变了 symbol manifest 的仓库级合同。建议放在现有 game003 symbol manifest scale / animation 规则附近，避免后续 agent 手动加第二份 app 内 priority 表。

## 9. 验收命令

基础检查：

```bash
git status --short --untracked-files=all
git diff --stat
```

rendercore：

```bash
CI=true pnpm --filter @slotclientengine/rendercore test
CI=true pnpm --filter @slotclientengine/rendercore typecheck
CI=true pnpm --filter @slotclientengine/rendercore lint
CI=true pnpm --filter @slotclientengine/rendercore format:check
```

验证 generator 保留 manifest priority：

```bash
CI=true pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --input-dir assets/game003-s1 --output-dir assets/game003-s1 --symbols WL,H1,H2,H3,H4,H5,L1,L2,L3,L4,L5,CO,CL,SC --scale 1
git diff -- assets/game003-s1/symbol-state-textures.manifest.json
```

期望：`WL`、`CL`、`SC` 的 `renderPriority` 仍保留，其它 symbol 不被无故写入 `renderPriority: 0`，`animations`、`scale` 和状态贴图路径不丢失。

game003：

```bash
CI=true pnpm --filter game003 generate:static-config
CI=true pnpm --filter game003 check:static-config
CI=true pnpm --filter game003 test
CI=true pnpm --filter game003 typecheck
CI=true pnpm --filter game003 lint
CI=true pnpm --filter game003 release:check
```

symbolsviewer：

```bash
CI=true pnpm --filter symbolsviewer test
CI=true pnpm --filter symbolsviewer typecheck
CI=true pnpm --filter symbolsviewer lint
CI=true pnpm --filter symbolsviewer format:check
```

最终 diff 检查：

```bash
git diff --check
git status --short --untracked-files=all
```

若某个命令失败，任务报告必须记录：

- 命令原文。
- 失败摘要。
- 是否与本任务相关。
- 已采取的修复或为什么暂时阻塞。

不要把未运行或失败的命令写成通过。

## 10. 二次遗漏检查

提交任务前必须做一次遗漏检查，并把结果写入任务报告：

- manifest parser：`renderPriority` 是否仍然遵守未知字段 fail-fast。
- generator：重新生成是否保留 `renderPriority` 和 `animations`，且不新增无意义 `0`。
- runtime：`RenderSymbol.renderPriority` 是否穿透 catalog、standalone catalog、reel registry、reel set。
- 排序：跨行、跨列、spin 中、落停后是否都不会破坏默认顺序或 mask；参与排序的 Pixi 父容器是否已经启用 `sortableChildren` 或显式排序。
- 坐标：共享 slot layer 后 slot 实际位置、reel bounce、`pixelOffsetY`、`getVisibleSymbolGeometrySnapshot(...)` 是否仍一致。
- pool：`RenderSymbolPool` release/acquire 后 priority 和 slot container `zIndex` 是否会重新同步。
- game003：priority 是否只来自 manifest，没有 app 内第二份表或 `SC/CL/WL` 排序分支；`symbol-animation-config.ts` 默认入口是否同步。
- symbolsviewer：是否能从 manifest 读到 priority，不把它当动画或 scale。
- docs：`packages/rendercore/README.md`、`apps/game003/README.md`、`apps/symbolsviewer/README.md`、`agents.md` 是否同步。
- generated：`game-static.generated.ts` / `game-loading.generated.ts` 是否只通过 generator 改动，未手改。
- 协议边界：没有改 live server、`gamecode`、URL query、server scene、本地公开轮带合同。
- 测试边界：如果测试写法变奇怪，优先修测试，不弱化生产逻辑。
- 视觉交接：若未做浏览器截图或用户确认，报告中明确 game003 视觉测试由用户完成。

## 11. 任务报告要求

完成后新增：

```text
tasks/83-rendercore-symbol-render-priority-[utctime].md
```

报告必须为中文，至少包含：

- 任务结论。
- 修改文件清单。
- manifest 字段合同最终说明。
- `WL/CL/SC` 的 game003 priority 配置值。
- 默认顺序保持方式说明。
- 执行过的验收命令和结果。
- 未执行或失败的命令及原因。
- 二次遗漏检查结果。
- 是否更新了 `agents.md`；若未更新，说明为什么不必要。
- game003 视觉验证状态：已由执行者验证、已由用户确认，或交由用户实测。

报告命名示例：

```bash
UTC_TIME="$(date -u +%y%m%d-%H%M%S)"
REPORT="tasks/83-rendercore-symbol-render-priority-${UTC_TIME}.md"
```

不要把任务报告写到 `docs/`，不要覆盖本任务计划文件。
