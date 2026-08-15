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

## Crave production 发布清理

以下均属于 `apps/game002v2` 的生产接线调整，不包含在任务 213 的自动改动中，发布前由游戏侧手动
完成并重新执行浏览器/真机验收。

### 必须移除或替换

- 取消 `main.ts` 对 `createGame002v2PerformanceTrace()` 的默认创建和注入，移除
  `markStartup()`、round adapter 的 trace 参数以及 framework `performanceObserver` 接线。
  `performance-trace.ts` 和测试可以保留作开发诊断，但 production 入口不得引用；若 production
  仍需临时启用，必须由明确的构建级 opt-in 控制，并在 record 输出后删除 completed spin，禁止
  `spins` Map 随会话永久增长。
- 移除 framework 的 `rngConsole: { target: window, ... }`。它会安装全局 `window.rng(...)`、允许
  下一轮请求注入测试服 `lstrand`，并输出服务器 random numbers，只能用于测试环境。
- 将 `launch.ts` 当前固定的 `wss://gameserv.rgstest.slammerstudios.com/` 替换为经确认的 production
  WebSocket endpoint。不要恢复玩家可通过 URL 任意覆盖 `serverUrl` 的能力；生产地址应来自受控
  发布配置。
- 将 `main.ts` 和 `round-adapter.ts` 中直接使用的 `console.error` 接到 production 错误上报与脱敏
  展示。不得吞掉 fail-stop 错误，也不得向玩家控制台输出 token、请求/响应 payload、服务器 scene、
  random numbers 或内部敏感数据。
- 移除 performance trace 接线后，同步更新 `apps/game002v2/README.md` 中 Task 187/188 timing trace
  的常驻输出说明。

### 无需作为调试代码删除

- `apps/game002v2/tests/**`、Vitest 配置与 devDependencies 不会由 production 入口打包。
- Vite dev server 的 `host: "0.0.0.0"`、`port: 5207` 只影响开发服务器；当前 production build
  没有显式开启 sourcemap。
- Web Crypto CN 随机、`requestAnimationFrame`、launcher URL 参数解析和正常运行时错误边界属于
  正式逻辑，不能因名称或浏览器 API 看起来像诊断代码而删除。
