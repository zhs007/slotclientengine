# Game Layout Runtime Address SPI

Game Layout production runtime 通过 `SceneLayoutPackageRuntime.addresses` 提供统一、严格且可枚举的定位接口。
地址只定位编辑器已经创建并导出的 owner，或 manifest 中显式声明的 runtime resource；它不是 JSON Pointer，
也不能访问 Pixi display tree、音频 backend 或 physical asset path。

## 快速开始

```ts
const EVENT =
  "gamelayout:/transition/BaseGame/FreeGame/effect/spine/event/Start";

const dispose = runtime.addresses.bind(EVENT, (occurrence) => {
  // transition 的目标场景已经原子提交；回调必须同步返回。
  beginFreeGamePresentation(occurrence.sequence);
});

await runtime.requestGameMode("FreeGame");

// 不再需要时解除绑定；runtime.destroy() 也会统一清理。
dispose();
```

需要用 Promise 编排时，先创建 waiter，再发起会触发事件的操作，避免漏掉同步 occurrence：

```ts
const start = runtime.addresses.wait(EVENT, { signal });
const transition = runtime.requestGameMode("FreeGame");
await start;
await doSomethingAtStart();
await transition;
```

`bind()` 不回放历史事件。listener 按注册顺序同步调用，返回 Promise 或抛错都会显式失败；异步逻辑应使用
`wait()`。`wait()` 支持 `AbortSignal`，runtime 销毁时尚未完成的 waiter 会 reject。

## 地址规则

地址固定以 `gamelayout:/` 开头，结构 segment 使用小写，编辑器 identity 保持原始大小写：

```text
gamelayout:/layer/layout
gamelayout:/node/basegame-background
gamelayout:/node/basegame-background/layer/child
gamelayout:/reel/main
gamelayout:/reel/main/layer/win
gamelayout:/mode/BaseGame
gamelayout:/mode/BaseGame/bgm
gamelayout:/mode/BaseGame/bgm/lifecycle/started
gamelayout:/transition/BaseGame/FreeGame
gamelayout:/transition/BaseGame/FreeGame/effect/spine/event/Start
gamelayout:/popup/free-entry
gamelayout:/popup/free-entry/layer/title
gamelayout:/popup/free-entry/string/image-string/imgnumber-0
gamelayout:/audio/music/base-bgm
gamelayout:/audio/music/base-bgm/lifecycle/stopped
gamelayout:/audio/effect/award.coin
gamelayout:/resource/spine/Nearwin1
```

动态 segment 使用 canonical percent encoding。禁止相对地址、空 segment、`.`、`..`、query、fragment、
trailing slash、非 canonical encoding、basename/filename/hash fallback。可使用共享 formatter 避免手写转义：

```ts
import { formatGameLayoutRuntimeAddress } from "@slotclientengine/gameframeworks";

const address = formatGameLayoutRuntimeAddress(
  "transition",
  fromMode,
  toMode,
  "effect",
  "spine",
  "event",
  eventName,
);
```

## 查询与严格解析

```ts
const allEvents = runtime.addresses.list({ kind: "event" });
const descriptor = runtime.addresses.describe(EVENT);
const endpoint = runtime.addresses.resolve(
  "gamelayout:/node/basegame-background",
  "render-object",
);

if (endpoint.kind !== "render-object") throw new Error("unexpected kind");
const background = endpoint.get();
background.setVisible(true);
```

- `list()` 返回按 manifest 编译的 immutable descriptor catalog，不要求对象当前 active。
- `describe()` 只返回 owner、kind、capability 和少量稳定 metadata，不返回 manifest/raw config。
- `resolve(address, expectedKind)` 同时验证地址存在且 kind 精确匹配。
- borrowed endpoint 在使用时检查 runtime 状态；销毁后调用显式失败。
- unknown address、大小写错误、kind mismatch、未 allowlist 音效和非法 factory options 都不 fallback。

## RenderObject 与图层

