# @slotclientengine/gameframeworks

`gameframeworks` 是后续 slot 游戏默认 facade。游戏侧默认只依赖 `@slotclientengine/gameframeworks`，由本包整合 `uiframeworks` HUD、`netcore` live session 和 `logiccore` 的 `GameLogic`。

facade 同时公开 Scene Layout package runtime 与 slot operation coordinator 的 app-facing factory/type；游戏可以注入只含异步 `start` 的 typed 业务 handler，但无需从 package 内部 display tree 重建 root/reel 层级。

facade 同时导出 `SceneLayoutGameModePrepareOptions` 与 `SceneLayoutGameModeRequestOptions`。正常 mode request 保持 manifest 声明的 Popup/Spine/video 流程；宿主已明确选择跳过表现时可传 `{ immediate: true }`，runtime 仍校验 direct edge并原子准备/提交target，但不播放或伪造被跳过的transition event。真实 displayed/stable mode event继续发布，`immediate`不能与`preludePopupStrings`同时使用，也不能抢占已开始的转场。

Scene Layout 的 program-only JSON 数据也由 facade 暴露类型。游戏在创建画面 runtime 前可调用 `packageResource.loadJsonData("spin-config")`，再交给 app-owned strict parser。数据源选择必须由 app 配置显式决定：选择 `gameConfig` 时继续使用现有 Symbols game config；选择 `gameLayout` 时才加载 exact JSON key。两者没有自动优先级、同名覆盖或 fallback，解析后的公开本地轮带/权重表再传给既有 reel/value resolver API。

facade 同时导出 `SceneLayoutAudioEffectPlayOptions` 与 `AudioPlaybackHandle`。audio 程序键可直接 `runtime.playEffect(key)` 单次播放，或传 `{ loop: true, endEvent }`；结束 Event、`handle.stop()` 与 `runtime.stopEffect(key)` 分别提供自动、单次精确和 route 级停止边界。

facade re-export `gamelayout:/` runtime address formatter、parser、resolver 与 endpoint/event 类型。
程序接入见 [`docs/gamelayout-runtime-addresses.md`](../../docs/gamelayout-runtime-addresses.md)。
authored UI 控件可直接用 `runtime.getUiControl(id)` 或 `ui-control` endpoint 取得；facade 导出 radio 与 step-slider capability 类型，不要求游戏依赖 RenderCore 或接触 Pixi display tree。

facade 同时 re-export RenderCore 的 `RenderObject.motion` 合同与 manual-clock runtime factory。受 Scene Layout、
reel presentation layer 或 exact Spine slot 管理的 owned object 可用 `animate()` 同时缓动位置、透明度、x/y 缩放和
顺时针角度，也可用 `fadeIn()` / `fadeOut()`；fade 不改变 `visible`。游戏继续用 `await` / `Promise.all()` 编排，
不需要建立 timeline DSL。settled borrowed Symbol/part 必须先 clone，不能借 motion 绕过 reel owner。

统一父节点组合使用 `runtime.addresses.mount()`；程序 resource/Popup 可选传显式 `instanceId`，再用 live
instance address、`addresses.addressOf()` 或 `RenderObject.getChildLayer()` 精确定位 Spine slot/VNI text layer。ID 不传时保持
匿名兼容路径，重复 live ID 失败；mount/detach 不转移 caller-owned child 的 destroy ownership。

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
  framePolicy,
  live: {
    serverUrl: "wss://example.test/game",
    token: "token",
    gamecode: "game001",
  },
  betOptions: [{ bet: 1, lines: 10 }],
  initialMuted: false,
  initialFastMode: false,
  initialAutoMode: false,
});

await framework.connect();
await framework.spin();
```

## 测试服下一轮 RNG

需要测试服务器强制下一轮局面时，consumer 可以显式启用 instance-scoped
`rngConsole`：

```ts
const framework = createSlotGameFramework({
  // 其它正式配置...
  rngConsole: {
    target: window,
    log: (message) => console.info(message),
  },
});
```

framework 会在 target 上安装非枚举的 `rng(...values)`。浏览器控制台输入：

```js
rng(8, 61, 41, 33, 13, 729);
```

下一次真正交给 live session 的 spin params 会增加
`lstrand: [8, 61, 41, 33, 13, 729]`，随后立即清空该 override。before-connect、
非 idle 或 destroyed 状态下被拒绝的 spin 不消费它；请求一旦交给 session，即使
网络失败也不会自动恢复，因为无法确认请求是否已经到达服务器。连续合法调用采用
last-write-wins。

参数必须是一个或多个非负 safe integer；不接受 string、array 参数、空调用或隐式
转换。非法调用显式失败并保留此前合法的 pending 序列。若
`buildSpinRequest()` 本身返回 `lstrand`，console override 只在被消费的那一轮覆盖
它，后续恢复 app 原请求。

每次 GMI 成功解析后，framework 会通过配置的 logger 输出可复制的
`rng(11,22,33)`。target 已存在 `rng` 时创建 framework 会显式失败，不覆盖宿主；
`framework.destroy()` 会清空 pending，并且只移除仍属于该实例的 command。
`rngConsole` 不默认启用，也不能用 server RNG 驱动客户端公开轮带、reel phase 或
其它视觉随机。

## 预连接 Session

普通游戏继续直接创建 framework 并调用 `framework.connect()`。如果游戏有独立 loading 首屏，可以先在 loading 的 `99%` 阶段只准备 live session：

```ts
import {
  createSlotGameFramework,
  prepareSlotGameLiveSession,
} from "@slotclientengine/gameframeworks";

const liveSession = await prepareSlotGameLiveSession({ live, signal });

