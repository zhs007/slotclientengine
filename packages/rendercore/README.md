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
  createSymbolManifestAnimationResolver,
  createSymbolCatalog,
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
        disabled: disabledTexture,
      },
    },
  },
  texturePolicy: {
    requiredStateTextures: ["spinBlur", "disabled"],
  },
});
```

`normal` 可以是旧的 `Texture` / URL 字符串，也可以是显式 normal source：

```ts
const single = {
  normal: { kind: "single", texture: normalTexture },
  states: { spinBlur, disabled },
};

const layered = {
  normal: {
    kind: "layered",
    layers: [
      { index: 0, texture: bottomTexture },
      {
        index: 1,
        texture: topTexture,
        keyframes: [topTexture, topOpenTexture, topOpenedTexture],
      },
    ],
  },
  states: { spinBlur, disabled },
};
```

layer index 必须从 `0` 开始连续，不能重复、缺层或为负数；已加载 `Texture` 的多层 symbol 会校验每层尺寸一致。layer 可选 `keyframes` 表示同一 layer 的贴图序列；声明后必须非空，第一帧必须等于该 layer 的静态 `texture`，所有已加载帧尺寸必须一致。未声明 keyframes 的 layer 会规范化为空序列，但外部配置不能写 `keyframes: []`。

`getTextureSet(symbol)` 返回规范化后的 source；`getAsset(symbol)` 只用于旧单图 symbol，遇到 layered symbol 会抛错，避免把 layer `0` 伪装成普通图。

`states` 可以提供 `spinBlur`、`disabled` 等状态贴图。`spinBlur` / `disabled` 可以在状态机语义上继续等价到 `normal`，但默认静态 ani 会按 `requestedState` 选择状态贴图；因此 snapshot 仍可显示 `spinBlur -> normal`，画面使用 `spinBlur` 贴图。多层 symbol 进入状态贴图时，`RenderSymbol` 会隐藏普通 layers，并用单张 `stateSprite` 展示合成后的状态图；回到 `normal`、`appear`、`win` 后恢复普通 layers。

`texturePolicy.requiredStateTextures` 用于声明某些状态贴图必须存在。缺少必需贴图、状态贴图声明了未知 state，或 `createRenderSymbol()` 收到尚未加载的 URL 字符串时都会抛错，避免静默回退到普通图。

## Symbol Manifest

`rendercore` 提供共享 manifest helper，供游戏 app、viewer 和构建链路复用同一套解析规则：

- `parseSymbolStateTextureManifest(...)`：校验 `symbol-state-textures.manifest.json`，读取 normal、states、scale、renderPriority 和可选 animations。
- `createSymbolAssetMapFromManifestModules(...)`：把 Vite glob module 转成 `createSymbolCatalog(...)` 可消费的 stateful asset map。
- `createSymbolScaleMapFromManifest(...)`：从 manifest 读取每个 symbol 的显示 scale。
- `createSymbolRenderPriorityMapFromManifest(...)`：从 manifest 读取每个 symbol 的 Pixi 渲染叠放优先级。
- `getSymbolDisplaySymbolsFromManifest(...)`：得到 manifest 声明且可展示的 symbol 顺序。
- `createSymbolVniAnimationResourcesFromManifest(...)`：从 manifest animations、VNI project modules 和 VNI asset modules 解析 VNI 动画资源。
- `createSymbolSpineAnimationResourcesFromManifest(...)`：从 manifest animations、Spine skeleton modules、atlas raw modules 和 texture URL modules 解析 Spine 动画资源。

manifest 允许每个 symbol 声明可选 `renderPriority`。缺省值为 `0`，显式值必须是非负安全整数；负数、小数、`NaN`、`Infinity`、字符串或 `null` 都会显式失败。优先级只影响 Pixi slot symbol 的叠放顺序：数值越大越靠上；数值相同继续保持默认顺序，即下面压住上面、右边压住左边。它不改变服务器 scene、reel stop、win result 顺序、symbol state、中奖金额 overlay 或点击逻辑。

manifest 允许每个 symbol 通过 `animations` 声明状态动画。当前支持：

- `kind: "builtin"`：使用 rendercore 的内置 once 表现，但 `durationSeconds` 必须由 manifest 显式声明。
- `kind: "static"`：播放一次静态普通态，可用于把某个 once 状态显式配置成无额外动画；`durationSeconds` 必须由 manifest 显式声明。
- `kind: "vni"`：显式声明 project 路径和 playback，VNI project 会通过 `@slotclientengine/vnicore` 校验，project 引用的所有 assets 必须能从 Vite asset modules 中解析到 URL。
- `kind: "spine"`：显式声明 `skeleton`、`atlas`、`texture` 和 `playback`。`skeleton` 必须是 `./*.json`，`atlas` 必须是 `./*.atlas` raw text，`texture` 必须是 `./*.png` URL，`playback.mode` 固定为 `animation`，`animationName` 区分大小写并且必须存在于 skeleton，`loop` 必须符合 state playback 合同；`transform.x/y/scale` 只做显式位置和等比缩放，不做 app 侧推导。

`stageRect` 是 editor/export 侧概念，不属于 runtime symbol manifest；manifest 中出现 `stageRect` 会作为未知字段显式失败。缺 manifest、未知 manifest 字段、未知 state、缺贴图、非法 scale、缺 animation `durationSeconds`、缺 VNI project、缺 VNI asset、缺 Spine skeleton/atlas/texture、atlas page 与 texture 文件名不一致或 Spine animation name 不匹配都会显式失败。app 和 viewer 不应复制 manifest parser，也不应在运行时代码里写 `if symbol === "L1"` 这类专属 VNI/Spine 逻辑。

## 动画解耦

状态定义只描述语义，不描述视觉效果。具体动画通过 `SymbolAnimationResolver` 注入：

```ts
const normalFallbackResolver = createDefaultSymbolAnimationResolver();

const resolver = (context) => {
  if (context.resolvedState === "win" && context.symbol === "S10") {
    return createMyS10WinAni(context);
  }

  return normalFallbackResolver(context);
};
```

resolver context 同时包含 `requestedState` 和 `resolvedState`，所以调用方可以区分 `spinBlur -> normal` 这类等价请求。resolver 找不到动画时必须抛错，不能静默退回 `normal`。

默认 resolver 只提供 `normal` 静态表现，不提供全局默认 `appear` / `win`。需要 once 动画时，调用方必须通过 manifest `kind: "builtin" | "static" | "vni" | "spine"` 或 named animation profile 显式声明：

- `normal`：静态单帧 ani。
- manifest `kind: "builtin"` 的 `appear`：单次放大弹回，结束后 scale 复位；需要显式正数 `durationSeconds`。
- manifest `kind: "builtin"` 的 `win`：单次扫光 overlay，结束后清理 overlay；需要显式正数 `durationSeconds`。

`createSymbolManifestAnimationResolver()` 会优先使用 manifest 声明的 animation，再回落到调用方传入的 fallback resolver。VNI animation 直接把 `VNIPlayer` 的 Pixi display tree 挂到当前 symbol 的 `overlayLayer` 中；runtime 不创建隐藏 canvas、canvas-to-texture、额外 renderer、`stageRect` viewport 或 mask。VNI root 按 project stage 中心对齐，project 的 stage background 不会作为 symbol 动画背景绘制。Spine animation 由 rendercore 的 Spine adapter 解析 atlas/skeleton/texture，并把 display tree 挂到同一个 `overlayLayer`，不由 app 侧直接 import Spine parser 或播放状态机；当前 `spine=3.8.99` JSON 使用 rendercore 内部受限 adapter，Spine 4.x 资源仍可走官方 Pixi v8 runtime。对 `normal.kind: "spine"` 的 symbol，如果 `appear` / `win` 没有 manifest animation，resolver 只退回该 symbol 自身 normal Spine 展示并按当前 once 状态完成，不退回通用 builtin/default 动画；manifest 中显式声明的 Spine animation name 仍必须真实存在且大小写完全一致。动画生命周期由 `RenderSymbol.update(deltaSeconds)` 推进。`SymbolAni.destroy()` 会在状态切换和 symbol 销毁时释放 VNI/Spine player 和已挂载的 Pixi 节点。

`createNamedSymbolAnimationResolver()` 支持用“名字 + 参数”绑定动画 profile：

```ts
const resolver = createNamedSymbolAnimationResolver({
  profiles: {
    SC: {
      appear: {
        playback: "once",
        durationSeconds: 0.46,
        effects: [
          {
            name: "layerBounceScale",
            params: { layer: 1, maxScale: 1.2, offsetY: -12 },
          },
          { name: "layerShineScale", params: { layer: 2, maxScale: 1.2 } },
        ],
      },
    },
  },
  fallback: createDefaultSymbolAnimationResolver(),
});
```

内置 named animation：

- `layerTextureSequence`：参数 `layer`、`frameDurationSeconds`、`delaySeconds`、`durationRatio`，按 layer 的 `keyframes` 切换贴图，结束后恢复静态 `texture`。
- `layerBounceScale`：参数 `layer`、`maxScale`、`offsetY`、`cycles`、`delaySeconds`、`rotationDegrees`。`rotationDegrees` 为可选峰值旋转角度，负数表示逆时针/向左旋转，缩放归零时会还原到 `0`。
- `layerShineScale`：参数 `layer`、`maxScale`、`shineAlpha`、`shineWidthRatio`、`delaySeconds`、`durationRatio`、`rotationDegrees`。`rotationDegrees` 与缩放脉冲同步，结束后还原到 `0`。
- `layerStaggeredShineScale`：参数 `layers`、`maxScale`、`staggerSeconds`、`durationRatio`。
- `singleSpriteAppear`：兼容单图 `appear`。
- `singleSpriteWinShine`：兼容单图 `win`。

`layerTextureSequence` 引用不存在的 layer、目标 layer 未声明至少两帧 keyframes、参数类型错误、`durationRatio` 超出 `(0, 1]` 或未知参数都会抛 `SymbolAnimationError`。其他 named animation 遇到未知动画名、未知参数、错误参数类型、非法范围或引用不存在的 layer 也会抛 `SymbolAnimationError`。

## Win Amount Animation

中奖金额动画从 `@slotclientengine/rendercore/win-amount` 子路径导出。它只处理通用 raw amount、formatter、阈值倍率、Pixi layout 和 VNI tier 资源，不硬编码 USD、game003、GMI 字段名、中奖组件名或 Ways 规则。

```ts
import {
  createWinAmountAnimationPlayer,
  createWinAmountAnimationTiersFromManifestModules,
  parseWinAmountAnimationManifest,
} from "@slotclientengine/rendercore/win-amount";
```

调用方必须传入服务器整数金额和当前下注整数金额：

- `betAmountRaw` 必须是 finite positive number。
- `winAmountRaw` 必须是 finite non-negative number。
- 阈值比较使用 `winAmountRaw / betAmountRaw`，不要先格式化或除显示 scale。
- formatter 由 app 显式注入，返回空字符串或抛错会显式失败。

播放器只暴露一个 Pixi `container`，不创建 `PIXI.Application`、canvas、DOM overlay、RAF 或独立 renderer。游戏主 ticker 负责调用 `update(deltaSeconds)`，viewport 变化时调用 `applyLayout(...)`。big/super/mega 等 VNI tier 会按 `tierStageRect` 做等比 cover 缩放，不能对 x/y 分别缩放导致竖屏或宽屏下压扁。

`requestAdvance()` 是玩家点击加速语义：普通数字阶段如果本轮不到 bigwin，会直接跳到最终金额并停在 `awaiting-dismiss`；如果本轮会到 bigwin 以上，会一次点击跳一档，依次进入 big/super/mega 等 tier，最后仍停在 `awaiting-dismiss`，不会隐藏文字或 tier effect。`requestDismiss()` 仅保留给调用方显式请求渐隐关闭；如果当前 tier effect 仍在播放，它会请求 segmented VNI 结束并等待 effect 排空。`dismissImmediately()` 用于调用方在开始下一轮前同步清理上一轮展示，对 `idle` / `complete` 幂等，对 counting、tier-counting、awaiting-dismiss 或 dismissing 阶段都会立即清空文字和 tier effect。

big/super/mega tier 使用 VNI segmented playback：`durationSeconds`、`loopStartTime`、`loopEndTime` 和 `keepParticlesAlive` 全部来自 win-amount manifest。推荐入口是 `createWinAmountAnimationTiersFromManifestModules(...)`；它先用 `parseWinAmountAnimationManifest(...)` 校验 manifest 的白名单字段、相对 glob、tier 顺序和时间区间，再校验 project modules、asset modules、asset basename 重复、缺 project、缺 asset，以及 `0 <= loopStartTime <= loopEndTime <= durationSeconds <= project.stage.duration`。`durationSeconds` 可以小于 5 秒；当配置的 `durationSeconds` 小于源 project 时，会 clone runtime project 并截断 `stage.duration`，不会 mutate import 进来的 JSON。

## Catalog

`createSymbolCatalog` 用 `LogicGameConfig` 和资源 map 建立 paytable 与图片的精确匹配关系：

```ts
import { createGameConfig } from "@slotclientengine/logiccore";

const gameConfig = createGameConfig(rawGameConfig);
const catalog = createSymbolCatalog({
  gameConfig,
  assets: {
    S00: texture,
  },
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

## Viewport API

viewport 能力从主入口和子路径导出：

```ts
import {
  calculateFocusedArtViewport,
  calculateResponsiveArtViewport,
  mapAnchorRectToArt,
  mapArtRectToViewport,
  mapReferenceRectToArt,
} from "@slotclientengine/rendercore/viewport";
```

`calculateFocusedArtViewport()` 用于“完整 art 坐标系 + 当前 canvas 逻辑尺寸 + 游戏 focus rect”的裁切计算。调用方传入完整背景或最大美术空间 `artSize`、当前 canvas backing 的 `viewportSize`、必须完整保留的 `focusRect`，可选传入 `minMargin`。返回值包含：

- `visibleRect`：当前 viewport 应显示 art 中的哪一块。
- `worldOffset`：把完整 art world container 移到 viewport 内的偏移，等于 `-visibleRect.x/y`。
- `focusRectInViewport`：focus rect 在当前 viewport 内的位置，用于测试和诊断。

该 helper 只做通用几何计算，不读取资源、不创建 Pixi 对象，也不包含任何 game002 路径、symbol 名或棋盘常量。`viewportSize` 大于 `artSize`、`focusRect` 超出 art、focus 加 margin 无法放入 viewport、`NaN`/`Infinity`/非正数都会显式抛错，避免运行时静默裁掉关键区域。

`mapReferenceRectToArt()` 用于把旧设计稿或旧 portrait crop 里的矩形映射到新的完整 art 坐标。典型用法是把旧 `1125 x 2000` 坐标中的棋盘矩形映射到 `2000 x 2000` art 中，再把映射后的矩形作为 focus rect。

`mapArtRectToViewport()` 用于在已有 `visibleRect` 下，把完整 art 坐标系中的任意矩形映射到当前 viewport 坐标。典型用法是 focus rect 与棋盘、调试框或其它 art rect 不同的时候，先用 `calculateFocusedArtViewport()` 得到裁切结果，再用该 helper 映射其它矩形。`rect` 和 `visibleRect` 都必须在 `artSize` 内；`rect` 不要求完全落在 `visibleRect` 内，超出当前可见区域时仍返回确定坐标。app 不应自行复制 `rect.x - visibleRect.x` 这类通用映射算法。

`mapAnchorRectToArt()` 用于把相对某个 art-space anchor 左上角的 child rect 映射回完整 art 坐标。`anchorRect` 必须位于 `artSize` 内，child rect 的 `x/y` 是相对 anchor 的偏移，可以是负数；child 可以视觉上越过 anchor 边界，但映射后的 rect 必须仍位于完整 art 内。该 helper 不知道具体游戏的部件语义，只做通用 anchor/focus rect 几何映射和 fail-fast 校验。

`calculateResponsiveArtViewport()` 用于横竖屏有不同 art 和 focus rect 的场景。调用方必须同时传入 `landscape` 和 `portrait` 两套 variant；当 `viewportSize.height > viewportSize.width` 时选择 `portrait`，否则选择 `landscape`，包括正方形 viewport。选中 variant 后仍复用 `calculateFocusedArtViewport()` 的校验和返回语义，因此 variant 缺失、focus rect 越界或 margin 放不进 viewport 都会显式失败。该 API 只处理通用横竖屏 art 选择和几何裁切，不包含具体游戏的资源名、部件摆放或转轮区常量。

## Reel API

reel 能力从主入口和子路径导出：

```ts
import {
  RenderReelSet,
  createReelLayout,
  createReelSpinPlan,
  createReelSymbolRegistry,
} from "@slotclientengine/rendercore/reel";
```

`ReelSymbolRegistry` 把 `LogicGameConfig` 的 paytable、已加载 `Texture`、空图标配置和 symbol 状态贴图合并成可渲染 registry：

- `texturedSymbols`：paytable 中有普通图且可创建 `RenderSymbol` 的 symbol。
- `configuredEmptySymbols`：调用方显式配置为空的 symbol，例如 viewer 里的 `BN`。
- `missingAssetEmptySymbols`：paytable 中缺少普通图的 symbol，按空 cell 处理。
- `ignoredAssetsWithoutPaytable`：有图片但不在 paytable 的孤儿资产，不参与 reels 渲染。

空图标会占据 cell 和 reel 位置，但 `createRenderSymbolByCode()` 返回 `null`，状态请求是 no-op。有普通图的 symbol 如果缺少 `texturePolicy.requiredStateTextures` 声明的状态贴图会直接抛错，不会静默回退到普通图。

cell 尺寸由当前参与 reels 渲染的非空普通图动态计算：单图使用普通 texture 尺寸，多层 symbol 使用 layer 共同尺寸；若配置了 `symbolScales`，则使用 `texture width/height * scale` 后的尺寸参与最大宽高计算。显式空图标、缺图空图标、孤儿图片和状态贴图都不参与尺寸计算。`RenderReel` 会把每个非空 symbol 放在 cell 中心，并在创建 `RenderSymbol` 时把对应 `scale` 应用到根容器。`symbolScales` 只能配置 paytable 中存在的 symbol，缩放系数必须是正数。`symbolRenderPriorities` 同样只能配置 paytable 中存在的 symbol，值必须是非负安全整数；普通 reel、reel set 和 grid-cell reel 都只用它调整 Pixi render order，所有值为 `0` 时保留默认层级。

`createReelLayout()` 支持 `columnGap` 控制轴间距；`RenderReel` 只在 starting / spinning / settling 等非静止态裁切单轴内容，停止态会取消裁切，允许偏大的 symbol 自然超出格子外框。

典型流程：

```ts
const finalYs = gameConfig.getStopYCoordinates({
  reelsName: "reels01",
  sceneName: "step0.scene0",
  scene,
});

const registry = createReelSymbolRegistry({
  gameConfig,
  assets: loadedTextures,
  emptySymbols: ["BN"],
  symbolScales: {
    SC: 1.5,
  },
  texturePolicy: { requiredStateTextures: ["spinBlur"] },
});

const cellSize = registry.getCellSize();
const layout = createReelLayout({
  reelCount: reels.getReelCount(),
  visibleRows: 5,
  cellWidth: cellSize.width,
  cellHeight: cellSize.height,
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
  stopDelayMs: 180,
});
reelSet.spin(plan, { targetVisibleScene: scene });
```

`createReelSpinPlan()` 先使用最终 y、时长、速度和最小转动距离反推每轴 `travelSymbols` 与 `startY`。默认 viewer 语义下每轴至少转动 `minimumSpinCycles * visibleRows`，即 `10 * 5 = 50` 个 symbol 位置。`RenderReelSet.update(deltaSeconds)` 按 `startDelayMs` 一轴一轴启动，并按每轴 `stopAtMs` 一轴一轴停下。

`RenderReelSet.spin(plan, { targetVisibleScene })` 可把服务器本轮目标可见窗口叠加进临时 spin strip。滚动过程仍从本地公开轮带读取，完成后 `getVisibleScene()` 等于 `targetVisibleScene`。因此 live slot 前端不需要也不应该读取、缓存或泄露服务器真实轮带；如果目标窗口无法在本地公开轮带反查出 stop y，调用方可以继续使用当前 y 或 `0` 生成物理 spin plan，再把目标窗口传给 `targetVisibleScene`。

`RenderReelSet.resetToVisibleScene(scene, finalYs?)` 用于进入游戏后的默认可见窗口展示；它只设置当前静态窗口，不启动 spin。`finalYs` 可用于记录/保持物理 y，不要求目标窗口在本地公开轮带中连续存在。

状态流转由核心库触发：

- 旋转中，非空 symbol 请求 `spinBlur`。
- 落点刷新后，可见非空 symbol 请求 `appear`。
- `appear` 播放完成后，`RenderSymbol` 回到默认 `normal`。

## Grid Cell Reel API

grid-cell reel 用于棋盘格、逐格启动、逐格停止的特殊转轮表现。每个正在滚动的 cell 都有 `cellWidth x cellHeight` 的裁切窗口，内部复用 `RenderReel` 的 `visibleRows=1` 微型 reel；暗度 overlay 是挂在微型 reel 内部的交替深浅 strip，会随 reel 的 `currentY` 滚动并覆盖在 symbol 上方，所以固定格子中能看到快速明暗变化。单个 cell 落地后会立即移除外层裁切，最终静态 symbol 不继续依赖 mask；落地暗度会折叠到当前 cell 内淡出，避免没有 mask 时影响邻格。

```ts
import {
  RenderGridCellReelSet,
  createGridCellOrder,
  createGridCellReelOffsetMatrix,
  createGridCellReelSpinPlan,
} from "@slotclientengine/rendercore/reel";

const order = createGridCellOrder({
  columns: 6,
  rows: 9,
  mode: "top-down-left-right",
});
const cellReelOffsets = createGridCellReelOffsetMatrix({
  columns: 6,
  rows: 9,
  rowOffsetStep: 16,
});

const gridReels = new RenderGridCellReelSet({
  reels,
  registry,
  columns: 6,
  rows: 9,
  cellWidth: 120,
  cellHeight: 120,
  order,
});

gridReels.resetToScene(defaultScene, finalYs, cellReelOffsets);
const plan = createGridCellReelSpinPlan({
  reels,
  finalYs,
  targetScene,
  columns: 6,
  rows: 9,
  order,
  cellReelOffsets,
  timing: {
    startStepMs: 16,
    stopStepMs: 16,
    settleAfterLastStartMs: 180,
    minimumSpinCycles: 6,
    speedSymbolsPerSecond: 54,
  },
  dimming: {
    evenAlpha: 0.5,
    oddAlpha: 0.35,
    fadeInMs: 80,
    fadeOutMs: 160,
  },
});
gridReels.spin(plan);
```

`createGridCellOrder({ mode: "top-down-left-right" })` 生成 `(0,0),(0,1)...(0,rows-1),(1,0)...` 的稳定顺序。`createGridCellReelSpinPlan()` 对每个 cell 计算 `startAtMs`、`stopAtMs`、`durationMs`、`axisPlan`、`targetVisibleSymbols` 和交替暗度；默认每个 cell 的最终 y 使用 `reels.normalizeY(x, finalYs[x] + y)`。如果传入 `cellReelOffsets`，则使用 `reels.normalizeY(x, finalYs[x] + y + cellReelOffsets[x][y])`，让同一列内不同格子也能使用更分散的本地轮带窗口滚动。`targetVisibleSymbols` 仍会注入临时 spin strip 的落点窗口，因此完成后的 `getVisibleScene()` 能还原目标 scene。调用方可以用本地公开轮带提供滚动内容，再把服务器本轮目标窗口叠加到临时 strip，不需要也不应该暴露服务器真实轮带。

grid-cell API 会 fail-fast 校验 scene 尺寸、final y 长度、order 重复/越界/缺失、offset 矩阵尺寸和整数值、timing、alpha 范围和 reel 列数。资源状态缺失仍由 `ReelSymbolRegistry` / `RenderSymbol` 按 `texturePolicy.requiredStateTextures` 显式失败，不会静默回退到普通图。

`RenderGridCellReelSet.update(deltaSeconds)` 在 cell landed 后会立刻把目标 symbol 复位到最终 y 的 `normal` 状态，不播放 `appear`；完成边界只等待所有 cell 已 landed 且所有 dim overlay alpha 已归零。snapshot 提供 `phase`、`hasClipMask`、`cellX/cellY`、`reelX/reelY`、当前可见 `dimmingAlpha`、`requestedState` 和 `visibleSymbol`，用于游戏层诊断和测试，不暴露可变内部对象。

## 全局序列

`SymbolStateSequenceController` 只决定下一步请求哪个状态，不直接操作 Pixi。viewer 或游戏层把返回的状态广播给全部 `RenderSymbol`。`once` 状态需要等全部 symbol 都上报 `onceCompleted` 后再推进。

## 命令

状态贴图生成脚本只在 Node 侧使用 `sharp`，不会进入浏览器运行时代码或发布 bundle。`assets/symbols/symbol-composites.json` 可声明多层资源；旧字符串 layer 继续用文件名推导 index，对象 layer 使用显式 `index`、`texture` 和可选 `keyframes`。复合 symbol 会先按 layer 静态 `texture` 顺序合成完整图标，再从合成结果生成 `spinBlur` 和 `disabled`，manifest 的 `normal` 会写为 layered object 并保留对象 layer 的 keyframes。生成器会为每个 symbol 写入显示缩放系数 `scale`，默认值为 `1`，也可以通过 `--scale` 指定；`scale` 必须是有限正数。仓库内生成物应显式写出 `scale`，consumer 应从 manifest 读取，不要维护第二份手写 scale 表。重新生成 manifest 时，生成器会保留旧 manifest 中仍然有效的 `animations` 和显式 `renderPriority`，非法 `renderPriority` 会让生成失败，避免叠放规则被悄悄删掉。当前 viewer/reels 资源可用下面命令生成：

```bash
pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --symbols S00,S0,S1,S5,S10,SC,RS,X2,X5,X10 --composites assets/symbols/symbol-composites.json --scale 1
```

```bash
pnpm --filter @slotclientengine/rendercore lint
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore build
pnpm --filter reelsviewer dev -- --host 0.0.0.0
```
