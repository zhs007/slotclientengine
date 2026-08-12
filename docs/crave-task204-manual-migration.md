# Crave 任务 204 人工更新说明

本文说明 RenderCore 任务 204 合入后，如何人工更新外部 Crave 项目。本文不会修改 Crave，也不代表
Crave 已完成浏览器验收。

## 基线与范围

- Crave 路径：`/Users/zerro/gitee.com/pixicrave`
- 编写本文时 HEAD：`49c19087b825c4bbebce00f2286c9d60080e9ebb`
- 需要修改的主文件：`apps/crave/src/round-adapter.ts`
- 需要复核的业务文件：`apps/crave/src/feature-anis.ts`、`apps/crave/src/default-scene-values.ts`
- 不修改 Symbols package manifest；WL、WM、CM 已有 exact node `multiplier` 和 normal/blur 资源继续复用。

先让 Crave 依赖包含任务 204 API 的 `@slotclientengine/rendercore` 版本，再做以下源码调整。

## 1. 注册 WL、WM、CM formatter

在 `round-adapter.ts` 从 RenderCore 导入 `SymbolValueTextBindingMap`，并在模块级声明稳定配置：

```ts
import type { SymbolValueTextBindingMap } from "@slotclientengine/rendercore";

const SYMBOL_VALUE_TEXT_BINDINGS = Object.freeze({
  WL: Object.freeze({ multiplier: formatMultiplier }),
  WM: Object.freeze({ multiplier: formatMultiplier }),
  CM: Object.freeze({ multiplier: formatMultiplier }),
}) satisfies SymbolValueTextBindingMap;

function formatMultiplier(value: number): string {
  return `x${value}`;
}
```

`WL`、`WM`、`CM` 和 `multiplier` 都是当前 Crave Symbols package 中的 exact 名称。这里不能改成
“取唯一 node”，也不要把 formatter 写进 JSON manifest。以后某个 symbol 有多个 ImgNumber 时，在该
symbol 对象里继续增加 exact node 与 formatter 即可。

在 `RoundAdapter.applyInitialState()` 的 `createSceneLayoutPackageRuntime()` 顶层参数中注册配置：

```ts
const runtime = createSceneLayoutPackageRuntime({
  resource: this.#resource,
  symbolValueTextBindings: SYMBOL_VALUE_TEXT_BINDINGS,
  reelPresentation: {
    /* 保持现状 */
  },
  gridCellPresentation: {
    /* 保持现状 */
  },
});
```

unknown symbol、unknown node、非函数 formatter、空返回值或缺 glyph 会在局部画面更新前显式失败，不要用
fallback、空字符串或默认 `String(value)` 掩盖资源错误。

## 2. 保留现有 otherScene value 数据流

`round-adapter.ts` 当前已经通过 `readPresentationValues()` 把 `VALUE_COMPONENTS` 和
`SPIN_VALUE_COMPONENTS` 中 WL/WM/CM 的 `otherScene` 合并成 target `presentationValues`，并传给：

- `spinTo(... presentationValues ...)`；
- `spinMainReelToScene({ presentationValues })`；
- cascade 的 `targetValues` / value commits；
- `applyMainReelSnapshot({ presentationValues })`。

这些调用继续保留。任务 204 会让同一个 occurrence value 自动经过 formatter 写入 `multiplier`：target
occurrence 进入 `spinBlur` 时使用 blur profile，landing/settled 后切回 normal profile，文字和外层
container identity 保持不变，不需要在落停后补一次 `setText()`。

`gridCellPresentation.presentationValueResolver` 也继续保留。它负责本地公开轮带上的临时 rolling
occurrence，而不是服务器 target。当前 `createGame002v2DefaultSceneValueResolver()` 只为 CN 使用公开的
`bgcoinweight` 采样，因此本地滚动带上的 WL/WM/CM 默认是 `null`，绑定文字会为空；服务器 target
WL/WM/CM 仍使用已编译的 `otherScene` value。如果产品要求本地临时 WL/WM/CM 也显示模糊数字，必须另行给
resolver 配置公开、本地、可审计的值策略；不得读取、缓存、推断或伪装服务器真实轮带/target
`otherScene`。

## 3. 清理重复手工写字，只保留 value mutation

迁移后，同一业务路径只提交 value：

```ts
symbol.setValue(nextValue);
```

或继续使用 Crave 当前 runtime 封装：

```ts
runtime.setMainReelSymbolPresentationValue(x, y, nextValue);
```

`apps/crave/src/feature-anis.ts` 当前第 156、287 行附近的
`setMainReelSymbolPresentationValue(...)` 是 value mutation，应保留；任务 204 会让它同时更新绑定文字。
replacement 中的 `outputPresentationValue`、cascade value commit 也应保留。

删除同一路径中为了倍率显示而增加的逐格：

```ts
symbol.setText("multiplier", `x${value}`);
```

未绑定的其它命名 node 仍可使用 `setText(name, text)`。不要同时维护 automatic binding 与同一
`multiplier` 的手工第二份状态；手工覆盖已绑定 node 后，下一次 `setValue()` 会重新应用 formatter。

建议迁移后搜索残留：

```text
setText("multiplier"
setImageStringText("multiplier"
setMainReelSymbolPresentationValue
outputPresentationValue
presentationValues
```

前两项应只保留确有独立手工语义的调用；后三项是 value 数据流，不能一概删除。

## 4. 人工浏览器验收

浏览器验收由 Crave 维护者执行，至少覆盖：

1. 正常窗口和截图中的极窄/极小窗口反复 resize，不再出现
   `viewportSize.width cannot contain focusRect minMargin`，canvas 尺寸和 focus 仍正常。
2. WL、WM、CM target 在 spin blur、landing 和 settled 三个阶段显示同一个 `xN`；不会先显示
   `initialText`、落停后才跳值，或创建重叠的第二套 ImgNumber。
3. free spin、base spin、dropdown/refill、WM/CM feature replacement 和 final snapshot 的倍率均来自对应
   `otherScene`/fallback value matrix。
4. 同值重复提交不重复闪烁；倍率变化通过 value mutation 更新；`null` 清空绑定文字。
5. DevTools 无 formatter、unknown node、缺 glyph、Spine slot/profile 或 viewport 异常。

验收失败时先记录 scene、symbol code、坐标、presentation value、state 和 component/otherScene 来源；不要在
Crave 增加首 node、默认 `x1`、延时补 `setText()` 或 viewport 固定像素容差。
