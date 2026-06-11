# rendercore composite symbols 任务计划

## 1. 任务目标

继续完善 `packages/rendercore` 的 symbol 系统，支持“复杂 symbol”：一个图标由多张同尺寸图层叠加而成，图层编号 `0` 在最下面，编号越大越靠上。核心渲染、状态动画、动画配置解析和资源校验必须放在 `packages/rendercore`；`apps/symbolsviewer` 只负责 viewer 的资源绑定、动画参数配置和 UI 展示。

本计划是完整可执行版本，不依赖任何其它上下文。执行者只需要阅读本文件，即可完成实现、测试、README、验收和任务报告。

核心目标：

- `packages/rendercore` 支持单图 symbol 和多层 symbol 两种渲染输入。
- 特殊图标 `SC`、`RS`、`X2`、`X5`、`X10` 在 `apps/symbolsviewer` 中不能再直接使用 `SC.png`、`RS.png`、`X2.png`、`X5.png`、`X10.png` 作为普通态主图，必须使用拆层资源组合：
  - `SC`: `SC-0.png`、`SC-1.png`、`SC-2.png`
  - `RS`: `RS-0.png`、`RS-1.png`、`RS-2.png`
  - `X2`: `X2-0.png`、`X2-1.png`
  - `X5`: `X5-0.png`、`X5-1.png`
  - `X10`: `X10-0.png`、`X10-1.png`
- 拆层规则：
  - 一个 symbol 可拆为 `n` 张图。
  - 每张图大小必须一致。
  - layer `0` 在最下面，layer `1` 叠在 `0` 上，以此类推。
  - layer 下标必须从 `0` 开始连续，缺层、重复、乱序、尺寸不一致都必须 fail-fast 抛错。
- `spinBlur` 和 `disabled` 状态贴图必须先把多层 symbol 合成完整图标，再基于合成结果生成；不能分别模糊/置灰每个图层后再叠，也不能回退使用旧单图。
- 动画需要用“名字 + 参数配置”绑定，同一个 symbol 的不同状态可以配置不同动画；不同 symbol 的同一状态也可以配置不同动画。
- `SC` 和 `RS` 的动画：
  - `appear`: layer `0` 不变；layer `1` 上下弹动并小幅缩放，最大缩放约 `1.2`；layer `2` 缩放到约 `1.2` 并扫光。
  - `win`: layer `0`、`1`、`2` 按不同速率或延迟做扫光和缩放，节奏错开，缩放最大约 `1.2`。
- `X2`、`X5`、`X10` 的动画：
  - `appear`: layer `0` 不变；layer `1` 缩放到约 `1.2` 并扫光。
  - `win`: layer `0`、`1` 按不同速率或延迟做扫光和缩放，节奏错开，缩放最大约 `1.2`。
- `apps/symbolsviewer` 功能不变：
  - 仍展示 `normal`、`appear`、`win`、`spinBlur`、`disabled`。
  - 仍支持播放/暂停、下一状态、重置、默认 stable 状态选择、序列增加/移除/调整。
  - 展示列表仍是 paytable 和图片资源交集，当前应包含 `S00`、`S0`、`S1`、`S5`、`S10`、`SC`、`RS`、`X2`、`X5`、`X10`。
  - 新实现后，上述 5 个特殊图标必须以多层方式展示和动画。
- 更新 `packages/rendercore/README.md` 和 `apps/symbolsviewer/README.md`；如果实现改变仓库协作规则、目录规范或基础脚本，再同步更新根目录 `agents.md`，否则在任务报告中说明无需更新。
- `rendercore` 是核心库，必须有足够测试用例；`pnpm --filter @slotclientengine/rendercore test` 的实际 coverage lines/functions/branches/statements 必须全部大于 `80%`，不能降低现有阈值。
- 任务完成后，在 `tasks/` 下新增中文任务报告，文件名为 `23-rendercore-composite-symbols-[utctime].md`，其中 `utctime` 使用 UTC 年月日时分秒格式，例如 `260401-181300`。

## 2. 当前仓库事实

仓库事实：

- 根仓库是 `pnpm` + `turbo` TypeScript monorepo。
- Node.js 要求为 `>=24.0.0`，pnpm 要求为 `>=10.0.0`。
- workspace 匹配 `apps/*` 和 `packages/*`。
- 根级命令包括：
  - `pnpm build`
  - `pnpm lint`
  - `pnpm test`
  - `pnpm typecheck`
  - `pnpm format`
  - `pnpm format:check`
- 根目录协作文件路径是 `agents.md`。
- 如果执行 `pnpm install` 或依赖下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

`rendercore` 当前事实：

- package 路径：`packages/rendercore`。
- 包名：`@slotclientengine/rendercore`。
- 当前已导出 symbol 和 reel 模块。
- 当前 symbol 相关核心文件：
  - `packages/rendercore/src/symbol/types.ts`
  - `packages/rendercore/src/symbol/catalog.ts`
  - `packages/rendercore/src/symbol/render-symbol.ts`
  - `packages/rendercore/src/symbol/ani.ts`
  - `packages/rendercore/src/symbol/animation-resolver.ts`
  - `packages/rendercore/src/symbol/state-machine.ts`
  - `packages/rendercore/src/symbol/sequence.ts`
  - `packages/rendercore/src/symbol/errors.ts`
  - `packages/rendercore/src/symbol/index.ts`
