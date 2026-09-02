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
- EditorCore 的 Game Layout event group UI 只能消费 committed `game-layout` root，并调用 RenderCore editor inspector 从该 root 的 exact closure 编译候选；具体 family identity、owner、state、坐标和 lifecycle 不得硬编码、从 filename/hash 推断或由 raw address 输入补造。row draft 与 group draft 分层提交，Layout 替换后按 exact address 复验，切换 root 不按相似名称迁移。

## Import boundary

- Game Layout Editor 的 loose-file 上传必须在解析前整批校验 ASCII filename 并统一小写；中文、空格、非法字符或小写化 collision 使整批原子失败。完整 mapped Editor ZIP 按 map 路由提取 typed manifest 实际引用闭包后迁移 Layout-owned logical filename key：NFKC、ASCII 合法字符小写、ASCII 非法字符转连字符、非 ASCII 转稳定 Unicode code-point token，collision 按稳定顺序加扩展名前 suffix；只结构化改写已知 manifest path 引用，不修改业务 identity 或 atlas page logical name。SymbolsEditor 已验证合法的 owner-owned filename key 在 Game Layout Editor 导入、替换、导出和重导时保持 exact case；与全局其它 owner 形成大小写 alias 时显式失败。
- legacy path 只允许在导入边界迁移，不进入新 draft 或重新导出。
- 导入时移除 Finder `__MACOSX/**`、`._*`、`.DS_Store` 和恰好一层包裹真实 root manifest 的外目录。
- owner Editor 重开自身项目与 export/build checker 仍严格验证真实 package path、map、hash、缺失文件和 orphan payload；consumer Editor vendoring 已导出的 Symbols、Popup、Image String 或 Scene Layout 时只按 typed manifest 与 assets map 路由物化实际引用闭包，不比较 hash/byteLength/content-addressed filename，也不因未消费的 map entry 或 ZIP entry 阻断导入。实际引用缺失、路径不安全、schema/parser/decoder 不兼容仍在消费点显式失败；元数据和包裹目录不得进入 workspace。
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

