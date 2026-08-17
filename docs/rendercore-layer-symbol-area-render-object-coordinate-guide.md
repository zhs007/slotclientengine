# RenderCore Layer、SymbolArea、RenderObject 与坐标指南

本文是游戏侧使用 RenderCore 第一层渲染能力的 canonical 指南。它覆盖 Scene Layout layer、盘面 SymbolArea、编辑器已放置对象、程序创建对象，以及 Gamelayout authored 坐标和跨父节点坐标转换。

RenderCore 不向游戏开放 Pixi `Container`、world matrix、display bounds、parent/children 或 zIndex。需要挂载和换算时使用 `RenderObjectLayer`、`RenderPoint` 与 opaque `RenderAnchor`。

## 快速选择

| 需求                           | 入口                               | 返回值与 ownership                    |
| ------------------------------ | ---------------------------------- | ------------------------------------- |
| 读取盘面、symbol、盘面表现层   | `getSymbolArea("main")`            | borrowed `PresentableSymbolArea`      |
| 取得统一挂载目标               | `getRenderLayer(ref)`              | borrowed `RenderObjectLayer`          |
| 操作 Editor 已放置节点         | `getRenderObject(nodeId)`          | borrowed typed capability 或 `null`   |
| 从 `runtimeResources` 创建对象 | `createRenderObject(resourceName)` | detached、caller-owned `RenderObject` |

这四个入口不互相 fallback。`getRenderObject("sparkle")` 不会读取同名程序资源，`createRenderObject("background")` 也不会克隆同名 authored node。

## 统一取得 Layer

新游戏只使用：

```ts
const reelOverlay = runtime.getRenderLayer("reel");
const popupLayer = runtime.getRenderLayer("popup");
const mainTop = runtime.getRenderLayer("main.top");
const mainWin = runtime.getRenderLayer("main.win");
const backgroundChildren = runtime.getRenderLayer("background");
```

### Ref grammar

| Ref                                 | 含义                                              |
| ----------------------------------- | ------------------------------------------------- | ------- | ------------------------------- |
| `layout`                            | authored scene node 之上的 layout 程序层          |
| `reel`                              | main reel 整体之上的稳定层，低于 transition/popup |
| `transition`                        | 游戏状态转场程序层                                |
| `popup`                             | popup 程序层                                      |
| `<areaId>.bottom`                   | area symbols 下方                                 |
| `<areaId>.top`                      | area symbols 上方                                 |
| `<areaId>.win`                      | area win 表现层                                   |
| `<nodeId>`、`<nodeId>.child`        | exact authored node 子层                          |
| `<nodeId>.before`、`<nodeId>.after` | exact authored node 前/后 sibling band            |
| `node:<legacyId>[:child             | before                                            | after]` | 旧包中带点号或占用保留名的 node |

解析顺序固定为 stable ref、`node:` legacy namespace、area suffix、canonical node。未知、非法或当前 runtime 不具备的 ref 显式失败，不尝试其它解释。

```ts
runtime.getRenderLayer("main.top"); // area top
runtime.getRenderLayer("node:main.top"); // 旧 node id "main.top"
```

`getSymbolArea(id).getLayer()`、`getNodeRenderLayer()` 与 raw `getLayer()` 为旧 consumer/host/editor 兼容保留，不是新游戏的并列 layer lookup。

## SymbolArea 与 Symbol

```ts
const area = runtime.getSymbolArea("main");
const symbol = area.getSymbol({ x: 2, y: 1 });

const areaPoint = symbol.getPosition();
const anchor = symbol.getAnchor();
```

`getPosition()` 是当前 occurrence 中心在 area-local 坐标系中的数值快照。`getAnchor()` 捕获 exact occurrence，可在其它父节点下延迟解析。replacement、release、回池或 destroy 后旧 symbol/Anchor stale，不按相同格位绑定新 occurrence。

空格唯一 code 为 `-1`，仍返回带位置与 Anchor 的 Empty `SymbolHandle`；依赖真实素材的 state/text/value 操作会失败。

### 一组 Symbols