```ts
const objectEndpoint = runtime.addresses.resolve(
  "gamelayout:/node/basegame-background",
  "render-object",
);
if (objectEndpoint.kind !== "render-object") throw new Error("kind mismatch");
const object = objectEndpoint.get(); // borrowed，不由调用者 destroy

const layerEndpoint = runtime.addresses.resolve(
  "gamelayout:/reel/main/layer/win",
  "layer",
);
if (layerEndpoint.kind !== "layer") throw new Error("kind mismatch");
const layer = layerEndpoint.get(); // opaque RenderObjectLayer，不暴露 Container
layer.add(objectCreatedByProgram);
// 不再显示时：layer.remove(objectCreatedByProgram);
```

标准 layer 地址包括 `layout/reel/transition/popup`，每个 authored node 的 `before/child/after`，以及 reel
的 `bottom/top/win`。调用者负责释放自己创建的对象和 attachment disposer，不销毁 borrowed owner。

## 创建程序 RenderObject

runtime resource 必须在 Game Layout manifest 中显式声明；它和 authored node 是不同 namespace：

```ts
const factory = runtime.addresses.resolve(
  "gamelayout:/resource/spine/Nearwin1",
  "resource-factory",
);
if (factory.kind !== "resource-factory") throw new Error("kind mismatch");
const nearwin = await factory.create(); // caller-owned

const numberFactory = runtime.addresses.resolve(
  "gamelayout:/resource/image-string/WinNumber",
  "resource-factory",
);
if (numberFactory.kind !== "resource-factory") throw new Error("kind mismatch");
const winNumber = await numberFactory.create({
  text: "1280",
  anchor: { x: 0.5, y: 0.5 },
});
```

image-string factory 强制要求 `text`；其它 kind 禁止传 image-string options。返回对象由调用者 detach/destroy。
兼容接口 `createRenderObject()` 与 `createImgNumberRenderObject()` 仍可使用。程序图片沿用 package
`coordinateOrigin`：`center` 时图片中心是对象原点，挂到 Spine slot 或其它 anchor 时无需由游戏手工减去
半个图片尺寸；缺失/`top-left` 时继续以图片左上角为对象原点。

## Authored loop Spine

`gamelayout:/node/<exact-id>` 返回的 authored Spine 仍由 Scene Layout runtime 拥有。对
`kind === "spine" && playback === "loop"` 的对象，可以请求 exact animation，并把
caller-owned、当前 detached 的程序 `RenderObject` 批量绑定到 exact slots：

```ts
const endpoint = runtime.addresses.resolve(
  "gamelayout:/node/conveyor",
  "render-object",
);
if (endpoint.kind !== "render-object") throw new Error("kind mismatch");
const conveyor = endpoint.get();
if (conveyor.kind !== "spine" || conveyor.playback !== "loop")
  throw new Error("expected authored loop Spine");

firstImage.setRotation(90);
firstImage.setScale({ x: -1, y: 1 });
const attachment = conveyor.bindSlotObjects([
  { slot: "slot-0", object: firstImage },
  { slot: "slot-1", object: secondImage },
]);

await conveyor.playAnimation("Start"); // once，完成时 resolve
await conveyor.playAnimation("Idle", { loop: true }); // 第一圈完成时 resolve，动画继续
conveyor.stopAnimation();
attachment.detach();
```

新 playback 会 reject 被 supersede 的未完成 playback；`stopAnimation()`、AbortSignal、
runtime destroy 也会 reject 对应 waiter。unknown animation/slot、重复 slot/object、borrowed
child 或已挂载 child 显式失败。一次 batch 替换失败会恢复该 authored node 原有 attachment；
handle 的 `detach()` 幂等，child destroy 和 runtime destroy 都会清理关系，但 child ownership
始终留在调用者。图片等 child 的局部旋转和缩放由 `RenderObject.setRotation()`、`setScale()` 设置；
旋转单位为顺时针度数，负 scale 可镜像对应轴。Spine attachment 不解释或改写 child transform。
state-machine Spine 只能继续使用 `requestState()`。

