# EditorCore Assets Demo

`editordemo` 是任务 229/231 的隔离验收宿主。它只依赖 `@slotclientengine/editorcore` 的公开 Assets API，不加载或复用任何正式 editor 的应用代码。

功能包括一枚非侵入式“Assets 管理”按钮、modal dialog、统一导入入口、可调宽树形列表、搜索与筛选、媒体/Spine/VNI/ImgNumber 预览、程序使用标记、单 root 导出、Demo 工程 ZIP 导入/导出，以及 10,000 条根节点的 UI 性能 fixture。

```bash
pnpm --filter editordemo dev
```

浏览器人工验收由任务发起人执行；自动验收覆盖 dialog 生命周期、单 root strict ZIP、工程 ZIP 严格校验和往返一致性。人工验收重点检查 splitter、Escape/焦点返回、Spine animation、VNI 播放、ImgNumber text，以及关闭 dialog 后没有继续播放或残留 canvas。
