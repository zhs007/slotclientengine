# @slotclientengine/rendercore

`rendercore` 是 slot 前端渲染核心库。它基于 `pixi.js` v8、复用 `@slotclientengine/pixiani` 的基础显示对象生命周期，并复用 `@slotclientengine/logiccore` 的 game config/paytable 契约。`apps/symbolsviewer` 是本包的调试 app，业务展示逻辑不放进核心库。

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

`SymbolDefinition` 保留 paytable 关联信息：`code`、`symbol`、`pays`。`RenderSymbol` 只持有一个主 `Sprite`、普通 `Texture` 和可选状态贴图引用；`normal`、`appear`、`win` 等状态不会复制图片资源。

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

`normal` 是普通贴图，`states` 可以提供 `spinBlur`、`disabled` 等状态贴图。`spinBlur` / `disabled` 可以在状态机语义上继续等价到 `normal`，但默认静态 ani 会按 `requestedState` 选择状态贴图；因此 snapshot 仍可显示 `spinBlur -> normal`，画面使用 `spinBlur` 贴图。

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

## 全局序列

`SymbolStateSequenceController` 只决定下一步请求哪个状态，不直接操作 Pixi。viewer 或游戏层把返回的状态广播给全部 `RenderSymbol`。`once` 状态需要等全部 symbol 都上报 `onceCompleted` 后再推进。

## 命令

状态贴图生成脚本只在 Node 侧使用 `sharp`，不会进入浏览器运行时代码或发布 bundle。当前 viewer 资源可用下面命令生成：

```bash
pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --symbols S00,S0,S1,S5,S10
```

```bash
pnpm --filter @slotclientengine/rendercore lint
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore build
```
