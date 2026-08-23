# EditorCore Assets Demo

`editordemo` 是任务 229/231/241 的隔离验收宿主。它只依赖 `@slotclientengine/editorcore` 的公开 Assets API，不加载或复用任何正式 editor 的应用代码。

功能包括非侵入式“Assets 管理”和“编辑 Event 组”按钮、统一导入入口、可调宽树形列表、搜索与筛选、媒体/Spine/VNI/ImgNumber 预览、程序使用标记、单 root 导出、Game Layout ZIP 驱动的渐进式 event group 编辑、Demo 工程 ZIP 导入/导出，以及 10,000 条根节点的 UI 性能 fixture。

```bash
pnpm --filter editordemo dev
```

Event 验收先在 Assets 管理中导入 Gamelayout Editor 的 mapped ZIP，再打开“编辑 Event 组”，选择该 Layout，逐级
添加、修改和移除 ZIP 实际提供的 event。确认结果只显示在当前页面，不写入 Demo 工程 archive；reset/open project
会清空该 UI session。

浏览器人工验收由任务发起人执行；自动验收覆盖 dialog 生命周期、单 root strict ZIP、工程 ZIP 严格校验、event
catalog replacement 和往返一致性。人工验收重点检查 splitter、Escape/焦点返回、渐进式 event 候选与搜索、
Symbol 全部/行/列/cell 坐标、Spine/VNI/ImgNumber 预览，以及关闭 dialog 后没有 stale UI、继续播放或残留 canvas。
