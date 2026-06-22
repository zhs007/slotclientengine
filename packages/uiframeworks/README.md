# @slotclientengine/uiframeworks

通用 slot 游戏 DOM UI 框架。该包负责固定设计分辨率 frame、游戏层、UI overlay、slot HUD 控件、viewport 缩放，以及兼容旧调用方的 live `netcore` + `logiccore` spin 数据流编排。

后续完整游戏默认应优先依赖 `@slotclientengine/gameframeworks`。`uiframeworks` 现在同时提供 UI-only controller，供上层框架复用 HUD/DOM/状态渲染，而不强制使用本包旧的网络与 collect 流程。

默认 HUD 参考 `docs/ui002.png` 的黑底扁平风格：白色 icon、轻量文字、底部裸排信息区和金色 `BUY BONUS`。UI 不创建 canvas；默认 icon 由受控现成 icon 包 `lucide` 提供；不使用图片 HUD 资产或 icon font，也不在 DOM/CSS 中散落复杂手绘 icon。具体游戏如果需要自己的渲染层，应在 `SlotGameAdapter` 的 game layer 内显式实现。

## 基本用法

```ts
import {
  createSlotUiFramework,
  type SlotGameAdapter,
} from "@slotclientengine/uiframeworks";
import "@slotclientengine/uiframeworks/styles.css";

const adapter: SlotGameAdapter = {
  mount(root) {
    root.append(document.createElement("div"));
  },
  applySpinResult(result) {
    console.log(result.totalwin, result.logic.getStepCount());
  },
};

const framework = createSlotUiFramework({
  root: document.querySelector("#app")!,
  gameAdapter: adapter,
  live: {
    serverUrl: "wss://example.test/game",
    token: "token",
    gamecode: "game001",
  },
  betOptions: [
    { bet: 1, lines: 10 },
    { bet: 2, lines: 10, times: 2 },
  ],
  brandLabel: "HYPER GAMING",
  clock: {
    format: () => "18:25",
  },
  buyBonus: {
    label: "BUY BONUS",
    enabled: true,
  },
  currency: "USD",
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

- 顶部：左侧时间 `.slot-ui-clock`，右侧可选品牌 `.slot-ui-brand`。
- 左侧竖排：menu、fast、sound，默认使用 `lucide` SVG icon，颜色走 `currentColor`；fast 和 sound 都是 toggle 控件。
- 底部：上排可选 `BUY BONUS` CTA 与居中的 `WIN`，下排 `BALANCE`、带币种的 `BET`、竖排 `+/-`、大号 spin 和小号 auto。
- `showFastToggle` 默认显示 fast toggle；显式传 `false` 时隐藏左侧 fast 按钮，但仍保留 `fastMode`、`setFastMode()` 和 `buildSpinParams()` 行为。
- `spin` 支持 `idle`、`connecting`、`spinning`、`presenting`、`collecting`、`error`、`disabled`，禁用态保持可见。`presenting` 用于游戏展示本次逻辑结果期间保持 spin 按钮禁用。

金额默认使用 `Intl.NumberFormat`；也可以传入 `currency`、`locale` 或 `formatMoney(amount)`。金额输入必须是 finite number。

新增配置：

- `brandLabel?: string`：右上品牌文案；不传则不渲染品牌，基础库不硬编码品牌。
- `clock?: false | SlotUiClockOptions`：`false` 时不渲染时间；`now`、`format`、`locale`、`hour12` 和 `updateIntervalMs` 可用于稳定测试或本地化。`updateIntervalMs` 必须是正整数。
- `buyBonus?: false | SlotUiBuyBonusOptions`：`false` 时不渲染按钮；`label` 默认 `BUY BONUS`，`enabled: false` 会同步 disabled 和 `aria-disabled`。
- `onMenu` / `onBuyBonus`：对应 HUD 按钮 callback；未传 callback 时点击不会伪造业务逻辑。`onInfo` 会作为 menu 的兼容 fallback。

## Game Adapter

`SlotGameAdapter` 至少实现：

- `mount(root, context)`：挂载游戏层。
- `applySpinResult(result)`：接收 `rawResult`、`gmi`、`GameLogic`、`totalwin`、`results`、`userInfo`。

可选实现：

- `applyInitialState(state)`
- `setUiState(snapshot)`
- `destroy()`

## UI-only Controller

`createSlotUiController()` 只负责创建 HUD DOM、绑定按钮 handler、渲染 `SlotUiStateSnapshot`，不接受 `live`、`clientFactory` 或 `logicFactory`。上层框架可以用它接管 spin/bet/sound/fast/auto/buy bonus，再自行安排网络、logic 转换和 collect 时序。

```ts
import { createSlotUiController } from "@slotclientengine/uiframeworks";

const controller = createSlotUiController({
  root,
  betOptions: [{ bet: 1, lines: 10 }],
  handlers: {
    onSpin: () => void frameworkSpin(),
    onIncreaseBet: () => setBetIndex(1),
    onDecreaseBet: () => setBetIndex(0),
    onMutedChange: setMuted,
    onFastModeChange: setFastMode,
    onAutoModeChange: setAutoMode,
  },
});

controller.update(snapshot);
```

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

`apps/uiframeworksviewer` 提供 mock/live 两种模式，用来检查 `docs/ui002.png` 风格、不同视口、长金额、sound off、error、loading、win、auto、fast active、buy bonus disabled、no brand 和 clock disabled 状态。

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