```ts
const group = area.getSymbols([
  { x: 0, y: 1 },
  { x: 1, y: 1 },
  { x: 2, y: 1 },
]);

const middle = group.getMiddleSymbol();
const membersCenter = group.getCenter();
const boundsCenter = group.getCenter({ mode: "bounds" });
const cellBounds = group.getCellBounds();
const centerAnchor = group.getAnchor({ align: "center" });
```

- `getMiddleSymbol()` 严格按调用方传入 positions 的顺序取中间项，不按 x/y 重新排序；只有奇数成员有效。
- 默认 `getCenter({mode:"members"})` 是成员中心的算术平均。
- `mode:"bounds"` 是选中 cell footprint 合并矩形的中心。
- `getCellBounds()` 返回 area-local `{x,y,width,height}`；非连续选择会包含中间空域。
- cell bounds 来自 reel/grid owner 的稳定格子尺寸，不读取图片、Spine/VNI、缩放动画或 Pixi visual bounds。

空组、重复 position、偶数 middle、越界、未落地或任一 stale occurrence 都显式失败。standard、grid-cell 与 CellSpin 遵守同一合同。

## Authored RenderObject

`getRenderObject(nodeId)` 取得 Gamelayout Editor 已放置对象的稳定 borrowed façade：

```ts
const object = runtime.getRenderObject("background-effect");
if (!object) {
  // 当前 known kind 没有安全的 public adapter。
} else if (object.kind === "image-string") {
  object.setText("12500");
} else if (object.kind === "vni") {
  object.play(); // 由已有 player 播放 manifest timeline
} else if (object.kind === "spine" && object.playback === "state") {
  await object.requestState("FG");
} else if (object.kind === "spine") {
  object.play(); // 重播 manifest 声明的 default animation/loop
}
```

所有返回对象共享：

```ts
object.getAnchor();
object.setVisible(false);
```

`setVisible()` 是程序可见性 override，并与 authored variant/game-mode visibility 做 AND。它不能把当前 mode/variant 已隐藏的节点强制显示。

Authored object 的 placement、parent、player 和 destroy 仍由 Scene Layout runtime 拥有。因此 façade 不提供 `setPosition()`、`destroy()` 或任意 raw display 访问。相同 node id 重复获取返回相同 façade identity；不会创建第二个 player/display。

未知 node、未初始化 runtime 或 destroyed runtime 抛错。已知但无法安全公开的 kind 返回 `null`，调用方不得据此转去猜同名资源。

## 程序创建 RenderObject

```ts
const sparkle = await runtime.createRenderObject("sparkle");
sparkle.setPosition({ x: 0, y: 0 });
runtime.getRenderLayer("main.win").add(sparkle, 10);

// caller owns cleanup
runtime.getRenderLayer("main.win").remove(sparkle);
sparkle.destroy();
```

`createRenderObject()` 只查 manifest `runtimeResources` 的 exact key，异步创建 detached caller-owned image/Spine/VNI 对象。ImgNumber 使用 `createImgNumberRenderObject()`。unknown key、kind mismatch、资源 prepare 失败都不 fallback。

## Gamelayout Authored 坐标

Scene Layout manifest 可配置 `coordinateOrigin: "top-left" | "center"`。游戏始终使用配置后的 authored 坐标，不需要把中心坐标手工加上半个 artSize 来迎合 Pixi。

### Well-known point

```ts
const origin = runtime.getLayoutPoint({ kind: "origin" });
const artCenter = runtime.getLayoutPoint({ kind: "art", align: "center" });
const artTopLeft = runtime.getLayoutPoint({ kind: "art", align: "top-left" });
const screenCenter = runtime.getLayoutPoint({
  kind: "viewport",
  align: "center",
});
```

支持九宫格 alignment：`top-left | top | top-right | left | center | right | bottom-left | bottom | bottom-right`。

- `origin` 恒为 authored `(0,0)`。
- `art` 使用当前 snapshot `artSize`。
- `viewport` 使用 `applyViewport()` 后当前 logical `visibleRect`。
- 本文的“屏幕”只指 Scene Layout logical viewport，不是 CSS page、浏览器 window 或 device pixels。

在 center origin 中，art center 为 `(0,0)`，art top-left 为 `(-width/2,-height/2)`。在 top-left origin 中，art top-left 为 `(0,0)`。

