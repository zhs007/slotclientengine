# Scene layout rules

适用于 `apps/gamelayouteditor`、`packages/rendercore/scene-layout` 及 production layout package consumer。

## Editor ownership

- gamelayouteditor 是 browser-only editing UI，拥有 draft、preview controls、filename-key workspace、受限 ZIP import/export 和 dependency binding。
- editor 保持 `base: "./"`，可部署到任意静态 CDN 子路径，不依赖 server/API/WebSocket/数据库/登录态/持久化存储。
- preview 复用 uiframeworks frame viewport 和 rendercore production scene runtime；preview zoom 不进入 manifest，canvas 拖动不修改 layout config。主预览必须把真实 canvas 与 window keyboard target 绑定到 rendercore Popup input；不得用 CSS `pointer-events: none` 截断 production interaction，也不得依赖 editor overlay 的 Pixi hit-test 顺序。
- preview 的任意成功 mode commit（authoring selection、正式 transition、primary action）必须按 committed displayed mode 重新解析 frame viewport，同步 resize renderer、应用 runtime viewport 并更新 canvas CSS/guide；不得沿用 source mode 的 frameDesignSize 或 art 裁切范围。
- Resource Picker 按资源 kind 提供 typed preview；Spine/VNI 必须复用 production player 语义，图片与 glyph 总览只读取 project-owned bytes。切换或关闭 Picker 必须释放 player、ticker 与 Object URL；动画 preview renderer 由 editor app 单例拥有并只在 app destroy 时释放，不得为每次关闭销毁并干扰主布局 renderer。preview 失败不得修改 draft。

## Mode、variant 与稳定节点

- Scene Layout latest 为 v7：root 只保留 typed `main` grid；每个 mode 直接声明 `main.enabled` 与 `main.variants.landscape/portrait`，每侧保存 main center `x/y`、absolute `focusRect` 和可选 `minFocusMargin`。v7 不含 `coordinateOrigin`、`artSize`、adaptation type、`backgroundNodes`、`reelPlacements` 或 `frameFocusRect`。RenderCore 与 Editor 读取合法 v1–v7并统一规范化为 v7；Editor 只预览和导出 canonical v7。
- v7 `nodes` 是严格的 `resource | uiControl` 图层 union；v1–v6 只接受图形。UI 控件使用可扩展 discriminated union：`radio` 显式绑定不同且同尺寸的 off/on image root；`step-slider` 显式绑定不同 track/thumb、至少 2 档和正吸附时长，track 必须形成正水平行程。两者复用唯一 id/order/scope/placement并固定从首状态初始化；Editor 不按文件名配对，也不把控件降级为普通 image 图层。
- RenderCore 继续 strict 读取和运行历史 per-mode loop BGM、root effects 与 Popup/Symbol cue；该 compatibility 只属于历史 artifact consumer，不是 Editor authoring 合同。Game Layout Editor 打开旧 package 时必须先完整验证 source schema/map/hash/closure，随后迁移删除 root legacy audio 与 mode BGM，但不得改写只读 Symbols/Popup dependency。
- Game Layout Editor 中 root 音频先作为统一 filename-key asset 导入，不因文件名自动绑定用途；全局 Event 音乐音效对话框是唯一音频行为 authoring 入口，只选择已上传 audio，不负责导入 bytes。audio root 可另外绑定唯一稳定程序键，以 `{ kind: "audio", path, mediaType }` 进入 `runtimeResources` 供 typed load，但不因此获得 music/effect、playback、bus 或 focus 语义。既无 Event 引用也无程序键的音频保留在 authoring workspace 但不进入 production closure；audio 不得伪装成 scene node、RenderObject 或 runtime address。canonical v7 的 legacy audio catalog恒为空、mode 不含 `bgm`、`eventAudio.ignoreLegacyAudio` 恒为 true。
- event audio 的 `music` / `effect` 是玩家可独立控制的音量总线，不是互斥播放策略。once track 可独立降低 BGM，并在 `same-audio` / `all` 中至多选择一种音效范围；target gain 为 `0..1`，默认 authoring 值为 `0.5`。衰减由每个 active voice 的 owner-scoped lease 持有，owner 自身不被降低，重叠 lease 取最小 gain，结束、停止、失败和 destroy 必须恢复。loop track 不配置 focus，开始 event 在解锁前保留播放意图，once event 在解锁前丢弃。
- Shared schema/runtime 中 `ignoreLegacyAudio=false` 仍按历史合同播放自动 mode BGM、Popup cue 与 Symbol cue；Game Layout Editor 不再暴露该开关且导出恒为 true。初始 mode 的 displayed/stable entered occurrence 必须在 init 成功后发出，使 Event audio 与其它 event consumer 看到一致的首次状态。
- 每个 v7 mode 显式声明 `main.enabled`；关闭时不得绑定 Symbols，但横竖 main/focus 几何仍必填并用于 viewport。runtime 不得按 mode id 猜测开关。
- orientation variant只由宿主原始page width/height决定；正方形保持当前variant，首次正方形为landscape，focus和派生frame尺寸不得反馈成方向输入。
- main、普通 scene node、Popup 与 transition 都按当前 `landscape` / `portrait` variant 解析；方向 resize 只更新 placement/visibility，不重建稳定 player。
- orientation variant选定后必须把该variant的actual focusRect（及显式margin）按contain最大化；无margin时focus映射到CSS page后至少一轴与page相等。frameDesignSize、visibleRect、worldOffset和focusRectInViewport只由page aspect、所选actual focus及显式margin决定，不依赖美术边界或背景。
- primary action只引用同source的显式direct transition target；runtime复用既有prepare/commit/rollback和trusted gesture边界，不按mode名称推断点击行为。
- editor 拥有无类型的通用 game mode draft、main 横竖配置、Symbols package 与 award popup binding；背景只是零至多个普通 node，不存在背景专属 selector、readiness 或隐式默认值。
- 普通 scene node 可使用 image、official Spine、image-string 或 runtime VNI。所有 v7 placement 都位于同一中心坐标平面：image 以图片中心、VNI 以项目 authored `(0,0)`、Spine 以 skeleton authored origin、image-string 以显式 anchor 对齐 `x/y`；不得读取或改写 VNI JSON 来换算坐标，也不得从 bounds 或当前帧猜中心。
- 普通 scene node 和 main 的 order 可由用户显式编辑并保留稀疏值；canonical v7 中 node、main、Popup root 的 order 全局唯一。legacy 冲突只由共享 latest upgrader 确定性处理并同步重建 runtimeAllocation；显式 v7 parser 执行 strict canonical 校验。
- 普通 scene node 的 optional `scope` 精确表达 mode 与方向可见性；字段缺失表示全局。最终可见性是 scope 匹配与当前 variant placement 的 AND；不可见不删除 node、不改变全局 order。mode rename 必须改写 scope，仍有 scoped node 引用时禁止删除。

