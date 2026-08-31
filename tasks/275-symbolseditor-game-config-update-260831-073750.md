# 275 symbolseditor-game-config-update 执行报告

UTC：2026-08-31 07:37:50

## 最终实现

- Symbols Editor“项目配置”页新增“更新 gameconfig.json”入口，显示当前来源文件与 symbol 数量。
- `prepareGameConfigUpdate()` 先调用共享 strict parser，再按 exact symbol name 构造 candidate 和
  `kept/added/removed/codeChanged` 摘要。同名草稿保留全部 authoring 并采用新 code；新增项使用当前
  cellSize 建 explicit-empty normal；删除/同 code 改名不猜迁移。
- UI 在文件读取后显示完整 review，用户确认且 store revision 未变化时才一次 `replace()`；取消、坏 JSON/
  schema 与 stale revision 均零提交。
- 被删 symbol 的 asset/dependency library 内容保留为未引用资源，现有 exact export closure 自动排除；更新后
  ZIP 的 canonical `gameconfig.json`、manifest 与 mapped assets 可重新导入。
- 项目页为 update row 增加独立三列样式；该调整来自实际页面视觉检查，避免复用状态定义四列布局导致标题
  被挤压。README 与 Editor artifact 稳定规则已同步。

## 实际修改文件

```text
apps/symbolseditor/src/model/editor-project.ts
apps/symbolseditor/src/ui/workspace-app.ts
apps/symbolseditor/src/styles.css
apps/symbolseditor/tests/editor-project.test.ts
apps/symbolseditor/tests/app-shell.test.ts
apps/symbolseditor/tests/zip-io.test.ts
apps/symbolseditor/README.md
docs/agent-rules/editor-artifacts.md
```

未修改 shared package public API、schema、package dependency、`package.json` 或 `pnpm-lock.yaml`。

## 验收结果

- `pnpm --filter symbolseditor typecheck`：通过。
- `pnpm --filter symbolseditor test`：通过，11 files / 95 tests。
- `pnpm --filter symbolseditor lint`：通过。
- `pnpm --filter symbolseditor build`：通过；仅保留既有 Vite config 与 chunk-size warning。
- `pnpm --filter symbolseditor format:check`：临时依赖环境解析到 Prettier 3.9.6，报告 5 个未修改文件及 3 个
  目标文件的版本格式差异。随后使用 lockfile 预期版本执行
  `pnpm dlx prettier@3.8.1 --check apps/symbolseditor docs/agent-rules/editor-artifacts.md tasks/275-symbolseditor-game-config-update.md`：
  通过。
- `git diff --check`：通过。
- 定向复验：`editor-project.test.ts`、`app-shell.test.ts`、`zip-io.test.ts` 共 55 tests 通过。

测试覆盖成功更新、取消、非法 JSON/schema、stale revision、same-name code change、add/remove、同 code rename
非推断、library bytes 保留、未引用资源排除、canonical ZIP 和重导。

## 环境与计划偏差

- worktree 初始没有 package executable links；`CI=true pnpm install --frozen-lockfile` 被仓库既有 broken
  lockfile 缺项阻止。为不修写 lockfile，使用 `pnpm install --lockfile=false` 建立临时 `node_modules`；首次
  offline 尝试缺 `@types/node` tarball，获准联网后完成。所有依赖文件均位于忽略目录，tracked dependency
  metadata 和 lockfile 无变化。
- `apps/symbolseditor/src/styles.css` 是计划允许的条件文件：实际页面检查确认必须增加最小布局样式。
- 未扩大 shared API/schema/consumer 范围，无其它实施偏差。

## 人工验收

按用户要求由用户完成。当前 `http://127.0.0.1:4175/` dev server 与浏览器页面保持可用；尚需用户最终确认：

1. 合法更新的 review 文案、确认/取消和 symbol 保留/新增/删除结果；
2. 非法 JSON 与操作中项目变化不覆盖现有项目；
3. 导出 ZIP 后重新打开，确认更新后的 game config、code/reels 与既有 binding。

## 剩余风险

- 用户确认删除 symbol 后没有持久 undo；资源 bytes 仍在当前 library，但已删除的 typed draft 需从旧 ZIP
  恢复。
- 最终人工浏览器验收尚待用户完成；自动测试、构建与一次实际页面布局检查均已通过。
