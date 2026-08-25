# Loading UI rules

## Ownership

- `packages/gameloading` 只拥有资源加载、进度、取消以及 `99%/100%` 生命周期和可注入 Loading UI contract，不包含具体 DOM/CSS。
- `packages/gameloading-ui-simple` 与 `packages/gameloading-ui-leo` 是独立原生 DOM/CSS、零运行时依赖实现，不依赖 React、Pixi、framework 或 network。
- Wildsheep Loading 不在当前范围，不增加 alias 或 fallback。

## Lifecycle

- 游戏 live 初始化在 loading `99%` 回调中校验配置并准备 session。
- `100%` 后才创建 framework/Pixi 画面，并复用同一个 prepared session，禁止 loading 前挂载或双 WebSocket。
- Scene Layout delivery 的 BGM/音效/视频不得进入 metadata ZIP、atlas 或 splash 初始资源进度；它们保持独立 CDN URL 与原 production bytes，由浏览器媒体层按实际播放需要请求。此合同保留流式加载能力，但不保证所有浏览器或 backend 都采用同一种流式解码策略。
- Loading UI 的视觉 gate 不决定 live session 是否完成；enter 成功后由 controller 统一 exit/destroy。
- game002v2 注入 Leo UI，game003v2 注入 simple UI。
