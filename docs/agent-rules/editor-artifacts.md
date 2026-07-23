# Editor artifact rules

适用于 `apps/imgnumbereditor`、`popupeditor`、`symbolseditor`、`gamelayouteditor`、`packages/editorresource`、`packages/browserartifactio` 以及 consumer 的 dependency vendoring。

## 统一 filename-key workspace

- 四个纯前端编辑器统一使用 `packages/editorresource` 的扁平、大小写敏感 filename-key 工作区。
- 单一导入入口可混选普通文件和 ZIP；默认同名覆盖，但 review 必须明确列出冲突。
- workspace 只维护一份全局资源表；app 不实现第二套导入、覆盖或 hash 算法。
- 导出顶层 `assets.map.json` 将 filename key 映射到完整 SHA-256 content-addressed payload。
- manifest 只保留 owner-owned 结构语义和 filename-key 引用；不恢复目录上传、logical resource、按类型拆分 importer 或 `dependencies/` 资源目录。

## Import boundary

- legacy path 只允许在导入边界迁移，不进入新 draft 或重新导出。
- 导入时移除 Finder `__MACOSX/**`、`._*`、`.DS_Store` 和恰好一层包裹真实 root manifest 的外目录。
- 清理后仍严格验证真实 package path、map、hash、缺失文件和 orphan payload；元数据和包裹目录不得进入 workspace。
- ZIP/path/Object URL 的 bounded 安全和 source index 属于 `packages/browserartifactio`，editor app 不复制。

## Content addressing

- 上传统一使用 browserartifactio 的 kebab-case logical id、bounded source index、Web Crypto 完整 SHA-256 和 flat allocator。
- owner payload 路径固定为 `assets/<64-char-sha256>.<canonical-ext>`。
- manifest、Spine atlas 和 VNI refs 必须结构化同步改写。
- exact content path 可以复用，但 logical identity 不合并。
- nested dependency 自包含；consumer 只 vendor 精确闭包，不重新 hash。

## Spine import

- atlas page 是结构化 logical page name，texture map value 才是 filename key。
- legacy page suffix 与图片真实编码不一致时，导入边界保留 page logical name，按 bytes 规范化物理 key 并显式映射。
- Spine background art size 必须由用户或 manifest 明确提供，不从 skeleton bounds 或 atlas page 推导。

## Popup Editor

- `apps/popupeditor` 只输出 strict `award-celebration` popup package；普通 popup 不在当前范围。
- VNI export bundle 只把 `purpose=runtime` 作为运行候选：唯一 runtime 自动选择，多个 runtime 才枚举；禁止手输 profile id，`purpose=editing` 不进入候选。
- popup package 使用完整 SHA-256 content-addressed owned payload，并保持 exact closure。
- `packages/rendercore/popup` 拥有 popup manifest/parser、image/VNI/official Spine/image-string layer、BigInt threshold sequence、金额格式、点击/dismiss/end drain 和 runtime snapshot；editor/game app 不复制。

## Symbols Editor

- `apps/symbolseditor` 只拥有 browser editing/IO/UI、typed draft transaction、dependency library、资源引用图、per-symbol state assignment、value/cascade 表单和固定 all-symbol single-state preview。
- app 不执行 sequence/cascade timeline，也不生成 spinBlur/disabled 或其它 state texture。
- symbol manifest/package parser、arbitrary exact path、sparse state texture、explicit empty animation、Spine/VNI introspection、display-set 交叉验证和 runtime player 属于 rendercore。
- `empty` 是用户显式选择的 manifest resource kind，不是缺资源 fallback。
- symbols ZIP 包含唯一公开 game config、package `cellSize` 与 exact resource closure；缺失、orphan、版本错配显式失败，不允许 glob 或 filename guess。
- value presentation 先配置 Spine tier resource，再为所有 tier 统一选择 state animation；静态 reel state 独立绑定图片。

## ImgNumber Editor

- `apps/imgnumbereditor` 只拥有 draft/UI、静态/计数模板、filename-key package IO。
- editor 只编辑一个共享 dependency、共同 slot、center alignment 和 transform；导出时按稳定 runtime schema 物化为内容一致的 per-tier binding。
- 不恢复每 tier 重复编辑同一 animation 或 ImgNumber node。
- glyph layout、dynamic visualBounds anchor、Pixi sprite 和 `setText()` 生命周期属于 rendercore image-string。

## Layout Editor dependency

- gamelayouteditor 把 symbols ZIP 和 popup ZIP 当自包含 dependency；每个 active variant 只配置明确 binding 和相对 viewport center 的 popup root `x/y/scale`。
- popup 内部坐标、tier、layer 和资源只回 popupeditor 编辑。
- dependency Map 只拥有 validated files；被 mode 引用的 package 随 layout ZIP 精确 vendor 一次，未引用 dependency 排除。
- 上传资源不会自动绑定 glyph/state/node/background/placement；所有 binding 都要求用户显式选择。
- 真实 award ImgNumber 未提供时，game002/game003 保留当前 production win-amount 路径，不用字体、CN digits 或 fixture glyph 冒充迁移完成。