## Symbols binding 与 preview

- gamelayouteditor 把 SymbolsEditor ZIP 视为自包含、只读的 symbol 状态机 package：只绑定 package id、reelSet、renderMode，并通过 rendercore 的公开状态/能力与 preview API 驱动预览。不得在 Layout Editor 暴露或改写 symbol 内部图片、Spine/VNI animation、state layer、value presentation 或 cascade 配置；这些细节只回 SymbolsEditor 编辑。
- mode binding 显式拥有 package id、reelSet 和 renderMode。
- symbols package `cellSize` 必须等于共享 main grid cell size，reel count 等于 columns，公开轮带只含 display symbols；失败不修改 grid 或 auto-fit。
- preview 从绑定 package 的公开 reel set 按列选择合法 stop 并连续读取 rows。production 使用 Web Crypto，测试可注入随机源，禁止 `Math.random()`。
- resize、variant、zoom、普通 relayout、Popup root placement 和相同 binding 的 mode 切换不得重建runtime或重新抽样；Editor拖拽
  resize只能更新现有viewport并合并同一animation frame内的高频事件。
- sampled/server scene、otherScene preview、服务器真实轮带和随机数不写入 layout ZIP。

## Directed transition

- transition 是独立有向边，使用 explicit none、strict Spine overlay 或 video-blackout union。每条 edge 独立保存可选 `preludePopup`，必须引用普通 Spine Popup；不同 edge 可不配置或引用不同 Popup。none 仍要求显式边和完整 target prepare，不是缺边 fallback。
- production `requestGameMode(...,{immediate:true})`只可跳过已有direct edge的Popup/overlay表现；仍须完整target prepare和原子mode/reel/visibility commit，不允许缺边fallback、抢占active transition或与`preludePopupStrings`组合。被跳过的Popup/transition/effect event不发布，真实displayed/stable mode与BGM event继续发布。
- editor 只自动准备当前 stable source 到所选 target 的一条直接边。
- 缺显式边时不得瞬切、反向复用、自动寻路或回退旧 node state machine。
- Spine/MP4 使用统一 state-switch action 和中文阶段提示。
- audible `play()` 必须在真实 trusted click 调用栈内同步触发。

