# Game Viewer

Game Viewer 是纯前端的零代码游戏模板配置器与独立 runtime window。新实例由
production scene-layout ZIP、versioned component/flow/presentation config 和一次性
live credential 组成；它不生成游戏源码，不执行服务器作者 graph，也不托管或模拟
服务器。

## 本地运行

```bash
pnpm --filter gameviewer dev
```

配置器只通过 `@slotclientengine/gameframeworks/scene-layout-template` 使用 shared
能力。server authoring JSON 仅用于遍历 bet method、component catalog 与生成待确认
建议；原始 JSON、repository reels、credential 不进入 project 或 runtime URL。

首版 reel presentation 是 strict `standard-v1 | grid-cell-v1`，round flow 是 base
components + optional cascade block。cascade 通过 capability contract 组合，不属于
任一 reel kind。缺 package resource、component、state、value binding 或 popup 时会在
readiness 阶段显式失败。

运行时会在 initial spin 前把完整 server round 编译为不可变 plan，再通过 framework
facade 驱动 shared coordinator。standard/grid-cell 都执行真实 remove、dropdown 和
refill movement；配置器/runtime 不解析 plan、不直接操作 renderer，也不再以最终
scene reset 代替 cascade。remove-excluded、drop-held、value 与 sequential companion
均来自用户确认并绑定 active symbol package 的 strict V1 policy。存在 value symbol 时，
`presentation.flow` 必须使用 V2，并显式提供 collect cadence、金额格式、item/summary
样式和位置；V1 语义保持不变且不会静默获得 collect fallback。readiness 只解析 ZIP
内的严格 manifest/资源闭包，不创建 Pixi 或图片解码资源。
