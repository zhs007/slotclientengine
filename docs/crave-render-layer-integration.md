# Crave RenderObject 图层接入说明

本文供 Crave 仓库的执行者使用。RenderCore 仓库不修改 Crave 源码，也不知道 Crave 当前文件名或 class；示例中的 resource、node、animation 必须替换为 Gamelayout manifest 与 Crave 配置中的大小写完全一致名称。

任务 206 已提供 `SceneLayoutPackageRuntime.createRenderObject()` 与 `createImgNumberRenderObject()`。本说明只补充这些 detached、caller-owned object 如何挂到 area、Scene 顶层或 exact named node，以及如何跨 layer 对齐。

## 1. 兼容原则

已有 Crave 调用不需要强制迁移：

- `area.getLayer(id).add/remove` 与 `area.present()` 保持原行为；
- Scene Layout 原有 `getLayer/getNode/attachChild/attachRelative` 仍可供既有 host 集成使用；
- 新调用点优先使用 opaque `RenderObjectLayer`，不要新增 raw Pixi `Container`、`toGlobal/toLocal` 或 world-coordinate 代码。

新旧入口操作同一套 runtime/display tree，不要把同一个 object 同时挂到两边。

## 2. 选择目标 layer

### Area layer

```ts
const winLayer = area.getLayer("win");
const topLayer = area.getLayer("top");
```

`bottom < symbols < top < win` 顺序不变。`symbols` 主层不公开。

### Scene 顶层

```ts
const layoutLayer = runtime.getRenderLayer("layout");
const reelLayer = runtime.getRenderLayer("reel");
const transitionLayer = runtime.getRenderLayer("transition");
const popupLayer = runtime.getRenderLayer("popup");
```

- `layout`：普通 authored layout 与 main reel 上方、transition/popup 下方的程序对象；
- `reel`：跟随 main reel 本地原点的稳定 overlay；mode 切换替换 reel 时 façade 保持有效；
- `transition`、`popup`：对应稳定顶层中的程序对象层；
- presentation-only runtime 请求 `reel` 会显式失败。

### Exact named node

```ts
const child = runtime.getNodeRenderLayer(NODE_ID); // 默认 child
const before = runtime.getNodeRenderLayer(NODE_ID, "before");
const after = runtime.getNodeRenderLayer(NODE_ID, "after");
```

- `child` 是 named node 的子节点，继承该 node 的 placement、scale、rotation、variant 与 game-mode visibility；
- `before/after` 是同一 authored node slot 内的前后 attachment band；
- node id 与 placement 必须 exact，未知值不 fallback。

## 3. 直接挂载与销毁

`add/remove/addAt` 是第一层原子接口，不接管 object ownership。调用方必须先 remove，再 destroy：

```ts
const effect = await runtime.createRenderObject(RESOURCE_NAME);
const layer = runtime.getNodeRenderLayer(TARGET_NODE_ID, "after");

layer.add(effect, LOCAL_ORDER);
try {
  await effect.play(EXACT_ONCE_ANIMATION, { signal });
} finally {
  layer.remove(effect);
  effect.destroy();
}
```

静态 image 不支持 `play()`；VNI 播放完整 authored timeline时不传 animation name；official Spine 必须传真实存在的 exact animation。Nearwin 的选择、循环、取消和业务时序仍由 Crave 决定。

ImgNumber 使用同一 layer 合同：

```ts
const amount = await runtime.createImgNumberRenderObject(IMGNUMBER_RESOURCE, {
  text: formatAmount(initialAmount),
  anchor: { x: 0.5, y: 0.5 },
});
const layer = runtime.getNodeRenderLayer(AMOUNT_NODE_ID, "child");

layer.add(amount, LOCAL_ORDER);
try {
  amount.setText(formatAmount(nextAmount));
} finally {
  layer.remove(amount);
  amount.destroy();
}
```

不要保留字体 fallback。缺 glyph 时 `setText()` 原子失败并保持旧画面。

## 4. 跨 layer 对齐

