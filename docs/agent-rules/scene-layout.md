# Scene layout rules

适用于 `apps/gamelayouteditor`、`packages/rendercore/scene-layout` 及 production layout package consumer。

## Editor ownership

- gamelayouteditor 是 browser-only editing UI，拥有 draft、preview controls、filename-key workspace、受限 ZIP import/export 和 dependency binding。
- editor 保持 `base: "./"`，可部署到任意静态 CDN 子路径，不依赖 server/API/WebSocket/数据库/登录态/持久化存储。
- preview 复用 uiframeworks frame viewport 和 rendercore production scene runtime；preview zoom 不进入 manifest，canvas 拖动不修改 layout config。主预览必须把真实 canvas 与 window keyboard target 绑定到 rendercore Popup input；不得用 CSS `pointer-events: none` 截断 production interaction，也不得依赖 editor overlay 的 Pixi hit-test 顺序。
- Resource Picker 按资源 kind 提供 typed preview；Spine/VNI 必须复用 production player 语义，图片与 glyph 总览只读取 project-owned bytes。切换或关闭 Picker 必须释放 player、ticker 与 Object URL；动画 preview renderer 由 editor app 单例拥有并只在 app destroy 时释放，不得为每次关闭销毁并干扰主布局 renderer。preview 失败不得修改 draft。

## Mode、variant 与稳定节点

- editor 拥有通用 game mode draft，以及 mode 到独立 per-variant background、symbols package 和 award popup 的显式 binding；普通 Spine popup 可绑定到一条有向 Spine transition 或独立显式注册，不伪装成 mode award binding。
- 新 mode 的 background 默认未绑定；每个 variant 明确选择，不继承另一 mode 的 editable node。
- background node id 按 mode/variant 稳定生成，不从资源名产生 `-2/-3` identity。
- 相同 logical resource 跨 mode 仍使用独立 node/placement；图片复用已加载 texture，稳定 Spine player 在 mode 切换时保留，不释放/重建。
- stable Spine background 只使用显式 single loop。未来稳定背景 kind 也遵守 exact-resource 和 stable-node 合同。
- 普通 scene node 可使用 official Spine 或 runtime VNI：Spine 显式选择 animation/loop，VNI 播放完整 timeline 并显式选择 loop；每个 node 保持独立 player/playhead。新建普通 Spine node 的骨架原点放在各 variant art center（`top-left` 坐标写入 `artSize / 2`，`center` 坐标写入 `0,0`），不得要求或使用 skeleton bounds/atlas texture 尺寸；Spine background 仍要求显式完整 art size。VNI 不得作为 background 或 transition。
- VNI scene node 的 `project.stage` 是 100% art-space 尺寸；top-left 原点对齐 stage 左上角，center 原点对齐 stage 中心。runtime 使用宿主 ticker 手动 update，并跳过不可渲染节点。
- 普通 scene node 和 main reel 的 order 可由用户显式编辑并保留稀疏值；node、main reel、Popup root 的 order 全局唯一。Popup root 默认从 `2000` 分配且必须高于全部 node/main reel。背景与 main reel 在 editor 大纲中继续特殊展示，不以此禁止普通 node 跨越 reel order。
- 普通 scene node 的 optional `gameMode` 表示 exact 单一 mode 作用域；字段缺失表示全局并兼容旧 v1 数据。background node 禁止声明该字段。最终可见性是 mode 作用域匹配与当前 variant placement 的 AND；不可见不删除 node、不改变全局 order。mode rename 必须改写引用，仍有 scoped node 引用时禁止删除。

## Symbols binding 与 preview

