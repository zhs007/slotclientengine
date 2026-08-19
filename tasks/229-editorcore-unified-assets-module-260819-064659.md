# 229 EditorCore 统一 Assets 模块执行报告

UTC：2026-08-19T06:46:59Z

## 结果

任务 229 已在隔离范围内完成：新增 `@slotclientengine/editorcore` 和 `editordemo`，未迁移或修改 `imgnumbereditor`、`popupeditor`、`symbolseditor`、`gamelayouteditor`。

EditorCore 公开 `assets/data`、`assets/core`、`assets/adapters`、`assets/ui` 和 CSS。底层继续复用 EditorResource 的 flat filename key、review、原子 commit、完整 SHA-256 map/payload；EditorCore 只新增 typed graph、tree occurrence、usage/program binding、owner adapter 编排和共享 DOM UI。Core 与默认格式 adapter 已拆开，headless core 不会隐式加载 RenderCore/VNICore/AudioCore。

## 实现摘要

- 支持 image、audio、video、spine、vni、image-string、popup、symbols、game-layout 九类顶层 root。
- Spine 和 Popup 内部 Spine 在 prepare 阶段建立 skeleton → atlas → texture；内部 leaf 只读，root 才能 bind/delete/rename。
- graph 保存唯一 node/typed relation，树仅为多 root 共享 leaf 的 UI 投影；关系环、dangling、未知格式和不完整 closure 显式失败。
- 一个导入按钮支持普通文件和 ZIP；profile、同名覆盖/keep-both、host candidate validation 完成后才提交，失败保留旧 snapshot。
- 使用状态和程序使用状态由 host reference/binding 实时派生；相同 bytes 的不同 logical keys 只在 content-addressed payload 层去重。
- UI 提供 search、kind/usage filter、固定行高虚拟 treegrid、键盘展开、inspector、原生媒体预览、review 和 destroy/Object URL cleanup。
- Editordemo 提供严格 versioned 工程 ZIP 导入/导出和 10,000-root UI fixture。工程重导校验 map/hash/size/orphan，并恢复 catalog 与程序 binding。

实现中测试发现 Popup namespace 后 atlas page logical name 与 namespaced texture key 不同，原始 generic tree builder 会漏掉 `uses-texture`；现已改为从 Popup typed `textures` mapping 建立关系，并由回归测试保护。

## 文件与规则

- 新增 `packages/editorcore/**`、`apps/editordemo/**`。
- 更新 `pnpm-lock.yaml` 的两个 workspace importer；没有新增第三方 runtime 依赖。
- 更新 `AGENTS.md` 路由、`docs/agent-rules/editor-artifacts.md` 和 `packages/editorresource/README.md`，固化“flat identity + typed tree projection + physical hash dedupe”边界。
- owner public API 已足够；交付包补验仅修正 RenderCore 的 VNI bundle profile 校验边界，没有修改 VNICore、AudioCore 或正式 Editor。

## 自动验收

按用户决定采用定向 L2，不运行整仓 L3：

- `pnpm --filter @slotclientengine/editorcore typecheck`：通过。
- `pnpm --filter @slotclientengine/editorcore lint`：通过。
- `pnpm --filter @slotclientengine/editorcore test`：19 tests 通过；statements 85.35%、branches 66.38%、functions 85.14%、lines 87.76%。
- `pnpm --filter @slotclientengine/editorcore build`：通过。
- `pnpm --filter @slotclientengine/editorcore format:check`：通过。
- `pnpm --filter editordemo typecheck`：通过。
- `pnpm --filter editordemo lint`：通过。
- `pnpm --filter editordemo test`：4 tests 通过；statements 75.00%、branches 60.37%、functions 80.55%、lines 75.93%。
- `pnpm --filter editordemo build`：通过。Vite 对 928.18 kB 默认格式 adapter chunk 给出大于 500 kB 的非阻断 warning；该 demo 会一次包含全部 owner adapter，正式 Editor 尚未接入。
- `pnpm --filter editordemo format:check`：通过。
- `CI=true pnpm install --frozen-lockfile`：通过，41 workspace projects already up to date。
- `git diff --check`：通过。

## 浏览器与偏差

浏览器人工验收按用户要求由用户执行，本报告不将其记为已通过。建议运行 `pnpm --filter editordemo dev`，重点检查混合导入/review、Spine/Popup/Symbols 展开、程序 binding 与删除阻止、导出重导，以及 10,000-root 搜索/滚动。

规划稿的验收级别由 L3 调整为用户指定的定向 L2；原因是本任务没有开始迁移正式 Editor。除此之外没有扩大到 production schema/runtime/app，也没有新增第三方 UI 或 virtualization 依赖。

## 交付包兼容补验

- 修正 VNI bundle profile 边界：editing backup 只校验结构、profile 和闭包，选中的 runtime profile 继续执行完整运行时校验。
- Symbols mapped ZIP 允许 package manifest 声明的 game config 与 symbol manifest 作为正式 control files。
- 新增 `game-layout` package root，复用 RenderCore Scene Layout parser 与 exact closure collector。
- 真实交付包验证通过：`bamboo2.zip` 导入为 11-key VNI root，`symbols.zip` 导入为 114-key Symbols root，`layout9.zip` 导入为 218-key Game Layout root，均无 blocking error。
- EditorCore：typecheck、lint、4 files / 21 tests 通过；RenderCore VNI bundle 定向测试 6 tests、typecheck、定向 lint 通过；Editordemo typecheck 通过。
