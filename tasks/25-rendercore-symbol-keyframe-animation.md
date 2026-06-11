# rendercore symbol keyframe animation 任务计划

## 1. 任务目标

在 `packages/rendercore` 已支持复合 symbol 的基础上，新增通用“layer 关键帧贴图动画”能力，让 `RS` 图标在 `win` 状态下播放礼盒开箱序列 `SC-1-0.png` 到 `SC-1-4.png`，共 5 帧。

本计划是完整可执行版本，不依赖其它上下文。执行者只需要阅读本文件，即可完成实现、测试、README、验收和任务报告。

核心目标：

- 基础能力优先放在 `packages/rendercore`；除非发现确实有跨非 symbol 场景复用价值，否则不改 `packages/pixiani`。
- 如果最终确实修改了 `packages/pixiani`，必须同步更新 `packages/pixiani/README.md`，并把 `@slotclientengine/pixiani` 的 lint/test/typecheck/build 纳入验收；其基础库覆盖率也不能低于 `80%`。
- `rendercore` 只实现通用能力，不写死 `RS`、`SC-1-0` 或具体 app 路径。
- `RS` 的具体关键帧资源声明和 `win` 动画绑定放在外部配置：
  - `assets/symbols/symbol-composites.json`
  - `assets/symbols/symbol-state-textures.manifest.json`
  - `apps/symbolsviewer/src/symbol-animation-config.ts`
  - `apps/reelsviewer/src/symbol-animation-config.ts`
  - `apps/game001/src/symbol-animation-config.ts`
- `RS` 的原 layer 1 资源不再使用 `assets/symbols/RS-1.png`，改用 `assets/symbols/SC-1-0.png` 作为静态普通态 layer 1。
- `RS` 的 5 帧开箱动画在所有进入 `win` 状态的 `RS` 实例上同步播放；这里的“播放 5 帧动画”指同一个 layer 的贴图序列随时间切换，不是把 5 张图同时叠加显示。
- 所有使用这组图标的 app 都需要更新并有测试覆盖：
  - `apps/symbolsviewer`
  - `apps/reelsviewer`
  - `apps/game001`
- `packages/rendercore` 测试覆盖率 statements / branches / functions / lines 都必须大于 `80%`，不能降低现有阈值。
- 更新 README：
  - `packages/rendercore/README.md`
  - `apps/symbolsviewer/README.md`
  - `apps/reelsviewer/README.md`
  - `apps/game001/README.md`
- 如果实现改变仓库协作规则、目录规范或根级脚本，再同步更新根目录 `agents.md`；否则在任务报告中说明无需更新。
- 任务完成后，在 `tasks/` 下新增中文任务报告，文件名为 `25-rendercore-symbol-keyframe-animation-[utctime].md`，其中 `utctime` 使用 UTC 年月日时分秒格式，例如 `260401-181300`。

## 2. 当前仓库事实

仓库事实：

- 根仓库是 `pnpm` + `turbo` TypeScript monorepo。
- Node.js 要求为 `>=24.0.0`，pnpm 要求为 `>=10.0.0`。
- 如果依赖下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

当前相关实现：

- `packages/rendercore` 已支持单图 symbol 与 layered symbol。
- `RenderSymbol` 当前有：
  - `baseLayer`
  - `layers`
  - `stateSprite`
  - `overlayLayer`
- `SymbolVisualLayer` 当前包含：
  - `index`
  - `texture`
  - `sprite`
- `resetBaseDisplay(context)` 当前会把每个 layer 的 sprite texture 重置为该 layer 的静态 `texture`。
- `createNamedSymbolAnimationResolver()` 当前通过“动画名 + 参数”绑定效果，内置：
  - `layerBounceScale`
  - `layerShineScale`
  - `layerStaggeredShineScale`
  - `singleSpriteAppear`
  - `singleSpriteWinShine`
- `assets/symbols/symbol-composites.json` 当前声明 `RS` layers 为：

```json
{
  "layers": ["./RS-0.png", "./RS-1.png", "./RS-2.png"]
}
```

- `assets/symbols/symbol-state-textures.manifest.json` 当前声明 `RS.normal.layers` 为：

```json
[
  "./RS-0.png",
  "./RS-1.png",
  "./RS-2.png"
]
```