const framework = createSlotGameFramework({
  root,
  gameAdapter,
  live,
  liveSession,
  betOptions,
  framePolicy,
});

await framework.connect();
```

`prepareSlotGameLiveSession()` 只创建 session 并完成 `client.connect()` / `client.enterGame()`，不会创建 UI、mount adapter 或渲染 Pixi。进入游戏时把同一个 `liveSession` 传给 framework，`framework.connect()` 会幂等读取当前 userInfo，不会重复 WebSocket connect 或 enterGame。若同时传 `liveSession` 和 `clientFactory`，会显式失败，避免调用方误以为自定义 factory 仍会生效。

`initialMuted/initialFastMode/initialAutoMode` 缺省都为 `false`，非 boolean 会 fail-fast。显式值会进入第一份 framework snapshot、UI initial state 与 `onStateChange`；之后玩家操作仍只通过 framework commands 更新唯一的 instance state。

## 游戏侧合同

- `framework.spin()` 返回 `Promise<GameLogic>`。
- `adapter.playSpin(logic)` 收到的就是当前 spin 的 `GameLogic`。
- `adapter.playSpin(logic)` 的 Promise resolve 表示游戏动画或展示完成；框架随后按协议自动 collect。
- adapter 可成对实现同步 `startSpinPresentation()` 与 `cancelSpinPresentation(error)`：框架先真正调用
  `session.spin()` 发出请求，再启动无目标预转；响应、解析或播放失败时只取消一次。每个 framework
  spin 请求只启动一次，响应中后续的 free-game/refill 展示不重新进入该等待边界。
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
  framePolicy,
});
```

`context.initialState` 和后续 `update(snapshot)` 都是 framework 状态的只读投影。UI 只能通过 `context.commands` 请求 spin、bet、mute、fast 和 auto 操作；不得持有 session、socket、adapter、collect 或 balance reconciliation。每次 framework 创建都会获得独立的 context、commands、UI handle、viewport subscription 和 destroy 生命周期。保留的 command 在 framework destroy 后不会再启动业务操作。

任一 active connect/spin/presentation 在 destroy 后恢复时都会以 destroyed error 终止，不会迟到执行 initial state、presentation 或 collect。非法 factory handle 会在创建边界显式失败；UI `update()` 抛错时 framework 保留原始异常、只通知一次 `onError`，并清理 UI、session 和 adapter。

## Frame Policy

`createSlotGameFramework()` 要求提供 `framePolicy` 并透传给底层 `uiframeworks`。DOM frame 根据浏览器 viewport 与 policy 计算提交给游戏 canvas 的逻辑尺寸、CSS 缩放和黑边居中；不再接受独立 `designSize`，也不会隐式回退到固定设计分辨率：

```ts
const framework = createSlotGameFramework({
  root,
  gameAdapter,
  live,
  betOptions,
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

facade 同时重新导出 `FeatureBar2Data` 与 `parseFeatureBar2Data()`；游戏通常直接调用
`logic.getFeatureBar2Data(stepIndex, exactName)`，未触发时得到 `undefined`，错误 type/shape
显式失败。feature 名、队列长度和显示映射仍由游戏拥有。

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
UI spinning -> netcore spin request -> optional adapter pre-spin -> GameLogic
  -> UI presenting -> adapter.playSpin(logic)
  -> adapter resolve -> optional collect -> UI idle
```

最终 collect 规则保持为：

```ts
(totalwin > 0 && results >= 1) || (totalwin === 0 && results > 1);
```

因此 `framework.spin()` resolve 时，必要 collect 已完成并且状态已回到可安全下一次 spin 的 `idle`。

## 可选性能边界

`SlotGameFrameworkOptions.performanceObserver` 是实例级、默认关闭的诊断合同。它以调用方
可注入的单调 clock 上报 framework mount/connect、UI spin command、request build/send、
response、logic parse、adapter presentation、collect 和终止边界；startup 使用 trace id 0，
spin 使用实例内递增 id。事件不携带 request/response、token、logic、scene 或随机数。
observer 的 clock/callback 抛错或返回非有限值时被忽略，不得改变游戏状态或替换原错误。
预转 adapter 启动、完成和取消分别以 `adapter-pre-spin-start/complete/cancel` 上报。

## 配置驱动 round facade

本包重导出 logiccore 的 strict round-flow parser、immutable execution-plan compiler 与相关类型，供游戏和 scene-layout template 通过默认 facade 接入。framework 不复制 server round 解释或 renderer movement；配置模板把规范化 `GameLogic` 先交给 compiler，再把冻结 plan 交给 rendercore coordinator。游戏专属 amount/value resolver 与 typed extension 仍由 app 注入。

scene-layout readiness 使用 ZIP inspection 得到的已解析 filename-key 文件检查 active symbol manifest、value presentation、sequential collect 与 popup capability，不提前创建 Pixi、图片 texture 或 Worker；真正启动 runtime 时才构造并独立销毁渲染资源。

## 验收命令

```bash
pnpm --filter @slotclientengine/gameframeworks lint
pnpm --filter @slotclientengine/gameframeworks test
pnpm --filter @slotclientengine/gameframeworks typecheck
pnpm --filter @slotclientengine/gameframeworks build
pnpm --filter @slotclientengine/gameframeworks format:check
```

正式游戏可从 facade 使用 `SlotOperationPlanV2`、strict server view、V2 generators、
mutation derivation 与 `finalizeSlotOperationPlanV2`；本地 suggestion/review 不从 facade
导出，避免 authoring 代码进入 live game bundle。render execution 使用 rendercore 的
effect-exact 实例级 operation registry/coordinator。
