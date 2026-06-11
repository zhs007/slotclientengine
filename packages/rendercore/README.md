# @slotclientengine/rendercore

`rendercore` 是 slot 前端渲染核心库。它基于 `pixi.js` v8、复用 `@slotclientengine/pixiani` 的基础显示对象生命周期，并复用 `@slotclientengine/logiccore` 的 game config/paytable 契约。`apps/symbolsviewer` 和 `apps/reelsviewer` 是调试 app，业务展示逻辑不放进核心库。

## Symbol API

主要入口：

```ts
import {
  RenderSymbol,
  SymbolStateMachine,
  SymbolStateSequenceController,
  createDefaultSymbolAnimationResolver,
  createDefaultSymbolStatePreset,
  createSymbolCatalog
} from "@slotclientengine/rendercore";
```

`SymbolDefinition` 保留 paytable 关联信息：`code`、`symbol`、`pays`。`RenderSymbol` 支持单图 symbol 和多层 symbol：单图会创建一个 layer sprite，多层会按 `0, 1, 2...` 顺序创建多个 layer sprite，`0` 在最下面。`getMainSprite()` 仍返回 layer `0` 以兼容旧代码；复杂动画应使用 `getLayerSprites()` 或 animation context 的 `layers`。

## 状态语义

状态由 `SymbolStateDefinition` 描述：

- `stable` 状态可以长期停留，播放方式只能是 `loop` 或 `static`。
- `once` 状态只播放一次，播放方式必须是 `once`。
- 默认状态只能是 `stable`。
- 单次状态完成后回到当前默认状态。
- 当前状态是 `loop` 时，请求切换会等待下一次 loop 完成边界。
- 当前状态是 `static` 时，请求切换会立即生效。
- 显式 `frameDurationSeconds` 不得小于 `1 / 60` 秒。

默认 preset 包含 `normal`、`spinBlur`、`disabled`、`appear`、`win`。其中 `spinBlur -> normal`、`disabled -> normal` 是状态等价配置；等价目标必须存在、phase 必须一致、链路不能有环。

## 状态贴图

资源 map 兼容旧写法，也支持显式状态贴图集合：

```ts
const catalog = createSymbolCatalog({
  gameConfig,
  assets: {
    S00: {
      normal: normalTexture,
      states: {
        spinBlur: spinBlurTexture,
        disabled: disabledTexture
      }
    }
  },
  texturePolicy: {
    requiredStateTextures: ["spinBlur", "disabled"]
  }
});
```

`normal` 可以是旧的 `Texture` / URL 字符串，也可以是显式 normal source：

```ts
const single = {
  normal: { kind: "single", texture: normalTexture },
  states: { spinBlur, disabled }
};

const layered = {
  normal: {
    kind: "layered",
    layers: [
      { index: 0, texture: bottomTexture },
      { index: 1, texture: topTexture }
    ]
  },
  states: { spinBlur, disabled }
};
```

layer index 必须从 `0` 开始连续，不能重复、缺层或为负数；已加载 `Texture` 的多层 symbol 会校验每层尺寸一致。`getTextureSet(symbol)` 返回规范化后的 source；`getAsset(symbol)` 只用于旧单图 symbol，遇到 layered symbol 会抛错，避免把 layer `0` 伪装成普通图。

`states` 可以提供 `spinBlur`、`disabled` 等状态贴图。`spinBlur` / `disabled` 可以在状态机语义上继续等价到 `normal`，但默认静态 ani 会按 `requestedState` 选择状态贴图；因此 snapshot 仍可显示 `spinBlur -> normal`，画面使用 `spinBlur` 贴图。多层 symbol 进入状态贴图时，`RenderSymbol` 会隐藏普通 layers，并用单张 `stateSprite` 展示合成后的状态图；回到 `normal`、`appear`、`win` 后恢复普通 layers。

