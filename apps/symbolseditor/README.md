# Symbols Editor

“上传资源 / 上传文件夹”接受图片、完整 Spine/VNI closure 和已知 ZIP；standalone
ImgNumber ZIP 也可由“上传资源”自动识别。上传只进入资源库，Picker 仍显式绑定。
导出时 owned image、Spine skeleton/atlas/pages、VNI project/assets 自叶子向根
结构化改写为完整 SHA-256 hash-flat path；nested dependency 保持自包含。

纯前端、resource-library-first 的 symbols package v1 编辑器。它把公开 `gameconfig.json` 或已有 symbols ZIP 转为 typed draft；资源先进入项目资源库，再由每个 symbol/state 的 typed Picker 显式绑定，不从 symbol code 或文件名猜路径。

## 固定工作流

1. 上传公开 game config，或导入已有 ZIP。
2. 新项目默认进入“资源”工作区；上传文件组或目录，搜索并按类型、引用状态、批次筛选和管理资源。
3. 进入“Symbols”，在紧凑 symbol rail 选择 display set 和当前 symbol；Inspector 分为“基础 / 状态 / Value / Cascade”。
4. 在“状态”中一次只编辑一个 state。新增 state 后会自动进入该 state、同步右侧预览并明确显示初始 explicit empty。
5. 点击资源字段的“选择/更换”打开 Picker；Picker 只显示当前字段兼容且解析状态明确的资源，确认后才执行一次原子绑定。
6. 在单 symbol 的 Value/Cascade Inspector 编辑结构化配置；在“项目配置”管理 package id、cellSize 和项目 state definitions。
7. 右侧固定按 numeric code 显示全部 display symbols 的一个 state，并支持 Replay、fit 和 `25%..400%` zoom。
8. 严格校验并导出 deterministic ZIP。

新项目默认 `160 × 160`，每个 symbol 只有 explicit empty `normal`、`scale: 1` 和 `renderPriority: 0`。不会创建 `WL.png`、`WL.spinBlur.png`、`WL.disabled.png` 等假定路径，也不会生成、模糊、灰度化或复制 state texture。完全没有美术资源的项目可以合法导出，package `resources` 为 `[]`。

普通批量上传遇到同 canonical path 时整个批次失败；只有资源列表的“替换”操作能保留 path 更新 bytes。上传后不会自动绑定普通图片或动画，即使 Picker 内只上传了一个文件也仍需明确确认。仍被引用的资源或 state 不能删除。unused 资源可留在 draft，但不会进入 ZIP。Spine skeleton/atlas、VNI project 和 Value tier skeleton/atlas 都通过 typed Picker 选择；Spine texture 由 atlas page 相对 atlas 路径精确解析，不提供独立 Picker。项目只有一个依赖完整的 atlas 时，创建 Spine 配置或选择 skeleton 会自动采用它。Spine animation 和 slot 继续来自严格 metadata 交集，没有自由资源路径或 animation-name 输入框。

VNI 与 Spine 都是中性的动画资源，`loop/once` 由 state lifecycle 编排。normal 和 stable/loop state 导出循环 playback，once state 导出单次 playback；编辑器允许在 normal、once 和 stable/loop state 中选择 VNI，并由 rendercore 对 manifest lifecycle 一致性做严格校验。

主工作区、Inspector Tab、selected symbol/state、资源筛选、展开项、Picker 查询和成功提示都是 UI session state，不进入 typed project、symbol manifest、package manifest 或 ZIP。导入已有 ZIP 默认进入 Symbols；普通 transaction 和异步 preview 更新不会强制切换工作区或重置手动 zoom。

预览只显示当前选定的一个 state：未配置、explicit empty 和资源错误分别显示占位。它不执行 sequence、hold、next、spin、cascade timeline、remove/drop/refill 或 Nearwin 编排。

## Image-string dependency 与节点

“导入 Imgnumber ZIP”只接受 standalone image-string v1 ZIP，并按 dependency id vendoring 到 `dependencies/image-strings/<id>/`；同 id 同内容去重，不同内容必须走显式替换。仍被普通节点或 `SYMBOL.valuePresentation.text.tiers[index]` 引用的 dependency 不能删除，错误会列出精确位置。重新导入 symbols package 时会从 vendored 闭包重建 logical dependency，避免把内部 JSON/PNG 暴露成普通素材。

Image string Inspector 为普通 Spine state 配置稳定有序的命名节点。Value Inspector 的 Number presentation 则提供 `Font | 完整数值图片 | ImgNumber（按 tier）` 三种互斥模式，并与 Spine tiers 分区显示；ImgNumber 每档只列已导入 dependency 和该档 skeleton 的真实 slot，不显示第二份阈值。增加 tier 会增加未配置 binding，删除/移动 tier 会在同一 transaction 中删除/移动对应 binding；切换模式会整体替换 text 分支，隐藏字段不会残留。未选择 dependency/slot 的中间状态会显示 diagnostics 并阻止导出。preview value 只写 UI session，由 rendercore 同时解析 Spine tier 与 ImgNumber。

```bash
pnpm --filter symbolseditor dev
pnpm --filter symbolseditor format:check
pnpm --filter symbolseditor lint
pnpm --filter symbolseditor typecheck
pnpm --filter symbolseditor test
pnpm --filter symbolseditor build
```
