# @slotclientengine/gameframeworks

`gameframeworks` 是后续 slot 游戏默认 facade。游戏侧默认只依赖 `@slotclientengine/gameframeworks`，由本包整合 `uiframeworks` HUD、`netcore` live session 和 `logiccore` 的 `GameLogic`。

## Scene-layout 零代码模板

`@slotclientengine/gameframeworks/scene-layout-template` 是 app-facing 的唯一模板入口。
`inspectSceneLayoutTemplateInputs()` 编译 immutable readiness snapshot；
`createSceneLayoutSlotGameTemplate()` 一次接收 layout ZIP bytes、strict serializable
config 和 session-only credential，内部组合现有 framework/session/logic/render
lifecycle。调用方不传 Pixi factory、Spine/VNI player、symbol resolver、reel callback 或
game-specific adapter。

server authoring JSON 只用于 bet method/component catalog 与 review suggestion，不属于
runtime 输入。reel presentation (`standard | grid-cell`) 和 round flow (base + optional
cascade) 是两条独立 versioned 轴；未知 kind/block、缺资源、renderMode mismatch 与
capability mismatch 都在 mutation 前显式失败。

## 基本用法

```ts
import {
  createSlotGameFramework,
  getComponentScenesByName,
  type SlotGameAdapter,
} from "@slotclientengine/gameframeworks";
import "@slotclientengine/gameframeworks/styles.css";

let unsubscribeViewport = () => undefined;
const gameAdapter: SlotGameAdapter = {
  mount(context) {
    console.log(context.getViewport().frameDesignSize);
    context.gameLayer.append(document.createElement("ol"));
    unsubscribeViewport = context.onViewportChange((viewport) => {
      console.log("resize", viewport.frameDesignSize);
    });
  },
  async playSpin(logic) {
    const scenes = getComponentScenesByName(logic, "lineWin");
    console.log(logic.getTotalWin(), scenes.length);
  },
  destroy() {
    unsubscribeViewport();
  },
};

const framework = createSlotGameFramework({
  root: document.querySelector("#app")!,
  gameAdapter,
  live: {
    serverUrl: "wss://example.test/game",
    token: "token",
    gamecode: "game001",
  },
  betOptions: [{ bet: 1, lines: 10 }],
});

await framework.connect();
await framework.spin();
```

## 预连接 Session

普通游戏继续直接创建 framework 并调用 `framework.connect()`。如果游戏有独立 loading 首屏，可以先在 loading 的 `99%` 阶段只准备 live session：

```ts
import {
  createSlotGameFramework,
  prepareSlotGameLiveSession,
} from "@slotclientengine/gameframeworks";

const liveSession = await prepareSlotGameLiveSession({ live });

const framework = createSlotGameFramework({
  root,
  gameAdapter,
  live,
  liveSession,
  betOptions,
});

await framework.connect();
```

`prepareSlotGameLiveSession()` 只创建 session 并完成 `client.connect()` / `client.enterGame()`，不会创建 UI、mount adapter 或渲染 Pixi。进入游戏时把同一个 `liveSession` 传给 framework，`framework.connect()` 会幂等读取当前 userInfo，不会重复 WebSocket connect 或 enterGame。若同时传 `liveSession` 和 `clientFactory`，会显式失败，避免调用方误以为自定义 factory 仍会生效。

## 游戏侧合同

- `framework.spin()` 返回 `Promise<GameLogic>`。
- `adapter.playSpin(logic)` 收到的就是当前 spin 的 `GameLogic`。
- `adapter.playSpin(logic)` 的 Promise resolve 表示游戏动画或展示完成；框架随后按协议自动 collect。
- 游戏不要解析 `gmi.replyPlay` 或调用 `client.collect()`。
- `balance`、`bet`、`win`、spin 状态和 collect 状态由框架自动驱动 HUD。
- 游戏如需动态 canvas backing size，应通过 `context.getViewport()` 读取初始 viewport，并通过 `context.onViewportChange(listener)` 订阅后续 resize；不要从游戏 app 直接依赖 `@slotclientengine/uiframeworks`。

