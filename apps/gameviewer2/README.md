# Game Viewer 2

项目外层格式为 strict v4：保存 layout hash、现有 scene/choreography flow 与
`slot-operation-authoring-project@2`。v2/v3 导入必须先加载匹配 ZIP，并显式接受升级草稿；
在全部 edge `review: complete` 且 strict finalizer 闭合前，预览与导出禁用。

首个 authored snapshot 由 scene landing 建立；相邻 snapshot 会生成 spin landing 或显式
state mutation evidence，相同 snapshot 不自动生成 presentation placeholder。
Operations 页签显示每条 edge 的 suggestion 状态、候选数和 diagnostics，并允许逐 draft 修改
本地注册 kind 与完整 payload JSON。payload 可显式表达 positions、relocation pairing、result、
order、amount；修改后 edge 恢复为 `review: required`，只有 strict compile 与目标 snapshot 精确
闭合后才能逐 edge 接受。
launch v4 只通过一次性 MessageChannel 发送 ZIP、flow 和 finalized V2 plan；预览 runtime
在创建 Pixi/runtime 资源前核对首个 landing 与每个 authored output checkpoint。Replay
继续新建本地 generation，不复用未完成的 cell controller。核对通过后，spin、同一
edge 的 ordered drafts 与 settled commit 均由 rendercore 实例级 operation coordinator
执行；settled scene/value 只取当前 `operation.output`。

完全本地的 scene / otherScene 流程预览器。导入 Game Layout Editor production ZIP 后，可编辑场景链、逐格 Symbol 与值、状态编排，并在独立窗口播放。scene 编辑器以 `columns = width`、`rows = height` 显示矩阵，底层数据仍是 x-first `scene[x][y]`。

外层 v4 中的 presentation flow 继续使用 strict `scene-other-scene-flow` v2。首边 Spin 是一个合并编排，固定由“Spin 前 → Spin 中 → 停止”三个节点组成；停止和普通 Sequence 都以 exact `normal` 结尾，中间项只允许由真实动画 completion 推进的 once state，不使用 hold timer。

每个非 initial scene 可选择等待所有格回到 `normal`，或在左上角 `(0,0)` 回到 `normal` 后处理下一 scene。Spin 无论选择哪种策略，都必须先等 standard / grid-cell reel 物理停稳。v1 项目不自动迁移。

运行：`pnpm --filter gameviewer2 dev`

生产代码仅直接依赖 `@slotclientengine/rendercore` 与
`@slotclientengine/slotoperationauthoring`；不使用 `netcore`、服务器 round 或 component 配置。
