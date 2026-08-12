# 任务 201 执行报告：RenderCore 第二层安全组合 API

## 结果

完成第二层第一版实现，并将game003v2作为正式consumer迁移。游戏继续使用普通`for + await`；RenderCore负责临时节点
ownership、repeat/spin interruption cleanup、opaque anchor坐标转换、SymbolGroup批量preflight、manual-clock motion和通用
area spin stagger装配。没有引入plan、业务DSL、第三层玩法模板、raw Pixi对象或新依赖。

## 实现摘要

- Presentation context新增`mount/unmount/withNode/move/transfer`；节点显式声明`detach|destroy`，每次repeat callback形成独立
  scope，success/error/spin interruption/destroy统一cleanup。
- 新增opaque `RenderAnchor`：SymbolRender、SymbolGroup center、area point和Scene Layout exact named node均可提供anchor；实际
  mount/move时在RenderCore内部转换到目标layer坐标。
- `SymbolArea.getSymbols()`返回捕获exact occurrences的`SymbolGroup`；拒绝空组/重复位置/stale成员，批量set/play先完整验证；
  playback支持parallel/sequential。
- generic motion复用任务197的`prepareVisibleOccurrenceMotion()` line/cubic/easing sampler，以ReelArea update时钟推进；generic
  transfer只移动临时RenderNode或owned clone，不取得盘面commit。
- 新增`createAreaSpinFunction()`，支持column order和landing stagger，仍只调用逐列ReelSpin原子接口。
- game003v2 Win删除中心Symbol排序、layer add/remove/destroy和自定义AreaSpinFunction；改为
  `getSymbols + group anchor + context.withNode + group.playState`，landing使用通用left-to-right stagger factory。
- 任务197 grid-cell occurrence transfer的lease/commit public行为未改变；第二层仅复用其pure motion sampler。

## 计划适配

- 计划建议新增独立presentation测试目录；实际第一版核心owner位于`RenderReelSet`，因此scope/anchor/motion生命周期测试加入现有
  `render-reel-spin.test.ts`，避免为同一owner建立fake runtime。public类型仍拆入`presentation/`和`symbol-group.ts`。
- named Scene node anchor以`runtime.getNodeAnchor(id)`提供；同时导出中性`getNamedRenderAnchor(source,id)`，没有扩大raw layer API。
- 第一版start接口为同步void，无法安全表达frame stagger；factory严格拒绝非零start stagger，只实现顺序start和异步landing
  stagger。满足game003v2当前同步pre-spin合同。

## 自动化验收

已通过的定向测试：

```text
RenderCore：5 files / 60 tests passed
game003v2：3 files / 9 tests passed
```

覆盖scope节点ownership、group center anchor、manual-clock motion、spin interruption cleanup、repeat错误、staggered landing以及
legacy grid-cell transfer兼容。最终typecheck/build/diff结果见执行会话收尾。

## 人工验收

按用户要求由用户在浏览器完成：中奖Symbol同步播放、金额中心/层级、组间与轮间节奏、首轮后可Spin、Spin无异常中断后台
循环、下一轮无残留文字、五列同步pre-spin、120ms逐列落停、CO value和popup。自动化不替代视觉结果。

## 剩余边界

- 当前group anchor只冻结`center`真实需求；其它align/bounds待玩法需求。
- generic transfer只接受已挂入presentation scope的RenderNode或owned clone；borrowed盘面Symbol relocation继续使用专用
  occurrence transfer。
- `collectCoins/playWins/expandWild`等第三层业务模板未实施。
