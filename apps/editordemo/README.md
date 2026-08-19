# EditorCore Assets Demo

`editordemo` 是任务 229 的隔离验收宿主。它只依赖 `@slotclientengine/editorcore` 的公开 Assets API，不加载或复用任何正式 editor 的应用代码。

功能包括统一导入入口、树形列表、搜索与筛选、详情预览、程序使用标记、冲突确认、Demo 工程 ZIP 导入/导出，以及 10,000 条根节点的 UI 性能 fixture。

```bash
pnpm --filter editordemo dev
```

浏览器人工验收由任务发起人执行；自动验收覆盖工程 ZIP 严格校验和往返一致性。