`texturePolicy.requiredStateTextures` 用于声明某些状态贴图必须存在。缺少必需贴图、状态贴图声明了未知 state，或 `createRenderSymbol()` 收到尚未加载的 URL 字符串时都会抛错，避免静默回退到普通图。

## 动画解耦

状态定义只描述语义，不描述视觉效果。具体动画通过 `SymbolAnimationResolver` 注入：

```ts
const resolver = (context) => {
  if (context.resolvedState === "win" && context.symbol === "S10") {
    return createMyS10WinAni(context);
  }

  return createDefaultSymbolAnimationResolver()(context);
};
```

resolver context 同时包含 `requestedState` 和 `resolvedState`，所以调用方可以区分 `spinBlur -> normal` 这类等价请求。resolver 找不到动画时必须抛错，不能静默退回 `normal`。

默认 resolver 只提供 viewer 默认表现：

- `normal`：静态单帧 ani。
- `appear`：单次放大弹回，结束后 scale 复位。
- `win`：单次扫光 overlay，结束后清理 overlay。

`createNamedSymbolAnimationResolver()` 支持用“名字 + 参数”绑定动画 profile：

```ts
const resolver = createNamedSymbolAnimationResolver({
  profiles: {
    SC: {
      appear: {
        playback: "once",
        durationSeconds: 0.46,
        effects: [
          { name: "layerBounceScale", params: { layer: 1, maxScale: 1.2, offsetY: -12 } },
          { name: "layerShineScale", params: { layer: 2, maxScale: 1.2 } }
        ]
      }
    }
  },
  fallback: createDefaultSymbolAnimationResolver()
});
```

内置 named animation：

- `layerBounceScale`：参数 `layer`、`maxScale`、`offsetY`、`cycles`、`delaySeconds`。
- `layerShineScale`：参数 `layer`、`maxScale`、`shineAlpha`、`shineWidthRatio`、`delaySeconds`、`durationRatio`。
- `layerStaggeredShineScale`：参数 `layers`、`maxScale`、`staggerSeconds`、`durationRatio`。
- `singleSpriteAppear`：兼容单图 `appear`。
- `singleSpriteWinShine`：兼容单图 `win`。

未知动画名、未知参数、错误参数类型、非法范围或引用不存在的 layer 都会抛 `SymbolAnimationError`。

## Catalog

`createSymbolCatalog` 用 `LogicGameConfig` 和资源 map 建立 paytable 与图片的精确匹配关系：

```ts
import { createGameConfig } from "@slotclientengine/logiccore";

const gameConfig = createGameConfig(rawGameConfig);
const catalog = createSymbolCatalog({
  gameConfig,
  assets: {
    S00: texture
  }
});
```

catalog 只把 paytable 与资源 map 的交集加入 `displayableSymbols`。请求创建不可展示 symbol、未知状态、非法默认状态、非法等价配置或 URL 资产未加载为 `Texture` 时都会抛错。

`getAsset(symbol)` 继续返回普通贴图以保持兼容；需要完整状态贴图集合时使用 `getTextureSet(symbol)`。

## Ticker

`RenderSymbol` 不创建 Pixi `Application`，也不从磁盘加载图片。调用方负责加载 `Texture`，并在游戏主循环里显式推进：

```ts
const symbol = catalog.createRenderSymbol("S00", { texture });
stage.addChild(symbol);

app.ticker.add((ticker) => {
  symbol.update(ticker.deltaMS / 1000);
});

symbol.requestState("appear");
symbol.requestState("win");
```

## Reel API

reel 能力从主入口和子路径导出：

```ts
import {
  RenderReelSet,
  createReelLayout,
  createReelSpinPlan,
  createReelSymbolRegistry
} from "@slotclientengine/rendercore/reel";
```

`ReelSymbolRegistry` 把 `LogicGameConfig` 的 paytable、已加载 `Texture`、空图标配置和 symbol 状态贴图合并成可渲染 registry：

