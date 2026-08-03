# Editor artifact rules

适用于 `apps/imgnumbereditor`、`popupeditor`、`symbolseditor`、`gamelayouteditor`、`packages/editorresource`、`packages/browserartifactio` 以及 consumer 的 dependency vendoring。

## 统一 filename-key workspace

- 四个纯前端编辑器统一使用 `packages/editorresource` 的扁平、大小写敏感 filename-key 工作区。
- 单一导入入口可混选普通文件和 ZIP；同名覆盖必须在 review 明确列出冲突。consumer 可要求用户显式选择覆盖或 keep-both；只有显式 keep-both 才由 shared allocator 分配扩展名前的稳定 suffix，禁止错误时静默改名。
- workspace 只维护一份全局资源表；app 不实现第二套导入、覆盖或 hash 算法。
- 导出顶层 `assets.map.json` 将 filename key 映射到完整 SHA-256 content-addressed payload。
- manifest 只保留 owner-owned 结构语义和 filename-key 引用；不恢复目录上传、logical resource、按类型拆分 importer 或 `dependencies/` 资源目录。
- 编辑器的强制导出必须建模为 manifest 内稳定程序键到 typed root 的显式 binding；不得用 orphan allowlist、UI session 状态或 raw payload 路径替代。取消 binding 后，无其它 owner 引用的资源恢复为不导出。
- node/package/mode 等业务 identity 和资源列表标签不得从 `assets/<SHA-256>.*` physical payload path 重建；ZIP 往返后继续使用 manifest identity 与 logical filename key。

## Import boundary

- Game Layout Editor 的 loose-file 上传必须在解析前整批校验 ASCII filename 并统一小写；中文、空格、非法字符或小写化 collision 使整批原子失败。完整 mapped Editor ZIP 在 map/hash/size 验证后迁移 logical filename key：NFKC、ASCII 合法字符小写、ASCII 非法字符转连字符、非 ASCII 转稳定 Unicode code-point token，collision 按稳定顺序加扩展名前 suffix；只结构化改写已知 manifest path 引用，不修改业务 identity 或 atlas page logical name。
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
- production package 图片后处理只允许通过 owner schema 改写 layout、image-string、Symbols、Popup 和 VNI typed reference；Spine atlas page logical name、VNI `originalName` 和业务 identity 必须保持不变。
- 后处理改变 bytes 或 filename key 后必须重新计算完整 SHA-256、byte length、media type 和 physical path，并严格复验 map hash/size/path/orphan；相同 bytes 可以共享 physical payload，但不得合并 logical key。

## Spine import

- atlas page 是结构化 logical page name，texture map value 才是 filename key。
- legacy page suffix 与图片真实编码不一致时，导入边界保留 page logical name，按 bytes 规范化物理 key 并显式映射。
- 同一批多个 skeleton JSON 可以共享一个 atlas 与同一组贴图，但每个 JSON 必须形成独立 root；依赖方向只允许 root JSON 指向共享 atlas/贴图，不得让 leaf 反向拥有或合并 sibling root。
- 多 JSON Spine 上传必须先对全部 skeleton、atlas page 和 texture map 完成 prepare，再一次性 commit；任一成员失败时整批不修改 workspace。
- Spine background art size 必须由用户或 manifest 明确提供，不从 skeleton bounds 或 atlas page 推导。

## Popup Editor

- `apps/popupeditor` 只输出 strict `award-celebration` popup package；普通 popup 不在当前范围。
- VNI export bundle 只把 `purpose=runtime` 作为运行候选：唯一 runtime 自动选择，多个 runtime 才枚举；禁止手输 profile id，`purpose=editing` 不进入候选。
- popup package 使用完整 SHA-256 content-addressed owned payload，并保持 exact closure。
- `packages/rendercore/popup` 拥有 popup manifest/parser、image/VNI/official Spine/image-string layer、BigInt threshold sequence、金额格式、点击/dismiss/end drain 和 runtime snapshot；editor/game app 不复制。

## Symbols Editor