- 当前 state texture 生成脚本是 `packages/rendercore/scripts/generate-symbol-state-textures.mjs`。
- 当前 generator / app loader 通过文件名形如 `${symbol}-${index}.png` 推导 layer index；`SC-1-0.png` 会被旧规则误判成 symbol `RS-1` 的 layer `0`，不能直接作为 `RS` 的 layer `1` 使用。
- `apps/symbolsviewer`、`apps/reelsviewer`、`apps/game001` 当前各自维护一份特殊 symbol 动画 profile，三份都需要更新。
- `apps/reelsviewer` 和 `apps/game001` 当前 spin 流程主要自动请求 `spinBlur` 和 `appear`；已有 `win` profile，但是否根据真实中奖线自动触发 `win` 不在当前代码契约内。本任务只保证请求 `RS` 的 `win` 状态时会播放关键帧序列，不在没有中奖线/slot 坐标契约的情况下发明新业务判定。

新增素材事实：

- `assets/symbols/SC-1-0.png`
- `assets/symbols/SC-1-1.png`
- `assets/symbols/SC-1-2.png`
- `assets/symbols/SC-1-3.png`
- `assets/symbols/SC-1-4.png`

## 3. 设计原则

### 3.1 基础库边界

`packages/rendercore` 负责：

- 扩展 symbol layer 的资源模型，使单个 layer 可以声明可选关键帧 textures。
- 校验 layer 静态 texture 与关键帧 textures 的合法性。
- 在 animation context 中暴露每个 layer 的关键帧 textures。
- 提供通用 named animation effect，例如 `layerTextureSequence`。
- 在 reset / complete / 状态切换时确保 layer texture 不遗留在中间帧。
- 更新状态贴图生成脚本，使复合图标的普通态合成使用 layer 的静态 texture；对 `RS` 来说就是 `SC-1-0.png`。

`packages/rendercore` 不负责：

- 写死 `RS`。
- 写死 `SC-1-0.png` 到 `SC-1-4.png`。
- 写死 `assets/symbols` 路径。
- 推断某次 spin 哪些坐标中奖。
- 在配置缺失时回退使用 `RS-1.png`。

app 和资源配置负责：

- 声明 `RS` layer 1 的静态 texture 是 `SC-1-0.png`。
- 声明 `RS` layer 1 的关键帧为 `SC-1-0.png` 到 `SC-1-4.png`。
- 把 `RS.win` profile 绑定到通用 `layerTextureSequence` effect。
- 保持 `SC`、`X2`、`X5`、`X10` 现有动画语义不被误改。

### 3.2 不做不必要兜底

必须 fail-fast：

- `RS` 配置了关键帧后，缺任意一帧都必须抛错。
- `RS` 的 layer 1 不能回退到 `RS-1.png`。
- keyframes 为空、包含空路径、重复 index、非法 layer index、尺寸不一致、未加载为 `Texture` 都必须抛错。
- 动画 profile 引用不存在的 layer 或该 layer 未声明 keyframes 时必须抛 `SymbolAnimationError`。
- 未知动画名、未知参数、错误参数类型、非法数值范围仍然必须抛错。
- 测试如果为了适配实现而产生奇怪写法，优先修改测试，不要改不该改的生产逻辑。

### 3.3 兼容旧行为

必须保持：

- 旧单图 symbol 行为不变。
- 旧 layered symbol 无 keyframes 时行为不变。
- `SC`、`X2`、`X5`、`X10` 不需要声明 keyframes。
- `getAsset(symbol)` 对 layered symbol 仍然抛错，不返回 layer `0`。
- `spinBlur` / `disabled` 状态贴图仍用合成后的单张 state texture，不在运行时逐层模糊或置灰。
- `resetBaseDisplay()` 回到普通态时，所有 layers 都恢复静态 texture、位置、缩放、旋转、透明度和可见性。

## 4. 资源模型建议

### 4.1 rendercore 类型扩展

修改 `packages/rendercore/src/symbol/types.ts`。

建议把 `SymbolLayerTextureSource` 扩展为：

```ts
export interface SymbolLayerTextureSource<TTexture = Texture | string> {
  readonly index: number;
  readonly texture: TTexture;
  readonly keyframes?: readonly TTexture[];
}

export interface SymbolVisualLayer {
  readonly index: number;
  readonly texture: Texture;
  readonly keyframes: readonly Texture[];
  readonly sprite: Sprite;
}
```