- gamelayouteditor 把 SymbolsEditor ZIP 视为自包含、只读的 symbol 状态机 package：只绑定 package id、reelSet、renderMode，并通过 rendercore 的公开状态/能力与 preview API 驱动预览。不得在 Layout Editor 暴露或改写 symbol 内部图片、Spine/VNI animation、state layer、value presentation 或 cascade 配置；这些细节只回 SymbolsEditor 编辑。
- mode binding 显式拥有 package id、reelSet 和 renderMode。
- symbols package `cellSize` 必须等于共享 main grid cell size，reel count 等于 columns，公开轮带只含 display symbols；失败不修改 grid 或 auto-fit。
- preview 从绑定 package 的公开 reel set 按列选择合法 stop 并连续读取 rows。production 使用 Web Crypto，测试可注入随机源，禁止 `Math.random()`。
- resize、variant、zoom、普通 relayout 和相同 binding 的 mode 切换不得重新抽样。
- sampled/server scene、otherScene preview、服务器真实轮带和随机数不写入 layout ZIP。

## Directed transition

- transition 是独立有向边，使用 explicit none、strict Spine overlay 或 video-blackout union。每条 edge 独立保存可选 `preludePopup`，必须引用普通 Spine Popup；不同 edge 可不配置或引用不同 Popup。none 仍要求显式边和完整 target prepare，不是缺边 fallback。
- editor 只自动准备当前 stable source 到所选 target 的一条直接边。
- 缺显式边时不得瞬切、反向复用、自动寻路或回退旧 node state machine。
- Spine/MP4 使用统一 state-switch action 和中文阶段提示。
- audible `play()` 必须在真实 trusted click 调用栈内同步触发。

## Rendercore production runtime

- rendercore 拥有 strict gameModes、plural symbolPackages、directed transition schema、exact dependency closure 和 production API。
- scene-layout authored coordinate origin 只允许 `top-left` / `center`；缺失按 `top-left`。node、art-space Spine transition 与 main reel 的 origin 映射由 rendercore 统一实现，focus rect 继续使用 art 左上角矩形。
- scene node placement 的 `rotation` 使用角度，normalized `center` 默认 `0.5/0.5`；旧字段缺失分别按 `0` 与默认中心规范化。rendercore 统一应用 node position/scale/pivot/rotation matrix，Spine 的默认中心精确使用 authored origin `(0,0)`。editor/app 不复制 transform，不从 skeleton bounds、atlas texture 或当前动画帧猜另一套默认中心。Popup/transition 仍只用 `x/y/scale`，main reel 仍只用 `x/y`。
- main reel per-variant placement 只允许 `x/y`，不提供整体 scale；横竖屏适配通过背景素材、art size 和 reel placement 完成，不改写转轮或 per-symbol scale。
- geometry-only manifest 更新必须先校验 immutable structure，再原子提交并复用 texture、Spine player、当前 mode、reel 与 scene；资源、topology、binding 或 transition 结构变化必须走完整 prepare/commit。
- transition overlay 使用固定顶层 `scene-transition-overlay`；video blackout 是 viewport-space runtime object，不是 CSS overlay。
- runtime 在切换前准备完整 target scene；只在 none direct commit、exact Spine event occurrence 或 video media-time `fadeStart` 边界原子切换 background、reel 和 displayed mode。
- editor 的 authoring stable-mode selection 必须与 production `requestGameMode()` 隔离：它不要求 directed edge、不播放 overlay，并用同一 visibility commit 同步背景、scoped 普通节点与 displayed mode；相同 symbols binding 不重建或重新抽样，prepare 失败不得留下半切换状态。
- video 不使用 wall-clock fade，不自动静音，也不在 `play()` 拒绝时 fallback。
- once/ended settle、iOS gesture-safe prepare、trusted-click synchronous play 和当前 mode popup lifecycle 属于 rendercore。带 prelude 的任意 edge 必须先完整完成 popup start→loop→end，再继续效果；source mode 在 popup complete 前保持不变。带 prelude 的 video 在 complete 后显式等待第二次 trusted gesture，不得预播、静音或与 Popup end 并行。
- Scene Layout Popup presentation 在 active prelude 或 award celebration 期间必须由 rendercore 的 host-bound input 接收完整 canvas `pointerdown` 与 window 非 repeat `keydown`：prelude 锁存 end 请求，award celebration 执行 advance，等待中的 video 在第二次 trusted gesture 同步启动。显式 DOM binding 期间不得同时走 Pixi fallback；Popup idle 后必须透传输入，editor 与游戏 app 不复制分派或阶段判断。
- shared code 不硬编码 BaseGame/FreeGame/BonusGame、BG/FG、animation/event 名或业务字段。