- `apps/popupeditor` 输出 strict `award-celebration`、普通 `spine`、`single-state` popup package，或独立 `popup-object` v1 工件。Popup Object 项目级只持久化 stable lowercase kebab `name`，不拥有 Popup id/type、adaptation、focus、backdrop、audio、tier、amount 或输入；它可组合五类 Popup 图层但不得嵌套对象。
- Popup v9 可把 Popup Object ZIP 作为 typed resource，并在 award、Spine overlay 或 single-state 中以 opaque 原子 layer 实例化。对象内部 name/attachment/order 不与宿主扁平合并，宿主不能穿透挂接内部节点；对象 lifecycle、update 和 destroy 从属宿主 Popup，且不新增 canvas、ticker 或 completion 状态机。
- Popup Editor 启动时没有隐式项目；项目只能通过“创建项目”dialog（名称与固定类型）或单独导入 Popup ZIP 建立。项目 ZIP 与资源导入是两个入口，资源入口中 VNI/ImgNumber 只接受各自 Editor 导出的 ZIP，Spine 必须以完整 JSON/atlas/texture 组导入。同名不同 bytes 必须由用户逐项选择覆盖或自动 suffix 保留两份，不能默认提交。
- Popup v9 沿用 v8 的三种互斥类型，并要求每个 text style 显式保存 `widthRange`；`0/0` 唯一表示关闭，正数区间由 runtime 只调字号拟合 local typographic width。Popup Editor 新建项目固定为 v9；合法 v1–v8 ZIP 必须先按原版本 strict 校验与 prepare，再给全部文字层补 `0/0`、原子迁移为 v9，后续 preview/export 只写 v9。Editor guides 中的宽度参考框是 session-only，不进入持久合同。
- Popup Editor 独立预览页拥有唯一的 Pixi Application/canvas，并把 rendercore Popup player 的 Container 挂入其中；rendercore Popup 与游戏/Scene Layout consumer 不得创建 canvas、Renderer、ticker 或 RAF。预览在合法配置变化后自动 rebuild，不提供 Build、advance、dismiss 或 immediate-dismiss UI；普通交互只来自完整 preview canvas 或 keyboard input。
- 新 Popup v6 authoring 不提供独立 Spine prompt；旧 prompt 在 v1/v2 导入迁移时结构化转换为 `name=prompt` 的字体文字 overlay，冲突使整次导入失败。award 各档与 Spine overlay 都可声明多个命名字体文字和 manual ImgNumber；文字省略 resource 时使用系统字体，显式选择时只接受 package-owned WOFF2/WOFF/TTF/OTF，失效引用不降级。award 的状态由档位 presence 表达，Editor 必须提供显式 stable-id 复用操作而不得按资源猜测合并；每个档仍必须恰好有一个 exact id 为 `win-amount` 的金额层。
- Popup Editor 的 award tier VNI 只允许 authoring `segmented`，必须显式保存合法 `loopStartTime/loopEndTime`；普通 single-state/overlay VNI 仍可选择 `once`。production parser/runtime 继续兼容历史 award `once` package，但 Editor 不得新建、切换或导出这种配置。
- Popup v4–v9 的 image、字体文字、ImgNumber、VNI 与 Spine layer 可挂 Popup root、同作用域 official Spine exact slot或 VNI exact text layer；普通 Spine Popup 还可挂主 Spine。VNI/Spine parent edge 必须使用同一依赖图拒绝 self与混合循环；Editor 候选必须来自 shared Spine/VNI strict metadata和当前可共同实例化的 layer作用域，不把仅导入资源库的 VNI当父节点、不猜首项。跨作用域引用、缺 slot/text layer、同父 order冲突、覆盖后失效与删除被引用 target 都阻止 transaction，不自动回根。
- 普通 Spine Popup 的可选 Tap info 子对象挂载配置只保存 external object 的父节点 metadata：main Spine exact slot或当前 Spine overlay的VNI exact文字层。Popup package与Editor不因此拥有对象resource、instance、transform、order、visibility、ticker、input或lifecycle；未配置时不生成默认target，真正对象的提供与挂载必须由后续consumer另行定义typed ownership合同。
- Game Layout Editor 可严格导入 standalone Popup Object ZIP 到候选库，并在项目级显式选择零或一个 Tap info 对象；导入不得自动绑定，未选对象不得进入production closure，删除已选对象必须先清空binding。同name替换与失败回滚保持旧selection和bytes。
- VNI export bundle 只把 `purpose=runtime` 作为运行候选：唯一 runtime 自动选择，多个 runtime 才枚举；禁止手输 profile id，`purpose=editing` 不进入候选。
- popup package 使用完整 SHA-256 content-addressed owned payload，并保持 exact closure。
- Popup 字体与其它 payload 一样按完整 SHA-256 物理去重；logical filename key 与 owner 引用不得从 hash path 反推或合并。
- Popup 必须保持 `popup/data → popup/core → popup/editor` 单向分层：data 拥有 v1–v9 strict source parser、唯一默认 latest normalizer与纯引用合同；core 拥有 production resolved-resource prepare、focus/presentation、layer、string registry、金额、input与 award/Spine/single-state 状态机；editor 只组合 mapped standalone package、namespace/materialize 和同 Core snapshot wrapper。任何 editor/game runtime 都必须用默认 loader把受支持版本转为latest。

## Game Layout Event

- EditorCore 的 Game Layout event selector 直接消费 RenderCore shared catalog，并把 `symbol-state`、`symbols-state-batch` 与 `spin-lifecycle` 显示为独立 family；Spin family 的整体/单元范围及 reel/spin/scope/x/y/lifecycle 只能来自 catalog facets。Editordemo 与 Game Layout Editor 不维护 app-local event family 表或按 address 猜测标签。

