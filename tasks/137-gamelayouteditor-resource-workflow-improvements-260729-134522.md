# 任务 137：Game Layout Editor 资源工作流改进执行报告

## 结果

任务已在 `apps/gamelayouteditor` 范围内完成：

- Resource Picker 右侧新增 typed preview：image 原图、Spine atlas page 总览/显式 animation 播放、VNI timeline、image-string glyph 总览。
- loose-file Spine 上传支持多个 4.3 JSON 共享一个 atlas 和精确贴图集；每个 JSON 是独立 root，整批 prepare/validate 后原子提交。
- production ZIP 继续以正式 layout 实际引用 root 为起点收集 exact closure；已增加共享 Spine leaf 往返和未引用 sibling JSON 排除测试。
- 图层重绑、背景更换和资源替换尽量保留兼容配置；图片尺寸变化只更新 art size，不再自动重置 reel、focus 或 placement。

未修改 scene-layout v1 schema、rendercore/vnicore public API、依赖版本或 `pnpm-lock.yaml`。

## 关键实现

- 新增 `ResourcePickerPreview` owner，统一管理异步 request token、Pixi/Spine/VNI player、ticker、renderer 和 Object URL；失败、切换、关闭及 app destroy 都会清理临时对象。
- 新增 `uploadSpineResources()` 批量入口。共享 atlas/texture 只由各 JSON root 单向引用；既有共享 root 的 page mapping 不兼容时整批失败。
- editor ZIP 重导允许不同 Spine skeleton root 共享完全一致的 atlas/texture leaf，同时继续拒绝 skeleton root、不同 kind 或不一致语义的路径冲突。
- `rebindLayerResource()` 保留 node id、order、placements/hidden placements，并在合法时保留 Spine animation、loop、VNI loop 和 image-string text/anchor。
- 背景绑定与 image replacement 只有首次缺少完整 geometry 时才初始化；已有 geometry 在尺寸变化后原值保留，严格 validator 负责阻止非法导出。
- 导出反馈的“未引用资源”统计改用完整 layout reference collector，包含 background 与 transition 引用。

## 实际修改文件

- `apps/gamelayouteditor/src/model/editor-project.ts`
- `apps/gamelayouteditor/src/model/resource-commands.ts`
- `apps/gamelayouteditor/src/model/validation.ts`
- `apps/gamelayouteditor/src/preview/resource-picker-preview.ts`
- `apps/gamelayouteditor/src/ui/app-shell.ts`
- `apps/gamelayouteditor/src/ui/resource-picker.ts`
- `apps/gamelayouteditor/src/styles.css`
- `apps/gamelayouteditor/tests/app-shell.test.ts`
- `apps/gamelayouteditor/tests/resource-picker-preview.test.ts`
- `apps/gamelayouteditor/tests/ui-session.test.ts`
- `apps/gamelayouteditor/tests/validation.test.ts`
- `apps/gamelayouteditor/tests/zip-io.test.ts`
- `apps/gamelayouteditor/README.md`
- `docs/agent-rules/editor-artifacts.md`
- `docs/agent-rules/scene-layout.md`
- `tasks/137-gamelayouteditor-resource-workflow-improvements.md`
- 本执行报告

## 计划适配

- 没有修改预计范围中的 ZIP IO 文件：现有 exporter 已按正式 manifest root 收集 typed exact closure；通过共享 Spine round-trip/unused sibling 测试证明后，只需放宽 editor project 的合法共享 leaf 导入规则。
- 没有修改 `editor-resource.ts`：现有 `{skeleton, atlas, textures}` 已完整表达 JSON 到共享 leaf 的单向关系。
- 预览使用公开 production player，没有扩张跨 package API。

## 自动验收

在 Node.js 24 环境执行：

- `pnpm --filter gamelayouteditor typecheck`：通过。
- `pnpm --filter gamelayouteditor test`：通过，22 个测试文件、165 项测试。
- `pnpm --filter gamelayouteditor lint`：通过。
- `pnpm --filter gamelayouteditor build`：通过；仅有既有的单 chunk 大于 500 kB 提示。
- `pnpm --filter gamelayouteditor format:check`：通过。
- `git diff --check`：通过。

依赖准备时，首次未切换到仓库要求的 Node 24，`sharp` 安装失败；切换 Node 24 后按锁文件安装成功。lockfile 未变化。

## 浏览器验收

已做基础真实浏览器冒烟：

- image Picker 右栏显示原图；
- 一次上传 `H1.json`、`H2.json`、`Symbol.atlas`、`Symbol.png` 后生成两个独立 Spine roots，未自动创建 node；
- Spine 未选择 animation 时显示 atlas page，选择 `Idle` 后 official player 正常显示动画画面；
- Picker 关闭后对话框与预览 owner 正常释放。

按用户要求，完整浏览器人工验收由用户执行，当前未标记为通过。建议继续覆盖 VNI/image-string、快速切换/控制台资源泄漏、只引用一个 sibling 后导出 ZIP，以及不同尺寸背景替换后的严格错误与配置保留。

## 剩余风险

- 大型 VNI、复杂多页 Spine 和连续快速候选切换仍需要用户在目标浏览器与真实美术资源上确认性能和视觉效果。
- 保留的 geometry 若超出新 art size 会按设计使 draft 校验失败并禁止导出，需要用户显式调整；不会自动修复。
- 未 commit、未 push、未创建 PR。