约定：

- `texture` 是 layer 的静态普通态贴图。
- `keyframes` 是可选关键帧序列；如果声明，必须包含 `texture` 对应的第一帧。
- 对 `RS` layer 1，`texture` 和 `keyframes[0]` 都是 `SC-1-0.png`。
- 对没有关键帧的 layer，`keyframes` 规范化为空数组。
- `resetBaseDisplay()` 一律用 `layer.texture` 恢复静态普通态。

### 4.2 manifest layer 声明扩展

旧字符串 layer 声明继续支持：

```json
"./SC-1.png"
```

新增对象 layer 声明，用于文件名不能安全推导 index 的场景：

```json
{
  "index": 1,
  "texture": "./SC-1-0.png",
  "keyframes": [
    "./SC-1-0.png",
    "./SC-1-1.png",
    "./SC-1-2.png",
    "./SC-1-3.png",
    "./SC-1-4.png"
  ]
}
```

规则：

- 字符串 layer 保持旧规则：文件名必须匹配 `${symbol}-${index}.png`。
- 对象 layer 使用显式 `index`，不要从文件名推导 index。
- 对象 layer 的 `texture` 必须是非空字符串。
- 对象 layer 的 `keyframes` 如果存在，必须是非空字符串数组。
- 如果声明 keyframes，`keyframes[0]` 必须等于 `texture`，否则 fail-fast。
- 所有 layer index 排序后必须从 `0` 开始连续。
- 同一 layer 的 `texture` 和所有 keyframes 尺寸必须一致。
- 同一 symbol 的所有 layers 静态 texture 尺寸必须一致。

### 4.3 RS 配置目标

更新 `assets/symbols/symbol-composites.json` 中 `RS`：

```json
"RS": {
  "layers": [
    "./RS-0.png",
    {
      "index": 1,
      "texture": "./SC-1-0.png",
      "keyframes": [
        "./SC-1-0.png",
        "./SC-1-1.png",
        "./SC-1-2.png",
        "./SC-1-3.png",
        "./SC-1-4.png"
      ]
    },
    "./RS-2.png"
  ]
}
```

重新生成后，`assets/symbols/symbol-state-textures.manifest.json` 中 `RS.normal.layers` 也必须保留等价的对象 layer 信息。`RS.spinBlur.png` 和 `RS.disabled.png` 必须基于 `RS-0 + SC-1-0 + RS-2` 合成，不能继续使用旧 `RS-1.png`。

`assets/symbols/RS-1.png` 不再作为任何配置、manifest、测试 fixture 或 README 示例引用。默认动作是从仓库删除该旧图；只有发现外部不可迁移原因时才允许保留，但必须在任务报告中写明原因，并证明运行时不会引用它。

## 5. 实施步骤

### 5.1 rendercore：类型、规范化和 RenderSymbol

修改文件：

- `packages/rendercore/src/symbol/types.ts`
- `packages/rendercore/src/symbol/catalog.ts`
- `packages/rendercore/src/symbol/render-symbol.ts`
- `packages/rendercore/src/symbol/ani.ts`
- `packages/rendercore/src/reel/symbol-registry.ts`

执行内容：

1. 在 `SymbolLayerTextureSource` 中加入 `keyframes?: readonly TTexture[]`。
2. 在 `SymbolVisualLayer` 中加入规范化后的 `keyframes: readonly Texture[]`。
3. 更新 `normalizeLayeredTextureSource()`：
   - 保留旧字符串/Texture source 兼容。
   - 校验 keyframes 必须是数组。
   - 校验 keyframes 内每个 texture/path 存在。
   - 对已加载 `Texture`，校验所有 keyframes 尺寸与 layer 静态 texture 一致。
   - clone / getTextureSet / getNormalTextureSource 时保留 keyframes。
4. 更新 `assertLoadedNormalSource()`：
   - layer texture 和 layer keyframes 都必须已经加载为 `Texture`。
   - URL 字符串必须明确报错。
5. 更新 `RenderSymbol` 创建 visual layers 的逻辑：
   - `sprite.texture` 初始等于 `layer.texture`。
   - `layer.keyframes` 透传到 animation context。