## Rendercore production runtime

- 公开入口固定为 `@slotclientengine/rendercore/scene-layout/data|core|editor`，不再提供混合 `scene-layout` 或 root wildcard。游戏 runtime 只依赖 data/core；Gamelayout Editor、Game Viewer/Viewer2 和需要 mapped ZIP/standalone Application 的工具依赖 editor 包装，但预览必须复用包装内部的同一个 core runtime。
- core 不创建 Application、canvas、ticker 或 RAF，不拥有 workspace/authoring session；宿主逐帧调用 `update(deltaSeconds)`。游戏热路径使用 `getStableGameMode()`、`getGameModePhase()` 等标量 query；完整 game-mode/award snapshot 只由 editor inspector 读取。
- Scene Layout 在组合 Popup/Symbol package 时才把 local effect name 编译为 `<binding>.<local>` route；程序只能播放/停止显式 allowlist route。cue delay 使用宿主 `update(deltaSeconds)` 时钟，stop、切状态、rollback 与 destroy 必须取消未触发播放并清理 owner-scoped instance。
- rendercore 拥有 strict gameModes、plural symbolPackages、directed transition schema、exact dependency closure 和 production API。
- canonical v7 只有中心坐标系，原点固定为 `(0,0)`；authored x/y 允许任意有限负数。legacy `top-left` / `center` 和 `artSize` 只存在于 v1–v6 strict parser/upgrader 输入，不能泄漏到 v7 snapshot、Editor draft 或 consumer API。
- `focusRect` 与 main rect 不要求互相包含；parser、runtime 与 editor 不因越界自动裁切或修正。Editor 必须用相对 main 的 `left/top/right/bottom` 四边外扩量编辑 focus，正数向外、负数向内；导入从 absolute rect 精确反算，导出保存 absolute center-plane rect。
- runtime必须从current snapshot公开 main/visibleRect 九宫格 point 及 authored point↔opaque Anchor；Point/Rect是调用时快照，Anchor延迟解析，不得把logical visibleRect称为CSS/window/device坐标。
- canonical layer ref只能由一个strict parser按stable、`node:` legacy、exact area suffix、canonical node顺序解析；unknown/ambiguous/unavailable显式失败，禁止alias或node/resource同名fallback。
- scene node placement 的 `rotation` 使用角度，normalized `center` 默认 `0.5/0.5`；旧字段缺失分别按 `0` 与默认中心规范化。rendercore 统一应用 node position/scale/pivot/rotation matrix，Spine 的默认中心精确使用 authored origin `(0,0)`。editor/app 不复制 transform，不从 skeleton bounds、atlas texture 或当前动画帧猜另一套默认中心。Popup/transition 仍只用 `x/y/scale`，main reel 仍只用 `x/y`。
- main per-variant placement 只允许 center `x/y`，不提供整体 scale；横竖屏适配通过 main/focus 与普通 node placement 完成，不改写转轮或 per-symbol scale。
- 外部 geometry-only manifest 更新必须先校验 immutable structure，再原子提交并复用 texture、Spine player、当前 mode、reel 与 scene；
  Popup root的per-variant `x/y/scale`属于geometry，package identity、manifest与order仍属于immutable structure。资源、topology、binding
  或transition结构变化必须走完整prepare/commit。package-owned mode target已在manifest parse/transition prepare边界验证，switch commit
  只应用prepared geometry/visibility/order，不重复parse或全结构比较。
