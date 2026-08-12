# 任务 200 后续：ReelArea 第一层与 game003v2 await win loop

## 结果

按后续确认的第一层合同完成实现。standard reel 新增 `ReelArea` façade，统一提供安全 area layers、
symbol center、game-owned await presentation 与最高优先级 `area.spin`。game003v2 已移除旧
SymbolWinCarousel、state/geometry snapshot 和 raw reel container 依赖，改用第一层对象直接实现中奖循环。

## 实现摘要

- `ReelArea` 提供 `getSymbol()`、`getLayer("bottom" | "top" | "win")`、`present()` 与
  `spin.start/land/cancel`。
- display 顺序固定为 `bottom < symbols < top < win`，symbols 主层不暴露。
- `SymbolRender.getPosition()` 返回 area-local occurrence center；stale/未落停继续显式失败。
- `RenderNode` 增加通用 `setPosition/setVisible`，新增 `createTextRenderNode()`。
- `area.present()` 内部拥有 AbortController 和 frame-driven delay；spin start/land 自动中断当前
  presentation、阻止旧 continuation并清理 win layer。游戏不接触 interruption 类型或 signal。
- `AreaSpinFunction` 可在 runtime 装配时注入；默认实现所有列同时 start/land。game003v2 扩展只增加
  `x * stopDelayMs` 落停 cadence。
- ReelSpin 开始时以 immediate `spinBlur` 接管当前 occurrence，打断活动 symbol playback。
- game003v2 中奖逻辑直接循环 groups，取得具体 SymbolRender，await `playState("win")`；金额 TextRenderNode
  使用最中间 symbol center定位并挂入 win layer。首轮完成后 operation resolve，循环继续到下一 spin。
- 旧 `RenderReelSet.spin(plan)` 与其它 legacy façade暂时保留给未迁移 consumer；game003v2 不再使用。

## 自动化验收

通过：

```text
pnpm --filter @slotclientengine/rendercore exec vitest run tests/reel/render-reel-spin.test.ts tests/symbol/symbol-render.test.ts tests/reel/render-reel-set.test.ts tests/scene-layout/package-runtime.test.ts
结果：4 files / 40 tests passed

pnpm --filter game003v2 test
结果：3 files / 9 tests passed

pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore build
pnpm --filter game003v2 typecheck
git diff --check
结果：全部通过
```

## 人工验收

待用户浏览器验收：中奖组循环、金额位置/层级、首轮后可点 Spin、Spin 对循环的无异常中断、五列同步
pre-spin、120ms落停、CO value、popup和下一轮 win loop。自动化不替代视觉结果。

## 说明

`ReelArea` 使用 façade 而不是直接把 `spin` controller 加到 RenderReelSet，是因为后者已有 legacy
`spin(plan)` 方法；这样 game003v2 获得纯第一层接口，同时不破坏现有 consumer 的编译兼容。
