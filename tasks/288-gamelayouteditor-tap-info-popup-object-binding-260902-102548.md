# 288 Game Layout Editor Tap info Popup Object 执行报告

## 结果

- 执行时间：`2026-09-02T10:25:48Z`
- HEAD：`5c9b6356a4c5fe0c918e1a151b607a5ad1019790`（detached，未提交）
- 状态：代码、定向自动化、文档已完成；真实浏览器人工验收按用户安排未执行。

## 实现

- Scene Layout v7 新增可选 `tapInfoObject: { manifest }`，strict 区分 mapped filename key 与 `dependencies/popup-objects/<name>/popup-object.manifest.json` direct path；asset collection、immutable structure、production ZIP、URL loader 与 exact nested closure 已接通。
- Scene Layout package resource 只准备并拥有一份 `PopupPreparedObject` definition；普通 Spine Popup 同时具有 v9 `spine.tapInfoObject.attachment` 时，每个 player 创建独立 mutable instance。
- 外部对象与普通 overlays 共用一次 official main-Spine-slot / VNI-text-layer attachment transaction，并固定追加到同父 children 尾部；不进入 `objects/getObject()`、string registry 或 runtime address。
- 对象在 Spine Popup `start` 激活，在 start/loop 每帧一次 update，进入 end 前停用；complete、immediate dismiss、init failure 与 destroy 均走既有清理边界。
- Game Layout Editor 新增 standalone Popup Object ZIP strict importer、候选库、同名替换、删除保护、项目级显式选择、“未配置”、preview asset closure、导出与重开恢复。导入不自动选择，未选对象不进入 ZIP。
- `gamelayoutpkgcli` 将 project-wide object closure 归入 shared initial delivery owner，并在优化重写时同步改写 layout binding；这是执行时为满足 production delivery parity 增加的最小范围。
- 更新 Scene Layout、Popup、Popup Object 文档，两份 README 与三份稳定领域规则。

## 自动化证据

通过：

```text
RenderCore 定向 Vitest：9 files / 74 tests passed
Game Layout Editor 定向 Vitest：4 files / 48 tests passed
Game Layout package CLI 定向 Vitest：2 files / 24 tests passed
RenderCore、Game Layout Editor、Game Layout package CLI 直接 TypeScript 检查：passed
Game Layout Editor 直接 Vite production build：passed（1185 modules transformed）
修改文件 Prettier check：passed
git diff --check：passed
```

计划中的 workspace 脚本级命令：

```text
pnpm --filter @slotclientengine/rendercore --filter gamelayouteditor typecheck
pnpm --filter gamelayouteditor build
```

二者均在任务 288 package 完成后，被既有 `packages/editorcore/src/assets/ui/game-layout-event-dialog.ts` 的三个无关类型错误阻断：`spin-lifecycle` / `ui-control-state` 不在当前 `GameLayoutRuntimeEventFamily` union（行 877、910、924）。本任务未扩大范围修改 EditorCore；直接检查、定向测试和直接 Vite build 均通过。

计划中的宽范围 Prettier 命令还报告 5 个本任务未修改的存量文件格式问题：`packages/rendercore/src/popup/editor.ts`、`packages/rendercore/src/scene-layout/runtime.ts`、`apps/gamelayouteditor/src/model/resource-commands.ts`、`apps/gamelayouteditor/src/ui/ui-session.ts`、`apps/gamelayouteditor/tests/app-shell.test.ts`。改动文件单独检查通过。

## 待人工验收

浏览器验收由用户执行，重点按计划复核：

1. 导入对象后不自动选择，未选择导出不含对象；
2. main Spine slot 与 VNI text layer 两条真实挂载路径；
3. 同父已有 overlay 时对象稳定位于尾部且无 slot owner 冲突；
4. start/loop 显示、进入 end 前消失、重复打开重新开始；
5. 清空、替换失败保留旧预览、导出重开、已选删除拒绝。

## 清理与剩余风险

- 为在无 `node_modules` 的 worktree 中验收而创建的临时依赖映射、复制的依赖目录和生成 `dist` 已全部删除；只保留源码、测试、文档、计划与本报告。
- 自动化覆盖 mapped/direct/URL closure、Editor ZIP round-trip、delivery owner/rewrite、main slot 合并与生命周期；真实复杂 VNI/Spine 对象的浏览器渲染和视觉顺序仍以人工验收为最终证据。
