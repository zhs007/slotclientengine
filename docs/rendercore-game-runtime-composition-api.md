# RenderCore Game Runtime 坐标、动画、Slot 绑定与换层 API

本文是任务 226 新增 API 的 game runtime 使用文档。适用对象是 production 游戏代码；不用于
Gamelayout Editor、authoring preview 或 standalone viewer。

新游戏默认从 `@slotclientengine/gameframeworks` 导入公共类型和 helper。直接开发 RenderCore package 时，
等价入口位于 `@slotclientengine/rendercore`、`@slotclientengine/rendercore/reel`。

## 1. 稳定 Cell 坐标

### API

```ts
interface SymbolArea {
  getCellAnchor(position: { x: number; y: number }): RenderAnchor;
  resolveAnchor(anchor: RenderAnchor): RenderPoint;
}
```

`ReelSpin`、`CellSpin` 和 legacy grid-cell 的 SymbolArea 都实现同一个合同。

`getCellAnchor()` 返回逻辑可见格中心的 opaque Anchor：

- 不依赖当前格是否有 Symbol；hole `-1` 也可以取得；
- 在 targetless、rolling、部分落停和 settle 阶段保持可解析；
- 不代表 rolling Sprite、轮带经过项或 server stop；
- 落停后与该格 `getSymbol(position).getAnchor()` 的中心坐标一致；
- x/y 必须是范围内整数，runtime destroy 后失效。

取得 area-local 数值坐标：

```ts
const area = runtime.getSymbolArea("main");
const cell = area.getCellAnchor({ x: 2, y: 1 });
const point = area.resolveAnchor(cell);
// point 属于 main SymbolArea local space
```

转换到其它 layer-local 坐标：

```ts
const cell = area.getCellAnchor({ x: 2, y: 1 });
const winLayer = runtime.getRenderLayer("main.win");
const pointInWinLayer = winLayer.resolveAnchor(cell);
```

只为了挂载时，不需要先读取数值：

```ts
const marker = await runtime.createRenderObject("marker");
runtime.getRenderLayer("main.win").addAt(marker, {
  anchor: area.getCellAnchor({ x: 2, y: 1 }),
  offset: { x: 0, y: -20 },
  order: 10,
});
```

### Rolling 中使用

```ts
const anchor = area.getCellAnchor({ x: 2, y: 1 });
runtime.startMainReelContinuousSpin();

// 合法：cell anchor 与 occurrence 解耦
const rollingPoint = runtime.getRenderLayer("main.top").resolveAnchor(anchor);

// 非法：尚未落地时不存在可借用的 exact Symbol occurrence
area.getSymbol({ x: 2, y: 1 });
```

需要跟随格位时长期持有 Anchor；需要存数值时重新调用 `resolveAnchor()`。不要缓存跨 mode、variant 或
Scene Layout placement 变化的旧 `RenderPoint`。

## 2. RenderObject 循环播放

### API

```ts
interface RenderObjectPlayOptions {
  signal?: AbortSignal;
  loop?: boolean;
}

interface RenderObject {
  play(name?: string, options?: RenderObjectPlayOptions): Promise<void>;
  stop(): void;
}
```

### Spine

```ts
const effect = await runtime.createRenderObject("nearwin-effect");
runtime.getRenderLayer("main.top").add(effect, 20);

// Promise 在第一圈完整 loop edge resolve；动画继续循环。
await effect.play("Nearwin", { loop: true });

effect.stop();
runtime.getRenderLayer("main.top").remove(effect);
effect.destroy();
```

### VNI

VNI 播放 authored timeline，不接受 animation name：

```ts
const effect = await runtime.createRenderObject("sparkle-vni");
await effect.play(undefined, { loop: true });
effect.stop();
effect.destroy();
```

### Promise 与中断语义

| 调用                                      | Promise                      | 播放状态               |
| ----------------------------------------- | ---------------------------- | ---------------------- |
| `play(name)` / `{loop:false}`             | once 完成时 resolve          | 保持既有非循环行为     |
| `play(name, {loop:true})`                 | 第一圈完成时 resolve         | resolve 后继续后台循环 |
| 首圈前 `AbortSignal.abort()`              | reject                       | reset/停止             |
| 首圈前 `stop()`、下一次 `play()`、destroy | reject                       | 停止、取代或销毁       |
| 首圈 resolve 后 `stop()`                  | 已 resolve，不再改变 Promise | 停止后台循环           |

