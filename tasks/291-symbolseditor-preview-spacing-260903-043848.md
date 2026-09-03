# 291 symbolseditor-preview-spacing 执行报告

UTC：`2026-09-03T04:38:48Z`

## 结果

任务 291 已完成实现与 L1 自动化验收。Symbols Editor 预览 toolbar 新增“偏移（px）”配置，默认 `0`，只接受
非负安全整数。偏移同时增加横纵相邻 cell 的 local-space 间隔，随后继续由 gallery zoom 统一缩放；设置 `200`、
缩放 `50%` 时新增可见间隔为 `100px`。

偏移只保存在 `SymbolEditorPreview` 实例中。它不经过 store transaction，不重建 package resource/player，也不进入
project、preview snapshot、manifest、assets map 或导出 ZIP。自动测试已比较修改偏移前后的实际导出 ZIP 字节，结果一致。

## 修改文件

- `apps/symbolseditor/src/preview/symbol-preview.ts`
  - 新增 session-only `cellOffset` getter/setter与严格校验。
  - 统一计算 columns/rows、横纵 stride、exact content bounds 和 cell center position。
  - `setResource`、offset relayout、resize 和 fit 共用同一布局结果；手动 offset 调整保留当前 zoom。
- `apps/symbolseditor/src/ui/workspace-app.ts`
  - 在 zoom 旁增加偏移 number input。
  - 合法值直接调用 preview；非法值恢复最后合法值并在现有 error region 显式提示，不触发 store。
- `apps/symbolseditor/tests/preview-layout.test.ts`
  - 覆盖 offset `0` parity、非正方形 cell、横纵位置、exact bounds、`200 × 50% = 100`、空/单 cell 和非法值。
- `apps/symbolseditor/tests/app-shell.test.ts`
  - 覆盖 toolbar 默认值/接线、非法输入、无 resource rebuild，以及偏移前后导出 ZIP 字节一致。
- `apps/symbolseditor/README.md`
  - 记录 offset、zoom 和不持久化/不导出的边界。
- `tasks/291-symbolseditor-preview-spacing.md`
  - 任务计划。

## 计划偏差

- 未修改 `apps/symbolseditor/src/styles.css`：现有 `.preview-toolbar input[type="number"]` 已提供所需宽度，toolbar 也已有
  横向滚动；无需为本任务增加重复样式。
- 首次定向测试因新安装 workspace 尚无依赖包 dist 而在 import resolution 阶段失败，未进入测试用例。运行 app 自带
  `prepare:deps` 后原命令通过；这不是代码回归。
- 用户明确表示浏览器验收自行处理，因此本报告不把自动化或 build 当作人工视觉验收。

## 自动化验收

```text
pnpm --filter symbolseditor exec vitest run tests/preview-layout.test.ts tests/app-shell.test.ts
通过：2 files，37 tests。

pnpm --filter symbolseditor typecheck
通过。

pnpm --filter symbolseditor build
通过：Vite production build 完成；仅保留既有 >500 kB chunk warning。

pnpm exec prettier --check apps/symbolseditor/src/preview/symbol-preview.ts apps/symbolseditor/src/ui/workspace-app.ts apps/symbolseditor/src/styles.css apps/symbolseditor/tests/preview-layout.test.ts apps/symbolseditor/tests/app-shell.test.ts apps/symbolseditor/README.md tasks/291-symbolseditor-preview-spacing.md tasks/291-symbolseditor-preview-spacing-260903-043848.md
通过。

git diff --check
通过。
```

依赖环境使用 Node `v24.14.0`、pnpm `10.0.0`。执行 `CI=true pnpm install --frozen-lockfile` 补齐本地依赖，lockfile
未修改。

## 待人工浏览器验收

由用户执行计划第 8 节人工验收，重点检查：

1. 使用真实超出 `cellSize` 的图标确认横纵遮挡随 offset 增大而消失，图标 scale、guide 和动画不变。
2. offset `200` + zoom `50%` 的可见新增间隔为 `100px`；调整 offset 不改变手动 zoom，“适配全部”可容纳新网格。
3. 新建/打开项目、state/Replay、resize和 preview重试不丢失当前页面会话 offset；导出 ZIP不含 offset。
4. 空值、负数和非数字恢复最后合法值并显示错误，窄窗口 toolbar仍可横向滚动操作。

## 剩余风险

- offset 不测量实际美术 visual bounds；不同图标的溢出量不同，需用户选择足够间隔。
- 浏览器中的真实 Pixi画面、toolbar窄屏交互和人工像素测量尚未由本次执行验证。