## 游戏内 UI Factory

默认不传 `uiFactory` 时，framework 继续同步创建现有 `uiframeworks` DOM HUD，DOM class、frame policy、金额格式和按钮行为不变。其他 presentation 可以实现 `SlotGameUiFactory` 后按 framework instance 注入：

```ts
import type {
  SlotGameUi,
  SlotGameUiFactory,
} from "@slotclientengine/gameframeworks";

const uiFactory: SlotGameUiFactory = {
  create(context): SlotGameUi {
    // frame/gameLayer/overlay 必须在 create() 返回前同步建立。
    const frame = document.createElement("div");
    const gameLayer = document.createElement("div");
    const overlay = document.createElement("div");
    frame.append(gameLayer, overlay);
    context.root.replaceChildren(frame);

    return {
      elements: { frame, gameLayer, overlay },
      getViewport: () => currentViewport,
      onViewportChange: (listener) => subscribeViewport(listener),
      update: (snapshot) => renderHud(snapshot),
      destroy: () => frame.remove(),
    };
  },
};

const framework = createSlotGameFramework({
  root,
  gameAdapter,
  live,
  betOptions,
  uiFactory,
});
```

`context.initialState` 和后续 `update(snapshot)` 都是 framework 状态的只读投影。UI 只能通过 `context.commands` 请求 spin、bet、mute、fast 和 auto 操作；不得持有 session、socket、adapter、collect 或 balance reconciliation。每次 framework 创建都会获得独立的 context、commands、UI handle、viewport subscription 和 destroy 生命周期。保留的 command 在 framework destroy 后不会再启动业务操作。

任一 active connect/spin/presentation 在 destroy 后恢复时都会以 destroyed error 终止，不会迟到执行 initial state、presentation 或 collect。非法 factory handle 会在创建边界显式失败；UI `update()` 抛错时 framework 保留原始异常、只通知一次 `onError`，并清理 UI、session 和 adapter。

## Frame Policy

`createSlotGameFramework()` 接受 `framePolicy` 并透传给底层 `uiframeworks`。默认不传时保持固定设计分辨率行为；传入 focus policy 时，DOM frame 会根据浏览器 viewport 计算提交给游戏 canvas 的逻辑尺寸、CSS 缩放和黑边居中：

```ts
const framework = createSlotGameFramework({
  root,
  gameAdapter,
  live,
  betOptions,
  designSize: { width: 1125, height: 2000 },
  framePolicy: {
    mode: "focus",
    maxDesignSize: { width: 2000, height: 2000 },
    preferredPortraitSize: { width: 1125, height: 2000 },
    focusRect: { width: 720, height: 1080 },
    minFocusMargin: { left: 60, right: 60, top: 60, bottom: 60 },
  },
});
```

`framePolicy` 只影响 DOM frame 和 canvas 逻辑尺寸，不改变 live、spin、presenting、collect、money 或 state 语义。adapter 的 viewport listener 抛错时会进入框架 error 路径，不会被静默吞掉。

横竖屏 art 尺寸不同的游戏可以传 `mode: "orientation-focus"`，按浏览器 viewport 的 `height > width` 选择 `portrait` variant，否则选择 `landscape` variant。该模式仍只透传给 `uiframeworks` 计算 DOM frame，不承载游戏图片名、symbol、reel 或 live 逻辑：

```ts
framePolicy: {
  mode: "orientation-focus",
  variants: {
    landscape: {
      maxDesignSize: { width: 2000, height: 2000 },
      focusRect: { width: 1424, height: 1061 },
    },
    portrait: {
      maxDesignSize: { width: 1174, height: 2000 },
      focusRect: { width: 1130, height: 1061 },
      minFocusMargin: { left: 22, right: 22 },
    },
  },
}
```