- transition overlay 使用固定顶层 `scene-transition-overlay`；video blackout 是 viewport-space runtime object，不是 CSS overlay。
- runtime 在切换前准备完整 target scene；normal路径只在none direct commit、exact Spine event occurrence或video media-time`fadeStart`边界原子切换background、reel和displayed mode；显式immediate路径在target-only prepare完成后直接提交稳定mode且不创建transition player。
- editor 的 authoring stable-mode selection 必须与 production `requestGameMode()` 隔离：它不要求 directed edge、不播放 overlay，并用同一 visibility commit 同步背景、scoped 普通节点与 displayed mode；相同 symbols binding 不重建或重新抽样，prepare 失败不得留下半切换状态。
- video 不使用 wall-clock fade，不自动静音，也不在 `play()` 拒绝时 fallback。
- once/ended settle、iOS gesture-safe prepare、trusted-click synchronous play 和当前 mode popup lifecycle 属于 rendercore。带 prelude 的任意 edge 必须先完整完成 popup start→loop→end，再继续效果；source mode 在 popup complete 前保持不变。带 prelude 的 video 在 complete 后显式等待第二次 trusted gesture，不得预播、静音或与 Popup end 并行。
- `requestGameMode()`可为exact edge绑定的普通Spine prelude提交本轮`text | image-string` exact-name最终string；这些值不进入prepare/cache identity，并在Popup complete、失败、取消或runtime destroy后恢复调用前handle状态。shared runtime不解释translation key或金额业务。
- Scene Layout Popup presentation 在 active prelude 或 award celebration 期间必须由 rendercore 的 host-bound input 接收完整 canvas `pointerdown` 与 window 非 repeat `keydown`：prelude 锁存 end 请求，award celebration 执行 advance，等待中的 video 在第二次 trusted gesture 同步启动。显式 DOM binding 期间不得同时走 Pixi fallback；Popup idle 后必须透传输入，editor 与游戏 app 不复制分派或阶段判断。
- 三类Popup都可作为顶层programmatic binding保留；Editor只对直接引用或显式程序用途的binding导出并显示canonical owner地址。package runtime必须把program Popup、mode award和transition prelude放入同一个FIFO，保持单active并在完整关闭后自动启动下一项；严格立即打开另有fail-fast入口。session close/cancel必须绑定exact请求identity，queued cancel和stale close不得影响其它项；正常关闭锁存到正式end完成，immediate仅用于显式取消/cleanup。同一Scene Layout runtime的全部Popup只创建一个共享压暗display object，并按当前active Popup的backdrop配置与状态更新。
- 游戏判断 active award 生命周期只使用 package runtime 的 phase query；完整 award snapshot 只从 `@slotclientengine/rendercore/scene-layout/editor` inspector 读取，inspector复用同一个package runtime且不得进入game facade。
- shared code 不硬编码 BaseGame/FreeGame/BonusGame、BG/FG、animation/event 名或业务字段。
- production runtime 与 editor package inspection 必须共用唯一的纯 Game Layout event catalog compiler。editor inspector 只从 strict Layout、Symbols、Popup 和 audio manifest closure 返回 frozen descriptor/family/facets，不创建 renderer/player/browser resource；EditorCore 和 app 不解析 canonical address 重建第二份 event 语义表。
- event catalog 必须把逐 occurrence `symbol-state` 与每 request 一次的 `symbols-state-batch` 作为两个可见 family；EditorCore、Editordemo 与 Game Layout Editor 均直接显示共享 catalog family，不按 address 字符串合并、隐藏或猜测 batch identity。
- event catalog 的 `spin-lifecycle` family 只按实际 main Symbols render mode 暴露 ReelSpin 或 GridCell，并始终为可创建的 CellSpin 暴露整体 started/ended、exact/wildcard started/stopped 与 all-stopped；多 Symbols binding 不得重复地址。Editor 只消费 reel/spin/scope/x/y/lifecycle facets，不从 canonical address 反向猜事件语义。
- event catalog 只暴露可驱动表现与音频的业务状态、动画和生命周期边界；mode BGM 与 audio music 自身的 started/stopped 不作为 event，不得形成音频驱动音频的递归触发族。`mode/<id>/state/stable/entered|exited` 是 event BGM 的标准开始/结束边界。

## Resource lifecycle

