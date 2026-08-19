# Editor artifact rules

适用于 `apps/imgnumbereditor`、`popupeditor`、`symbolseditor`、`gamelayouteditor`、`apps/editordemo`、`packages/editorcore`、`packages/editorresource`、`packages/browserartifactio` 以及 consumer 的 dependency vendoring。

## 统一 filename-key workspace

- 四个纯前端编辑器统一使用 `packages/editorresource` 的扁平、大小写敏感 filename-key 工作区。
- 单一导入入口可混选普通文件和 ZIP；同名覆盖必须在 review 明确列出冲突。consumer 可要求用户显式选择覆盖或 keep-both；只有显式 keep-both 才由 shared allocator 分配扩展名前的稳定 suffix，禁止错误时静默改名。
- workspace 只维护一份全局资源表；app 不实现第二套导入、覆盖或 hash 算法。
- 导出顶层 `assets.map.json` 将 filename key 映射到完整 SHA-256 content-addressed payload。
- manifest 只保留 owner-owned 结构语义和 filename-key 引用；不恢复目录上传、logical resource、按类型拆分 importer 或 `dependencies/` 资源目录。
- 编辑器的强制导出必须建模为 manifest 内稳定程序键到 typed root 的显式 binding；不得用 orphan allowlist、UI session 状态或 raw payload 路径替代。取消 binding 后，无其它 owner 引用的资源恢复为不导出。
- node/package/mode 等业务 identity 和资源列表标签不得从 `assets/<SHA-256>.*` physical payload path 重建；ZIP 往返后继续使用 manifest identity 与 logical filename key。

## Shared typed Assets catalog

- `packages/editorcore` 在 `editorresource` 的扁平 filename-key workspace 之上拥有共享 typed asset graph、root tree projection、使用状态、程序 binding 事务、格式 adapter 与 UI；不得反向复制 key/hash/map/ZIP 安全算法。
- 顶层 root kind 固定为 image、audio、video、spine、vni、image-string、popup、symbols、game-layout、text、binary。权威数据是唯一 node 与有向 typed relation 的 graph；最外层 UI 只列 root，树 occurrence 只是展开共享 leaf 的视图，不是持久 identity 或虚拟目录。
- 尚无 loader 的文件按严格 UTF-8/control-character 检测保存为 opaque text 或 binary；新增 owner loader 后应在 generic fallback 前显式 claim。已知格式的坏签名/schema、坏 hash、缺失引用和 package physical orphan 仍显式失败，不得降级为 opaque 文件。
- Spine atlas/page、VNI image、ImgNumber glyph 和 Popup/Symbols/Game Layout package leaf 只能由 owner root 传递使用，不能独立进入 Picker、程序 binding、改名或删除。复用 leaf 必须另行导入顶层 root，最终只在 physical payload 层按完整 SHA-256 去重。
- `used`、`programmatic` 和 leaf transitive usage 必须从宿主 typed reference/program binding 与 graph 实时派生，不保存可漂移的布尔副本。root 命令和导入必须在 candidate project/catalog/workspace 全部验证后原子提交。
- 正式 Editor 迁移只能消费已由 `apps/editordemo` 和自动测试证明的 EditorCore public contract；迁移前不得删除 owner 现有正式 schema/parser/runtime，也不得在 EditorCore 猜测 owner manifest 语义。

## Import boundary

- Game Layout Editor 的 loose-file 上传必须在解析前整批校验 ASCII filename 并统一小写；中文、空格、非法字符或小写化 collision 使整批原子失败。完整 mapped Editor ZIP 在 map/hash/size 验证后迁移 Layout-owned logical filename key：NFKC、ASCII 合法字符小写、ASCII 非法字符转连字符、非 ASCII 转稳定 Unicode code-point token，collision 按稳定顺序加扩展名前 suffix；只结构化改写已知 manifest path 引用，不修改业务 identity 或 atlas page logical name。SymbolsEditor 已验证合法的 owner-owned filename key 在 Game Layout Editor 导入、替换、导出和重导时保持 exact case；与全局其它 owner 形成大小写 alias 时显式失败。
- legacy path 只允许在导入边界迁移，不进入新 draft 或重新导出。
- 导入时移除 Finder `__MACOSX/**`、`._*`、`.DS_Store` 和恰好一层包裹真实 root manifest 的外目录。
- 清理后仍严格验证真实 package path、map、hash、缺失文件和 orphan payload；元数据和包裹目录不得进入 workspace。
- ZIP/path/Object URL 的 bounded 安全和 source index 属于 `packages/browserartifactio`，editor app 不复制。