- 当前 `RenderSymbol` 只有一个主 `Sprite` 和一个 `overlayLayer`，适合单图 symbol；本任务需要扩展为可管理多个 layer sprite。
- 当前 `SymbolTextureSet` 支持 `normal` 和 `states`，状态图用于 `spinBlur` / `disabled`；本任务需要扩展为支持 `single` 和 `layered` 两种普通态来源。
- 当前默认 symbol 状态包括：
  - `normal`
  - `spinBlur`
  - `disabled`
  - `appear`
  - `win`
- 当前 `spinBlur -> normal`、`disabled -> normal` 是状态等价配置；默认静态 ani 会按 `requestedState` 选择状态贴图。
- 当前状态贴图生成脚本：
  - `packages/rendercore/scripts/generate-symbol-state-textures.mjs`
  - 使用 `sharp` 在 Node 侧生成 `*.spinBlur.png` 和 `*.disabled.png`
  - 当前按单张普通图生成，本任务需要支持多层合成后再生成状态图。
- 当前 `packages/rendercore/vite.config.ts` coverage 阈值 lines/functions/branches/statements 均为 `80`；本任务不能降低阈值。

`apps/symbolsviewer` 当前事实：

- app 路径：`apps/symbolsviewer`。
- 当前从 `assets/gamecfg/game2.json` 读取 paytable。
- 当前用 `import.meta.glob("../../../assets/symbols/*.png")` 读取 symbol 资源。
- 当前用 `assets/symbols/symbol-state-textures.manifest.json` 读取状态贴图 manifest。
- 当前核心文件：
  - `apps/symbolsviewer/src/main.ts`
  - `apps/symbolsviewer/src/symbol-assets.ts`
  - `apps/symbolsviewer/src/viewer-sequence.ts`
  - `apps/symbolsviewer/src/styles.css`
  - `apps/symbolsviewer/README.md`
- 当前 viewer 测试：
  - `apps/symbolsviewer/tests/symbol-assets.test.ts`

`apps/reelsviewer` 相关事实：

- `apps/reelsviewer` 也读取 `assets/symbols/symbol-state-textures.manifest.json`。
- 当前 `apps/reelsviewer/src/assets.ts` 期望 manifest 中每个 symbol 的 `normal` 是 string。
- 当前 `packages/rendercore/src/reel/symbol-registry.ts` 的 `ReelSymbolRegistryModel` 按单张 `Texture` 计算 cell size 并创建 `RenderSymbol`。
- 因此本任务如果把共享 manifest 的 `normal` 扩展为 layered object，必须同步更新 `apps/reelsviewer` 和 rendercore reel registry 的资源解析，避免 root build/test 因共享资产契约变化而回归。

当前资源事实：

- `assets/gamecfg/game2.json` paytable 当前包含：
  - `BN`
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
- `assets/symbols` 当前包含普通图：
  - `CO.png`
  - `RS.png`
  - `S00.png`
  - `S0.png`
  - `S1.png`
  - `S5.png`
  - `S10.png`
  - `SC.png`
  - `SX.png`
  - `X2.png`
  - `X5.png`
  - `X10.png`
- `assets/symbols` 当前包含拆层图：
  - `SC-0.png`、`SC-1.png`、`SC-2.png`
  - `RS-0.png`、`RS-1.png`、`RS-2.png`
  - `X2-0.png`、`X2-1.png`
  - `X5-0.png`、`X5-1.png`
  - `X10-0.png`、`X10-1.png`
- `assets/symbols` 当前包含状态图：
  - `*.spinBlur.png`
  - `*.disabled.png`
  - `symbol-state-textures.manifest.json`
- `BN` 是 paytable 中的空图标，无普通图，不进入 `symbolsviewer` 展示。
- `CO.png` 和 `SX.png` 是孤儿图片，不在 `game2.json` paytable 中，不进入 `symbolsviewer` 展示。

## 3. 设计原则

### 3.1 核心库和 viewer 边界

`packages/rendercore` 负责：

- 多层 symbol 的类型定义、资源规范化、资源校验。
- 多层 symbol 的 Pixi display object 构建。
- symbol catalog 和 reel registry 都能理解同一套单图 / 多层资源输入。
- layer sprite 的锚点、位置、尺寸一致性、z-order 管理。
- 状态切换时对单图和多层 symbol 的一致 reset 行为。
- 名字加参数的动画配置模型。
- 内置通用 layer 动画 primitive，例如 layer 弹跳缩放、layer 扫光缩放、错峰扫光缩放。
- 状态贴图生成脚本中“先合成再生成”的核心规则。

`packages/rendercore` 不负责：

- 写死 `SC`、`RS`、`X2`、`X5`、`X10` 的 viewer 参数。
- 写死 `assets/symbols` 路径。
- 写死 `assets/gamecfg/game2.json`。
- 创建页面按钮、DOM 面板或 viewer 交互。
- 静默把缺失 layer 替换成旧单图。

`apps/symbolsviewer` 负责：

- 声明哪些 symbol 在当前 demo 中使用多层资源。
- 绑定 `SC`、`RS`、`X2`、`X5`、`X10` 的 layer 文件。
- 配置每个特殊 symbol 在 `appear` 和 `win` 状态下使用哪组命名动画和参数。
- 继续展示和控制全局状态序列。

### 3.2 不做不必要兜底

本任务必须保持 fail-fast：

