# Crave 任务 213 手动验收

## 接线结论

本次优化位于 `packages/rendercore`，Crave 默认无需修改或启用开关。仓库内没有修改
`apps/game002v2/**`、`assets/crave/**` 或 `assets/gamecfg002/**`。浏览器和手机验收由使用者执行。

Crave 已有的 `createGame002v2DefaultSceneValueResolver()` 会从 active Symbols package 的
`bgcoinweight` 抽取滚动 CN value，因此无需新增接线。RenderCore 现在按该 value 选择 CN tier
并复用对应轻量 image-string view；服务器 target CN 则强制使用 round 中的 explicit value。

## CN 正确性复验

使用能够重复的同一份服务器 round/RNG 数据，至少连续复验以下组合：

- 水平相邻 CN、垂直相邻 CN，以及 3 个以上连续 CN；
- 相同 CN code 但不同数字；同 tier 改值和跨 tier 改值；
- BaseGame、FreeGame、cascade/refill 后落下的 CN；
- 同一输入重复 20 次，逐格比较最终 code 和数字。

预期：spin 中只看到既有 spinBlur 表现；落停前若资源仍在准备，轮子短暂停留在最终模糊帧，
不会先出现无数字 CN；落停时底图和数字一起出现。相邻 CN 必须各有独立数字，不能共享、串值或
一轮有一轮无。滚动中的随机 CN 应覆盖不同档位外观；最终模糊帧上的档位/数字必须已经切换为
服务器 target value，不能保留前一个随机值。

## 视觉回归

检查 full/selective/continuous settle 的方向、local phase、mask、bounce、dimming、逐格 start/stop
节奏、render priority、landing appear、win、remove、dropdown/refill、transfer 和 mode transition。
重点观察慢帧或后台切回前台后的最后一帧，不能出现 normal 空白帧或旧数字闪回。

## 手机性能记录

建议同一设备、同一构建连续运行至少 30 分钟，在开始、10、20、30 分钟记录：

- FPS、长帧和明显卡顿发生点；
- JS heap（浏览器支持时）、GC pause 和内存是否能回落；
- 机身温升和降频迹象；
- 每轮 spin 后 display/player 数量是否持续增长。

heap 呈锯齿并能回落、但随温升掉帧，通常更像持续 CPU/allocation 压力与 thermal throttling；
heap 基线单调上升则继续查 retention。

## 可选 Crave 手动清理

`apps/game002v2/src/performance-trace.ts` 的 completed spin record 当前会继续留在内部 `spins`
Map。它不是滚动 RenderSymbol churn 的主因，但长会话中属于独立的小型累积点。若真机 heap 证据显示
该 Map 增长，可在完成记录输出后手动 `delete` 对应 spin id，并验证 trace 消费方不再读取该记录。
这项 app 修改不包含在任务 213 的自动改动中。
