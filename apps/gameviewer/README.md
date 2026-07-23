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
