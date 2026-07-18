# 任务 105 实施报告

状态：代码实现和自动化验收完成；真实浏览器验收按用户要求由用户执行，因此任务完整 Definition of Done 仍待人工验收结果。

## 1. 执行环境与隔离

- UTC 记录时间：2026-07-18 10:34:56 UTC
- 分支：`main`
- 起始 HEAD：`6dbee924630231666c7261c89c0e06523b27ad06`
- 最终 HEAD：`6dbee924630231666c7261c89c0e06523b27ad06`（本次未提交）
- Node.js：`v24.14.0`
- pnpm：`10.0.0`
- 代理：未使用；未安装、删除或升级依赖，未修改 lockfile。
- 起始 `git status --short`：只有用户已有的未跟踪计划文件 `tasks/105-game-layout-editor-workspace-redesign.md`。
- 隔离：保留该计划文件，不修改任务范围外的用户文件；全仓生成命令执行后，game002、game003、symbolsviewer 的生成文件均未产生 diff。
- 最终 `git status --short`：本报告、计划文件、下列 gamelayouteditor 实现/测试文件和两处 rendercore 文件有改动；无其它文件。

## 2. 实际修改文件

### gamelayouteditor

- `apps/gamelayouteditor/README.md`
- `apps/gamelayouteditor/src/io/exported-layout-zip.ts`
- `apps/gamelayouteditor/src/model/editor-project.ts`
- `apps/gamelayouteditor/src/model/editor-resource.ts`
- `apps/gamelayouteditor/src/model/resource-commands.ts`
- `apps/gamelayouteditor/src/model/validation.ts`
- `apps/gamelayouteditor/src/styles.css`
- `apps/gamelayouteditor/src/ui/app-shell.ts`
- `apps/gamelayouteditor/src/ui/layout-workspace.ts`
- `apps/gamelayouteditor/src/ui/project-workspace.ts`
- `apps/gamelayouteditor/src/ui/resource-picker.ts`
- `apps/gamelayouteditor/src/ui/resources-workspace.ts`
- `apps/gamelayouteditor/src/ui/ui-markup.ts`
- `apps/gamelayouteditor/src/ui/ui-session.ts`
- `apps/gamelayouteditor/tests/app-shell.test.ts`
- `apps/gamelayouteditor/tests/editor-store.test.ts`
- `apps/gamelayouteditor/tests/ui-session.test.ts`
- `apps/gamelayouteditor/tests/validation.test.ts`
- `apps/gamelayouteditor/tests/zip-io.test.ts`

### rendercore 与任务文档

- `packages/rendercore/src/scene-layout/manifest.ts`
- `packages/rendercore/tests/scene-layout/manifest.test.ts`
- `tasks/105-game-layout-editor-workspace-redesign.md`（用户提供，未修改）
- `tasks/105-game-layout-editor-workspace-redesign-260718-103456.md`

## 3. 最终信息架构

- 左侧顶层只保留 `资源`、`布局`、`项目` 三个 ARIA Tab，同一时间只渲染一个主工作区；支持方向键、Home、End 和焦点保持。
- `资源`工作区提供紧凑 logical resource 列表、搜索、image/Spine 与引用状态筛选、详情、引用、上传、完整替换、零引用删除，以及从资源发起背景或图层操作。
- `布局`工作区采用 outline + 单一 Inspector。outline 分背景、main reel、普通图层；Inspector 只编辑当前选择，保留 background/reel/layer 的 typed 字段、顺序、variant 可见性、placement 和 Spine animation。
- `项目`工作区集中项目 id、模式、variants/nodes/resource 统计、严格诊断和 production ZIP closure 摘要，并明确提示未引用资源不会导出。
- preview 始终在右侧主区域，page size、zoom、guides 和 symbols package 控制归入右侧 drawer；资源列表、outline、Inspector 独立滚动。
- Tab、filter、outline selection、expanded ids、Picker、symbols drawer 等状态由 `EditorUiSessionState` 管理，不写入 typed project 或 production ZIP。

## 4. Typed model 与事务语义

- `EditorProject.resources` 保存 `Map<string, EditorLayoutResource>`，`assets` 独立保存精确 path -> bytes。
- image resource 拥有 `id/kind/path/size`；Spine resource 拥有 `id/kind/skeleton/atlas/textures/animationNames/bounds?`。
- node 只保存 `id/order/resourceId/defaultAnimation?/placements`；`defaultAnimation` 属于 node playback，不参与素材签名。
- 导入现有 layout ZIP 时按完整素材签名去重；同一 Spine 素材的不同 node animation 会共享 logical resource，不按 basename 猜共享关系。
- 上传只在全部解码、Spine dependency、atlas page、animation metadata 校验成功后原子提交 resource 和 bytes，不创建 node 或 background。
- Resource Picker 使用结构化 target；搜索、筛选、浏览、取消和 Picker 内上传都不修改 node。上传后只刷新并高亮候选，仍需用户明确确认；不自动选第一个资源，不猜 animation。
- 同一 resource 可创建多个 placement 独立的 layer；确定性 node id 只提出 `-2/-3` 建议，最终仍严格校验。
- 重绑允许 image/Spine 类型切换，并清理旧类型字段；Spine 必须显式选择有效 animation。
- 删除 layer 或清除 background 只删除引用 node，不删除 resource/bytes。删除 resource 仅允许零引用；失败信息列出 node、role 和 variant。
- 更换不同尺寸背景必须显式选择 reinitialize；无 bounds Spine 不猜 art size，保持 incomplete diagnostics。