6. 更新 `resetBaseDisplay(context)`：
   - 每次 reset 都把 `layer.sprite.texture` 重置为 `layer.texture`。
   - 避免 `win` 播放中途切状态后残留 `SC-1-3` 等中间帧。
7. 更新 `reel/symbol-registry.ts` 的并行类型和 normalize 逻辑，避免 reels 路径丢失 keyframes。

注意：`catalog.ts` 与 `reel/symbol-registry.ts` 当前有相似的 normalize 逻辑。可以做最小重复修改；只有在不扩大范围且测试清晰时，才抽共享 helper。

### 5.2 rendercore：新增 named animation effect

修改文件：

- `packages/rendercore/src/symbol/named-animations.ts`
- `packages/rendercore/tests/symbol/named-animations.test.ts`

新增内置 effect，建议命名为 `layerTextureSequence`：

参数建议：

```ts
{
  layer: number,
  frameDurationSeconds?: number,
  delaySeconds?: number,
  durationRatio?: number
}
```

语义：

- 从 `context.layers[layer].keyframes` 读取 textures。
- 如果目标 layer 不存在，抛 `SymbolAnimationError`。
- 如果目标 layer 没有 keyframes 或 keyframes 少于 2 帧，抛 `SymbolAnimationError`。
- `frameDurationSeconds` 可选；不配置时按当前 profile 的有效播放窗口把所有 keyframes 均匀铺满。
- `delaySeconds` 默认为 `0`。
- `durationRatio` 默认为 `1`，用于让帧序列只占 profile 的一部分时长。
- `progress(0)` 显示第 0 帧。
- 中间进度按 `Math.floor(localProgress * frameCount)` 选择帧，最大不超过最后一帧。
- `complete()` 把 sprite texture 恢复为 `layer.texture`。

测试必须覆盖：

- 5 帧 keyframes 在 `win` 过程中按进度切换。
- `complete()` 后恢复到第 0 帧静态 texture。
- 与 `layerShineScale` 或 `layerStaggeredShineScale` 同时存在时不会互相破坏。
- layer 不存在时抛错。
- layer 没有 keyframes 时抛错。
- `frameDurationSeconds`、`delaySeconds`、`durationRatio` 非法时抛错。
- 未知参数仍抛错。

### 5.3 generator：支持显式 layer 对象和 keyframes

修改文件：

- `packages/rendercore/scripts/generate-symbol-state-textures.mjs`
- `packages/rendercore/tests/symbol/state-texture-generator.test.ts`

执行内容：

1. 扩展 `loadCompositeConfig()`，让 `layers` 数组同时支持：
   - 旧字符串：`"./SC-1.png"`
   - 新对象：`{ "index": 1, "texture": "./SC-1-0.png", "keyframes": [...] }`
2. 对新对象 layer：
   - 使用显式 `index`。
   - 用 `texture` 作为合成普通态的输入。
   - 校验 `keyframes[0] === texture`。
   - 校验所有 keyframes 文件存在并可读。
   - 校验所有 keyframes 尺寸与 layer 静态 texture 一致。
3. `createCompositeSymbolBuffer()` 继续只合成每个 layer 的静态 `texture`。
4. `createManifest()` 输出 layered normal 时保留对象 layer 的 keyframes 信息。
5. 保持旧 manifest 输出不变：没有 keyframes 的 symbol 仍输出字符串 layer 数组，避免无意义 diff。

测试必须覆盖：

- `RS` 风格对象 layer 生成 manifest，manifest 保留 `index`、`texture`、`keyframes`。
- 状态贴图生成使用 `texture` 而不是旧 `${symbol}-${index}.png`。
- `keyframes[0] !== texture` 抛错。
- keyframe 缺文件抛错。
- keyframe 尺寸不一致抛错。
- 旧字符串 composite 仍通过。

### 5.4 app asset loader：解析 manifest keyframes

修改文件：

- `apps/symbolsviewer/src/symbol-assets.ts`
- `apps/symbolsviewer/tests/symbol-assets.test.ts`
- `apps/reelsviewer/src/assets.ts`
- `apps/reelsviewer/tests/assets.test.ts`
- `apps/game001/src/assets.ts`
- `apps/game001/tests/assets.test.ts`

执行内容：