## Symbols Editor

- Symbols Editor 的项目页可用一份完整公开 game config 原子替换当前唯一 config：先走共享 strict parser，再按 exact symbol name review/确认；同名 draft 只更新 numeric code并保留全部 authoring，新增项建 canonical explicit-empty draft，删除或同 code 改名不猜迁移、不保留 tombstone。删除项原来使用的 library bytes 不自动 GC，无其它 typed owner 时由 exact export closure 排除；project id、cellSize 和状态定义不从新 config 或文件名派生。
- 内层 symbol-state-textures manifest 的 canonical authoring 版本为 v3 并沿用 v2 state lifecycle。Symbols Editor 不拥有 audio asset、effect/cue draft 或 preview audio；打开含旧 audio 的合法 v1–v3 package 时必须先走 rendercore 的完整 strict parser/resource validation，再删除旧配置和仅由其引用的 bytes 并显示摘要。新导出恒写 v3，schema 必需的 `audio.effects` 恒为空且不写任何 `audioCues`。
- Popup Editor 不拥有 tier/segment audio draft、audio import 或 preview audio。打开含旧 audio 的合法 v1–v9 package 时先完成 source schema、map/hash、exact closure 与资源 prepare，再删除旧 effect/cue 和仅由其引用的 bytes并显示摘要；新导出 latest schema 必需的 audio container恒为空。RenderCore/AudioCore 的历史 parser、upgrader 与 runtime compatibility 不因 owner editor 停止 authoring 而删除或放宽。
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