## 5. Production ZIP 与 shared package

- 导出先生成现有 `SceneLayoutManifestV1`，再用 `collectSceneLayoutAssetPaths()` 取得闭包，从 byte store 精确选择、校验并写入；未引用 resource 留在当前 session，但不进入 ZIP，重新导入 production ZIP 也不会恢复。
- scene-layout schema、runtime、ZIP 格式、安全限制、资源加载与 preview 合同未改变。
- 为满足“同一完整素材可供多个 node 复用”，对 rendercore parser 做了一处必要的通用约束修正：同一完整素材签名可重复引用；不同签名仍禁止复用任意路径，大小写碰撞仍失败。Spine texture map 在签名中稳定排序。原 parser 对所有重复 path 一律拒绝，与任务要求的多 layer 复用无法同时成立，因此未在 app 中复制/改名素材或引入 fallback 绕过。
- `collectSceneLayoutAssetPaths()` 仍输出去重后的精确闭包，production schema 和消费者调用方式不变。

## 6. 自动化验收

### gamelayouteditor

- `format` / `format:check`：通过。
- `lint`：通过。
- `typecheck`：通过。
- `test`：12 个文件、70 项测试全部通过；任务前基线为 55 项。
- coverage：statements `82.42%`、branches `70.52%`、functions `87.10%`、lines `84.54%`。
- `build`：通过；880 modules，主 JS `565.43 kB`（gzip `160.71 kB`）。仍有 Vite 既有的 500 kB chunk warning，无构建错误。

新增/更新覆盖包括：logical resource 上传原子性、复用、替换、引用删除、背景尺寸初始化、Spine animation、import normalization、未引用 closure、Picker/session 零 mutation、ARIA Tabs/outline、单 Inspector、Object URL 生命周期和 ZIP round-trip。

### rendercore

- `format`、`lint`、`typecheck`、`build`：全部通过。
- `test`：55 个文件、349 项测试全部通过。
- coverage：statements `87.90%`、branches `80.39%`、functions `93.55%`、lines `88.31%`。
- scene-layout 专项测试验证完整签名复用可用、部分路径共享和尺寸漂移仍失败。

### 全仓最终门禁

- `pnpm lint`：26/26 package 成功。
- `pnpm typecheck`：26/26 package 成功。
- `pnpm test`：26/26 package 成功；包括 game002 95 项、game003 135 项及 rendercore/gamelayouteditor 回归。
- `pnpm build`：26/26 package 成功。
- `git diff --check`：通过。
- 仅观察到既有 Vite chunk size warning，以及 game003 静态生成流程的 Node experimental/deprecation warning；无失败。

## 7. 生命周期检查

- image thumbnail 使用单一 registry，以 path + bytes fingerprint 稳定复用 Object URL。
- resource replace/delete、project replace/import 和 app destroy 会撤销对应 URL；重复 render 不创建同 bytes 的新 URL，相关单测通过。
- project replace 和 app destroy 会关闭 Picker、清理临时状态，并销毁已有 preview owner。
- preview 继续通过 rendercore scene resource/runtime、Pixi、Spine 与 RenderSymbol 的 public lifecycle 创建和销毁，没有在 app 内复制 player/runtime 或加入 placeholder/fallback。
- 以上为代码审查和自动化验证结果；真实 GPU/Spine 播放、快速异步切换和浏览器内 owner 释放仍须在第 8 节人工验收中确认。

## 8. 浏览器人工验收交接

按用户明确要求，本次未启动或控制真实浏览器，也未记录浏览器版本、viewport、fixture、console 或截图；不能将此项标为通过。

启动命令：

```bash
pnpm --filter gamelayouteditor dev -- --host 127.0.0.1 --port 4173
```

请按计划第 14 节完整验收，至少记录：

1. Chromium 版本，1080/1280/1440/1920 宽度和低高度 viewport。
2. 30+ image、两个真实 Spine 4.3.x、100 resources/30 layers fixture。
3. 新项目资源优先流程、同资源双 layer、引用删除、orientation 双背景、不同尺寸 reinitialize、无 bounds Spine incomplete。
4. Picker 全键盘操作、Escape/Tab/focus restore、Picker 内上传不绑定、快速 rebind/delete/switch 无 stale 状态。
5. game002 或 game003 strict symbols ZIP、随机 scene 稳定性、导出 closure 和重新导入语义。
6. preview/独立滚动/console，以及 Object URL、Pixi、Spine、RenderSymbol owner 在 import/replace/delete/destroy 后释放。

如果人工验收无失败，可在本报告追加浏览器版本、viewport、fixture、通过项、console 与截图位置；若发现问题，任务仍应保持未完成并回到实现修复。

## 9. README、agents.md 与已知限制

- README 已改为真实的资源优先、Picker、outline/Inspector、preview drawer、strict closure 和 production ZIP round-trip 流程。
- 未修改 `AGENTS.md`：现有 rendercore scene-layout ownership 仍准确；本次 parser 修正是既有 production manifest 内同素材多 node 的通用引用能力，没有新增 app 专属跨包规则、schema 或 artifact 类型。
- 已知限制：本任务不提供 editor workspace archive；未引用资源只存在当前会话，production ZIP round-trip 不恢复它们。
- 未完成项：真实浏览器视觉、键盘、性能和 GPU/Pixi/Spine/RenderSymbol 生命周期验收，按用户要求由用户执行。