## Content addressing

- logical filename key 与 physical `assets/<sha256>.<ext>` path 是两个独立合同：前者是 owner manifest 的大小写敏感资源身份，后者只按 bytes 内容寻址。consumer editor 不得从 physical path 反推、规范化或改写另一个 editor 已验证合法的 logical key。
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

- `apps/popupeditor` 输出 strict `award-celebration`、普通 `spine` 或 `single-state` popup package；三种类型使用互斥 schema，不保留无关字段。
- Popup Editor 启动时没有隐式项目；项目只能通过“创建项目”dialog（名称与固定类型）或单独导入 Popup ZIP 建立。项目 ZIP 与资源导入是两个入口，资源入口中 VNI/ImgNumber 只接受各自 Editor 导出的 ZIP，Spine 必须以完整 JSON/atlas/texture 组导入。同名不同 bytes 必须由用户逐项选择覆盖或自动 suffix 保留两份，不能默认提交。
- Popup v8 沿用 v7 的 focus、backdrop、audio 与 strict attachment，并新增零到多图层的 `single-state`；其 exact layer id 同时是 Editor name、runtime name 与地址 segment，Spine/VNI autoplay 可省略，父节点只能引用同 Popup 已存在图层。Popup Editor 新建项目固定为 v8；合法 v1–v7 ZIP 必须先按原版本 strict 校验与 prepare，再原子迁移为 v8，后续 preview/export 只写 v8。
- Popup Editor 独立预览页拥有唯一的 Pixi Application/canvas，并把 rendercore Popup player 的 Container 挂入其中；rendercore Popup 与游戏/Scene Layout consumer 不得创建 canvas、Renderer、ticker 或 RAF。预览在合法配置变化后自动 rebuild，不提供 Build、advance、dismiss 或 immediate-dismiss UI；普通交互只来自完整 preview canvas 或 keyboard input。
- 新 Popup v6 authoring 不提供独立 Spine prompt；旧 prompt 在 v1/v2 导入迁移时结构化转换为 `name=prompt` 的字体文字 overlay，冲突使整次导入失败。award 各档与 Spine overlay 都可声明多个命名字体文字和 manual ImgNumber；文字省略 resource 时使用系统字体，显式选择时只接受 package-owned WOFF2/WOFF/TTF/OTF，失效引用不降级。award 的状态由档位 presence 表达，Editor 必须提供显式 stable-id 复用操作而不得按资源猜测合并；每个档仍必须恰好有一个 exact id 为 `win-amount` 的金额层。
- Popup v4–v8 的 image、字体文字、ImgNumber、VNI 与 Spine layer 可挂 Popup root 或同作用域 official Spine exact slot；普通 Spine Popup 还可挂主 Spine，ImgNumber 保留 VNI text-layer attachment。Editor 候选必须来自 shared Spine/VNI strict metadata，不猜首项；循环 target、跨作用域引用、缺 slot、同父 order 冲突、覆盖后失效与删除被引用 target 都阻止 transaction，不自动回根。
- VNI export bundle 只把 `purpose=runtime` 作为运行候选：唯一 runtime 自动选择，多个 runtime 才枚举；禁止手输 profile id，`purpose=editing` 不进入候选。
- popup package 使用完整 SHA-256 content-addressed owned payload，并保持 exact closure。
- Popup 字体与其它 payload 一样按完整 SHA-256 物理去重；logical filename key 与 owner 引用不得从 hash path 反推或合并。
- Popup 必须保持 `popup/data → popup/core → popup/editor` 单向分层：data 拥有 v1–v8 strict source parser、唯一默认 latest normalizer与纯引用合同；core 拥有 production resolved-resource prepare、focus/presentation、layer、string registry、金额、input与 award/Spine/single-state 状态机；editor 只组合 mapped standalone package、namespace/materialize 和同 Core snapshot wrapper。任何 editor/game runtime 都必须用默认 loader把受支持版本转为latest。

## Symbols Editor