- 特殊 symbol 已配置为多层时，缺 layer 不能回退到 `SC.png` / `RS.png` / `X2.png` / `X5.png` / `X10.png`。
- layer 编号不连续必须抛错。
- layer 不是从 `0` 开始必须抛错。
- layer 尺寸不一致必须抛错。
- 动画配置引用不存在的 layer index 必须抛错。
- 动画配置使用未知动画名称必须抛错。
- 动画配置参数类型错误必须抛错。
- 有普通态资源的 displayable symbol 缺少 `spinBlur` 或 `disabled` 必需状态贴图时必须抛错。
- manifest 引用不存在的普通图、layer 图或状态图必须抛错。
- 如果测试为了适配实现而推动奇怪写法，优先修改测试，不要改不该改的生产逻辑。

### 3.3 保持旧单图行为

本任务不能破坏已有单图 symbol：

- `S00`、`S0`、`S1`、`S5`、`S10` 仍按单图 symbol 渲染。
- 旧的 `SymbolAssetInput = Texture | string | SymbolTextureSet` 使用方式应尽量兼容。
- 旧的默认动画仍适用于单图 symbol：
  - `normal`: 静态单帧。
  - `appear`: 单次放大弹回。
  - `win`: 单次扫光。
- 旧的状态机语义不能改变：
  - `once` 完成后回当前默认状态。
  - `loop` 切换等 loop 边界。
  - `static` 可立即切换。
  - `spinBlur` / `disabled` 可以保持等价到 `normal`，但画面按 `requestedState` 选择状态贴图。

## 4. 数据模型建议

### 4.1 rendercore 类型扩展

修改 `packages/rendercore/src/symbol/types.ts`，建议新增这些类型。最终命名可微调，但语义必须清晰。

```ts
export interface SymbolLayerTextureSource<TTexture = Texture | string> {
  readonly index: number;
  readonly texture: TTexture;
}

export interface SingleSymbolTextureSource<TTexture = Texture | string> {
  readonly kind: "single";
  readonly texture: TTexture;
}

export interface LayeredSymbolTextureSource<TTexture = Texture | string> {
  readonly kind: "layered";
  readonly layers: readonly SymbolLayerTextureSource<TTexture>[];
}

export type SymbolNormalTextureSource<TTexture = Texture | string> =
  | SingleSymbolTextureSource<TTexture>
  | LayeredSymbolTextureSource<TTexture>;

export interface SymbolTextureSet<TTexture = Texture | string> {
  readonly normal: TTexture | SymbolNormalTextureSource<TTexture>;
  readonly states?: Readonly<Partial<Record<SymbolStateId, TTexture>>>;
}

export interface SymbolVisualLayer {
  readonly index: number;
  readonly sprite: Sprite;
}
```

兼容策略：

- 旧写法 `S00: Texture.WHITE` 规范化为 `{ kind: "single", texture: Texture.WHITE }`。
- 旧写法 `S00: { normal: Texture.WHITE, states: {...} }` 规范化为单图 source。
- 新写法 `SC: { normal: { kind: "layered", layers: [...] }, states: {...} }` 规范化为多层 source。
- `getTextureSet(symbol)` 必须能返回规范化后的完整 source。
- 如果继续保留 `getAsset(symbol)`，它只能作为旧 API 返回单图 symbol 的普通 texture；对 layered symbol 应抛出明确错误，提示使用 `getTextureSet(symbol)` 或新增的 `getNormalTextureSource(symbol)`。不要返回 layer `0` 冒充普通图。

### 4.2 RenderSymbol 扩展

修改 `packages/rendercore/src/symbol/render-symbol.ts`：

- `RenderSymbol` 内部新增 `symbolLayer` 或 `baseLayer` 容器，用于承载普通态 display object。
- 单图 symbol：
  - 创建一个 `Sprite`。
  - 该 sprite 放入 `baseLayer`。
  - `layers` 暴露为只有一个元素，index 为 `0`。
- 多层 symbol：
  - 按 layer index 升序创建多个 `Sprite`。
  - 每个 sprite anchor 设为 `0.5`。
  - 所有 layer sprite 的原点重合。
  - 按 `0, 1, 2...` 顺序 addChild，确保 `0` 在下面。
- `overlayLayer` 仍用于扫光 overlay，但扫光应能绑定到单个 layer，不只能扫主 sprite。
- `SymbolAnimationContext` 扩展：

```ts
export interface SymbolAnimationContext {
  readonly code: number;
  readonly symbol: string;
  readonly pays: readonly number[];
  readonly requestedState: SymbolStateId;
  readonly resolvedState: SymbolStateId;
  readonly state: SymbolStateDefinition;
  readonly texture: Texture; // 兼容旧单图 resolver；多层时可指向 layer 0 或抛弃依赖
  readonly stateTextures: Readonly<Partial<Record<SymbolStateId, Texture>>>;
  readonly requiredStateTextures: readonly SymbolStateId[];
  readonly root: Container;
  readonly baseLayer: Container;
  readonly sprite: Sprite; // 兼容旧 resolver；多层时建议指向 layer 0，复杂动画必须用 layers
  readonly layers: readonly SymbolVisualLayer[];
  readonly overlayLayer: Container;
}
```

注意：

