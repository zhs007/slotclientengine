# RenderCore 坐标与 Anchor API

> 状态：当前 public contract。本文说明游戏可使用的坐标获取、坐标转换、定位和移动接口。
>
> 本文只描述受控 public API，不开放 Pixi display tree、world transform、matrix、bounds 或 geometry snapshot。

Layer、SymbolArea、authored/program RenderObject 与坐标的完整选择和端到端示例见
[`rendercore-layer-symbol-area-render-object-coordinate-guide.md`](./rendercore-layer-symbol-area-render-object-coordinate-guide.md)。

## 两种定位数据

RenderCore 使用两种不同的数据表达位置：

```ts
interface RenderPoint {
  readonly x: number;
  readonly y: number;
}

interface RenderAnchor {
  readonly kind: "render-anchor";
}
```

- `RenderPoint` 是某个已知本地坐标系内的普通数值点；
- `RenderAnchor` 是 opaque、可延迟解析的定位 capability，不向游戏公开自身坐标系、Pixi node 或 transform。

只在调用方明确知道坐标属于哪个 area 时保存或计算 `RenderPoint`。涉及不同 layer、area 或 Scene Layout node 时，优先传递
`RenderAnchor`，由 RenderCore 在使用时转换。

## 获取坐标与 Anchor

### Symbol 中心

```ts
const symbol = area.getSymbol({ x: 2, y: 1 });
const point = symbol.getPosition();
const anchor = symbol.getAnchor();
```

`getPosition()` 返回当前 occurrence 中心在所属 `SymbolArea` 本地坐标系中的 `RenderPoint`。它适合同 area 的直接数值计算，
不等于 world coordinate。

`getAnchor()` 返回捕获 exact occurrence 的 Anchor。解析时会重新检查 occurrence；replacement、release、回池或 area destroy
后旧 Anchor stale。普通 symbol 和 `-1` Empty SymbolHandle 都支持位置与 Anchor。

尚未落地、leased、stale 或坐标越界时显式失败，不按相同 position 重绑到新 occurrence。

### SymbolGroup 中心

```ts
const group = area.getSymbols(positions);
const anchor = group.getAnchor({ align: "center" });
const middle = group.getMiddleSymbol();
const membersCenter = group.getCenter();
const boundsCenter = group.getCenter({ mode: "bounds" });
const cellBounds = group.getCellBounds();
```

`getAnchor({align:"center"})` 与默认 `getCenter()` 都保持成员中心算术平均语义。`getMiddleSymbol()`按传入positions顺序取中间项且只接受奇数成员；`bounds` center来自稳定cell footprint。`getCellBounds()`是area-local格子选择矩形，不是动画、贴图或Pixi visual bounds。成员中任一occurrence stale时整次读取失败。

### Area 本地点

```ts
const anchor = area.getAnchor({ x: 300, y: 120 });
```

`ReelArea.getAnchor(point)` 把 area-local `RenderPoint` 包装成 Anchor，便于之后挂载到其它 layer 或作为 motion 目标。
传入坐标必须为有限数；实际解析时校验。

### Symbol 内部 value 与命名文字

```ts
const valuePart = symbol.getPart({ kind: "value" });
const textPart = symbol.getPart({ kind: "text", name: "value" });

const valueAnchor = valuePart.getAnchor();
const textAnchor = textPart.getAnchor();
```

- `getPart({ kind: "value" }).getAnchor()` 指向 symbol 的实际 `valuePresentation`；
- `getPart({ kind: "text", name }).getAnchor()` 指向 exact named image-string node；
- 二者都不是整个 symbol 的中心；
- 未配置对应 presentation、名字未知或 occurrence stale 时显式失败。

part 是 borrowed `CloneableRenderObject`；使用 `part.clone()` 创建 owned 副本，用于只飞表现副本而不修改盘面值。

### Scene Layout 命名节点

```ts
const anchor = runtime.getNodeAnchor("coin-meter");

// 对只依赖 NamedRenderAnchorSource 的调用方：
const sameAnchor = getNamedRenderAnchor(runtime, "coin-meter");
```

该 Anchor 指向 Scene Layout exact named node 的局部原点。未知 node、runtime 未 ready 或已 destroy 时显式失败。
游戏不需要取得 node Container 或读取 world position。

### Gamelayout authored 坐标

```ts
const origin = runtime.getLayoutPoint({ kind: "origin" });
const artCenter = runtime.getLayoutPoint({ kind: "art", align: "center" });
const viewportCenter = runtime.getLayoutPoint({
  kind: "viewport",
  align: "center",
});
const authored = runtime.resolveLayoutAnchor(symbol.getAnchor());
const authoredAnchor = runtime.getLayoutAnchor({ x: 100, y: -40 });
```

这些 point 始终使用 manifest 配置的 `top-left | center` authored space。`viewport` 指当前 Scene Layout logical `visibleRect`，不是 CSS/window/device pixels。Point 是调用时快照；Anchor 在解析时使用当前 transform。

### RenderObjectLayer 本地点

```ts
const source = runtime.getRenderLayer("coin-meter");
const target = runtime.getRenderLayer("layout");
const anchor = source.getAnchor({ x: 0, y: 0 });
const pointInTarget = target.resolveAnchor(anchor);
```

