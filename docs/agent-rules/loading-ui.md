# Loading UI rules

## Ownership

- `packages/gameloading` 只拥有资源加载、进度、取消以及 `99%/100%` 生命周期和可注入 Loading UI contract，不包含具体 DOM/CSS。
- `packages/gameloading-ui-simple` 与 `packages/gameloading-ui-leo` 是独立原生 DOM/CSS、零运行时依赖实现，不依赖 React、Pixi、framework 或 network。
- Wildsheep Loading 不在当前范围，不增加 alias 或 fallback。

## Lifecycle

- 游戏静态资源请求必须与 loading resource phase 同轮启动；Scene Layout delivery 必须在此阶段完成 initial chunk、初始 atlas 与 package resource prepare，禁止只下载 manifest 后到 `99%` 才开始真实 assets 请求。游戏 live 初始化仍在 loading `99%` 回调中校验配置并准备 session。
- `100%` 后才创建 framework/Pixi 画面，并复用同一个 prepared session，禁止 loading 前挂载或双 WebSocket。
- Scene Layout delivery 的 BGM/音效/视频不得进入 metadata ZIP、atlas 或 splash 初始资源进度；它们保持独立 CDN URL 与原 production bytes，在 initial resource ready 后以高于非 initial GameMode 的后台优先级预取。此合同保留媒体 URL 与浏览器缓存/流式能力，但不保证所有浏览器或 backend 都采用同一种流式解码策略。
- `GameLoadingResource.dispose` 只清理尚未转交给成功 prepare result 的已加载值；失败、取消与 late fulfillment 必须幂等清理，成功进入游戏后 ownership 转给游戏 lifecycle。
- Loading UI 的视觉 gate 不决定 live session 是否完成；enter 成功后由 controller 统一 exit/destroy。
- game002v2 注入 Leo UI，game003v2 注入 simple UI。