1. 把 `ParsedLayeredManifestNormal.layers` 从 `readonly string[]` 扩展为 `readonly ParsedManifestLayer[]`。
2. `ParsedManifestLayer` 支持旧字符串和新对象。
3. 旧字符串 layer 保持旧校验。
4. 新对象 layer：
   - 显式读取 `index`。
   - 读取 `texture`。
   - 读取可选 `keyframes`。
   - 从 `assetsByFileName` 加载对应 URL。
   - 输出 `SymbolLayerTextureSource<string>`，保留 `keyframes` URL 数组。
5. `loadReelSymbolTextures()` 和 `loadGame001SymbolTextures()` 需要把 layer keyframes 从 URL 加载成 `Texture`。
6. `game001` 的 `validateCompositeManifest()` 需要从旧 string list 比对改为 normalized layer 比对：
   - 比对 index。
   - 比对 texture 路径。
   - 如果 state manifest 和 composite manifest 都声明 keyframes，则必须完全一致。
   - 如果其中一边声明 keyframes、另一边没有，必须抛错。

测试必须覆盖：

- `RS` manifest 对象 layer 能生成 `normal.kind === "layered"`，layer 1 的 `texture` 是 `/assets/SC-1-0.png`，`keyframes` 是 5 个 URL。
- `SC-1-0.png` 不会被识别为独立 symbol `RS-1`。
- manifest 缺 `SC-1-3.png` 对应模块时抛错。
- `keyframes[0]` 不是 layer texture 时抛错。
- `game001` composite manifest 与 state manifest keyframes 不一致时抛错。

### 5.5 app 动画 profile：更新 RS.win

修改文件：

- `apps/symbolsviewer/src/symbol-animation-config.ts`
- `apps/symbolsviewer/tests/symbol-assets.test.ts`
- `apps/reelsviewer/src/symbol-animation-config.ts`
- `apps/reelsviewer/tests/reels-demo.test.ts`
- `apps/game001/src/symbol-animation-config.ts`
- `apps/game001/tests/game-demo.test.ts`

执行内容：

1. 保持 `SC`、`X2`、`X5`、`X10` 当前 profile 不变。
2. 单独为 `RS` 定义 profile，不再完全复用 `createThreeLayerBonusProfiles()`。
3. `RS.appear` 可以继续沿用三层 bonus appear：
   - layer `1` 弹动缩放。
   - layer `2` 扫光缩放。
4. `RS.win` 必须包含 `layerTextureSequence`：

```ts
win: Object.freeze({
  playback: "once",
  durationSeconds: 0.72,
  effects: Object.freeze([
    Object.freeze({
      name: "layerTextureSequence",
      params: Object.freeze({
        layer: 1
      })
    }),
    Object.freeze({
      name: "layerStaggeredShineScale",
      params: Object.freeze({
        layers: Object.freeze([1, 2]),
        maxScale: 1.2,
        staggerSeconds: 0.08
      })
    })
  ])
})
```

可根据素材节奏微调 `durationSeconds` 或 `frameDurationSeconds`，但三份 app 必须保持同一语义。

测试必须覆盖：

- `RS.win.effects` 包含 `layerTextureSequence`，目标 layer 是 `1`。
- `SC.win` 不包含 `layerTextureSequence`。
- `reelsviewer` 中手动请求可见 `RS` 的 `win` 时，layer 1 texture 会切到后续 keyframe。
- `game001` 中手动请求可见 `RS` 的 `win` 时，layer 1 texture 会切到后续 keyframe。

说明：如果后续业务要让 `game001` 根据真实 spin result 自动找出中奖 `RS` 坐标并播放 `win`，需要先定义结果数据到 reel 坐标的映射契约；本任务不靠猜测实现该业务规则。

### 5.6 资源与 manifest 更新

修改文件：

- `assets/symbols/symbol-composites.json`
- `assets/symbols/symbol-state-textures.manifest.json`
- `assets/symbols/RS.spinBlur.png`
- `assets/symbols/RS.disabled.png`

执行内容：

1. 确认新增素材存在：
   - `assets/symbols/SC-1-0.png`
   - `assets/symbols/SC-1-1.png`
   - `assets/symbols/SC-1-2.png`
   - `assets/symbols/SC-1-3.png`
   - `assets/symbols/SC-1-4.png`
2. 确保这 5 张新增 PNG 纳入最终变更，不要遗漏在 untracked 状态。
3. 默认删除旧文件 `assets/symbols/RS-1.png`；如果实际保留，必须在任务报告解释原因。
4. 更新 `symbol-composites.json` 中 `RS` layer 1。
5. 运行生成命令：

