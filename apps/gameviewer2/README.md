# Game Viewer 2

完全本地的 scene / otherScene 流程预览器。导入 Game Layout Editor production ZIP 后，可编辑场景链、逐格 Symbol 与值、状态编排，并在独立窗口播放。

运行：`pnpm --filter gameviewer2 dev`

生产代码仅直接依赖 `@slotclientengine/rendercore`；不使用 `netcore`、服务器 round 或 component 配置。
