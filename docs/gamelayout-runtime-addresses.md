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
gamelayout:/node/conveyor/slot/amount
gamelayout:/node/banner/text-layer/title
gamelayout:/reel/main
gamelayout:/reel/main/layer/win
gamelayout:/mode/BaseGame
gamelayout:/mode/BaseGame/bgm
gamelayout:/transition/BaseGame/FreeGame
gamelayout:/transition/BaseGame/FreeGame/effect/spine/event/Start
gamelayout:/popup/free-entry
gamelayout:/popup/free-entry/layer/title
gamelayout:/popup/free-entry/string/image-string/imgnumber-0
gamelayout:/audio/music/base-bgm
gamelayout:/audio/effect/award.coin
gamelayout:/resource/spine/Nearwin1
gamelayout:/resource/spine/Nearwin1/instance/nearwin-left
gamelayout:/resource/spine/Nearwin1/instance/nearwin-left/slot/amount
gamelayout:/popup/free-entry/instance/help-1/layer/root
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

- `list()` 返回 immutable snapshot：静态 manifest catalog 加调用时仍 live 的显式 instance；旧 snapshot 不会随后变化。
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

const pooledNumber = await numberFactory.create({
  pooled: true,
  text: "50",
  anchor: { x: 0.5, y: 0.5 },
});
// 使用完成后统一 destroy；池化对象归还该 address 的池，永久对象真正释放。
pooledNumber.destroy();
```

`pooled` 默认为 `false`。每个 canonical factory address 只有一个空池起步，按同时取用的峰值惰性增长；
image-string 的 `text/anchor` 在每次取出时重新设置，因此 `"100"`、`"50"` 不会产生两个池。
池化句柄 `destroy()` 后立即 stale，runtime destroy 会永久释放该地址全部 idle/active 实例。
`pooled: true` 与 live `instanceId` 互斥。

active Symbols package 还发布 exact 程序工厂
`gamelayout:/symbol-package/<binding-id>/symbol/<symbol>`。它从 canonical symbol catalog 创建 normal
程序对象，支持同一 `create({ pooled })` 合同；unknown、inactive binding 或 symbol 显式失败。

需要用 address 唯一定位程序对象时，在创建时显式传 `instanceId`：

```ts
const nearwin = await runtime.createRenderObject("Nearwin1", {
  instanceId: "nearwin-left",
});
const instanceAddress = runtime.addresses.addressOf(nearwin);
// gamelayout:/resource/spine/Nearwin1/instance/nearwin-left
```

`instanceId` 可不传；不传保持旧的匿名 caller-owned 对象，但 `addressOf()` 会显式失败。ID 是 owner address 下的 exact
segment，`"gamelayout"` 只是一个合法普通值；相同 resource owner 下同时存活的重复 ID 在资源 prepare 前失败，不同 owner
可复用同名。对象 destroy 后地址立即注销，旧 endpoint 变为 stale，ID 可以重新使用。runtime 不生成 UUID，也不把 ID 写入 manifest。

image-string factory 强制要求 `text`；其它 kind 禁止传 image-string options。返回对象由调用者 detach/destroy。
兼容接口 `createRenderObject()` 与 `createImgNumberRenderObject()` 仍可使用。程序图片沿用 package
`coordinateOrigin`：`center` 时图片中心是对象原点，挂到 Spine slot 或其它 anchor 时无需由游戏手工减去
半个图片尺寸；缺失/`top-left` 时继续以图片左上角为对象原点。

在 Game Layout Editor 中导入 ImgNumber ZIP 后，在资源详情填写程序键（例如 `win-amount`）并点击
“设为程序资源”；展开详情即可复制由共享 formatter 生成的
`gamelayout:/resource/image-string/win-amount`。未绑定的 ImgNumber 不会显示程序工厂地址，也不会仅因导入而进入 production closure。

## 统一 parent mount

所有安全父节点都解析为同一个 opaque `RenderObjectLayer`，程序侧优先使用一次 address-native mount：

```ts
const child = await runtime.createImgNumberRenderObject("WinNumber", {
  text: "1280",
});
const handle = runtime.addresses.mount(
  "gamelayout:/resource/spine/Nearwin1/instance/nearwin-left/slot/amount",
  child,
  { order: 10 },
);

