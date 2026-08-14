# Crave named RenderObject 与 ImgNumber 接入说明

本文只描述 Crave 需要人工完成的调用点迁移。RenderCore 仓库不修改 Crave、Gamelayout manifest 或美术资源；下面直接使用 Gamelayout 包 `runtimeResources` 中大小写完全一致的 resource name，不要求 Crave 再增加一层配置。

对象创建后的area、Scene顶层、exact named node挂载、跨layer对齐和兼容策略见[Crave RenderObject 图层接入说明](./crave-render-layer-integration.md)。本文原有area scope示例继续有效，无需强制迁移。

## 1. Nearwin1 / Nearwin2

旧代码不再自行执行 path-to-key、`loadRuntimeResource()`、Spine player 创建和逐帧 update。Scene Layout package runtime 直接按 exact name 创建 detached、owned `RenderObject`：

```ts
const nearwin1 = await runtime.createRenderObject("nearwin1");
const nearwin2 = await runtime.createRenderObject("nearwin2");
nearwin1.setPosition({ x: nearwin1X, y: nearwin1Y });
nearwin2.setPosition({ x: nearwin2X, y: nearwin2Y });
```

Spine object 的 `play()` 必须传 manifest 中真实存在的 exact animation name；Promise 在 package runtime 的正常 ticker 更新到一次播放真正完成后才 resolve：

```ts
await nearwin1.play("Loop", { signal });
nearwin1.stop(); // 业务中断时停止；pending play 会 reject
```

Crave 仍负责 Nearwin1/2 的选择、重复次数、触发时序和取消。RenderCore 不猜默认动画、不把 Nearwin1 回退为 Nearwin2，也不接受 resource path 代替 name。

## 2. 挂载与销毁

factory 返回的对象尚未挂到 display tree。通过已有 presentation scope 挂到 Crave 选定的安全 layer；不要取得或操作 raw Pixi `Container`：

```ts
const nearwin1 = await runtime.createRenderObject("nearwin1");

await area.present(async (scope) => {
  await scope.withNode(
    area.getLayer("win"),
    nearwin1,
    { ownership: "destroy" },
    () => nearwin1.play("Loop", { signal }),
  );
});
```

`ownership: "destroy"` 时 scope 在成功、失败或中断后销毁对象，调用方不要再次承担生命周期。若使用 `ownership: "detach"`，scope 只卸载，Crave 必须在最终 `finally` 调用 `object.destroy()`。package runtime 销毁时会兜底销毁仍存活的 factory object。

静态 image object 没有播放能力，调用 `play()` 会明确失败。VNI object 播放 authored timeline，调用 `play()` 时不要传 animation name。

## 3. 图标中奖 ImgNumber

等美术把 ImgNumber 资源放入 Gamelayout 包并由 manifest 声明 exact `image-string` program resource 后，按 name、初始文字和可选 anchor 创建：

```ts
const winAmount = await runtime.createImgNumberRenderObject("imgnumber", {
  text: formatSymbolWinAmount(initialAmount),
  anchor: { x: 0.5, y: 0.5 },
});

winAmount.setPosition({ x: amountX, y: amountY });
winAmount.setText(formatSymbolWinAmount(nextAmount));
winAmount.setVisible(true);
```

这应替换 Crave 图标中奖效果当前使用的字体文字对象。金额计算与 formatter 仍属于 Crave；把 formatter 的最终 string 原样传给 `setText()`。不要保留字体 fallback，也不要在 RenderCore 或 Crave 猜一个资源 key。

`setText()` 会先验证完整 glyph 闭包；任意字符缺失时调用抛错，旧文字和旧画面保持不变。`setPosition()` 只修改对象位置，ImgNumber 根据文字宽度变化自动维护自身 anchor。需要同样外观的独立实例时使用：

```ts
const copy = winAmount.clone();
copy.setText(formatSymbolWinAmount(copyAmount));
copy.setPosition({ x: copyX, y: copyY });
```

clone 与原对象文字、位置和销毁互不联动；二者共享 package-owned glyph resource，均不得销毁资源本身。

## 4. Crave 修改清单

1. 确认 Gamelayout manifest 中存在 exact resource name：`nearwin1`、`nearwin2` 和 `imgnumber`。
2. 删除 Nearwin 调用点的 path-to-key、`loadRuntimeResource()`、player materialize 和 player update 代码，改用 `runtime.createRenderObject(name)`。
3. 保留 Crave 的 Nearwin 时序，只用 `play/stop` 编排。
4. 把图标中奖的字体文字替换为 `createImgNumberRenderObject()`，位置使用 `setPosition()`，内容使用 `setText()`。
5. 统一通过 presentation scope mount；逐一确认 `destroy` 或 `detach + finally destroy` ownership。
6. 不修改 RenderCore ticker。宿主继续像现在一样每帧调用 package `runtime.update(deltaSeconds)`，动态 factory object 会被同一 runtime 推进。

## 5. 严格失败

- name 为空、大小写不符或不存在：失败。
- generic factory 遇到 image-string：失败并要求使用 ImgNumber typed factory。
- ImgNumber factory 遇到非 image-string：失败。
- video resource：不支持创建 `RenderObject`，失败。
- Spine animation 不存在、ImgNumber glyph 缺失、对象或 runtime 已销毁：失败。
- abort、stop、supersede 或 destroy 发生在播放期间：pending `play()` reject；Crave 应走本轮既有取消路径，不做静默 fallback。

## 6. Crave 侧验收

自动检查按 Crave 实际 package 名调整：

```bash
pnpm --filter crave typecheck
pnpm --filter crave test
rg -n "loadRuntimeResource|createOfficialSpinePlayer|createGridCellEffectResourceFromLoadedSpine" apps/crave/src
```

最后一条只允许保留与 Nearwin 无关且仍有明确 ownership 的调用。

浏览器人工检查由 Crave 执行者完成：Nearwin1/2 的位置、层级、播放/中断/重复时序正确；图标中奖金额的位置、显隐、更新时机和格式正确；缺 glyph 时原位报错且不显示字体或空白 fallback；切场景和打断后 layer 无遗留对象。
