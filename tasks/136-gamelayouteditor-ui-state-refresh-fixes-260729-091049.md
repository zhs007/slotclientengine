# 任务 136：Game Layout Editor UI 状态刷新修复执行报告

## 结果

任务已按计划在 `apps/gamelayouteditor` 内完成。没有修改 scene-layout v1 schema、共享 runtime、依赖清单或 lockfile；浏览器人工验收按用户要求保留给用户执行。

## 实现

- 普通图层关闭横屏/竖屏显示时，将该方向 placement 保存到 `EditorNodeDraft.hiddenPlacements`；重新开启恢复原 `x/y/scale`，首次开启仍使用固定初值。
- `hiddenPlacements` 只属于当前 editor draft。manifest/preview/export 仍显式投影 `placements`，隐藏方向不渲染、不进入 production ZIP；坐标原点切换会同步转换隐藏 placement。
- 转场 Promise 完成后严格检查 snapshot 已处于目标 stable/displayed mode；开启 follow 时同步主编辑状态与 preview selector，BigWin runtime 状态改为读取 stable mode binding。
- otherScene 以 package/symbol 稳定 key 保存 enabled、target、权重表分支和固定值分支；切换 enabled/source 或 UI 刷新不会清空未选分支。
- 通用刷新恢复带稳定 `data-*`/祖先上下文的 focus、selection range 和 selection direction；资源搜索与 Picker 搜索在 IME composition 期间不重建 DOM。
- 转场新建 from/to 与 BigWin placement 未提交文本进入 UI session draft；成功提交、删除 dependency、新建或导入项目时按上下文清理。
- README 已说明方向 placement 的会话记忆/ZIP 边界，以及成功转场的 follow 同步行为。

## 修改文件

- `apps/gamelayouteditor/src/model/editor-project.ts`
- `apps/gamelayouteditor/src/model/resource-commands.ts`
- `apps/gamelayouteditor/src/model/coordinate-origin.ts`
- `apps/gamelayouteditor/src/ui/ui-session.ts`
- `apps/gamelayouteditor/src/ui/app-shell.ts`
- `apps/gamelayouteditor/src/ui/layout-workspace.ts`
- `apps/gamelayouteditor/src/ui/transitions-workspace.ts`
- `apps/gamelayouteditor/tests/validation.test.ts`
- `apps/gamelayouteditor/tests/coordinate-origin.test.ts`
- `apps/gamelayouteditor/tests/app-shell.test.ts`
- `apps/gamelayouteditor/README.md`
- `tasks/136-gamelayouteditor-ui-state-refresh-fixes.md`

## 自动验收

使用 Codex 桌面内置 Node 环境，并按锁文件安装依赖。结果：

- `pnpm --filter gamelayouteditor typecheck`：通过。
- `pnpm --filter gamelayouteditor test`：通过，21 个 test files、158 个 tests。
- `pnpm --filter gamelayouteditor build`：通过；仅保留既有的单 chunk 大于 500 kB 提示。
- 定向回归：placement 重复开关与坐标转换、manifest projection、otherScene 分支保值、focus/caret/IME、transition draft、BigWin dirty input、转场完成状态同步均通过。
- `git diff --check`：通过。

依赖准备时，第一次命令因 shell 未提供 `node` 失败；切换到 Codex 桌面内置 Node 后同一锁定安装和后续验收均成功。这不是代码失败，也未修改 lockfile。

## 浏览器人工验收

状态：待用户验收。

建议清单：

1. 双背景项目分别编辑同一普通图层的横屏和竖屏 `x/y/scale`，各自关闭再开启，确认恢复原值；关闭期间 preview 不显示该方向图层。
2. 切换坐标原点后再恢复隐藏方向，确认视觉位置不跳；导出 ZIP 后确认隐藏方向未进入 manifest，并理解重新导入不会恢复隐藏缓存。
3. otherScene 为同一 symbol 分别设置权重表与固定值，反复切换 source/enabled 和其它 UI 操作，确认两个分支值都保留。
4. 在资源搜索和 Picker 搜索中测试中文输入法、选中文字、移动光标后继续输入，确认刷新不抢焦点、不跳到末尾。
5. 选择转场新建 from/to 后切换 Tab 再返回，确认草稿保留；创建失败时不清空，成功时才清空。
6. 执行 Spine/MP4 正向转场，确认完成后主状态、preview selector、Inspector 和 BigWin 绑定都指向目标 stable mode；再使用显式反向边返回并重复确认。
7. 编辑 BigWin placement 但不失焦，触发 popup runtime 状态刷新，确认输入不被旧 canonical 值覆盖；提交后确认预览使用新值。

## 剩余边界

- 隐藏 placement、otherScene 非活动分支、transition create 与 BigWin dirty input 都是当前 editor session 状态，不跨页面重载。
- 隐藏 placement 不进入 production ZIP；这是保持 schema 与运行时可见性不变的明确边界。
- 未执行真实浏览器验收，不能将上述人工项记为已通过。
