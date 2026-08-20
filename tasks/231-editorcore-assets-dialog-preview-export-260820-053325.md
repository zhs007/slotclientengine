# 231 EditorCore Assets Dialog、预览与导出执行报告

UTC：2026-08-20T05:33:25Z

## 结果

任务 231 的实现和自动化验收已完成。Editordemo 现在只挂载共享“Assets 管理”入口，点击后打开 EditorCore native modal dialog；关闭时不占用宿主主编辑区。正式的 ImgNumber、Popup、Symbols、Game Layout Editor 没有迁移或修改。

浏览器人工验收按用户要求由用户执行，本报告不将其记为已通过。因此计划中同时要求“自动化和浏览器证据”的 preview 项，以及要求全套 L3 通过的综合项仍保持未完成状态。

## 实现摘要

- 新增 `mountEditorAssetsDialog(...)` public facade，负责 trigger、native dialog、open/close、Escape、焦点进入/返回和 destroy；底层继续复用 `mountEditorAssetsView(...)`，关闭时暂停 import review 和 preview。
- 树区默认宽度调整为 300px，新增 pointer drag、pointer capture、键盘方向键和 ARIA separator；窄屏改为上下布局，宽度只保存在当前 UI 实例。
- inspector 只保留名称、root、类型和 preview；程序使用改为未标记/标记中/已标记的显式交互，未标记时 program key 不可编辑，内部 leaf 不显示 root 命令。
- 新增 default preview provider：image/audio/video 使用原生元素和 Object URL；Spine 复用 RenderCore official player并支持 strict animation 选择；VNI 复用 VNICore viewer；ImgNumber 复用 RenderCore image-string renderer 并支持 preview-only text；Popup、Symbols、Game Layout 显示明确的不支持状态。
- preview 使用 selection generation 防止过期异步结果提交；切换、关闭和 destroy 会释放 player/resource、Pixi Application、ticker、canvas、Object URL 和监听器。
- `EditorAssetsController.exportRoot(...)` 返回 immutable `{ filename, mediaType, bytes }` artifact；UI 只在物化和校验全部成功后下载，并立即回收下载 URL。

## 导出矩阵

- image/audio/video/text/binary：导出 workspace 中该 root 的原始 bytes。
- Spine：生成 deterministic ZIP，包含 skeleton JSON、atlas 和 atlas page 实际引用的图片。
- VNI：生成 viewer 可直接打开的完整 single-project ZIP，包含项目 JSON 和 exact asset closure。
- ImgNumber、Popup、Symbols、Game Layout：生成各 owner sentinel/control file、`assets.map.json` 和 content-addressed payload 的完整 deterministic ZIP。
- 所有 mapped package 在返回前校验安全路径、manifest/schema、map/payload 和 exact closure；Symbols 还使用正式 materializer/resource prepare 复验。失败不会下载半成品或修改 controller snapshot。

## 文件与依赖

- EditorCore 新增 default export、default preview 和 dialog 模块，扩展 controller/data/UI public contract 与回归测试。
- Editordemo 改用 dialog facade，并同步 README 和布局说明。
- `packages/editorcore/package.json` 增加与 workspace 一致的 `pixi.js` 直接依赖；`pnpm-lock.yaml` 只更新 EditorCore importer。
- 没有修改四个正式 Editor、owner schema/runtime、EditorResource、RenderCore、VNICore、规则文件或 production assets。

## 自动验收

定向验收全部通过：

- `pnpm --filter @slotclientengine/editorcore typecheck`：通过。
- `pnpm --filter @slotclientengine/editorcore lint`：通过。
- `pnpm --filter @slotclientengine/editorcore test`：4 files / 23 tests 通过；statements 74.28%、branches 65.03%、functions 79.38%、lines 76.46%。
- `pnpm --filter @slotclientengine/editorcore build`：通过。
- `pnpm --filter @slotclientengine/editorcore format:check`：通过。
- `pnpm --filter editordemo typecheck`：通过。
- `pnpm --filter editordemo lint`：通过。
- `pnpm --filter editordemo test`：1 file / 4 tests 通过。
- `pnpm --filter editordemo build`：通过；Vite 对约 1,020 kB 的全 adapter/preview demo chunk 给出大于 500 kB 的非阻断 warning。
- `pnpm --filter editordemo format:check`：通过。
- `CI=true pnpm install --frozen-lockfile`：通过，lockfile 与 workspace importer 一致。
- `pnpm build`：40/40 workspace build 通过。
- `git diff --check`：通过。

整仓 L3 其余检查发现未修改包中的既有失败，本任务没有扩大范围修复：

- `pnpm typecheck`：`packages/uiframeworks/tests/test-helpers.ts:36` 的 `GameLogic` 测试对象缺少三个方法。
- `pnpm lint`：`packages/rendercore/src/scene-layout/package-runtime.ts:335` 的 `#catalog` 未使用，以及 `packages/rendercore/tests/reel/render-reel.test.ts:492` 的 `vi` 未定义。
- `pnpm test`：RenderCore 15 个既有失败（configured-round fixture 的 Scene Layout manifest 为空、manifest upgrade 期望 v3/实际 v4、Symbols package 期望 v2/实际 v3）；935 tests 通过。
- `pnpm format:check`：AudioCore 未忽略的 `coverage/` 与 `dist/` 中 34 个生成文件不符合 Prettier；EditorCore 和 Editordemo 均通过自己的 format check。

## 计划偏差与待验收

- 计划预期 VNI 在存在 runtime profile 时优先物化单 profile bundle。最终统一导出完整 single-project ZIP：当前 normalized catalog 持有的是已选 runtime closure，统一格式能被现有 viewer/default importer 严格打开，也避免在导出阶段伪造 profile 或重写业务路径；仍满足“完整可播放 ZIP”。
- 新测试合并进现有 `adapters-and-ui.test.ts`，未另建计划中的独立测试文件；测试职责和覆盖矩阵不变。
- 未执行独立代理验收；本次没有用户授权创建子代理，结论来自定向测试、整仓命令与补丁检查。
- 浏览器验收留给用户：重点检查 dialog 焦点/Escape/反复开关、桌面和窄屏 splitter、真实 Spine/VNI/ImgNumber 播放与快速切换 cleanup、各格式导出后由 owner 打开、程序标记互斥和 leaf 无命令。