## Resource lifecycle

- owned MP4、Spine、VNI project/assets、image、symbols 和 popup dependencies 都进入 exact closure；runtime 复用精确 bytes。
- 不属于 scene node/transition、但由程序读取的资源必须通过根 manifest 的唯一稳定程序键声明为 typed runtime resource；五类现有 root 均按正向 exact closure 导出。runtime consumer 按 key/kind 严格解析，不猜 filename 或 physical hash path。
- production export 先从 layout 收集实际引用的 root，再按有向依赖计算 exact closure。共享 atlas/贴图可由任一被用到的 Spine JSON root 带入；同批未引用的 sibling JSON root 不得因共享 leaf 被反向导出。
- 替换或重绑资源必须保留稳定 node identity、order、各 variant placement/visibility，并尽可能保留仍兼容的 animation、loop 与 image-string 配置。资源尺寸变化不得自动重置 reel、focus 或 placement；现有几何与新 art size 冲突时必须严格失败。
- 相同 symbols binding 的 mode 切换默认保留 reel、scene 和 player；只有显式 `recreateReel` 才重建。
- production full package runtime 可显式 deferred prepare main reel；首次 scene commit 前 reel 不可见且业务 API 必须失败。自定义 reel factory 采用 ownership transfer，package 仍负责 manifest order/placement 与 destroy；借用 overlay 只能通过 typed attach/dispose API 接入并位于 transition/popup 下方。
- background visibility、target scene commit、active standard/grid-cell reel prepare/swap 和 popup lifecycle 原子完成。
- 底层 named-node state machine 可供独立 consumer 使用，但不得成为 `requestGameMode()` 的隐藏入口或 fallback。
- app/editor 不复制 event drain、official Spine player、image-string、background visibility、reel placement 或 transition state machine。

## Production package optimization

- `apps/gamelayoutpkgcli` 只消费当前 filename-key mapped production ZIP；legacy direct-path、mixed package、坏 map、缺失 dependency 和 orphan payload 必须在优化前失败。
- WebP 后处理必须结构化改写 layout 与 nested owner manifest/VNI 的 typed 图片引用，重新生成完整 content-addressed payload 和 `assets.map.json`，再用 production package parser 复验；不得扫描任意 JSON 字符串猜路径。
- 资源分组从完整 typed dependency graph 推导，不硬编码 BaseGame、FreeGame、Symbols 或 BigWin 文件名。transition 归属 source mode并包含其 prelude Popup closure；initial 集合包含 shared、initial mode、其 symbols 和从 initial mode 发出的 transition。未被 mode、transition 或显式 programmatic binding 引用的 package 不得进入 production ZIP/group。
- 全局或 legacy 普通 node 归 shared 并进入每个 mode closure；声明 exact `gameMode` 的普通 node 只归该 mode。background ownership 仍来自 mode binding，order 不参与 owner 推导。
- 没有显式 mode ownership 的 runtime resource 归 shared/initial；共享 Spine atlas/texture leaf 可去重，但 leaf 不反向拥有或带入未声明的 sibling skeleton root。
- 每个 group 同时保存完整 `requiredAssets` 与相对 initial 的 `incrementalAssets`；完整闭包允许重叠，但全部优化资源必须至少被一个 group 覆盖。
- versioned asset-groups JSON 是 ZIP 外的独立交付物，不进入 production ZIP；它可供后续合图或 loading 优化消费，但 CLI 本身不修改 runtime loading 行为。

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
- 只需要 layout/background/popup、而 reel 由游戏业务 target 驱动时，使用 rendercore
  presentation surface；surface 仍拥有 mode-aware background visibility、popup placement
  和 destroy，app 只注入业务触发并组合公开 container。业务 reel 自己持有显示对象时，
  surface 使用 package runtime 的 presentation-only 模式，分层公开
  background/transition/popup，且不创建第二个 reel。