- 旧默认单图动画可以继续使用 `context.sprite`。
- 新复杂动画必须使用 `context.layers`，不能整体缩放 `root` 或 `baseLayer`，否则会影响本应不动的 layer `0`。
- `resetBaseDisplay(context)` 必须重置所有 layer sprite 的 texture、alpha、rotation、position、scale、mask，并清空 overlay。
- 进入 `spinBlur` 或 `disabled` 时，如果存在对应状态贴图，应显示合成后的单张状态图。推荐实现方式：
  - `baseLayer` 隐藏或移除普通 layer sprites。
  - 使用一个 `stateSprite` 显示 `context.stateTextures[requestedState]`。
  - 回到 `normal`、`appear`、`win` 时恢复普通 layers。
  - 该切换逻辑必须由 rendercore 统一处理，viewer 不直接操作 Pixi child。

## 5. 命名动画设计

### 5.1 新增动画配置模型

在 `packages/rendercore/src/symbol/ani.ts` 或新增 `packages/rendercore/src/symbol/named-animations.ts` 中实现名字加参数的动画机制。

建议新增：

```ts
export interface SymbolNamedAnimationSpec {
  readonly name: string;
  readonly params?: Readonly<Record<string, unknown>>;
}

export interface SymbolAnimationProfile {
  readonly playback: SymbolPlaybackKind;
  readonly durationSeconds: number;
  readonly effects: readonly SymbolNamedAnimationSpec[];
}

export interface NamedSymbolAnimationRegistry {
  readonly [name: string]: (context: SymbolAnimationContext, params: Readonly<Record<string, unknown>>) => SymbolLayerEffect;
}
```

其中 `SymbolLayerEffect` 可以是内部接口，用于在 `reset`、`progress`、`complete` 阶段驱动一个或多个 layer。不要把参数解析散落在 viewer 中，viewer 只提供 JSON-like 配置，rendercore 负责校验和执行。

### 5.2 内置动画 primitive

rendercore 至少提供以下命名动画：

1. `layerBounceScale`
   - 参数：
     - `layer`: number
     - `maxScale`: number，默认 `1.2`
     - `offsetY`: number，建议默认 `-10`
     - `cycles`: number，默认 `1`
     - `delaySeconds`: number，默认 `0`
   - 行为：指定 layer 上下弹动并缩放，完成后 position 和 scale 回到初始值。

2. `layerShineScale`
   - 参数：
     - `layer`: number
     - `maxScale`: number，默认 `1.2`
     - `shineAlpha`: number，默认 `0.95`
     - `shineWidthRatio`: number，默认 `0.28`
     - `delaySeconds`: number，默认 `0`
     - `durationRatio`: number，默认 `1`
   - 行为：指定 layer 做缩放和扫光，扫光 overlay 只以该 layer 的 texture 为源，不影响其它 layer。

3. `layerStaggeredShineScale`
   - 参数：
     - `layers`: number[]
     - `maxScale`: number，默认 `1.2`
     - `staggerSeconds`: number，默认 `0.08`
     - `durationRatio`: number，默认 `0.78`
   - 行为：多层按 layer 顺序错峰做扫光和缩放；完成后所有 layer 和 overlay 复位。

4. `singleSpriteAppear`
   - 兼容现有单图 `appear`，默认最大缩放可继续是现有行为或在 viewer 参数中指定。

5. `singleSpriteWinShine`
   - 兼容现有单图 `win` 扫光。

要求：

- 所有内置动画都必须校验参数类型和范围。
- 引用不存在的 layer 必须抛 `SymbolAnimationError`。
- 动画结束后必须清理 overlay、mask、alpha、scale、position。
- 同一个 state 可以组合多个 effect，并在同一个 `ManualSymbolAni` 或等价一次性 ani 内并行执行。
- resolver 返回的 playback 必须继续匹配状态定义，不允许为了测试绕过现有校验。

### 5.3 symbolsviewer 动画配置

新增或修改 `apps/symbolsviewer/src/symbol-animation-config.ts`，建议配置如下。示例必须是可执行的 TypeScript 配置，不要在真实代码中留下字符串占位或半成品对象：

```ts
const createThreeLayerBonusProfiles = () => ({
  appear: {
    playback: "once",
    durationSeconds: 0.46,
    effects: [
      { name: "layerBounceScale", params: { layer: 1, maxScale: 1.2, offsetY: -12 } },
      { name: "layerShineScale", params: { layer: 2, maxScale: 1.2 } }
    ]
  },
  win: {
    playback: "once",
    durationSeconds: 0.72,
    effects: [
      {
        name: "layerStaggeredShineScale",
        params: { layers: [0, 1, 2], maxScale: 1.2, staggerSeconds: 0.08 }
      }
    ]
  }
});

const createTwoLayerMultiplierProfiles = () => ({
  appear: {
    playback: "once",
    durationSeconds: 0.42,
    effects: [{ name: "layerShineScale", params: { layer: 1, maxScale: 1.2 } }]
  },
  win: {
    playback: "once",
    durationSeconds: 0.62,
    effects: [
      {
        name: "layerStaggeredShineScale",
        params: { layers: [0, 1], maxScale: 1.2, staggerSeconds: 0.1 }
      }
    ]
  }
});

export const SYMBOL_VIEWER_ANIMATION_PROFILES = Object.freeze({
  SC: createThreeLayerBonusProfiles(),
  RS: createThreeLayerBonusProfiles(),
  X2: createTwoLayerMultiplierProfiles(),
  X5: createTwoLayerMultiplierProfiles(),
  X10: createTwoLayerMultiplierProfiles()
});
```

语义要求：

- `SC` / `RS` 的真实配置必须等价于：

