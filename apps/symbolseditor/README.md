# Symbols Editor

纯前端、resource-library-first 的 symbols package v1 编辑器。它把公开 `gameconfig.json` 或已有 symbols ZIP 转为 typed draft；资源先进入项目资源库，再由每个 symbol/state 的受限下拉显式绑定，不从 symbol code 或文件名猜路径。

## 固定工作流

1. 上传公开 game config，或导入已有 ZIP。
2. 选择 display set；支持全选、全不选和反选。
3. 一次上传一个文件组，或用目录入口保留 VNI 子目录相对路径。
4. 在资源库检查 canonical path、类型、大小、批次、解析状态、引用和依赖。
5. 为单个 symbol 添加、排序或删除 visible state，并选择 `empty/image/layered image/Spine/VNI/static/builtin/activeSpine`。
6. 结构化编辑 custom state definition、value presentation 和 cascade presentation。
7. 右侧固定按 numeric code 显示全部 display symbols 的一个 state，并支持 Replay、fit 和 `25%..400%` zoom。
8. 严格校验并导出 deterministic ZIP。

新项目默认 `160 × 160`，每个 symbol 只有 explicit empty `normal`、`scale: 1` 和 `renderPriority: 0`。不会创建 `WL.png`、`WL.spinBlur.png`、`WL.disabled.png` 等假定路径，也不会生成、模糊、灰度化或复制 state texture。完全没有美术资源的项目可以合法导出，package `resources` 为 `[]`。

普通批量上传遇到同 canonical path 时整个批次失败；只有资源列表的“替换”操作能保留 path 更新 bytes。仍被引用的资源或 state 不能删除。unused 资源可留在 draft，但不会进入 ZIP。Spine skeleton/atlas/texture/animation/slot 和 VNI project 都来自严格解析后的下拉选项，没有自由资源路径或 animation-name 输入框。

预览只显示当前选定的一个 state：未配置、explicit empty 和资源错误分别显示占位。它不执行 sequence、hold、next、spin、cascade timeline、remove/drop/refill 或 Nearwin 编排。

```bash
pnpm --filter symbolseditor dev
pnpm --filter symbolseditor format:check
pnpm --filter symbolseditor lint
pnpm --filter symbolseditor typecheck
pnpm --filter symbolseditor test
pnpm --filter symbolseditor build
```
