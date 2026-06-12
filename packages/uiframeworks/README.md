# @slotclientengine/uiframeworks

通用 slot 游戏 DOM UI 框架。该包负责固定设计分辨率 frame、游戏层、UI overlay、slot HUD 控件、viewport 缩放，以及 live `netcore` + `logiccore` 的 spin 数据流编排。

UI 只使用 DOM 和 CSS 绘制，不创建 canvas，不使用 SVG、图片图标或 icon font。具体游戏如果需要自己的渲染层，应在 `SlotGameAdapter` 的 game layer 内显式实现。

## 基本用法

```ts
import {
  createSlotUiFramework,
  type SlotGameAdapter
} from "@slotclientengine/uiframeworks";
import "@slotclientengine/uiframeworks/styles.css";

const adapter: SlotGameAdapter = {
  mount(root) {
    root.append(document.createElement("div"));
  },
  applySpinResult(result) {
    console.log(result.totalwin, result.logic.getStepCount());
  }
};

const framework = createSlotUiFramework({
  root: document.querySelector("#app")!,
  gameAdapter: adapter,
  live: {
    serverUrl: "wss://example.test/game",
    token: "token",
    gamecode: "game001"
  },
  betOptions: [
    { bet: 1, lines: 10 },
    { bet: 2, lines: 10, times: 2 }
  ],
  currency: "USD"
});

await framework.connect();
await framework.spin();
```

## DOM 结构

框架创建以下层级：

```html
<main class="slot-ui-page">
  <div class="slot-ui-frame">
    <div class="slot-ui-game-layer"></div>
    <div class="slot-ui-overlay"></div>
  </div>
</main>
```

`.slot-ui-frame` 使用设计分辨率固定宽高，默认 `941 x 1672`，并通过 `calculateFrameScale(viewportWidth, viewportHeight, designSize)` 按完整 frame 缩放。游戏层始终保持设计坐标，不需要自己适配浏览器视口。

## HUD 控件

- 顶部左侧：菜单按钮，三条 DOM/CSS 横线。
- 顶部右侧：声音和快速 toggle，关闭态灰掉并显示斜线。
- 底部：完整 banner，包含 `balance`、`win`、下注区、圆形 `auto`。
- 下注区：`-`、`bet`、`+`，边界按钮 disabled。
- `spin`：大圆形主按钮，支持 `idle`、`connecting`、`spinning`、`collecting`、`error`、`disabled`。

金额默认使用 `Intl.NumberFormat`；也可以传入 `currency`、`locale` 或 `formatMoney(amount)`。金额输入必须是 finite number。

## Game Adapter

`SlotGameAdapter` 至少实现：

- `mount(root, context)`：挂载游戏层。
- `applySpinResult(result)`：接收 `rawResult`、`gmi`、`GameLogic`、`totalwin`、`results`、`userInfo`。

可选实现：

- `applyInitialState(state)`
- `setUiState(snapshot)`
- `destroy()`

## Live 数据流

生产路径只接受 `ws://` 或 `wss://`。传入 `http://` 或 `https://` 会明确失败，不会进入 replay、fixture、mock 或默认 GMI 兜底。

`connect()` 顺序：

1. 创建 `SlotcraftClient`。
2. `client.connect(token)`。
3. `client.enterGame(gamecode)`。
4. 读取并校验 `userInfo.balance`，除非调用方显式传入 `initialBalance`。
5. 调用 `gameAdapter.applyInitialState()`。

`spin()` 顺序：

1. 禁止并发 spin。
2. 使用默认 `{ bet, lines, times }` 或显式 `buildSpinParams(state, bet)`。
3. `client.spin(params)`。
4. 校验 `gmi`、finite `totalwin`、non-negative integer `results`。
5. 校验 `results === gmi.replyPlay.results.length`。
6. 调用 `createGameLogicFromGmi(gmi, meta)`。
7. 按 `(totalwin > 0 && results >= 1) || (totalwin === 0 && results > 1)` 执行 final collect。
8. 更新 `win`、`balance`，并调用 `gameAdapter.applySpinResult()`。

`netcore` 的 `error`、非预期 `disconnect`、`reconnecting`、`message` 错误，以及 logger `warn/error` 都会让当前操作失败，UI 进入 error 状态并 reject 对应 Promise。

## Viewer

`apps/uiframeworksviewer` 提供 mock/live 两种模式，用来检查不同视口、长金额、toggle、error、loading、win 和 auto 状态。

```bash
pnpm --filter uiframeworksviewer dev -- --host 0.0.0.0
```

## 验收命令

```bash
pnpm --filter @slotclientengine/uiframeworks lint
pnpm --filter @slotclientengine/uiframeworks test
pnpm --filter @slotclientengine/uiframeworks typecheck
pnpm --filter @slotclientengine/uiframeworks build
```

如果依赖下载失败：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
pnpm install
```