- owned MP4、Spine、VNI project/assets、image、symbols 和 popup dependencies 都进入 exact closure；runtime 复用精确 bytes。
- 不属于 scene node/transition、但由程序读取的资源必须通过根 manifest 的唯一稳定程序键声明为 typed runtime resource；各类 root 均按正向 exact closure 导出。`json` root 只承载 opaque program data，runtime 只验证 JSON object/array、返回 deep-frozen value，不解释业务 schema，也不生成 RenderObject、Object URL 或 runtime address。`audio` root 只返回 exact URL/mediaType，可与 Event audio 共用同一 logical payload，但不生成 RenderObject 或 runtime address，播放仍归 AudioCore owner。runtime consumer 按 canonical runtime manifest 的 key/kind 严格解析，即使 initial layout view 为 lazy prepare 而省略这些声明也不得误判 unknown；不得猜 filename 或 physical hash path。
- production export 先从 layout 收集实际引用的 root，再按有向依赖计算 exact closure。共享 atlas/贴图可由任一被用到的 Spine JSON root 带入；同批未引用的 sibling JSON root 不得因共享 leaf 被反向导出。
- 替换或重绑资源必须保留稳定 node identity、order、scope、各 variant placement/visibility，并尽可能保留仍兼容的 animation、loop 与 image-string 配置。资源尺寸变化不得重置 main placement 或 focus 四边外扩量。
- 相同 symbols binding 的 mode 切换默认保留 reel、scene 和 player；只有显式 `recreateReel` 才重建。
- latest `runtimeAllocation` 只保存 typed owner id、mode/variant active node 和 package/on-demand lifetime，不保存 physical path/hash/bytes。package runtime 在 init 准备全部声明的 Symbols reel entry；首次激活需要显式 scene，之后跨 binding 返回恢复原 entry，dormant entry 不 update 且只在 package destroy 或显式 replacement 时销毁。
- production full package runtime 可显式 deferred prepare main reel；首次 scene commit 前 reel 不可见且业务 API 必须失败。自定义 reel factory 采用 ownership transfer，package 仍负责 manifest order/placement 与 destroy；借用 overlay 只能通过 typed attach/dispose API 接入并位于 transition/popup 下方。
- scoped node visibility、target scene commit、active standard/grid-cell reel prepare/swap 和 popup lifecycle 原子完成。
- 底层 named-node state machine 可供独立 consumer 使用，但不得成为 `requestGameMode()` 的隐藏入口或 fallback。
- app/editor 不复制 event drain、official Spine player、image-string、scoped node visibility、main placement 或 transition state machine。
- authored loop Spine 的 exact animation await/stop 与 caller-owned RenderObject exact-slot batch attachment 由 production runtime 持有；不公开 player/Container，不猜 animation/slot alias，失败、supersede、abort、child/runtime destroy 必须清理或回滚。
- authored node、program resource与显式identity的program Popup可把exact child parent发布为owner-first runtime address；Spine slot、VNI text layer和Popup session root都复用opaque `RenderObjectLayer`。Popup queued instance可预挂但必须保持不可见，只有active instance显示；finished/cancelled/failed/destroy必须注销地址并detach caller child，不得污染缓存player的下一次session。
- package runtime按canonical resource factory address拥有唯一RenderObject池，并从active Symbols catalog发布exact `gamelayout:/symbol-package/<binding-id>/symbol/<symbol>`工厂；二者统一支持`create({pooled})/destroy()`，symbol factory另接受在返回前严格应用的`presentationValue`且每次checkout省略时重置为`null`，其它resource kind拒绝该字段。不得让app读取manifest bytes、猜默认symbol或维护第二份资源表。image-string池每次取出重设text/anchor，不按内容分桶。
- 所有authored Scene Layout RenderObject共享RenderCore manual-clock motion；manifest placement/visibility仍是唯一home owner，程序position与rotation按offset叠加、x/y scale按factor相乘、opacity只作用于authored slot且不得把0等同hidden。多属性命令先完整preflight再同帧提交；variant或geometry replacement、reset与destroy必须cancel pending Promise并把program transform复位neutral，不改变既有resource node的直接parent拓扑。
- `gamelayout:/event/variant-changed` 只描述 package runtime 已提交的 variant edge；首次 apply、同 variant resize 与失败 apply 不产生 occurrence，app 不以 raw viewport listener 复制第二套 variant 判定。
- 游戏程序对象优先使用rendercore additive `getRenderLayer()`或exact node
  `getNodeRenderLayer(child|before|after)`；这些façade必须复用production runtime已有root与named-node attachment band、继承
  variant/mode transform并保持旧raw host/editor接口兼容，不返回world坐标或mutable display tree。