handle.detach(); // 幂等；只 detach，不 destroy child
child.destroy();
```

parent 可以是 `layer/<layout|reel|transition|popup>`、reel `bottom/top/win`、node `before/child/after`、authored/program
Spine exact slot、authored/program VNI exact text layer，以及带显式 ID 的程序 Popup `.../instance/<id>/layer/root`。
`order` 缺省 `0` 且必须是 safe integer，只在该 exact parent 内排序；不会跨 Spine slot 改 draw order，也不会改 authored
全局 order。unknown/wrong-kind/stale parent、borrowed/already-mounted child 都显式失败。child destroy、parent destroy、
Popup session 结束或 runtime destroy 会清理 attachment，但 caller-owned child 的 destroy ownership 不转移。

对象引用场景也可直接调用 `spineOrVni.getChildLayer({kind:"spine-slot",slot:"amount"})` 或
`getChildLayer({kind:"vni-text-layer",layerId:"title"})`；相同 exact ref 返回稳定 façade，不支持的 kind 和 unknown exact 名称失败。

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

## Runtime 状态与动画事件

每个 package runtime 使用同一个 package-owned event manager 发布已经提交的离散边界：

```text
gamelayout:/popup/<id>/session/<queued|opening|active|closing|finished|cancelled|failed>
gamelayout:/popup/<id>/phase/<phase>/<entered|exited>
gamelayout:/popup/<id>/tier/<tier>/<entered|exited>
gamelayout:/popup/<id>/tier/<tier>/segment/<start|loop|end>/<entered|exited>
gamelayout:/mode/<id>/state/<displayed|stable>/<entered|exited>
gamelayout:/transition/<from>/<to>/lifecycle/<started|switched|ended|failed>
gamelayout:/node/<id>/animation/lifecycle/<started|ended>
gamelayout:/resource/spine/<key>/animation/lifecycle/<started|ended>
```

mode 的 `displayed` 表示 target scene 已提交，`stable` 表示整个 transition 已结束。Spine `started`
只在底层成功接管播放后发布；`ended.detail.outcome` 区分 `completed/stopped/superseded/aborted/failed/destroyed`。
Popup tier 名来自 exact manifest（例如 `bigwin`、`megawin`），shared runtime 不维护业务别名。

package runtime 首次 `init()` 成功后也会为 initial mode 发布 `displayed/entered`，随后发布 `stable/entered`；失败或 rollback 不发布半初始化 occurrence。Scene Layout v5 的 event audio 只消费这份统一 catalog 和 occurrence，不反向生成 audio-track lifecycle event，因此不会形成递归触发族。解锁前的 loop start 保留 intent，once occurrence 不补播。

Symbol instance 直接属于 address，不通过 `bind()`/`wait()` 的额外参数传递：

```text
gamelayout:/symbol-package/<binding-id>/symbol/<symbol-id>/instance/reel/<reel-id>/x/<x|*>/y/<y|*>/state/<state-id>/<entered|exited>
```

例如只监听第 2 列全部行可绑定：

```ts
runtime.addresses.bind(
  "gamelayout:/symbol-package/base/symbol/WL/instance/reel/main/x/2/y/*/state/win/entered",
  ({ address, detail }) => {
    console.log(address, detail.x, detail.y);
  },
);
```

`x/y` 的 exact 坐标和 `*` 组合都由 catalog 预编译；unknown reel、越界坐标或任意非 catalog 组合显式失败。
事件 occurrence 的 `address` 始终是实际 exact instance address，即使 listener 绑定的是 wildcard address。
manager 每次 symbol dispatch 只查询 exact/exact、exact/_、_/exact、_/_ 四个地址，不解析 glob；没有相关
listener/waiter 时不创建 occurrence/detail，也不调用 detail factory。symbol 只在当前 visible、settled occurrence
的 resolved visual state 实际变化时按旧 state exited、新 state entered 的顺序发布。

## 统一打开和关闭 Popup

顶层 `popups` 中的三类 binding 都使用 exact owner 地址打开。Game Layout Editor 中没有 mode/transition 直接引用的 package，
需要在 Popup 工作区点击“设为程序 Popup”后才会保留到顶层 `popups` 并显示可复制地址。

```ts
import { formatGameLayoutRuntimeAddress } from "@slotclientengine/gameframeworks";

const address = formatGameLayoutRuntimeAddress("popup", "help-panel");
const session = runtime.enqueuePopup({
  address,
  type: "single-state",
  instanceId: "help-1",
});

if (!session.instanceAddress) throw new Error("missing Popup identity");
const badgeMount = runtime.addresses.mount(
  `${session.instanceAddress}/layer/root`,
  helpBadge,
);