从静态 YAML 派生 frame policy 时，`packages/gameframeworks` 只读取每个 art variant 的 `background`、`frameFocusRect` 和 `minFocusMargin`。`focusRect`、`mainReelBackgroundPositionInFocusRect`、`conveyor.positionInFocusRect`、`reelAreaInMainReelBackground` 等游戏画面部件坐标由游戏 app 和 `rendercore` 通用几何 helper 使用，不能让 DOM frame policy 参与主转轴、传送带或转轮内容区定位。

## 逻辑读取

本包重新导出 `GameLogic`、`GameLogicStep`、`LogicComponent`、`SceneMatrix`、`WinResult` 等常用类型。游戏可通过 `logic.getStep(index)`、`logic.getComponentScenes(stepIndex, name)`，或以下 helper 按组件名读取：

- `findComponentSteps(logic, name)`
- `getComponentScenesByName(logic, name, options?)`
- `getComponentResultsByName(logic, name, options?)`

helper 只接收 `GameLogic`，不会暴露 raw 协议 wrapper。

## 游戏配置 Helper

本包窄重导出浏览器侧游戏配置能力，当前包括：

- `createGameConfig(config)`
- `LogicGameConfig`
- `LogicReels`

游戏需要读取 reel 配置或反查 stop y 时，应从 `@slotclientengine/gameframeworks` 导入这些 facade API，不直接依赖 `@slotclientengine/logiccore`。本包不会重导出 `logiccore/node` 或文件系统 loader。

## 静态配置 Helper

`@slotclientengine/gameframeworks/static-config` 提供浏览器安全的静态配置类型和 helper。这个子路径不解析 YAML、不读取文件系统，也不知道具体游戏的图片名；YAML 到 TS 的编译由 `apps/buildgamestatic` 负责。

常用 API：

- `assertSlotGameStaticConfig(config)`：校验 schema、skin、live server、art variant、frame focus、reel 参数和资源对象形态。
- `getSlotGameStaticSkin(config, skinId)`：按 skin id 取配置，缺失时显式失败。
- `parseSlotGameStaticSkinId(config, value)`：按 `supportedSkins` 校验 URL 中的 skin。
- `assertNoRejectedQueryParams(params, rejectedNames)`：拒绝 `serverUrl` 等静态构建不允许覆盖的 query。
- `createSlotGameFramePolicyFromStaticConfig(config, skinId)`：从静态配置生成 `orientation-focus` frame policy。

所有 helper 都采用 fail-fast 策略：缺字段、未知字段、非法 URL、非法数字、focus rect 越界、reel area 与 reel 配置不匹配都会抛错，不补默认值或静默忽略。

## Fail-fast 策略

- live URL 只允许 `ws://` 或 `wss://`。
- mock 只用于测试和 viewer 显式 mock 模式。
- 缺少 `gmi`、`totalwin`、`results`、结果长度不一致、非法 balance 或 logic 解析失败都会抛错。
- adapter reject、collect 失败、netcore `error`、非预期 `disconnect`、`reconnecting`、服务端错误消息和 logger `warn/error` 都会让框架进入 error。

## Collect 时序

spin 顺序为：

```text
UI spinning -> netcore spin -> GameLogic -> UI presenting -> adapter.playSpin(logic)
  -> adapter resolve -> optional collect -> UI idle
```

最终 collect 规则保持为：

```ts
(totalwin > 0 && results >= 1) || (totalwin === 0 && results > 1);
```

因此 `framework.spin()` resolve 时，必要 collect 已完成并且状态已回到可安全下一次 spin 的 `idle`。

## 验收命令

```bash
pnpm --filter @slotclientengine/gameframeworks lint
pnpm --filter @slotclientengine/gameframeworks test
pnpm --filter @slotclientengine/gameframeworks typecheck
pnpm --filter @slotclientengine/gameframeworks build
pnpm --filter @slotclientengine/gameframeworks format:check
```