```ts
{
  SC: {
    appear: {
      playback: "once",
      durationSeconds: 0.46,
      effects: [
        { name: "layerBounceScale", params: { layer: 1, maxScale: 1.2, offsetY: -12 } },
        { name: "layerShineScale", params: { layer: 2, maxScale: 1.2 } }
      ]
    },
    win: {
      playback: "once",
      durationSeconds: 0.72,
      effects: [
        { name: "layerStaggeredShineScale", params: { layers: [0, 1, 2], maxScale: 1.2, staggerSeconds: 0.08 } }
      ]
    }
  }
}
```

- `X2` / `X5` / `X10` 的真实配置必须等价于 layer `1` appear、`[0, 1]` win。
- 可以使用纯配置 helper 复用对象创建逻辑，但导出的配置里 5 个特殊 symbol 都必须有明确 profile。
- helper 不能返回共享可变对象；配置应 `Object.freeze` 或保持只读，避免运行时 UI 操作意外改动全局动画参数。


## 6. 资源和 manifest 设计

### 6.1 新增复合 symbol 配置

新增文件：

```text
assets/symbols/symbol-composites.json
```

建议内容：

```json
{
  "version": 1,
  "symbols": {
    "SC": {
      "layers": ["./SC-0.png", "./SC-1.png", "./SC-2.png"]
    },
    "RS": {
      "layers": ["./RS-0.png", "./RS-1.png", "./RS-2.png"]
    },
    "X2": {
      "layers": ["./X2-0.png", "./X2-1.png"]
    },
    "X5": {
      "layers": ["./X5-0.png", "./X5-1.png"]
    },
    "X10": {
      "layers": ["./X10-0.png", "./X10-1.png"]
    }
  }
}
```

校验规则：

- `version` 必须是 `1`。
- `symbols` 必须是对象。
- 每个 symbol 的 `layers` 必须是非空数组。
- 文件名必须符合 `${symbol}-${index}.png`。
- index 必须从 `0` 连续到 `n - 1`。
- 每个 layer 文件必须存在。
- 每个 layer 图片尺寸必须一致。

### 6.2 更新状态贴图 manifest

修改 `packages/rendercore/scripts/generate-symbol-state-textures.mjs`，支持复合配置：

- 新增参数：
  - `--composites <path>`：默认读取 `assets/symbols/symbol-composites.json`；文件不存在时可视为无复合配置，但如果 `--symbols` 中包含需要复合的特殊 symbol 且配置缺失，应由 viewer 测试或资源解析失败暴露。
  - `--symbols` 保持兼容。
  - `--input-dir`、`--output-dir` 保持兼容。
- 对单图 symbol：
  - 行为保持现状，基于 `${symbol}.png` 生成 `${symbol}.spinBlur.png` 和 `${symbol}.disabled.png`。
- 对复合 symbol：
  - 用 `sharp` 读取所有 layer。
  - 校验尺寸一致。
  - 先按 layer 顺序合成一张完整 image buffer。
  - 再基于合成 buffer 生成 `${symbol}.spinBlur.png` 和 `${symbol}.disabled.png`。
  - manifest 中 `normal` 不再是 `"./SC.png"` 这种单图路径，而是声明 layers。

建议新 manifest 结构保持兼容：

```json
{
  "version": 1,
  "states": ["spinBlur", "disabled"],
  "settings": {
    "spinBlur": { "kind": "verticalBoxBlur", "kernelHeight": 21 },
    "disabled": { "kind": "grayscale", "brightness": 0.72 }
  },
  "symbols": {
    "S00": {
      "normal": "./S00.png",
      "spinBlur": "./S00.spinBlur.png",
      "disabled": "./S00.disabled.png"
    },
    "SC": {
      "normal": {
        "kind": "layered",
        "layers": ["./SC-0.png", "./SC-1.png", "./SC-2.png"]
      },
      "spinBlur": "./SC.spinBlur.png",
      "disabled": "./SC.disabled.png"
    }
  }
}
```

兼容规则：

- `normal` 是 string 时表示单图。
- `normal.kind === "layered"` 时表示多层。
- viewer parser 必须同时支持这两种结构。
- 对 `SC`、`RS`、`X2`、`X5`、`X10`，manifest 必须使用 layered normal；如果仍是 `"./SC.png"` 这类 string，测试必须失败。

生成命令：

```bash
pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --symbols S00,S0,S1,S5,S10,SC,RS,X2,X5,X10 --composites assets/symbols/symbol-composites.json
```

如果最终实现把 `--composites` 做成默认读取，也仍建议在任务报告中记录显式命令，方便复现。

## 7. 具体实施步骤

### 7.1 基线确认

执行前先确认工作区状态和现有行为：

```bash
git status --short
pnpm --filter @slotclientengine/rendercore test
pnpm --filter symbolsviewer test
```

如果已有未提交改动，不要回滚用户改动；只围绕本任务修改必要文件。

### 7.2 扩展 rendercore 类型和资源规范化

修改文件：

- `packages/rendercore/src/symbol/types.ts`
- `packages/rendercore/src/symbol/catalog.ts`
- `packages/rendercore/src/symbol/errors.ts` 如需新增错误类型
- `packages/rendercore/src/symbol/index.ts`

要做：

- 引入单图 / 多层 normal source 类型。
- 在 catalog normalize 阶段支持：
  - legacy direct texture/string。
  - `{ normal: textureOrString, states }`。
  - `{ normal: { kind: "single", texture }, states }`。
  - `{ normal: { kind: "layered", layers }, states }`。