Area layer、Scene顶层和named node layer都实现同一合同。`getAnchor()`默认包装local origin；`resolveAnchor()`返回调用时
target-local snapshot，不返回world point。只为挂载时直接使用`target.addAt(object, {anchor, offset, order})`，无需先保存数值。

## 将 Anchor 解析为 Area 本地坐标

```ts
const point = area.resolveAnchor(anchor);
```

`ReelArea.resolveAnchor()` 是受控的只读转换接口：

- 输入任意由有效 RenderCore runtime 创建的 `RenderAnchor`；
- 输出该 `ReelArea` 本地坐标系中的 `RenderPoint`；
- 不允许调用方指定 raw Pixi target Container；
- 不返回 world coordinate、matrix、bounds 或 mutable display object；
- Anchor 非 RenderCore 创建、source stale、坐标非有限数或目标 area destroyed 时显式失败。

跨 area 转换使用目标 area 解析同一个 Anchor：

```ts
const sourceAnchor = mainArea.getSymbol(source).getAnchor();
const pointInFeatureArea = featureArea.resolveAnchor(sourceAnchor);
```

解析结果是调用时的坐标快照。viewport、Scene Layout、area 或 parent transform 后续改变时，旧 `RenderPoint` 不会自动更新；
需要最新值时重新调用 `resolveAnchor()`。长期 presentation 和 motion 应优先保留 Anchor，而不是缓存解析后的 Point。

适合调用 `resolveAnchor()` 的情况：

- 游戏确实需要数值来计算多个候选位置或 procedural effect；
- 第三方 typed effect API 只接受 area-local point；
- 调试、测量或业务无关的布局决策。

仅为了挂载或移动节点时，不需要先解析，应直接把 Anchor 交给 PresentationScope。

## 自动坐标转换

### mount 与 withNode

```ts
scope.mount(area.getLayer("win"), node, {
  anchor: symbol.getAnchor(),
  offset: { x: 0, y: -30 },
  ownership: "destroy",
});
```

`mount()` 和 `withNode()` 在挂载时把 Anchor 转成目标 layer 的本地坐标。`offset` 属于目标 layer 的本地坐标系，
计算结果为“已转换 Anchor + offset”。

target可以是area layer，也可以是`getRenderLayer/getNodeRenderLayer`返回的Scene layer。若scope来自`area.present()`，挂到
Scene layer的临时对象仍在area spin打断时按ownership清理。

### 第一层 addAt

```ts
targetLayer.addAt(node, {
  anchor: sourceLayer.getAnchor({ x: 10, y: 20 }),
  offset: { x: 0, y: -30 },
  order: 2,
});
```

`addAt()`是同步原子attachment：先完整验证layer/object/order/offset/anchor，再提交目标local position、order和parent。
失败保持position、parent与layer账本不变。它不接管ownership；调用方最终`remove()`后`destroy()`。

### move

```ts
await scope.move(node, {
  to: targetAnchor,
  durationSeconds: 0.3,
});
```

`move()` 要求 node 已在当前 PresentationScope 挂载。起点是 node 在当前目标 layer 的位置，终点是 `to` Anchor 在相同 layer
中的解析结果。

### transfer

```ts
const valuePart = symbol.getPart({ kind: "value" });

await scope.transfer(area.getLayer("win"), valuePart.clone(), {
  from: valuePart.getAnchor(),
  to: runtime.getNodeAnchor("coin-meter"),
  durationSeconds: 0.3,
  ownership: "destroy",
});
```

`transfer()`：

1. 将 `from` Anchor 转换到目标 layer；
2. 定位并挂载 node；
3. 将 `to` Anchor 转换到同一目标 layer；
4. 使用 RenderCore manual clock 执行 motion；
5. completion、failure、spin interruption 或 destroy 后按 ownership 清理。

generic `move/transfer` 只移动临时 owned `RenderObject` 或 owned clone，不提交目标 value，也不改变盘面 occurrence。

## 坐标转换语义

RenderCore 内部通过 source owner 到 global、再由 global 到 target local 的 Pixi transform 完成转换。该过程只属于内部实现；
public API 不开放 `toGlobal()`、`toLocal()`、Container 或 Matrix。

Anchor 在实际 `resolveAnchor()`、mount、move 或 transfer 时解析，因此使用当时的 transform。Anchor 不是提前缓存的 world point，
也不会绕过 viewport 或 Scene Layout transform。

## Public API 边界

当前不提供：

```ts
anchor.resolve();
symbol.getBounds();
symbol.getGeometry();
symbol.localToWorld(point);
symbol.worldToLocal(point);
area.resolveAnchorToWorld(anchor);
area.convertPoint(sourceContainer, targetContainer, point);
node.getPixiContainer();
```

这些接口会泄露 renderer/display tree 或鼓励游戏缓存不稳定坐标。新需求优先表达为 Anchor、目标 area 的
`resolveAnchor()`，或 PresentationScope 的 mount/move/transfer；只有无法由这些能力表达的真实 consumer 才继续扩展。

## 相关文档

- [RenderCore 三层 API 架构与边界](./rendercore-three-layer-api-architecture.md)
- [RenderCore operation 渲染第一层接口设计](./rendercore-operation-first-layer-api.md)