- `texturedSymbols`：paytable 中有普通图且可创建 `RenderSymbol` 的 symbol。
- `configuredEmptySymbols`：调用方显式配置为空的 symbol，例如 viewer 里的 `BN`。
- `missingAssetEmptySymbols`：paytable 中缺少普通图的 symbol，按空 cell 处理。
- `ignoredAssetsWithoutPaytable`：有图片但不在 paytable 的孤儿资产，不参与 reels 渲染。

空图标会占据 cell 和 reel 位置，但 `createRenderSymbolByCode()` 返回 `null`，状态请求是 no-op。有普通图的 symbol 如果缺少 `texturePolicy.requiredStateTextures` 声明的状态贴图会直接抛错，不会静默回退到普通图。

cell 尺寸由当前参与 reels 渲染的非空普通图动态计算：单图使用普通 texture 尺寸，多层 symbol 使用 layer 共同尺寸；宽度取最大普通图宽度，高度取最大普通图高度。显式空图标、缺图空图标、孤儿图片和状态贴图都不参与尺寸计算。`RenderReel` 会把每个非空 symbol 放在 cell 中心。

典型流程：

```ts
const finalYs = gameConfig.getStopYCoordinates({
  reelsName: "reels01",
  sceneName: "step0.scene0",
  scene
});

const registry = createReelSymbolRegistry({
  gameConfig,
  assets: loadedTextures,
  emptySymbols: ["BN"],
  texturePolicy: { requiredStateTextures: ["spinBlur"] }
});

const cellSize = registry.getCellSize();
const layout = createReelLayout({
  reelCount: reels.getReelCount(),
  visibleRows: 5,
  cellWidth: cellSize.width,
  cellHeight: cellSize.height
});

const reelSet = new RenderReelSet({ reels, layout, registry });
reelSet.resetToFinalYs(finalYs);
const plan = createReelSpinPlan({
  reels,
  finalYs,
  visibleRows: 5,
  minimumSpinCycles: 10,
  baseDurationMs: 1600,
  speedSymbolsPerSecond: 42,
  startDelayMs: 90,
  stopDelayMs: 180
});
reelSet.spin(plan);
```

`createReelSpinPlan()` 先使用最终 y、时长、速度和最小转动距离反推每轴 `travelSymbols` 与 `startY`。默认 viewer 语义下每轴至少转动 `minimumSpinCycles * visibleRows`，即 `10 * 5 = 50` 个 symbol 位置。`RenderReelSet.update(deltaSeconds)` 按 `startDelayMs` 一轴一轴启动，并按每轴 `stopAtMs` 一轴一轴停下。

状态流转由核心库触发：

- 旋转中，非空 symbol 请求 `spinBlur`。
- 落点刷新后，可见非空 symbol 请求 `appear`。
- `appear` 播放完成后，`RenderSymbol` 回到默认 `normal`。

## 全局序列

`SymbolStateSequenceController` 只决定下一步请求哪个状态，不直接操作 Pixi。viewer 或游戏层把返回的状态广播给全部 `RenderSymbol`。`once` 状态需要等全部 symbol 都上报 `onceCompleted` 后再推进。

## 命令

状态贴图生成脚本只在 Node 侧使用 `sharp`，不会进入浏览器运行时代码或发布 bundle。`assets/symbols/symbol-composites.json` 可声明多层资源；复合 symbol 会先按 layer 顺序合成完整图标，再从合成结果生成 `spinBlur` 和 `disabled`，manifest 的 `normal` 会写为 layered object。当前 viewer/reels 资源可用下面命令生成：

```bash
pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --symbols S00,S0,S1,S5,S10,SC,RS,X2,X5,X10 --composites assets/symbols/symbol-composites.json
```

```bash
pnpm --filter @slotclientengine/rendercore lint
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore build
pnpm --filter reelsviewer dev -- --host 0.0.0.0
```