- 内层 symbol-state-textures manifest 的 canonical authoring 版本为 v3：沿用 v2 state lifecycle，并新增 package-local audio effect/cue。打开合法 v1/v2 时只调用 rendercore 的统一 upgrader；新导出恒写 v3，editor preview/Replay 不按 state 名判断。
- Popup/Symbol effect 配置复用 `audiocore/editor` 的同一字段合同，只保存 local name。Popup 的每个 tier/segment 与每个 Symbol 的每个 state 都在自身编辑区维护零到多条独立 effect；不得用项目级 effect 表单加单一 cue 的两步流程覆盖同状态旧配置。Symbols Editor 视觉上仍播放全部 symbol 的所选 state，但音频试听必须通过 preview-only 单选下拉框只放一个 symbol，且该选择不写 manifest。
- `apps/symbolseditor` 只拥有 browser editing/IO/UI、typed draft transaction、dependency library、资源引用图、per-symbol state assignment、value/cascade 表单和固定 all-symbol single-state preview。普通 symbol 的 shared ImgNumber slot 候选取全部 top-level Spine state skeleton slot 交集，value-managed symbol 取全部 tier skeleton 交集；每个 value-managed symbol 只有一个 preview value，由 threshold 自动命中档位。该值只属于 UI session，不得进入 manifest/ZIP。
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
- 新 symbol-owned ImgNumber node 只在 Normal 配一个 `spineSlot`，全部 top-level Spine state 自动使用同名 slot；非 Spine state 继续用 exact `{state}` target 控制固定顶层 overlay。旧逐 Spine state target 无损兼容。
- 命名 ImgNumber 的 non-Spine `spinBlur` profile 由 Symbols Editor 在浏览器本地调用 rendercore versioned preset生成；同一普通dependency只生成一份派生dependency并跨node复用，glyph/special图片按source key去重。生成、library安装和全部eligible binding必须原子提交；source变化使受影响binding失效。runtime不生成像素。
- 新 value ImgNumber 每 tier 配置 normal JSON resource，并可显式生成/绑定该档 non-Spine `spinBlur` profile；slot/transform/color/special map 只在 Normal 配一次。生成结果按normal dependency复用但只绑定用户操作的tier，runtime在同一稳定container内切profile和slot/overlay attachment；未绑定tier不得回退其它档或normal assets。旧 per-tier完整binding与旧顶层special map可无损导入导出，新旧variant不得混写。
  dependency/state rename 或删除必须事务性重写并全量复验，失败回滚。UI 必须能查看、
  增删、修改 targets，导出统一写 canonical `targets`，旧单 `target` 仅导入兼容。

## ImgNumber Editor

- `apps/imgnumbereditor` 只拥有 draft/UI、静态/计数模板、filename-key package IO。
- editor 只编辑一个共享 dependency、共同 slot、center alignment 和 transform；导出时按稳定 runtime schema 物化为内容一致的 per-tier binding。
- 不恢复每 tier 重复编辑同一 animation 或 ImgNumber node。
- glyph layout、dynamic visualBounds anchor、Pixi sprite 和 `setText()` 生命周期属于 rendercore image-string。
- ImgNumber Editor 与其它 editor 的 standalone ImgNumber package 导入使用 `rendercore/image-string/editor`；纯 schema/reference rewrite 使用 `data`；Popup/Symbol/Scene Layout production preview 继续使用各自 owner runtime，不直接创建第二个 ImgNumber core。editor wrapper 只包装同一个 core，不复制 layout 或 Sprite 生命周期。

## Layout Editor dependency