## Production package optimization

- `apps/gamelayoutpkgcli` 只消费当前 filename-key mapped production ZIP；legacy direct-path、mixed package、坏 map、缺失 dependency 和 orphan payload 必须在优化前失败。
- WebP 后处理必须结构化改写 layout 与 nested owner manifest/VNI 的 typed 图片引用，重新生成完整 content-addressed payload 和 `assets.map.json`，再用 production package parser 复验；不得扫描任意 JSON 字符串猜路径。
- 资源分组从完整 typed dependency graph 推导，不硬编码 BaseGame、FreeGame、Symbols 或 BigWin 文件名。transition 归属 source mode并包含其 prelude Popup closure；initial 集合包含 shared、initial mode、其 symbols 和从 initial mode 发出的 transition。未被 mode、transition 或显式 programmatic binding 引用的 package 不得进入 production ZIP/group。
- 全局普通 node 归 shared 并进入每个 mode closure；声明 exact mode scope 的普通 node 只归对应 mode，order 不参与 owner 推导。legacy background binding 在 upgrader 中转换为普通 node scope。
- 每个 runtime resource 形成独立 deferred group，不并入 initial/shared；共享 Spine atlas/texture leaf 可去重，但 leaf 不反向拥有或带入未声明的 sibling skeleton root。typed JSON data 的 group closure 只含其 exact path，优化器可改写 filename key/path，但不得解析、格式化或改写 payload 内容。
- 每个 group 同时保存完整 `requiredAssets` 与相对 initial 的 `incrementalAssets`；完整闭包允许重叠，但全部优化资源必须至少被一个 group 覆盖。
- `gamelayoutpkgcli --delivery-dir` 输出 versioned CDN delivery：physical owner 只允许 `initial`、manifest 顺序的 `mode:<id>` 与 `media`；同一 asset 只由一个 owner 保存。node、Symbols 与 award Popup 归其最早使用 mode；transition overlay 与 prelude Popup 归 source mode，因此 `BaseGame -> FreeGame` 属于 BaseGame、反向边属于 FreeGame。无 mode owner 的 shared/programmatic resource 归 initial；空 mode 仍输出 readiness chunk。多个 logical key 映射到同一 content-addressed metadata path 时必须先合并为同一个最早 owner，禁止把同一路径写入多个 owner ZIP；runtime manifest parser 与 chunk loader 都保持严格重复检测。
- 新 delivery 恒写 version 2：项目 manifest 固定为 `delivery.manifest.json`，由游戏 import 或随项目 URL 发布；metadata ZIP、atlas 与 external media 使用 `<full-sha256>.<canonical-ext>`，作为普通文件平铺在 append-only CDN payload pool，不得生成 physical 子目录、unhashed payload alias 或 latest pointer。包内 metadata ZIP 与 `assets.map.json` 继续使用标准 mapped package path，不得从 CDN 扁平 filename 反推或改写 logical identity。
- delivery publisher 只新增缺失 payload，已有同名 payload 必须 byte-equal，旧 hashed payload 不删除；固定项目 manifest 在全部 payload 就绪后原子更新。`--check` 要求当前 manifest 与 candidate closure 存在且 byte-equal，允许额外合法旧 payload；GC、cache header、CORS 与 CDN purge 属于部署边界。
- delivery 中非 Spine raster 必须按 owner 在 RGBA 阶段先用允许 rotation 的 MaxRects 合图，再把最终 atlas 单次编码为 WebP；不得先逐图有损 WebP 再合图。Spine page 保持独立，JSON/VNI/`.atlas` 等元数据进入 owner ZIP。
- delivery atlas frame 的 Runtime 尺寸合同以 Pixi `Texture.width/height` 的 logical frame/orig 为准，不得用共享 atlas page 的 `TextureSource.width/height` 代替；frame logical size 与 manifest 不一致时仍显式失败。
- delivery 的音频和视频保持 production input bytes、codec 与 container 不变，作为独立 content-addressed CDN 文件，不进 metadata ZIP 或通用 atlas。runtime 保留外部 URL，不创建媒体 Blob；具体浏览器流式策略不写入 manifest。
- delivery manifest、metadata ZIP、atlas frame/rotation 与 external route 是 versioned strict contract；CLI 必须提供 deterministic `--check` parity。RenderCore 负责从 delivery 还原 logical mapped package、注册 atlas 子纹理并把 Spine/media 路由到外部 URL，game app 不复制 parser 或逐文件表。
- RenderCore delivery loader 由调用方显式传项目侧 `manifestUrl` 或已 import 的 `manifestBytes`，并独立传 payload HTTP(S) directory `urlPrefix`；只有 payload URL 相对 prefix 解析，部署 prefix 不进入 manifest。runtime 按明确版本继续读取历史 v1 nested route，新 CLI 只生成 v2，不提供 v1/v2 payload 路径 fallback。
- RenderCore delivery loader 把 initial payload 与其它 mode 的小型 metadata catalog 纳入首屏 package parse，但不提前加载非 initial atlas/WebP；initial ready 后先后台预取独立 media owner，再按 manifest 顺序预取其它 mode payload。package runtime 只初始化 initial owner，实际 mode 切换复用或抢占同一 chunk Promise，并在提交 target scene 前等待 exact mode atlas、node、Symbols 与 source-owned Popup prepare 完成。
- transition prelude Popup 的用户确认必须锁存：点击立即正常驱动 Popup 退场和全部 frame update；若 target mode assets 未 ready，只阻塞后续 scene commit。assets ready 后自动推进，不得吞掉点击或要求二次点击；video transition 必须在该 trusted gesture 内完成 audible media unlock。
- 不带 `--delivery-dir` 的 legacy 单 ZIP/asset-groups 模式仍可逐图片 WebP 并把 typed 音频固定输出 M4A/AAC-LC；不得与 byte-preserving delivery 模式混用。
- Editor/Viewer 测试 fixture 归具体 package 所有，优先使用内联 JSON/atlas/最小 raster bytes，不依赖 production mapped package，也不得成为 game app `publicDir`、production fallback 或 delivery runtime 的第二资源来源。

