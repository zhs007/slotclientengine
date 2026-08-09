# 188 game002v2 首屏与预转执行报告

## 结果

执行时间：`2026-08-09T09:20:33Z`；基线 HEAD：`1462a6ffc7c7fc71460728f75b9fd39ac8216d83`

已完成代码、自动测试、public API 文档和领域规则；未执行需要真实登录参数与同条件浏览器环境的
startup 5 次采样和 live spin 人工视觉验收。

## 最终合同

- gameframeworks 在 `session.spin(params)` 已返回 Promise 后同步调用 paired adapter pre-spin hook；
  response/parse/play 失败只通知一次取消，原错误保持 authoritative。
- rendercore 提供 grid-cell `startContinuous → settleContinuous/cancelContinuous` 与 Scene Layout main reel
  facade。start 只读取本地公开轮带；服务器 scene/value 只在 settle 注入临时 landing window。
- settle 从当前 fractional position、方向和瞬时速度继续运动，只在末段减速；selected positions 必须与
  start 完全一致，held occurrence 不重建。
- game002v2 每个 framework 请求只启动一次预转，响应的第一个 landing 消费它。同一响应后续 FG
  连续段和 refill 直接按已有目标播放，不等待消息、不重新预转。FreeGame 首段按请求前 authoritative
  scene/value 保留 WL/CN，BaseGame 首段全盘滚动。
- startup trace 新增 runtime init、initial scene commit、runtime attach 边界；Scene Layout 独立 node、
  active Symbols/reel/effect 和 popup 并发 prepare，全部任务 settle 后按 manifest/order 确定性 commit
  或统一 cleanup；相同 texture URL 的 in-flight load 去重。

## 主要文件

- `packages/gameframeworks/src/{types,framework}.ts`
- `packages/rendercore/src/reel/{types,render-reel,render-grid-cell-reel-set}.ts`
- `packages/rendercore/src/scene-layout/{types,runtime,package-runtime}.ts`
- `apps/game002v2/src/{performance-trace,spin-presentation,round-adapter}.ts`
- 对应定向测试、三个 README 与 `docs/agent-rules/{shared-game-runtime,game002}.md`

计划预计的独立 `grid-cell-continuous-spin.ts` 未新增：transaction 直接扩展现有 reel owner，避免产生第二个
状态机。未修改 assets、manifest、YAML、生成物、依赖声明或 lockfile。

## 自动验收

- rendercore 定向测试：4 files / 50 tests passed。
- gameframeworks framework-flow：1 file / 16 tests passed。
- game002v2：8 files / 15 tests passed。
- rendercore、gameframeworks、game002v2、game002 四个目标 typecheck：passed。
- rendercore、gameframeworks build：passed；最后速度连续改动后 rendercore typecheck/build 再次 passed。
- `git diff --check`：passed。

测试覆盖 request → pre-roll → delayed response → play 顺序、response failure exactly-once cancel、hook
配对校验、targetless 长时间滚动、selected/held、cancel、position-set mismatch、响应边界速度连续、exact
target settle、Scene Layout facade 与并发 init cleanup。

## 性能与人工验收

已有用户基线只有一次：startup `365.1ms`，其中
`initial-state-start → first-scene-paint=333.1ms`；spin
`request-send → response-received=3280.6ms`。本执行环境没有可复用的 live 登录参数和同条件浏览器
cold/warm cache 基线，因此未生成优化后 5 次原始样本或 median，也不声明百分比收益。

待在真实环境复验：

1. 同浏览器、viewport、网络与 cache 条件采集前后各 5 次 startup，比较新增 `runtime-init` 和
   `initial-state-start → first-scene-paint` median。
2. 普通 spin 确认 `first-cell-start/paint < response-received`（RTT 足够覆盖一帧时），响应边界无跳帧、
   停顿或二次起转。
3. FreeGame 首段确认 WL/CN held；同一响应后续 FG/refill 不等待、不再次预转；error/destroy 后无持续 ticker。

剩余风险是首屏 333.1ms 若主要来自 Pixi/Spine 同步构造而非资源等待，并发 prepare 的实际收益可能有限；
应以真实 median 与 profiler 决定是否继续优化，不能由当前自动测试推断。