所有 Point/Rect 都是调用时快照。viewport、variant 或 geometry 更新后需要重新读取。没有 current snapshot、alignment 非法或坐标非有限数时显式失败。

### Authored Point 与 Anchor

```ts
const anchor = runtime.getLayoutAnchor({ x: 120, y: -80 });
const current = runtime.resolveLayoutAnchor(anchor);
```

`getLayoutAnchor()` 把 authored point 包装成可跨 parent 延迟解析的 Anchor；`resolveLayoutAnchor()` 把任意有效 RenderCore Anchor 解析回当前 authored 坐标。

取得 exact node 和 symbol 的 Gamelayout 坐标：

```ts
const nodePoint = runtime.resolveLayoutAnchor(
  runtime.getRenderObject("coin-meter")!.getAnchor(),
);

const symbolPoint = runtime.resolveLayoutAnchor(
  runtime.getSymbolArea("main").getSymbol({ x: 2, y: 1 }).getAnchor(),
);
```

## 不同 Parent 下的坐标映射

从 source layer 本地点映射到 target layer：

```ts
const source = runtime.getRenderLayer("background.after");
const target = runtime.getRenderLayer("main.win");

const sourceAnchor = source.getAnchor({ x: 10, y: 20 });
const targetPoint = target.resolveAnchor(sourceAnchor);
```

仅为了挂载时无需先读取数值：

```ts
target.addAt(sparkle, {
  anchor: sourceAnchor,
  offset: { x: 0, y: -30 }, // target-local
  order: 10,
});
```

转换内部由 RenderCore 在解析时执行 source owner → global → target local；public API 不返回 global point 或 Matrix。Point 是快照，Anchor 在每次解析时使用当前 transform。

## PresentationScope 与清理

临时表现优先放入 `area.present()` 的 scope：

```ts
await area.present(async (scope) => {
  const effect = await runtime.createRenderObject("win-effect");
  scope.mount(runtime.getRenderLayer("main.win"), effect, {
    anchor: symbol.getAnchor(),
    offset: { x: 0, y: -20 },
    ownership: "destroy",
  });
  await scope.move(effect, {
    to: runtime.getRenderObject("coin-meter")!.getAnchor(),
    durationSeconds: 0.3,
  });
});
```

scope completion、failure、spin interruption 或 destroy 都按声明 ownership 清理。直接调用 layer `add/addAt` 不转移 ownership，调用方必须 remove/destroy。

## 生命周期与失败矩阵

| 情况                                       | 行为                                                     |
| ------------------------------------------ | -------------------------------------------------------- |
| unknown layer/area/node/resource           | 显式失败                                                 |
| presentation-only runtime 请求 `reel`/area | unavailable failure                                      |
| authored known kind 无安全 adapter         | `getRenderObject()` 返回 `null`                          |
| stale Symbol/Anchor                        | 解析或操作失败，不重绑                                   |
| 非有限 point/rect、非法 alignment/ref      | mutation 前失败                                          |
| `setVisible(true)` 但 authored mode 隐藏   | 仍隐藏                                                   |
| viewport/geometry 更新                     | 新 Point 使用新 snapshot；旧 Point 不变，Anchor 延迟解析 |
| direct layer add                           | caller-owned                                             |
| PresentationScope `ownership:"destroy"`    | scope-owned cleanup                                      |

所有批量 symbol geometry/state 操作先完整 preflight。失败不得留下部分可见性、position、parent、layer 账本或成员 mutation。

## Editor Node ID 规则

新版 Gamelayout Editor node id 只允许小写字母、数字和连字符，并禁止 `layout/reel/transition/popup` 四个 layer 保留名。导入旧 ZIP 时：

- 点号（以及旧下划线）规范化为连字符；
- 保留名改为 `<id>-node`；
- 已合法 canonical id 优先保留；
- collision 按稳定顺序分配 `-2`、`-3`；
- adaptation background、mode background 与 `nodeStates` key 同一事务改写；
- 导入提示显示完整 `old→new` map。

RenderCore production v1 parser 仍读取旧 id；未经过 Editor 重导的旧包使用 `node:<legacyId>` 明确取层。