## Popup placement

- 每个 active variant 只配置 popup root 相对 viewport center 的 `x/y/scale`。
- popup package 最终 vendor 到 layout ZIP；内部 layer、tier、坐标和资源保持 popup owner 自包含。
- popup 的字体文字样式、命名文字/ImgNumber 默认 string、award 内部档位和普通 Spine legacy prompt/overlay 在 Scene Layout 中只读；Editor 只允许按公开 node handle 临时覆盖预览 string。相同字体 bytes 由根 assets map 按 SHA-256 物理去重。
- 普通 Spine popup 的 placement 与注册由 Scene Layout 拥有；start/loop/end 动画名与点击锁存生命周期由 popup package 和 rendercore 拥有。
- Popup root order 由 Scene Layout binding 拥有，可由 editor 修改；rendercore 在当前 scene 的顶层 Popup root 中按 order 排序，不为转场 Popup 创建独立 scene。
- production app 直接消费 editor 导出的 mapped folder 时，构建期必须从根 manifest
  与 `assets.map.json` 生成 physical Vite import map；禁止宽泛 glob、运行时猜路径
  或另存业务资源表。该 game build generator 以当前美术目录为权威，不校验
  hash/size/content-addressed filename 或 orphan；editor/export/optimizer/ZIP 通过各自
  的 package validator 保持严格 integrity 合同，不复用该 generator 做校验。
- scene-layout runtime resolver 只把 `assets.map.json` 用作 logical key→安全
  physical path 路由，当前 files/bytes 为权威；不得在 runtime 比对 `sha256`/
  `byteLength`/content-addressed filename，也不因未引用 entry/file 阻断。实际引用的
  path 缺失、manifest/schema、资源解码和运行能力错误仍须失败。
- hash/size/path/orphan integrity 属于 editor/import/export/optimizer/production ZIP
  边界，必须由这些边界显式调用 `validateEditorAssetsMapPackage()`；不得把验证隐藏
  在 runtime resolver 的默认分支或依赖 game app 传 bypass policy。
- 只需要 layout/node/popup、而 reel 由游戏业务 target 驱动时，使用 rendercore
  presentation surface；surface 仍拥有 mode-aware node visibility、popup placement
  和 destroy，app 只注入业务触发并组合公开 container。业务 reel 自己持有显示对象时，
  surface 使用 package runtime 的 presentation-only 模式，分层公开
  scene/transition/popup，且不创建第二个 reel。