- Gamelayout Editor 只编辑和导出 Scene Layout latest v7；打开合法 v1–v7 时先调用 RenderCore 共享 upgrader，把 legacy 坐标、main 与 per-mode background binding 确定性规范化为中心坐标、普通 scoped node 和 allocation v3，再执行 Editor node-id migration并原子复验。每次导出都由 RenderCore 从 typed draft 重建并 strict 复验 allocation 与 event catalog 引用；旧 mode id、initial、edge 和只读 dependency 保持，不自动插入 Splash。root legacy music/effect 与 mode BGM 只作为 strict import 输入，迁移后从 draft 与仅由其拥有的 bytes 中移除并显示摘要；与 Event audio 共用的 asset 必须保留。
- Gamelayout Editor 的图层 authoring 必须显式区分 graphic 与 UI control；radio 的 off/on 及 step-slider 的 track/thumb 都是单一 draft transaction 的 typed image references，创建、分别重绑、删除检查、ZIP closure 与重导必须按 control kind 完整保持，禁止文件名自动配对、首项默认或拆成两个普通图层。
- Gamelayout Editor 导入的 JSON data 是 opaque、program-only asset：整批先严格验证 UTF-8、JSON 语法与 object/array root，再原子提交；只有显式 runtime program key binding 才进入 export closure。它不得进入画布、Picker、preview、RenderObject 或地址系统；mapped ZIP、重导与 optimizer 只能结构化改写 owner path，必须保持 payload bytes。
- EditorCore event dialog 的固定 source 与 typed row configuration 扩展只管理 dialog draft/lifecycle；宿主仍拥有 project、asset picker 和业务 schema。Gamelayout Editor 的 event audio 配置只能选择 Assets 已提交的 audio，不在 dialog 内上传或复制 bytes；project panel 重渲染前必须销毁旧 dialog。
- Game Layout Editor 的全局 Event audio dialog 是唯一持久化音频行为 authoring 入口，只能选择已提交的 audio asset并配置 exact start/end event、music/effect、once/loop 与 focus。audio root 可独立绑定 runtime program key 强制导出；该key提供exact URL/mediaType并派生默认once的program effect route，但按次loop/endEvent只属于调用API，不保存第二份authoring表。Editor不提供mode BGM、legacy root effect表或legacy ignore开关；canonical v7固定写空legacy audio catalog、mode无`bgm`、`eventAudio.ignoreLegacyAudio=true`。既无Event binding也无program key的audio asset不进入production ZIP。
- Game Layout Editor必须从shared formatter派生并显示/copy所选authored owner的canonical `gamelayout:/` runtime address；地址不可手输、不可写入manifest或另存alias表。audio 与 JSON program root 没有 runtime address，只显示 typed load API；transition Spine event地址必须包含exact from/to edge与configured event。
- UI control state event 必须来自 RenderCore shared catalog 的 `ui-control-state` family；EditorCore 只展示 control/control-kind/state/edge facets，Game Layout Editor 的 Event audio dialog 保存 radio off/on 或 step-slider 数字档位的 exact entered address，不解析地址或维护 app-local 控件事件表。
- 新项目使用中心坐标并可显式创建 Splash initial 与 BaseGame；背景不作为 mode 类型或必填项，用户只通过普通 node placement/scope 建立零个、一个或多个背景。Splash primary click只引用显式Splash→BaseGame transition。
- mode 的主转轮开关属于 v7 draft；关闭时仍保留横竖 main/focus authoring geometry但不绑定 Symbols，已有 Symbols binding 必须先显式解除。
- Gamelayout Editor新建/复制/重命名/导出的scene node id只允许lowercase alphanumeric+kebab并禁止`layout|reel|transition|popup`保留名。旧Layout ZIP先按rendercore v1兼容parser读取，再以确定性rename map原子规范化点号/下划线/保留名和collision，结构化改写adaptation background、mode background与nodeStates key，复验后提交并向用户显示完整old→new；不得覆盖或合并node。production parser继续兼容未重导旧包。
- gamelayouteditor 把 symbols ZIP 和 popup ZIP 当可多项并存的自包含 dependency library；standalone 校验后以 manifest id 生成稳定扁平 root/leaf key 并结构化改写 nested reference。同 id 再上传走替换并保留 binding/placement/order，提交后只 GC 无其它 owner 的旧 key；不同 id 不得互相覆盖 bytes。每个 active variant 只配置明确 binding 和相对 viewport center 的 popup root `x/y/scale`；root order 可编辑且必须高于全部 scene node/main reel。
- Popup Spine namespace 只改物理 filename key 和 manifest path value，不得改 atlas page logical name 或 texture map key。后续 filename-key 规范化必须把 Popup `resources` object key、resource root value、layer/spine reference 与 `audio.effects[].asset.sources[].path` 作为一个结构化 identity 原子改写，保持 object key exact 等于 compound root；Symbols dependency namespace 同样必须结构化改写其 audio source path 并携带对应 bytes。Popup 导入提交前必须用完整 SHA-256 比较其 namespace 前的 atlas/texture 与 Layout 自有 Spine 同名资产；同名不同 bytes 时列出双方 owner、filename 和 hash，用户可原子取消整次导入或明确继续隔离导入。不得自动覆盖、改名，或推断 skeleton JSON 与新版 atlas/texture 的兼容性。
- gamelayouteditor 的普通 node `scope` 属于 v7 layout manifest typed contract：字段缺失表示全局，字段存在时精确声明 mode × orientation；legacy 单 `gameMode` 与 per-mode background binding 只在共享 upgrader 中转成 v7 scope。Editor draft 只保存 scope，必须在结构化导入、编辑、导出、优化改写和重导中原样保留；不得把它存入 UI session、文件名约定或第二份资源表。scope/placement 隐藏不改变 node 的全局 order 或资源 identity，空 scope、unknown mode 与缺 placement 引用显式失败。
- 三类 Popup 导入 gamelayouteditor 后先进入 dependency library；任一类型都可显式设为程序 Popup并进入顶层`popups`。award-celebration仍只有mode可以直接引用，普通Spine仍可作为transition `preludePopup`，single-state没有直接引用位。没有直接引用且未设程序用途的Popup library item不得导出；地址只对实际导出的binding显示。
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