- 校验 layered layers：
  - 非空。
  - index 为整数。
  - index 从 `0` 连续。
  - texture/string 存在。
  - loaded Texture 场景下尺寸一致。
- 保持 required state texture 校验。
- 对 `getAsset()` 的 layered 行为给出明确处理，不能返回 layer `0` 冒充旧单图。

### 7.3 扩展 RenderSymbol 多层显示

修改文件：

- `packages/rendercore/src/symbol/render-symbol.ts`
- `packages/rendercore/src/symbol/ani.ts`
- `packages/rendercore/src/symbol/animation-resolver.ts`

要做：

- `RenderSymbol` 根据 normal source 创建单图或多层 display。
- 新增公开读取方法，至少包含：
  - `getLayerSprites(): readonly SymbolVisualLayer[]`
  - `getBaseLayer(): Container`
  - 如新增 `getStateSprite()`，需只用于测试/调试，不把业务逻辑绑死。
- 单图旧方法 `getMainSprite()` 保持可用。
- `resetBaseDisplay()` 重置全部 layer。
- 状态贴图 `spinBlur` / `disabled` 使用合成后的单张状态图显示。
- 回到 `normal` / `appear` / `win` 时恢复 layer 显示。
- 不允许 `appear` / `win` 的复杂配置误改 layer `0`，除非配置显式引用 layer `0`。

### 7.4 实现命名动画 resolver

新增或修改文件：

- `packages/rendercore/src/symbol/named-animations.ts`
- `packages/rendercore/src/symbol/ani.ts`
- `packages/rendercore/src/symbol/animation-resolver.ts`
- `packages/rendercore/src/symbol/index.ts`

要做：

- 提供 `createNamedSymbolAnimationResolver(options)` 或等价 API。
- 支持按 `symbol + state` 查找 profile。
- 找不到 profile 时可调用显式传入的 fallback resolver；fallback resolver 缺失时必须抛错。
- 内置并导出通用动画 primitive：
  - `layerBounceScale`
  - `layerShineScale`
  - `layerStaggeredShineScale`
  - `singleSpriteAppear`
  - `singleSpriteWinShine`
- 参数解析必须 fail-fast。
- 动画完成后必须完整清理临时 overlay/mask，并复位 layer transform。

推荐 resolver 形态：

```ts
const resolver = createNamedSymbolAnimationResolver({
  profiles: SYMBOL_VIEWER_ANIMATION_PROFILES,
  fallback: createDefaultSymbolAnimationResolver()
});
```

### 7.5 更新状态贴图生成脚本

修改文件：

- `packages/rendercore/scripts/generate-symbol-state-textures.mjs`

新增文件：

- `assets/symbols/symbol-composites.json`

要做：

- 支持读取复合配置。
- 支持 manifest `normal` 为 string 或 layered object。
- 对复合 symbol 先合成再生成 `spinBlur` / `disabled`。
- 不要删除或改写源 layer 图。
- `cleanupGeneratedFiles()` 只清理生成的状态图和 manifest，不清理 `*-0.png` / `*-1.png` / `*-2.png`。
- 运行生成命令并更新 `assets/symbols/symbol-state-textures.manifest.json`。
- 生成后检查 manifest 中 `SC`、`RS`、`X2`、`X5`、`X10` 都是 layered normal。

### 7.6 更新 symbolsviewer 资源解析和动画配置

修改文件：

- `apps/symbolsviewer/src/symbol-assets.ts`
- `apps/symbolsviewer/src/main.ts`
- `apps/symbolsviewer/src/viewer-sequence.ts` 如需要但不应改变功能
- `apps/symbolsviewer/README.md`

新增文件：

- `apps/symbolsviewer/src/symbol-animation-config.ts`

要做：

- parser 支持 manifest normal string 和 layered object。
- `createStatefulSymbolAssetMapFromModules()` 对 layered normal：
  - 从 glob modules 中取 layer URL。
  - 组装为 `{ normal: { kind: "layered", layers: [...] }, states: {...} }`。
  - 不能把 `SC-0`、`SC-1` 等 layer 当成独立 displayable symbol。
  - 不能把 `SC.png` 作为特殊 symbol 的 normal。
- `main.ts` 使用 rendercore 的 named resolver，把 viewer 配置传入 catalog 或 `createRenderSymbol()`。
- viewer 布局仍一次性展示所有 displayable symbols。
- 如果 complex symbol 尺寸比原单图不同，展示缩放逻辑应基于 visual bounds 或 normal source 最大尺寸，不能只读旧 `renderSymbol.texture.width`。
- UI 行为和测试 id 尽量不变，避免无关重写。

### 7.7 同步 reelsviewer 和 reel registry

修改文件：

- `packages/rendercore/src/reel/symbol-registry.ts`
- `packages/rendercore/src/reel/types.ts` 如需调整类型
- `apps/reelsviewer/src/assets.ts`
- `apps/reelsviewer/src/main.ts` 如需接入新 loader
- `apps/reelsviewer/README.md` 如共享 manifest 契约说明有变化

要做：

- `ReelSymbolRegistryModel` 必须接受 layered normal source，并把它原样传给新的 `RenderSymbol`。
- reel cell size 计算必须支持 layered source：
  - 单图 symbol 继续使用普通 texture 尺寸。
  - 多层 symbol 使用 layer texture 的共同尺寸。
  - layer 尺寸不一致时抛 `ReelAssetError` 或共享的 symbol asset error，不能选最大值糊过去。