不要读取“某层的全局 x/y”。source layer 把自己的 local point包装为 opaque anchor，target layer在调用时转换：

```ts
const sourceLayer = runtime.getNodeRenderLayer(ALIGN_NODE_ID, "child");
const targetLayer = runtime.getRenderLayer("layout");
const effect = await runtime.createRenderObject(RESOURCE_NAME);

targetLayer.addAt(effect, {
  anchor: sourceLayer.getAnchor({ x: SOURCE_LOCAL_X, y: SOURCE_LOCAL_Y }),
  offset: { x: TARGET_LOCAL_OFFSET_X, y: TARGET_LOCAL_OFFSET_Y },
  order: LOCAL_ORDER,
});
```

也可以使用 symbol、RenderObject 或其它 layer 的 anchor：

```ts
targetLayer.addAt(effect, {
  anchor: area.getSymbol(position).getAnchor(),
  offset: { x: 0, y: -30 },
});
```

`offset` 属于 target layer 本地坐标。viewport、mode或parent transform变化后，新的 `addAt/resolveAnchor` 使用调用时transform；不要缓存world point。

确需数值计算时使用 `targetLayer.resolveAnchor(anchor)`，结果只是 target-local snapshot，不是world coordinate。

## 5. 临时展示与 PresentationScope

对象需要跨 `await` 自动cleanup、随area spin打断或由scope销毁时，继续使用第二层：

```ts
const effect = await runtime.createRenderObject(RESOURCE_NAME);

await area.present((scope) =>
  scope.withNode(
    runtime.getNodeRenderLayer(TARGET_NODE_ID, "after"),
    effect,
    {
      anchor: runtime.getNodeRenderLayer(ALIGN_NODE_ID).getAnchor(),
      offset: { x: 0, y: -30 },
      order: LOCAL_ORDER,
      ownership: "destroy",
    },
    () => effect.play(EXACT_ONCE_ANIMATION, { signal }),
  ),
);
```

`ownership: "destroy"` 表示scope在成功、失败或area打断后销毁object；调用方不要再次destroy。`ownership: "detach"`只卸载，调用方仍需最终destroy。

area scope 即使挂到Scene layer，仍由area spin中断。跨场景永久对象不要借area scope存活，应使用直接add/remove并由Crave自己的scene生命周期清理。

## 6. Strict failure

下列情况均应进入Crave既有错误/取消路径，不做fallback：

- unknown runtime resource、layer id、node id或placement；
- presentation-only runtime请求`reel`；
- object已经有parent或重复挂载；
- 非safe-integer order、非finite point/offset；
- 伪造/stale anchor、destroyed object/runtime；
- Spine animation不存在、VNI错误传animation name、ImgNumber缺glyph；
- playback期间abort、stop、supersede或runtime destroy。

`addAt()`失败时不会改变object的position、parent或layer账本。不要捕获错误后改用首个node、默认layer、字体或静态图。

## 7. Crave 侧修改与验收

建议按真实Crave package名调整：

```bash
pnpm --filter crave typecheck
pnpm --filter crave test
rg -n "toGlobal|toLocal|worldTransform|loadRuntimeResource|createOfficialSpinePlayer" apps/crave/src
```

搜索命中不代表一律删除；只清理本次named RenderObject调用点中已由RenderCore接管的resource/player/坐标代码。

浏览器验收由用户在真实Crave/Gamelayout环境执行：

1. named Spine/VNI/image/ImgNumber分别挂到area、Scene root和exact node，位置、层级、显隐正确；
2. 横竖屏、viewport与mode切换后对齐无漂移；
3. Nearwin与中奖金额的业务时序和旧路径一致；
4. remove、spin打断、mode切换和runtime destroy后无残留node/player；
5. 旧接口调用无需迁移且没有视觉回归。

相关基础合同：

- [Task 206 named RenderObject 与 ImgNumber](./crave-named-render-object-migration.md)
- [RenderCore 坐标与 Anchor API](./rendercore-coordinate-and-anchor-api.md)
- [RenderCore 三层 API 架构](./rendercore-three-layer-api-architecture.md)