```bash
pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --symbols S00,S0,S1,S5,S10,SC,RS,X2,X5,X10 --composites assets/symbols/symbol-composites.json
```

6. 确认生成后的 state manifest 中：
   - `RS.normal.layers[1].index === 1`
   - `RS.normal.layers[1].texture === "./SC-1-0.png"`
   - `RS.normal.layers[1].keyframes` 是 `SC-1-0` 到 `SC-1-4`
   - 没有任何 `RS.normal` 引用 `./RS-1.png`
7. 确认 `RS.spinBlur.png` 和 `RS.disabled.png` 已更新。

### 5.7 README 和协作文件

修改文件：

- `packages/rendercore/README.md`
- `apps/symbolsviewer/README.md`
- `apps/reelsviewer/README.md`
- `apps/game001/README.md`

README 必须说明：

- rendercore 支持 layer keyframes。
- `SymbolLayerTextureSource.keyframes` 的含义。
- `layerTextureSequence` 的参数和 fail-fast 行为。
- `RS` 使用 `SC-1-0` 作为普通态 layer 1。
- `RS.win` 会播放 `SC-1-0` 到 `SC-1-4`。
- `RS.spinBlur` / `RS.disabled` 基于 `SC-1-0` 合成。
- 三个 app 的 RS 动画配置入口。

`agents.md` 判断：

- 如果只新增 rendercore API、资源 manifest schema、app 配置和 README，不改变仓库协作规则、目录规范或根级脚本，则不更新 `agents.md`，并在任务报告写明原因。
- 如果新增了新的根级命令、目录约定或协作要求，则同步更新根目录 `agents.md`。
- 如果最终修改了 `packages/pixiani`，还需要按 `packages/pixiani/agents.md` 的包内约束检查是否需要同步更新该包内协作说明。

## 6. 测试计划

### 6.1 rendercore 单测

必须新增或更新：

- `packages/rendercore/tests/symbol/catalog.test.ts`
- `packages/rendercore/tests/symbol/render-symbol.test.ts`
- `packages/rendercore/tests/symbol/named-animations.test.ts`
- `packages/rendercore/tests/symbol/state-texture-generator.test.ts`
- `packages/rendercore/tests/reel/symbol-registry.test.ts`

覆盖点：

- layer keyframes 被规范化、clone、传入 `RenderSymbol`。
- 未加载 URL keyframes 创建 `RenderSymbol` 时明确报错。
- loaded Texture keyframes 尺寸不一致报错。
- `resetBaseDisplay()` 恢复静态 texture。
- `layerTextureSequence` 正常播放 5 帧。
- `layerTextureSequence` 参数非法 fail-fast。
- reel registry 不丢 keyframes。
- generator 支持对象 layer，并保持旧字符串 layer 兼容。

### 6.2 app 单测

必须新增或更新：

- `apps/symbolsviewer/tests/symbol-assets.test.ts`
- `apps/reelsviewer/tests/assets.test.ts`
- `apps/reelsviewer/tests/reels-demo.test.ts`
- `apps/game001/tests/assets.test.ts`
- `apps/game001/tests/game-demo.test.ts`

覆盖点：

- 三个 app 都能解析 `RS` layer 1 keyframes。
- 三个 app 都不把 `SC-1-0` 到 `SC-1-4` 当成独立 displayable symbol。
- 三个 app 的 `RS.win` 配置包含关键帧 effect。
- `symbolsviewer` 的 displayable symbols 仍为：
  - `S00`
  - `S0`
  - `S1`
  - `S5`
  - `S10`
  - `SC`
  - `RS`
  - `X2`
  - `X5`
  - `X10`
- `reelsviewer` 和 `game001` 手动请求可见 `RS` 的 `win` 后，layer 1 texture 会按 keyframes 变化。

## 7. 验收命令

