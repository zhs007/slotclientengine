# Game Viewer and configured round-flow rules

## Product boundary

- `apps/gameviewer` 是纯前端零代码游戏模板配置器和独立 runtime window，不生成游戏源码。
- layout ZIP 是唯一美术/runtime resource owner。server authoring JSON 只用于遍历 bet method/component 和生成待用户确认的职责候选；不执行 graph、不启动服务器，也不向 runtime 传播原始 JSON 或 server repository reels。
- 新实例只能由 ZIP 加 versioned strict component/presentation config 创建；禁止游戏专属 adapter、resolver 或 source。

## Launch security

- launch credential 只存在一次性 MessageChannel payload，不进入 URL、project、localStorage 或日志。
- 配置器不预连接 WebSocket。
- 新窗口重新核对 payload version、nonce、layout hash 和 readiness，并独立拥有/销毁 session 与 render resource。

## Reel 与 flow 是独立配置轴

- reel presentation 首版只支持与 layout `renderMode` 匹配的 `standard-v1 | grid-cell-v1`。
- flow 是 base components 加可选的 `remove -> dropdown -> refill` cascade block；cascade 不属于任何 reel kind。
- standard、grid-cell 和未来 typed reel 都必须通过 capability contract 匹配 flow requirement。
- 未知 kind、block、extension、缺 resource/state/component/value/popup 一律显式失败，不 fallback。
- Task 123 的 `presentation.flow` V1 语义保持不变；value symbol 只能通过显式 V2 collect 配置接入。

## Compiler、coordinator 与 facade

- component 语义 parser/profile 和完整 server round immutable execution plan 属于 `packages/logiccore`。
- production ZIP、reel、symbol、cascade player 和最薄 capability coordinator 属于 `packages/rendercore`。
- one-call scene-layout template factory 属于 `packages/gameframeworks`。
- `apps/gameviewer/src/runtime` 只验证一次性 payload 并调用 framework facade；不得直接依赖 rendercore、Pixi、Spine 或 VNI。
- app runtime 不硬编码具体游戏、component 或 symbol。game003 的 bg-bar/minecart 等主转轮外玩法只能通过 versioned typed extension 接入，不能成为 standard reel 隐式能力。
- 不恢复 final-scene reset 伪 cascade，不在 game002/Game Viewer 复制共享 round 状态机。

## Production layout package

- scene-layout production ZIP 严格校验 manifest、gameModes、plural symbol packages、popup dependencies、exact resource closure 和 active variant。
- package runtime 只暴露 versioned public facade，不允许 app 绕过 coordinator 直接驱动画面 mutation。
- 缺少 profile、binding、capability 或资源时在 launch/compile 边界失败，不能运行到一半再猜测。