await session.presented;
await delayTime(2);
// 默认等待该类型的正式 end/dismiss 流程；cleanup 可用 session.cancel()。
await session.close();
await session.finished;
badgeMount.detach();
```

`enqueuePopup()` 会同时校验 owner 地址存在、binding type 与请求输入；Award 还严格校验 raw 金额。程序 Popup、mode award 与
transition prelude 共用一个 FIFO 和 active slot，当前项完整关闭后才启动下一项。`openPopup()` 是明确的 fail-fast 立即入口，存在 active、
pending 或 mode transition 时失败。session 的 `close()` 只操作自身 identity；queued session 会被取消，stale session 不会关闭后来项。
`presented` 在请求真正轮到并进入首个稳定展示阶段时完成，`finished` 在正常/立即关闭或 queued cancel 后完成，runtime destroy 时 reject。
每个 binding 的 player 在 runtime 初始化时创建一次并跨请求复用；全部 Scene Layout Popup 共用一个 runtime-owned 压暗层，按当前 manifest
更新颜色、透明度和 visibleStates。`getActivePopupAddress()` 只返回当前 active owner 或 `null`。全局 `closePopup()` 保留给不持有 session
的宿主 cleanup；session 不拥有 player，caller 不得 destroy package-owned Popup。

`instanceId` 同样可省略；省略时 `session.instanceAddress === null`。显式 ID 的 queued session 在返回时就注册 root parent，
因此可以预先 mount；只有 active session 的 group 可见。finished/cancelled/failed 后地址注销并 detach 全部 child，同一 ID 随后可复用。

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

未绑定的 Editor audio asset 没有 runtime address。legacy BGM 地址来自导出的 exact music name 与 mode binding，
不能通过地址绕过 mode owner 主动换曲；这些 structural endpoint 只提供 owner/snapshot 定位，不生成可绑定的
music 或 mode-BGM lifecycle event。event audio 应使用 `mode/<id>/state/stable/entered|exited` 等业务状态边界驱动，
避免音频自身再次触发音乐或音效。

## 生命周期和错误处理

Editor 工具需要枚举 event 时必须调用 RenderCore 的纯 catalog/inspection API，而不是解析地址字符串或维护另一张
业务 event 表。`inspectSceneLayoutRuntimeEventCatalog({ manifest, files })` 会严格检查完整 mapped Layout closure 与
嵌套 Symbols/Popup manifest，再返回与 production runtime 共用 compiler 生成的 frozen event descriptor、family 和
facets；该过程不创建 Pixi Application、player、texture、Object URL 或 ticker。

EditorCore 的 event group dialog 只把 catalog facets 用作渐进式筛选，最终保存的仍是 exact canonical address。
Symbol 的全部、指定列、指定行和指定 cell 分别选择 catalog 已有的 `*/*`、`x/*`、`*/y`、`x/y` entry；selector
不会变成 `bind()/wait()` 的额外参数，也不会生成 catalog 外的组合。

Symbol 状态包含两类互不替代的 event：

- `gamelayout:/symbol-package/<binding-id>/symbol/<symbol>/instance/reel/main/x/<x>/y/<y>/state/<state>/entered|exited`
  表示一个已落定 occurrence 的实际状态边界，保留 exact 坐标和 wildcard 订阅。
- `gamelayout:/symbol-package/<binding-id>/symbolsstatebatch/<symbol>/<state>` 表示一次批量播放请求；每个 request
  只发一个 occurrence，不含坐标，也不等待逐图标 animation 完成。

`playMainReelSymbolStateBatch()` 的每个 request 可显式传 `symbol`。显式值必须属于当前 Symbols package，且对应 code
必须实际出现在该 request 的 positions 中；省略时从预检后的 positions 选择最小 symbol code 对应的 symbol。runtime 会先完成
整批坐标、state、代表 symbol 与 event address 预检，再按 request 顺序发出全部 batch event，最后才启动逐图标状态切换：

```ts
await runtime.playMainReelSymbolStateBatch([
  {
    positions: winPositions,
    symbol: "WL", // 可省略；省略时取 positions 中最小 symbol code
    state: "win",
    options: {
      transitionMode: "immediate",
      completion: "once-complete",
    },
  },
]);
```

因此同一组中奖图标可只给 batch event 绑定一次音效，同时仍保留逐 occurrence 的 symbol-state event 给其它表现逻辑。
同地址的两个 request 仍是两个 occurrence；空 positions、未知或不在 positions 中的显式 symbol、未知 state、已 abort
signal 都不会产生 batch event 或部分启动。

| capability                              | ownership                      | 失效边界                                              |
| --------------------------------------- | ------------------------------ | ----------------------------------------------------- |
| authored RenderObject/RenderObjectLayer | runtime-owned borrowed         | runtime destroy；active owner 还受 mode/reel 状态约束 |
| popup descriptor/string input           | runtime-owned/immutable        | runtime destroy；input 仅对指定 request 生效          |
| audio effect playback handle            | AudioRuntime-owned handle      | ended/stopped/failed 或 runtime destroy               |
| runtime resource factory output         | caller-owned                   | 调用者 detach/destroy                                 |
| event subscription/waiter               | caller disposes/runtime cleans | dispose、abort 或 runtime destroy                     |

不要缓存 raw display/audio 对象，也不要从 manifest filename、ZIP physical path 或 asset hash 重建地址。
