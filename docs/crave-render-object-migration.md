# Crave 接入 RenderObject 迁移说明

本文说明 Crave 如何从 RenderCore 旧的 `cloneValue/getValueAnchor/cloneText/getTextAnchor` 迁移到统一
`RenderObject` API。RenderCore 仓库不会直接修改 Crave；请在 Crave 自己的分支人工应用并执行末尾验收。

## 1. 新对象模型

- whole symbol、普通文字、symbol 的 value part 与 exact-name text part 都是受控 `RenderObject`。
- `RenderObject` 内部基于 PixiJS `Container`，但不是 public `Container` 子类；不要读取或改写 `parent`、`children`、
  `worldTransform` 或直接 reparent。
- 盘面 symbol 和其 part 是 borrowed，不能 destroy或直接 transfer；调用 `clone()` 得到 detached owned object后再飞行。
- value/text内容写入仍使用typed API：value用`setValue/getValue`，命名文字用`setText/getText`。

如果 Crave 只从 `@slotclientengine/rendercore` 调用 factory/runtime，不需要新增 Pixi import。显式类型可从同一包导入：

```ts
import type {
  CloneableRenderObject,
  RenderObject,
  SymbolRenderPartRef,
} from "@slotclientengine/rendercore";
```

## 2. WL、WM、CM multiplier

WL/WM/CM 的 multiplier 是 Symbols manifest 中 exact name 为 `multiplier` 的 `imageStringNode`，不是 CN 使用的
`valuePresentation`。设置业务文字继续使用：

```ts
const symbol = runtime.getSymbolArea("main").getSymbol(position);
symbol.setText("multiplier", `x${multiplier}`);
```

取得统一 part：

```ts
const multiplierPart = symbol.getPart({
  kind: "text",
  name: "multiplier",
});
```

name 大小写必须与 manifest 精确一致；未知 name 会显式失败。不要根据“只有一个 image-string node”省略 name。

## 3. CN value

CN 等声明 `valuePresentation` 的 symbol 继续由 RenderCore 自动选择 value tier：

```ts
const symbol = runtime.getSymbolArea("main").getSymbol(position);
symbol.setValue(value);

const valuePart = symbol.getPart({ kind: "value" });
```

不要在 Crave 计算 `<10 / <100 / <1000 / 其余` tier，也不要把 value 转成命名文字。value尚未准备完成、value为null
且没有可见display、或symbol没有`valuePresentation`时，`getPart({kind:"value"})`会显式失败。

## 4. 统一飞行写法

文字和value只在part selector不同；clone、anchor、transfer完全相同：

```ts
const source = area.getSymbol(sourcePosition);
const origin = source.getPart({
  kind: "text",
  name: "multiplier",
}); // CN 改为 { kind: "value" }
const flying = origin.clone();

await area.present(async (context) => {
  await context.transfer(area.getLayer("win"), flying, {
    ownership: "destroy",
    from: origin.getAnchor(),
    to: runtime.getNodeAnchor("coin-meter"),
    durationSeconds: 0.5,
  });
});
```

飞whole symbol时直接使用symbol作为origin：

```ts
const origin = area.getSymbol(sourcePosition);
const flying = origin.clone({ state: "current" });
```

盘面borrowed symbol不能直接传给`context.transfer()`。必须飞owned clone，避免把真实reel occurrence从symbols层移走。

## 5. 飞向另一个 symbol

目标同样通过part anchor表达：

```ts
const source = area.getSymbol(sourcePosition);
const target = area.getSymbol(targetPosition);
const sourcePart = source.getPart({ kind: "text", name: "multiplier" });
const targetPart = target.getPart({ kind: "text", name: "multiplier" });
const flying = sourcePart.clone();

await area.present(async (context) => {
  await context.transfer(area.getLayer("win"), flying, {
    ownership: "destroy",
    from: sourcePart.getAnchor(),
    to: targetPart.getAnchor(),
    durationSeconds: 0.5,
  });
});

target.setText("multiplier", `x${nextMultiplier}`);
```

飞行动画只移动表现，不累加、不提交目标value/text。最后的`setText()`或`setValue()`仍由Crave业务顺序显式决定。

## 6. 旧 API 对照

| 旧调用                               | 新调用                                                        |
| ------------------------------------ | ------------------------------------------------------------- |
| `symbol.cloneValue()`                | `symbol.getPart({kind:"value"}).clone()`                      |
| `symbol.getValueAnchor()`            | `symbol.getPart({kind:"value"}).getAnchor()`                  |
| `symbol.cloneText("multiplier")`     | `symbol.getPart({kind:"text",name:"multiplier"}).clone()`     |
| `symbol.getTextAnchor("multiplier")` | `symbol.getPart({kind:"text",name:"multiplier"}).getAnchor()` |
| `createTextRenderNode(...)`          | `createTextRenderObject(...)`                                 |
| `RenderNode` / `TextRenderNode`      | `RenderObject` / `TextRenderObject`                           |

不要在 Crave 增加旧名字的本地alias；调用点应一次性迁移到canonical API。

## 7. 生命周期与错误处理

- `origin`是borrowed logical façade；不要destroy。
- `origin.clone()`返回owned object。交给`transfer(...,{ownership:"destroy"})`后由presentation scope在成功、失败、
  spin interruption或runtime destroy时清理，调用方不要再次destroy。
- 如果clone已由Crave手动mount且使用`ownership:"detach"`，Crave仍是owner，最终必须显式destroy。
- replacement、release、pool reuse后旧symbol/part会stale；不要按旧坐标继续复用。
- 不捕获错误后改飞whole symbol、首个node或(0,0)；未知part/resource/state必须fail-stop。

## 8. Crave 建议修改顺序

1. 搜索并替换旧类型与factory命名。
2. 把所有value/text的clone和anchor先收敛为一个局部`origin`。
3. 确认传给`transfer()`的是`origin.clone()`，不是borrowed `origin`。
4. 保留现有`setValue/setText`业务提交位置，不把提交移动到RenderCore。
5. 检查WL/WM/CM均使用exact `multiplier`，CN只使用value part。

## 9. 自动检查

在 Crave 仓库运行：

```bash
pnpm --filter crave typecheck
pnpm --filter crave test
rg -n "RenderNode|TextRenderNode|createTextRenderNode|cloneValue|getValueAnchor|cloneText|getTextAnchor" apps/crave/src
```

最后一条应无生产代码命中。若Crave package名称不同，按实际filter调整，不切换npm/yarn。

## 10. 浏览器人工验收

1. WL/WM/CM multiplier和CN value均从当前实际显示位置飞向coin meter。
2. CN跨value tier后，飞出的外观与当前source tier、文字、颜色、scale一致。
3. 飞向另一个symbol后，只在Crave显式提交时更新目标内容。
4. spin打断飞行后win layer无残留，source symbol/part仍在原层且可继续使用。
5. whole-symbol clone飞行不会移走或destroy盘面borrowed occurrence。