先执行 package 级验收：

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
pnpm --filter game001 lint
pnpm --filter game001 test
pnpm --filter game001 typecheck
pnpm --filter game001 build
```

如果实际修改了 `packages/pixiani`，追加执行：

```bash
pnpm --filter @slotclientengine/pixiani lint
pnpm --filter @slotclientengine/pixiani test
pnpm --filter @slotclientengine/pixiani typecheck
pnpm --filter @slotclientengine/pixiani build
```

再执行根级验收：

```bash
pnpm lint
pnpm test
pnpm typecheck
pnpm build
git diff --check
```

覆盖率验收：

- `pnpm --filter @slotclientengine/rendercore test` 输出中 statements / branches / functions / lines 都必须 `> 80%`。
- 不能修改 `packages/rendercore/vite.config.ts` 来降低 coverage thresholds。

资源引用验收：

```bash
find assets apps packages -name 'RS-1.png' -print
rg -n "RS-1\\.png" assets apps packages --glob '!tasks/**'
rg -n '"SC-1-0\\.png"|"SC-1-1\\.png"|"SC-1-2\\.png"|"SC-1-3\\.png"|"SC-1-4\\.png"' assets/symbols/symbol-composites.json assets/symbols/symbol-state-textures.manifest.json apps packages
rg -n '"sharp"|from "sharp"|node:fs|node:path|generate-symbol-state-textures' packages/rendercore/dist apps/symbolsviewer/dist apps/reelsviewer/dist apps/game001/dist
```

期望：

- `find` 命令默认无输出，证明旧 `RS-1.png` 已删除；若有输出，必须在任务报告解释保留原因。
- 第一个 `rg` 命令无输出，或只出现任务历史/报告中允许的说明；运行时配置、README、源码和测试不能再引用旧 `RS-1.png`。
- 第二个 `rg` 命令能看到 `SC-1-0` 到 `SC-1-4` 的配置和测试引用。
- 第三个 `rg` 命令无输出，证明 `sharp` 和 Node-only generator 没进入浏览器相关 dist。

需要执行本地浏览器 smoke 验收，优先用 Codex Browser；如果环境限制导致不能执行，任务报告必须写明未执行及原因，不能暗示已验收。下面三个 dev server 需要分别启动，若端口冲突则按 Vite 提示改用可用端口：

```bash
pnpm --filter symbolsviewer dev -- --host 0.0.0.0
pnpm --filter reelsviewer dev -- --host 0.0.0.0
pnpm --filter game001 dev -- --host 0.0.0.0
```

浏览器验收重点：

- `symbolsviewer` 默认序列切到 `win` 时，`RS` 礼盒 layer 播放开箱帧。
- `SC`、`X2`、`X5`、`X10` 动画不回归。
- `reelsviewer`、`game001` 页面能正常加载资源，不因 manifest schema 扩展报错；如页面没有自动触发 `win`，至少通过已有测试或临时调试入口证明请求可见 `RS.win` 后 keyframes 会推进。
- 如果没有执行浏览器验收，任务报告必须明确写“未执行浏览器验收”，不能暗示已验收。

## 8. 完成标准

任务完成必须同时满足：

- `rendercore` 支持通用 layer keyframes。
- `layerTextureSequence` 已有单测覆盖。
- `RS` 的 layer 1 静态贴图改为 `SC-1-0.png`。
- `assets/symbols/RS-1.png` 默认已删除；如保留，任务报告有明确原因且运行时引用验收通过。
- `RS.win` 在 `symbolsviewer`、`reelsviewer`、`game001` 都绑定 5 帧关键帧动画。
- `RS.spinBlur.png` / `RS.disabled.png` 基于 `SC-1-0.png` 重新生成。
- 所有 package 级和根级验收命令通过。
- `rendercore` coverage 四项均大于 `80%`。
- README 已更新。
- `agents.md` 已按必要性判断并在报告说明。
- 任务报告已写入 `tasks/25-rendercore-symbol-keyframe-animation-[utctime].md`。

## 9. 任务报告要求

报告文件名：

```text
tasks/25-rendercore-symbol-keyframe-animation-[utctime].md
```

报告内容必须包含：

- 实现摘要。
- 修改文件清单。
- RS 资源契约变更说明。
- 是否删除或保留 `assets/symbols/RS-1.png`，以及为什么。
- README 更新清单。
- `agents.md` 是否更新及原因。
- 所有验收命令及结果。
- `rendercore` coverage 实际数值。
- 是否执行浏览器验收；若未执行，明确写未执行。
- 已知限制：本任务不新增中奖线坐标推断；只保证现有 `win` 状态请求下播放关键帧动画。