- `apps/reelsviewer/src/assets.ts` 必须支持 manifest normal string 和 layered object。
- `apps/reelsviewer` 可以继续展示这些特殊 symbol 的多层普通态；旋转 `spinBlur` 和停用 `disabled` 仍使用合成后的状态贴图。
- 不要为了避免改 `reelsviewer` 而让状态贴图 manifest 只对 `symbolsviewer` 私有化；当前 manifest 是共享资产契约，必须保持两个 viewer 都能读。
- 增加或修改 `apps/reelsviewer/tests/assets.test.ts`、`apps/reelsviewer/tests/reels-demo.test.ts` 或 rendercore reel 测试，证明共享 manifest 变更不会破坏 reels viewer。

### 7.8 更新 README

修改：

- `packages/rendercore/README.md`
- `apps/symbolsviewer/README.md`
- `apps/reelsviewer/README.md` 如同步了共享 manifest 或多层 reel 展示说明

`packages/rendercore/README.md` 至少补充：

- 单图和多层 symbol 的资源输入格式。
- layer 顺序和尺寸规则。
- `spinBlur` / `disabled` 对多层 symbol 的生成规则。
- named animation resolver 的使用示例。
- 内置 layer 动画名称和参数。
- 状态贴图生成命令。
- 测试和覆盖率命令。

`apps/symbolsviewer/README.md` 至少补充：

- 当前 5 个特殊图标使用拆层资源。
- 旧 `SC.png` / `RS.png` / `X2.png` / `X5.png` / `X10.png` 不作为 viewer 普通态来源。
- `SC` / `RS` appear、win 动画规则。
- `X2` / `X5` / `X10` appear、win 动画规则。
- 手工验收点。

`apps/reelsviewer/README.md` 如有更新，至少说明：

- 共享 state texture manifest 支持单图 normal 和 layered normal。
- reel 普通态可以渲染多层 symbol。
- reel 的 `spinBlur` 使用合成后的状态贴图。

### 7.9 是否更新 agents.md

检查本任务是否改变仓库协作规则、目录规范或基础脚本：

- 如果只是新增 rendercore API、viewer 配置、资源 manifest 和 package 内脚本参数，不需要更新 `agents.md`。
- 如果新增了仓库级约定，例如所有 symbol 资产必须维护 `symbol-composites.json`，并且这个约定影响其它子项目协作，则同步更新 `agents.md`。
- 无论是否更新，都在任务报告中写明判断。

## 8. 测试计划

### 8.1 rendercore 单元测试

新增或修改测试：

- `packages/rendercore/tests/symbol/catalog.test.ts`
- `packages/rendercore/tests/symbol/render-symbol.test.ts`
- `packages/rendercore/tests/symbol/ani.test.ts`
- `packages/rendercore/tests/reel/symbol-registry.test.ts`
- 新增 `packages/rendercore/tests/symbol/named-animations.test.ts`
- 新增 `packages/rendercore/tests/symbol/composite-assets.test.ts`
- 新增 `packages/rendercore/tests/symbol/state-texture-generator.test.ts` 或在现有测试中覆盖脚本导出函数

必须覆盖：

- legacy 单图 asset 仍可创建 catalog 和 render symbol。
- layered asset 正常创建 layer sprites，z-order 为 `0`、`1`、`2`。
- layered layers 缺失、重复、非连续、非零起点、空数组都会抛错。
- loaded Texture 尺寸不一致会抛错。
- required state texture 缺失会抛错。
- layered symbol 的 `spinBlur` / `disabled` 使用合成状态图，不显示普通 layers。
- 从 `spinBlur` / `disabled` 回到 `normal` 后恢复普通 layers。
- `reset()` 会重置所有 layer 的 position、scale、rotation、alpha、mask。
- `layerBounceScale` 只影响指定 layer，不影响 layer `0`。
- `layerShineScale` 只给指定 layer 建扫光 overlay，完成后清理。
- `layerStaggeredShineScale` 对多层产生错峰 progress，完成后全部复位。
- 未知动画 name 抛 `SymbolAnimationError`。
- 动画配置引用不存在的 layer 抛 `SymbolAnimationError`。
- 参数类型错误或范围非法抛 `SymbolAnimationError`。
- 单图默认 `appear` / `win` 老测试继续通过。
- reel registry 能接受 layered normal source，cell size 来自 layer 尺寸。
- reel registry 遇到 layered source 尺寸不一致时失败，不影响空图标语义。
- reel registry 创建出来的 `RenderSymbol` 保留 layered display，不把多层压成 layer `0`。
- 状态贴图生成脚本：
  - 单图 symbol 生成逻辑保持兼容。
  - 复合 symbol 先合成再生成状态图。
  - manifest 对复合 symbol 输出 layered normal。
  - layer 尺寸不一致时脚本失败。

### 8.2 symbolsviewer 测试

新增或修改：

- `apps/symbolsviewer/tests/symbol-assets.test.ts`
- 如新增配置文件，则新增 `apps/symbolsviewer/tests/symbol-animation-config.test.ts`

必须覆盖：

