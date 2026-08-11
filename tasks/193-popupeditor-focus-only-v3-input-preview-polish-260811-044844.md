# 193 Popup Editor 重点区域适配与交互修复执行报告

## 结果

任务于 `2026-08-11T04:48:44Z` 完成代码与自动化验收。按用户约定，真实浏览器验收留给用户执行。

- 新增 strict Popup manifest v3：删除 authored `designViewport`，以四个正有限 focus extent 表达重点区域；v3 出现旧字段、legacy Spine prompt 或未知字段时显式失败。
- 新增无界 focus viewport 几何算法。v3 将重点区域完整 contain 到宿主页面，并按页面比例在另一轴显示 focus 外的额外 authored space，不再受有限 art bounds 钳制；v1/v2 presentation 保持原行为。
- Popup Editor 新建 award/Spine 项目统一为 canonical v3；项目页删除 viewport 配置和手动升级入口。
- v1/v2/v3 ZIP 均先按来源版本完成 strict parse、资源闭包与可选 prepare，再原子生成 v3 draft。v1 由旧 viewport 半边生成 focus，v2/v3 保留 focus；legacy prompt 转为字体文字层，缺失 alpha 规范化为 `1`。
- 首页“创建项目”和“导入项目”使用共同 action 尺寸样式；preview-only 背景按红、蓝、黄、绿、红持续平滑循环，且不进入 manifest、ZIP 或 runtime。
- Popup input binding 新增 keyboard eligibility callback。Popup Preview 对 input、textarea、select、button 和 contenteditable 的键盘事件放行，不再 advance/dismiss 或阻止默认输入；canvas pointer 与非表单键盘行为保持不变。
- Game Frameworks 同步公开 v3 类型；Game Layout Editor 与 package CLI 增加 v3 导入、保留和资源引用改写保护。
- Popup、rendercore README、manifest 文档和相关领域规则已同步 v3 合同。

## 主要文件

- `packages/rendercore/src/viewport/unbounded-focused-viewport.ts`：无界 authored plane 的 focus-only 投影算法。
- `packages/rendercore/src/popup/{types,manifest,presentation,input-binding}.ts`：v3 类型、strict parser、presentation 与键盘过滤合同。
- `apps/popupeditor/src/model/project.ts`、`src/io/popup-zip.ts`：canonical v3 create/export 与旧 ZIP 自动迁移。
- `apps/popupeditor/src/preview/popup-preview.ts`：表单键盘事件 eligibility 判断。
- `apps/popupeditor/src/ui/app-shell.ts`、`src/styles.css`：删除 viewport/升级 UI、统一入口尺寸与动态预览背景。
- `apps/gamelayouteditor/tests/popup-package.test.ts`、`apps/gamelayoutpkgcli/tests/reference-rewriter.test.ts`：直接 consumer 的 v3 parity 保护。
- `docs/popup-manifest.md`、相关 README 与领域规则：v3、迁移和输入边界说明。

## 验收证据

通过：

```text
@slotclientengine/rendercore targeted
  6 files / 114 tests passed
popupeditor targeted
  3 files / 22 tests passed
gamelayouteditor v3 Popup package
  1 passed / 4 skipped
gamelayoutpkgcli targeted
  2 files / 9 tests passed

@slotclientengine/rendercore typecheck
popupeditor typecheck
@slotclientengine/gameframeworks typecheck
gamelayouteditor typecheck
gamelayoutpkgcli typecheck

@slotclientengine/rendercore lint
popupeditor lint
popupeditor build
Prettier changed-files check
git diff --check
```

Game Layout Editor 的 Popup package/ZIP 组合定向测试仍有一项既有 multi-page Spine fixture 失败：fixture 请求不存在的 `start` animation。任务 191 已记录同一失败；本任务新增的 v3 用例在补齐 Assets mock 后独立通过，失败未进入 v3 parse、迁移或资源改写路径。

Popup Editor production build 通过，仅报告既有的主 chunk 大于 500 kB warning。

执行前使用仓库要求的 Node 24 环境完成 `pnpm install --frozen-lockfile`；未新增依赖，`pnpm-lock.yaml` 未变化。

## 浏览器待验

由用户执行以下真实浏览器验收：

- 新建 award/Spine 项目均为 v3，项目页不再出现 authored viewport 配置；导入 v1/v2 ZIP 后可直接预览并导出 v3。
- 横屏、竖屏和自定义预览分辨率下重点区域始终完整可见，focus 外内容可随页面比例自然延伸，guides 与内容矩阵一致。
- 首页两个入口的可视高度、内边距、文字对齐、hover/focus 状态一致。
- 预览背景持续按红 -> 蓝 -> 黄 -> 绿 -> 红平滑循环，透明 canvas 与半透明 backdrop 显示正确。
- Popup 播放期间连续编辑文字、数字、select 与 contenteditable：按键正常输入且不触发 advance/dismiss；非表单区域键盘与 canvas pointer 仍可推进 Popup。

未修改 `assets/**`、workspace 依赖或 lockfile。除上述真实浏览器验收外无未完成实现项。