- Gamelayout Editor只编辑和导出Scene Layout latest v4；打开合法v1–v3时先调用RenderCore共享upgrader生成默认`runtimeAllocation`与空音频合同，再执行Editor node-id migration并原子复验。每次导出都由RenderCore从typed draft重建并strict复验allocation；旧mode id、initial、edge和dependency保持，不自动插入Splash。
- BGM 只由 Game Layout Editor 按 mode 从已导入 audio asset 中可选配置，新绑定固定 loop，并在 production preview 试听；root 程序音效同样从 audio asset 显式命名并进入 programmatic allowlist，不复用通用 runtime-resource 键。effect 在 Popup/Symbol owner 中只使用 local name，组合到 Scene Layout 时才按 binding id 形成 `award.coin` 一类 route。未被 cue 引用但允许程序播放的 route 必须进入显式 programmatic allowlist；未绑定 audio asset 不进入 production ZIP。
- Game Layout Editor必须从shared formatter派生并显示/copy所选authored owner的canonical `gamelayout:/` runtime address；地址不可手输、不可写入manifest或另存alias表。未绑定audio asset没有runtime address，transition Spine event地址必须包含exact from/to edge与configured event。
- 新项目显式创建Splash initial与BaseGame；每个内置或后续新增mode都必须由用户从空下拉框选择单背景或横竖双背景类型，不继承当前mode或首项。Splash primary click只引用显式Splash→BaseGame transition。
- mode的主转轮开关属于v2 draft：新Splash关闭、BaseGame和普通新增mode开启；关闭时保留Editor内可恢复的placement草稿但latest export不写placement，已有Symbols binding必须先显式解除。
- Gamelayout Editor新建/复制/重命名/导出的scene node id只允许lowercase alphanumeric+kebab并禁止`layout|reel|transition|popup`保留名。旧Layout ZIP先按rendercore v1兼容parser读取，再以确定性rename map原子规范化点号/下划线/保留名和collision，结构化改写adaptation background、mode background与nodeStates key，复验后提交并向用户显示完整old→new；不得覆盖或合并node。production parser继续兼容未重导旧包。
- gamelayouteditor 把 symbols ZIP 和 popup ZIP 当可多项并存的自包含 dependency library；standalone 校验后以 manifest id 生成稳定扁平 root/leaf key 并结构化改写 nested reference。同 id 再上传走替换并保留 binding/placement/order，提交后只 GC 无其它 owner 的旧 key；不同 id 不得互相覆盖 bytes。每个 active variant 只配置明确 binding 和相对 viewport center 的 popup root `x/y/scale`；root order 可编辑且必须高于全部 scene node/main reel。
- Popup Spine namespace 只改物理 filename key 和 manifest path value，不得改 atlas page logical name 或 texture map key。后续 filename-key 规范化必须把 Popup `resources` object key、resource root value 和 layer/spine reference 作为一个结构化 identity 原子改写，保持 object key exact 等于 compound root。Popup 导入提交前必须用完整 SHA-256 比较其 namespace 前的 atlas/texture 与 Layout 自有 Spine 同名资产；同名不同 bytes 时列出双方 owner、filename 和 hash，用户可原子取消整次导入或明确继续隔离导入。不得自动覆盖、改名，或推断 skeleton JSON 与新版 atlas/texture 的兼容性。
- gamelayouteditor 的普通 node mode 作用域属于 layout manifest typed contract：缺少 `gameMode` 的旧数据按全局处理，单 mode scope 必须在结构化导入、导出、优化改写和重导中原样保留；不得把它存入 UI session、文件名约定或第二份资源表。scope/variant 隐藏不改变 node 的全局 order 或资源 identity。
- 普通 Spine 与 single-state popup 导入 gamelayouteditor 后只进入 dependency library；single-state 只能显式 programmatic registration，不能作为 mode award celebration 或 transition prelude；普通 Spine 仍可作为 transition `preludePopup` 或显式注册。未引用 Symbols/Popup library item 不导出。
- Symbols dependency 对 gamelayouteditor 是只读 symbol 状态机合同。Layout Editor 可以校验 package id、cell size、display symbols、公开 reel/state capability 和 exact closure，并调用 production preview；不得提供内部图片、Spine/VNI animation、state layer、ImgNumber/value 或 cascade 的编辑控件，也不得重写这些 owner-owned manifest 字段。
- Symbols dependency 的导入、预览、替换和 layout ZIP 重导必须保留其完整
  state/ImgNumber multi-target closure；headless authoring 可以显式跳过 texture load，
  但不能跳过 manifest、hash、binding 或 closure 校验。
- popup 内部坐标、tier、layer 和资源只回 popupeditor 编辑。
- dependency Map 只拥有 validated files；被 mode 引用的 package 随 layout ZIP 精确 vendor 一次，未引用 dependency 排除。
- 上传资源不会自动绑定 glyph/state/node/background/placement；所有 binding 都要求用户显式选择。目标
  state 的“上传并使用”本身视为一次显式绑定动作，必须在统一 review 成功后使用 resolved key 绑定。
- 真实 award ImgNumber 未提供时，game002/game003 保留当前 production win-amount 路径，不用字体、CN digits 或 fixture glyph 冒充迁移完成。

## Symbols Editor wrapper

Symbols Editor 使用 `rendercore/symbol/data` 与 `rendercore/symbol/editor`；mapped package、materialize、authoring introspection、生成和 standalone preview 属于 editor wrapper。其它 editor 只解析/重写 manifest 时使用 data，通过 Scene Layout 托管 production preview 时不得另建 symbol player；只有直接托管 standalone Symbols preview 才使用 editor wrapper。Application、canvas、ticker、ZIP/UI session 始终由 app 拥有。