- parser 能读取 manifest 中的 layered normal。
- `SC`、`RS`、`X2`、`X5`、`X10` 组装为 layered asset。
- `SC-0`、`SC-1` 等不会被当成独立 symbol。
- 特殊 symbol 的 direct single PNG 不会被作为 normal source。
- `createSymbolsViewerCatalog()` 的 displayable symbols 仍是：
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
- `BN` 仍被忽略为缺图 paytable symbol。
- `CO`、`SX` 仍是 orphan asset。
- viewer 动画配置中：
  - `SC` / `RS` 的 `appear` 引用 layer `1` 和 `2`。
  - `SC` / `RS` 的 `win` 引用 `[0, 1, 2]`。
  - `X2` / `X5` / `X10` 的 `appear` 引用 layer `1`。
  - `X2` / `X5` / `X10` 的 `win` 引用 `[0, 1]`。

### 8.3 reelsviewer 回归测试

新增或修改：

- `apps/reelsviewer/tests/assets.test.ts`
- `apps/reelsviewer/tests/reels-demo.test.ts`
- `apps/reelsviewer/tests/ui.test.ts` 如 UI 绑定受影响

必须覆盖：

- parser 能读取共享 manifest 中的 layered normal。
- `SC`、`RS`、`X2`、`X5`、`X10` 在 reelsviewer asset map 中也是 layered normal。
- `SC-0`、`SC-1` 等 layer 文件不会成为 paytable orphan symbol。
- reels demo 可以用 layered symbol assets 创建 registry、layout 和 reel set。
- `spinBlur` 必需状态贴图仍 fail-fast；缺状态贴图不能回退普通 layers。

### 8.4 覆盖率要求

执行：

```bash
pnpm --filter @slotclientengine/rendercore test
```

要求输出中 lines/functions/branches/statements 全部实际大于 `80%`。不能只满足配置阈值，任务报告中需要记录实际数值。

如果某个测试推动了奇怪实现，例如为了让断言通过而把缺失 layer 回退到旧单图，必须修改测试，不允许污染生产逻辑。

## 9. 验收命令

建议按顺序执行：

```bash
git status --short
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

说明：

- 如果 root 级命令因与本任务无关的既有问题失败，任务报告必须明确写出失败命令、失败摘要、是否与本任务相关、已完成的 package-local 验证结果。
- 如果依赖下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

然后重试失败命令。

## 10. 手工或浏览器验收

启动 viewer：

```bash
pnpm --filter symbolsviewer dev -- --host 0.0.0.0
```

在 PC 横屏视口，例如 `1280x720` 或更大，检查：

- Pixi canvas 非空。
- `S00`、`S0`、`S1`、`S5`、`S10`、`SC`、`RS`、`X2`、`X5`、`X10` 全部可见。
- `SC`、`RS`、`X2`、`X5`、`X10` 的普通态由多层图组成，不是旧单图。
- 默认序列自动播放。
- `SC` / `RS` 的 `appear`：
  - layer `0` 不动。
  - layer `1` 上下弹动并缩放到约 `1.2`。
  - layer `2` 缩放到约 `1.2` 并扫光。
- `SC` / `RS` 的 `win`：
  - layer `0`、`1`、`2` 都有错峰扫光和缩放。
- `X2` / `X5` / `X10` 的 `appear`：
  - layer `0` 不动。
  - layer `1` 缩放到约 `1.2` 并扫光。
- `X2` / `X5` / `X10` 的 `win`：
  - layer `0`、`1` 错峰扫光和缩放。
- `spinBlur` 显示的是多层合成后生成的模糊状态图，不是普通 layers，也不是旧单图。
- `disabled` 显示的是多层合成后生成的禁用状态图，不是普通 layers，也不是旧单图。
- 移除、调整、增加状态后，播放顺序按当前序列执行。
- 修改默认 stable 状态后，单次状态结束回到新的默认状态。

如果实际执行时没有做浏览器验收，任务报告必须明确写“未做浏览器验收”，不能暗示已经验证。

## 11. 完成标准

实现完成必须同时满足：

- `packages/rendercore` 支持单图和多层 symbol。
- `apps/symbolsviewer` 中 5 个特殊图标使用拆层资源，不使用旧单图作为普通态来源。
- `spinBlur` 和 `disabled` 对特殊图标是合成后生成。
- 动画由 rendercore 的名字加参数配置机制驱动。
- viewer 功能不倒退。
- `apps/reelsviewer` 能继续读取共享 manifest 并渲染 reel，不因 layered normal 变更回归。
- README 已更新。
- `rendercore` coverage 四项实际大于 `80%`。
- package-local 验证命令通过。
- root 级验证命令通过，或报告中清楚说明无关失败。
- `git diff --check` 通过。
- 任务报告已写入 `tasks/23-rendercore-composite-symbols-[utctime].md`。

## 12. 任务报告要求

任务完成后新增：

```text
tasks/23-rendercore-composite-symbols-[utctime].md
```

其中 `utctime` 使用 UTC 年月日时分秒格式，例如：

```text
23-rendercore-composite-symbols-260401-181300.md
```

报告必须包含：

- 实现摘要。
- 修改文件列表。
- 特殊图标的最终资源来源：
  - `SC`: layers
  - `RS`: layers
  - `X2`: layers
  - `X5`: layers
  - `X10`: layers
- 状态贴图生成命令和生成结果。
- rendercore coverage 实际数值。
- 验收命令及结果。
- `symbolsviewer` 与 `reelsviewer` 的共享 manifest 兼容处理说明。
- 浏览器/手工验收结果；如果未执行，明确写未执行。
- 是否更新 `agents.md` 以及原因。
- 遗留风险或后续建议。
