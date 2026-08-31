# 271 gamelayouteditor-mode-scoped-layers 执行报告

## 结果

- `EditorNodeDraft` 已删除旧 `gameMode` 双轨，只保存 v7 `nodes[*].scope`；导入、编辑、manifest preview、
  导出和重导使用同一份 exact mode × orientation scope。
- 普通图层 Inspector 已改为显式“所有状态有效”开关与 mode × orientation checkbox 矩阵。只有用户明确
  切回全局才删除 `scope`；从全局切为 scoped 时绑定当前编辑 mode 的现有 placements。
- 大纲 label 和灰显现在同时检查 mode scope 与当前 orientation placement。BaseGame/FreeGame 背景仍是
  普通节点，不增加背景 selector、名称猜测或 runtime 特判。
- placement 关闭会同步裁剪所有 scope 引用；清空最后 placement/scope context、unknown mode 和缺 placement
  引用均显式失败，不会静默扩大为全局。
- mode rename/delete 已只处理 v7 scope，并保持项目 mode 顺序。
- README 与 Editor artifact 规则已同步到 Scene Layout v7 generic scope 合同。

## 修改文件

实现：

```text
apps/gamelayouteditor/src/model/editor-project.ts
apps/gamelayouteditor/src/model/game-mode-commands.ts
apps/gamelayouteditor/src/model/resource-commands.ts
apps/gamelayouteditor/src/ui/layout-workspace.ts
apps/gamelayouteditor/src/ui/app-shell.ts
apps/gamelayouteditor/src/styles.css
```

测试与文档：

```text
apps/gamelayouteditor/tests/app-shell.test.ts
apps/gamelayouteditor/tests/editor-store.test.ts
apps/gamelayouteditor/tests/game-mode-commands.test.ts
apps/gamelayouteditor/tests/ui-session.test.ts
apps/gamelayouteditor/tests/validation.test.ts
apps/gamelayouteditor/tests/zip-io.test.ts
apps/gamelayouteditor/README.md
docs/agent-rules/editor-artifacts.md
tasks/271-gamelayouteditor-mode-scoped-layers.md
```

未修改 RenderCore、schema、runtime、assets、package manifest 或 `pnpm-lock.yaml`。

## 关键测试

- model：global/scoped 切换、single/multi-mode、orientation subset、unknown mode、缺 placement、拒绝清空
  最后 context、scope/placement 同步裁剪。
- mode command：multi-mode scope rename 与 scoped mode delete guard。
- UI：导入 scoped node 后全局开关状态、mode×orientation matrix、当前上下文灰显和 checkbox 事件提交。
- ZIP：两个普通背景分别绑定 BaseGame/FreeGame，完成 v7 export→import→draft→export→reimport exact scope
  往返，并确认 draft 不再出现 `gameMode`。
- EditorStore：scope 编辑被分类为 structural change，继续走完整 preview prepare/commit。

## 自动验收

- `pnpm --filter @slotclientengine/browserartifactio build`：通过。首次 typecheck 前需要补建该直接依赖的声明。
- `pnpm --filter gamelayouteditor typecheck`：通过。
- 六个定向 Vitest 文件：6 files / 53 tests 全部通过。
- `pnpm --filter gamelayouteditor lint`：通过。
- `pnpm --filter gamelayouteditor build`：通过；仅有既有 Vite `__dirname`、dynamic import 与 chunk size warning。
- 任务改动中除包含既有格式差异的两个源文件外，定向 Prettier 检查通过。
- `git diff --check`：通过。

依赖环境说明：工作树初始没有 `node_modules`；frozen install 因当前 `pnpm-lock.yaml` 缺少
`@typescript-eslint/eslint-plugin` peer snapshot 失败。随后使用 Node 24 与
`pnpm install --no-frozen-lockfile --lockfile=false` 只建立本地依赖目录，未读取或写回 lockfile。

`pnpm --filter gamelayouteditor format:check` 仍失败于：

```text
src/io/exported-layout-zip.ts
src/model/resource-commands.ts
src/ui/app-shell.ts
src/ui/transitions-workspace.ts
src/ui/ui-session.ts
```

其中三个文件完全未修改；另外两个文件的 Prettier 差异位于本任务未触及的既有段落。为避免顺手格式化，已恢复
这些无关格式行，只保留 scope 实现 diff。此项不是本任务行为回归。

## 待人工验收

由用户在浏览器导入 `crave/new-layout-layout17.5.zip`：

1. BaseGame 只显示 BaseGame 背景，FreeGame 背景灰显；切到 FreeGame 后互换。
2. landscape/portrait 的 Inspector matrix、画布和大纲状态一致，“所有状态有效”不会误勾选。
3. 不改 scope 导出重导保持 exact scope；修改一个 mode/orientation 后只影响该上下文。

自动化 synthetic ZIP 已覆盖相同数据合同，但不冒充上述真实素材验收。

## 计划偏差与剩余风险

- 未运行整仓验收，符合 L1 范围。
- 未读取或提交 Downloads 中的真实 ZIP；浏览器验收由用户负责。
- 若真实 ZIP 的两个节点本身没有 `scope`，Editor 会忠实显示为全局，不会按背景名称猜测；届时应检查 ZIP
  生成端或由用户显式设置 scope。