- `apps/symbolseditor` 只拥有 browser editing/IO/UI、typed draft transaction、dependency library、资源引用图、per-symbol state assignment、value/cascade 表单和固定 all-symbol single-state preview。
- Symbols 资源覆盖保持 owner-owned 配置和 filename-key 引用；被覆盖的有效 Spine skeleton 缺少已选 exact animation 时，只清空受影响的 animation selection（tiered shared animation 按全部 tier 一起清空）并显式报告，其它 candidate bytes 不能满足现有 typed binding 时整批回滚。完整 Symbols project ZIP 只能单独打开，不作为普通资源合并；project 与 preview failure 必须分层显式呈现。
- Symbols composite state 必须显式声明 normal/stateTexture base 与非空有序 layer；layer id 唯一且为 lowercase kebab-case，placement 只能是 underlay/overlay，leaf 只能是 Spine/VNI。Editor 的绑定、覆盖清理、引用图和导出必须定位 exact layer，不允许 filename guess、隐式 reorder 或降级为单层。
- app 不执行 sequence/cascade timeline。只有 explicit direct normal image 可由
  Symbols Editor 在浏览器本地调用 rendercore versioned preset，逐 symbol、逐 state
  生成并显式绑定 `spinBlur` 或 `disabled`；不抓动画帧、不合成 layered/tiered normal、
  不批量生成，也不复制像素算法。生成与目标 state“上传并使用”必须进入统一
  filename-key review/transaction，按该 state 最后一次成功提交生效。
- symbol manifest/package parser、arbitrary exact path、sparse state texture、explicit empty animation、Spine/VNI introspection、display-set 交叉验证和 runtime player 属于 rendercore。
- `empty` 是用户显式选择的 manifest resource kind，不是缺资源 fallback。
- symbols ZIP 包含唯一公开 game config、package `cellSize` 与 exact resource closure；缺失、orphan、版本错配显式失败，不允许 glob 或 filename guess。
- value presentation 先配置 Spine tier resource，再为所有 tier 统一选择 state animation；静态 reel state 独立绑定图片。
- symbol-owned ImgNumber node 使用非空、无重复的 exact `{state, slot}` target 集；
  dependency/state rename 或删除必须事务性重写并全量复验，失败回滚。UI 必须能查看、
  增删、修改 targets，导出统一写 canonical `targets`，旧单 `target` 仅导入兼容。

## ImgNumber Editor

- `apps/imgnumbereditor` 只拥有 draft/UI、静态/计数模板、filename-key package IO。
- editor 只编辑一个共享 dependency、共同 slot、center alignment 和 transform；导出时按稳定 runtime schema 物化为内容一致的 per-tier binding。
- 不恢复每 tier 重复编辑同一 animation 或 ImgNumber node。
- glyph layout、dynamic visualBounds anchor、Pixi sprite 和 `setText()` 生命周期属于 rendercore image-string。

## Layout Editor dependency

- gamelayouteditor 把 symbols ZIP 和 popup ZIP 当自包含 dependency；每个 active variant 只配置明确 binding 和相对 viewport center 的 popup root `x/y/scale`。
- Symbols dependency 的导入、预览、替换和 layout ZIP 重导必须保留其完整
  state/ImgNumber multi-target closure；headless authoring 可以显式跳过 texture load，
  但不能跳过 manifest、hash、binding 或 closure 校验。
- popup 内部坐标、tier、layer 和资源只回 popupeditor 编辑。
- dependency Map 只拥有 validated files；被 mode 引用的 package 随 layout ZIP 精确 vendor 一次，未引用 dependency 排除。
- 上传资源不会自动绑定 glyph/state/node/background/placement；所有 binding 都要求用户显式选择。目标
  state 的“上传并使用”本身视为一次显式绑定动作，必须在统一 review 成功后使用 resolved key 绑定。
- 真实 award ImgNumber 未提供时，game002/game003 保留当前 production win-amount 路径，不用字体、CN digits 或 fixture glyph 冒充迁移完成。