`loop` 必须是 boolean。Image、ImgNumber、Text 等没有动画 adapter 的 RenderObject 仍拒绝 `play()`。
`SymbolHandle` 的 once/stable/loop 由 Symbol manifest state 定义；给 `SymbolHandle.play()` 传 `loop` 会失败，
请继续使用 `setState()` / `playState()`。

游戏宿主仍必须持续调用 Scene Layout/runtime 的 `update(deltaSeconds)`；Promise 不会自行启动 RAF/ticker。

## 3. Address 统一挂载与实例身份

新代码优先通过一个入口挂到 Scene、ReelArea、Popup session、Spine slot 或 VNI 文字层：

```ts
const spine = await runtime.createRenderObject("win-board-spine", {
  instanceId: "board-main",
});
const amount = await runtime.createImgNumberRenderObject("win-digits", {
  text: "12500",
});

runtime.addresses.mount(
  "gamelayout:/resource/spine/win-board-spine/instance/board-main/slot/win_amount",
  amount,
  { order: 10 },
);
```

`instanceId` 是创建 program RenderObject 或 program Popup request 时的可选调用身份。传入后才能形成 live
instance address，并可用 `addresses.addressOf(object)` 反查；不传仍可使用对象引用和旧 layer API，但不能按 instance
address 定位。ID 在同一个 resource/Popup owner 下必须 live-unique，`"gamelayout"` 没有特殊含义；destroy/session结束后可复用。

对象引用已经在手里时，可以用 `getChildLayer({kind:"spine-slot",slot})` 或
`getChildLayer({kind:"vni-text-layer",layerId})` 取得同一个 opaque parent。`order` 只排 exact parent 内的程序 child。
mount handle 的 `detach()` 幂等且不 destroy child；child/parent/runtime destroy 和 Popup session 收尾也会自动解除关系。

## 4. ImgNumber 绑定到 Spine Slot（兼容接口）

### API

```ts
function attachRenderObjectToSpineSlot(options: {
  spine: RenderObject;
  child: RenderObject;
  slot: string;
  followSlotColor?: boolean;
}): SpineSlotRenderObjectAttachment;

interface SpineSlotRenderObjectAttachment {
  detach(): void;
}
```

### 完整示例

```ts
import { attachRenderObjectToSpineSlot } from "@slotclientengine/gameframeworks";

const spine = await runtime.createRenderObject("win-board-spine");
const amount = await runtime.createImgNumberRenderObject("win-digits", {
  text: "12500",
  anchor: { x: 0.5, y: 0.5 },
});

amount.setPosition({ x: 0, y: -8 });
const attachment = attachRenderObjectToSpineSlot({
  spine,
  child: amount,
  slot: "win_amount",
  followSlotColor: true,
});

runtime.getRenderLayer("main.win").add(spine, 100);
void spine.play("WinLoop", { loop: true });
amount.setText("18800");

attachment.detach();
runtime.getRenderLayer("main.win").remove(spine);
amount.destroy();
spine.destroy();
```

### 合同

- `spine` 必须是 program runtime resource factory 创建、支持 official Spine slot 的 owned RenderObject；
- `child` 必须是 owned、detached RenderObject；ImgNumber 是主要用例，也可使用其它 owned RenderObject；
- `slot` 是 exact、非空、首尾无空白的 slot name；不猜唯一 slot、不 fallback root；
- attach 不转移 destroy ownership；调用方仍分别 destroy child 和 spine；
- `detach()` 幂等，完成后 child 重新变为 detached；
- child 或 spine 在仍绑定时 destroy，会先自动解除关系，不 double-destroy 对方；
- 同一个 child 同时只能绑定一个 slot；已挂在 layer/parent 的 child 必须先 remove；
- 非 Spine、未知 slot、borrowed object、destroyed object 或重复 attachment 在可见 mutation 前失败。

绑定使用 Spine slot，不是 bone。底层复用 official Spine player 唯一的 slot wrapper，child 的 dynamic
ImgNumber pivot、局部 position 和 scale 不会被 slot matrix 覆盖。

## 5. RenderObject 与 Symbol 切换渲染层

### API

```ts
interface RenderObjectLayer {
  moveHere(
    node: RenderObject,
    options?: { order?: number },
  ): RenderObjectLayerMove;
}

interface RenderObjectLayerMove {
  restore(): void;
}
```

### 普通 RenderObject

对象必须已经挂在某个 parent；detached 对象首次挂载继续使用 `add()` / `addAt()`。

