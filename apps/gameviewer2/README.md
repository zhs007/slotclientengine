# Game Viewer 2

完全本地的 scene / otherScene 流程预览器。导入 Game Layout Editor production ZIP 后，可编辑场景链、逐格 Symbol 与值、状态编排，并在独立窗口播放。scene 编辑器以 `columns = width`、`rows = height` 显示矩阵，底层数据仍是 x-first `scene[x][y]`。

项目文件使用 strict `scene-other-scene-flow` v2。首边 Spin 是一个合并编排，固定由“Spin 前 → Spin 中 → 停止”三个节点组成；停止和普通 Sequence 都以 exact `normal` 结尾，中间项只允许由真实动画 completion 推进的 once state，不使用 hold timer。

每个非 initial scene 可选择等待所有格回到 `normal`，或在左上角 `(0,0)` 回到 `normal` 后处理下一 scene。Spin 无论选择哪种策略，都必须先等 standard / grid-cell reel 物理停稳。v1 项目不自动迁移。

运行：`pnpm --filter gameviewer2 dev`

生产代码仅直接依赖 `@slotclientengine/rendercore`；不使用 `netcore`、服务器 round 或 component 配置。
