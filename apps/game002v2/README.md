# game002v2

game002 的精简重写。运行时直接消费 `assets/crave` 解包目录，并通过
`SceneLayoutPackageRuntime` 调用 Gamelayout 已绑定的背景、Symbols、转场和 Popup。

回合表现是直接的异步调用链，不生成 execution plan、mutation contract 或 rollback。
业务失败采用 fail-stop；下一次恢复由重新连接/初始化负责。

## Task 187 表现与计时

启动后控制台以 `[game002v2 timing]` 输出结构化 startup/spin trace。每个 phase
包含单调时钟 `atMs`、相对上一阶段的 `durationMs` 和相对起点的 `elapsedMs`；记录
只含阶段名、实例内 trace id、状态和毫秒值，不包含 token、server payload、随机数、
scene 或轮带。startup 在初始 scene commit 后等待一个 animation frame 才允许 loading
退场；spin trace 另外记录 plan call、首个真实 cell started edge 和其后的 paint。控制台
首行直接汇总 total、click-to-first-cell-start/paint 和最大阶段，后续文本逐行展开全部
phase；`pre-start-largest` 单独标出点击到首格开始前的最大阶段。同一条日志的结构化
对象仍保留完整数据，便于采样统计。

## Task 188 首屏与预转

startup trace 进一步拆分 runtime init、initial scene commit、runtime attach 和首帧 paint。
Scene Layout runtime 并发 prepare 相互独立的 node、Symbols/reel/effect 与 popup 资源，全部
prepare 成功后仍按 manifest 顺序确定性 commit；失败会先等待所有已启动 prepare 收敛再统一清理。

每次 framework spin 请求在网络请求真正发出后立即启动一次无服务器目标的本地公开轮带预转，
响应中的第一个 landing 从当前运动状态连续落停。BaseGame 首段预转全盘；FreeGame 首段保留输入
盘面的 WL/CN，只滚动其它格。该响应内后续 FG 连续段和 refill 已有目标，不再等待消息、也不再次
预转。请求、解析或表现失败会取消尚未消费的预转并走既有 fail-stop。

`fg-spin` 以输入盘面为准保留 WL/CN occurrence，只对其它格执行 rendercore selective
spin，并由 shared runtime 校验 held code/value 未被 target 改写。Nearwin 的 `nearwin1`
与 refill sweep 的 `nearwin2` 只经 Crave runtime resource exact key 加载；期待状态下的
cascade 顺序为 existing-only dropdown、Nearwin2 sweep、holes selective refill spin。

中奖 remove 使用 rendercore terminal remove transaction。game002v2 只注入 WL retained
predicate，并核对返回的 removed/retained 坐标与 server `bg-remove` scene；不会在 remove
完成和 release 之间请求一次 normal。