## Layout variant 事件

每个 package runtime 都声明全局 `gamelayout:/event/variant-changed`。它只在一次
`applyViewport()`/art-space apply 成功提交且 `variantId` 与上次已发布值不同后同步派发：

```ts
const dispose = runtime.addresses.bind(
  "gamelayout:/event/variant-changed",
  ({ detail }) => {
    console.log(detail.previousVariantId, detail.variantId);
  },
);
```

首次 apply、同 variant resize 和失败 apply 不派发。`detail` 包含
`previousVariantId` 与 `variantId`；回调仍必须同步返回，异步编排使用 `wait()`。

## Popup 深层字符串

Popup 地址以 Scene Layout 的 popup binding id 为 owner，并使用 Popup Editor 中的 exact layer id/string name：

```ts
const value = runtime.addresses.resolve(
  "gamelayout:/popup/free-entry/string/image-string/imgnumber-0",
  "popup-string",
);
if (value.kind !== "popup-string") throw new Error("kind mismatch");

const handle = value.get();
handle.setText(totalWin.toString());

await runtime.requestGameMode("FreeGame", {
  preludePopupStrings: [value.input(totalWin.toString())],
});
```

`get()` 返回 package-owned string handle，可直接 `setText()/resetText()`；`input()` 只构造 typed input，不直接修改 Popup。现有 transition request 仍负责 apply/restore transaction；
因此失败、结束或取消后不会把临时字符串留给下次 Popup。`single-state` 的 popup-layer 地址提供 `get()`，返回 borrowed `RenderObject`；其它 Popup 类型的 layer 地址没有可取的 layer runtime，并会显式失败。地址不会开放内部 Container。

## 音效与 BGM

只有 Game Layout `programmaticEffects` allowlist 中的 route 才有可播放 endpoint：

```ts
const coin = runtime.addresses.resolve(
  "gamelayout:/audio/effect/award.coin",
  "audio-effect",
);
if (coin.kind !== "audio-effect") throw new Error("kind mismatch");
const playback = coin.play();
await playback.finished;
// coin.stop() 会停止同 route 的 pending/active instance。
```

未绑定的 Editor audio asset 没有 runtime address。BGM 地址来自导出的 exact music name 与 mode binding，
不能通过地址绕过 mode owner 主动换曲。可监听两种等价 owner 视角：

```ts
runtime.addresses.bind(
  "gamelayout:/audio/music/base-bgm/lifecycle/started",
  onBaseMusicStarted,
);
runtime.addresses.bind(
  "gamelayout:/mode/BaseGame/bgm/lifecycle/stopped",
  onBaseModeMusicStopped,
);
```

`started` 只在 backend loop instance 成功创建并由 AudioRuntime 接管后发生；`stopped` 只在 fade-out 到零、
instance 已 stop 后发生。同一首 BGM 的 mode 切换不会制造重复 start/stop，mute/pause/duck 也不等于 stop。

## 生命周期和错误处理

| capability                              | ownership                      | 失效边界                                              |
| --------------------------------------- | ------------------------------ | ----------------------------------------------------- |
| authored RenderObject/RenderObjectLayer | runtime-owned borrowed         | runtime destroy；active owner 还受 mode/reel 状态约束 |
| popup descriptor/string input           | runtime-owned/immutable        | runtime destroy；input 仅对指定 request 生效          |
| audio effect playback handle            | AudioRuntime-owned handle      | ended/stopped/failed 或 runtime destroy               |
| runtime resource factory output         | caller-owned                   | 调用者 detach/destroy                                 |
| event subscription/waiter               | caller disposes/runtime cleans | dispose、abort 或 runtime destroy                     |

不要缓存 raw display/audio 对象，也不要从 manifest filename、ZIP physical path 或 asset hash 重建地址。