```ts
const effect = await runtime.createRenderObject("sparkle");
const top = runtime.getRenderLayer("main.top");
const win = runtime.getRenderLayer("main.win");

top.add(effect, 5);
const movement = win.moveHere(effect, { order: 30 });

// 恢复原 parent、local position 和 order；幂等。
movement.restore();
top.remove(effect);
effect.destroy();
```

### Settled Symbol

`SymbolHandle` 也是 RenderObject，因此 landed Symbol 可以临时提升到 top/win/named-node layer：

```ts
const area = runtime.getSymbolArea("main");
const symbol = area.getSymbol({ x: 1, y: 1 });

const movement = runtime
  .getRenderLayer("main.win")
  .moveHere(symbol, { order: 50 });

await symbol.playState("win");
movement.restore();
```

只允许 settled exact Symbol。下一次 spin、replacement、release 或 destroy 使 occurrence stale 前，reel owner
会自动恢复这次临时换层；之后旧 SymbolHandle 仍 stale。自动恢复后再次调用 `movement.restore()` 不会把新
occurrence 拉出 reel。

### 原子性与限制

- move 前验证 target、order、source parent 和坐标；失败不改变 parent/position/order；
- 成功时保持对象原点的当前视觉位置，`order` 是目标 layer 内的安全整数；
- `moveHere()` 不转移 destroy ownership；
- 不开放 symbols 主层、raw Container、world coordinate、Matrix 或直接 zIndex；
- 不用它移动 rolling Sprite；rolling 阶段使用 cell/reel attachment 或稳定 cell Anchor；
- source/target runtime destroyed、object detached/stale/foreign、order 非安全整数时显式失败。

## 6. 最小清理清单

游戏创建 owned 对象后，正常结束按关系反向清理：

```ts
movement?.restore();
attachment?.detach();
object.stop();
layer.remove(object);
child.destroy();
object.destroy();
```

`restore()`/`detach()` 幂等。`remove()` 只负责 layer parent，不 destroy；`stop()` 只停止 playback，不
detach/destroy。runtime destroy 会清理关系，但不应作为日常 cleanup 方案。

## 7. API 选择速查

| 需求                               | API                                                 |
| ---------------------------------- | --------------------------------------------------- |
| rolling 时也取得格子中心           | `area.getCellAnchor(position)`                      |
| 取得 area-local 数值               | `area.resolveAnchor(anchor)`                        |
| 取得任意 layer-local 数值          | `layer.resolveAnchor(anchor)`                       |
| 按 Anchor 首次挂载 detached object | `layer.addAt(object, {anchor, ...})`                |
| 已挂载 object/Symbol 切层          | `targetLayer.moveHere(object, {order})`             |
| 恢复切层前状态                     | `movement.restore()`                                |
| Spine/VNI 单次播放                 | `object.play(name)`                                 |
| Spine/VNI 循环播放                 | `object.play(name, {loop:true})`                    |
| 停止后台循环                       | `object.stop()`                                     |
| ImgNumber 绑定 program Spine slot  | `attachRenderObjectToSpineSlot({spine,child,slot})` |
| 解除 slot 绑定                     | `attachment.detach()`                               |

更完整的 Scene Layout layer ref、authored coordinate 与 ownership 说明见
[`rendercore-layer-symbol-area-render-object-coordinate-guide.md`](./rendercore-layer-symbol-area-render-object-coordinate-guide.md)。

## 8. 程序音效播放与停止

绑定为 audio `runtimeResources` 的程序键会派生同名 effect route 和
`gamelayout:/audio/effect/<encoded-key>` endpoint。它不会回填 legacy audio catalog，也不会创建
RenderObject：

```ts
const once = runtime.playEffect("feature-jingle");

const loop = runtime.playEffect("feature-loop", {
  loop: true,
  endEvent: "gamelayout:/mode/BaseGame/state/stable/exited",
});

// exact invocation
loop.stop();

// 或停止 route 的全部 pending/active voice
runtime.stopEffect("feature-loop");
```

程序 audio 默认 once；历史 effect 省略 `loop` 时保持 authored playback，只有显式 boolean 才覆盖本次播放。
`endEvent` 只接受 effective loop 和已编译的 exact Event address，不回放订阅前的 occurrence。loop 的等价重复调用
返回同一 live handle；不同结束 Event 显式失败。lazy/CDN source 在加载期间返回 `pending` handle，manual/Event/route
stop 或 runtime destroy 后即使资源稍后完成也不会起播；加载和 backend 错误则让该 handle 以 `failed` settle。
