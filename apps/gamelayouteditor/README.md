# Game Layout Editor

纯前端 Scene Layout v8 编辑器，覆盖 layout、mode/orientation、可选 Splash role、全局 Event 音乐音效、图形图层、UI 控件图层、Symbols、award-celebration/普通 Spine/single-state Popup 与 Spine/MP4 有向转场。合法 v1–v8 ZIP 会在打开事务中规范化；后续预览和导出只生成 canonical v8。新项目只创建 BaseGame initial；用户自行创建欢迎 mode 并设为 Splash；点击后进入 initial，未配置转场时直接切换，配置后播放相应效果。设置 Splash 不会自动创建转场。编辑预览直接显示所选 GameMode，不显示默认黑 Splash；声音可通过“启用声音”开启。游戏运行时在未配置 Splash 时仍保留默认黑 Splash 点击门禁。

图层先区分“图形图层”和“UI 控件”。`radio` 必须从 Assets 明确选择不同且同尺寸的 off/on image root；`step-slider` 必须明确选择不同的 track/thumb，配置至少 2 档和正吸附时长，新建默认 3 档。两者都复用普通图层的唯一 id、order、scope 和横竖屏 placement，不按文件名配对。预览交互不回写 authoring draft；Inspector 可分别重绑图片，production closure 会包含控件的全部图片。

runtime 可按图层 id 调用 `getUiControl(id)`，或解析 `gamelayout:/ui-control/<id>` 的 `ui-control` endpoint，得到 borrowed discriminated capability。radio 发布 `.../radio/state/<off|on>/entered`；step-slider 吸附完成才发布 `.../step-slider/state/<index>/entered`。初始化与 same-state set 不发事件。全局 Event 音乐音效对话框从 RenderCore shared catalog 的“UI 控件状态”family 选择 exact 地址，并把数字状态显示为对应档位。
控件命中的同一次 pointer/click 会被控件消费，不会继续触发 Splash primary action 或其它 preview host click 行为。

## 中心坐标与 per-mode 可见性

Scene Layout v8 继承 v7 的固定中心坐标。root `main` 保存 grid，每个 mode 显式保存 `main.enabled` 以及
landscape/portrait 的 main center、absolute focusRect 和可选 margin。Editor 以相对 main 四边的
`left/top/right/bottom` 外扩量编辑 focus（正数外扩、负数内缩），导入时从 absolute focusRect 反算，
导出时再派生 canonical absolute focusRect。背景没有专属类型、selector 或 readiness；零个、一个或
多个背景都作为普通 scene node 添加。

普通节点的 optional `scope` 精确声明 mode × orientation 可见性；字段缺失才表示所有 mode。Inspector
提供显式全局开关和 mode × orientation 矩阵。最终显示要求当前 mode/orientation 命中 scope（或节点为
global）且对应 orientation placement 存在。预览和 production runtime 按宿主原始页面宽高选择方向；
尺寸宽高相等时维持当前方向，首次以正方形启动时选择 landscape。

award-celebration Popup 作为自包含 dependency，通过 `rendercore/popup/editor` 完成 standalone ZIP 校验、flatten、namespace 与 vendor。任一受支持的 Popup v1–v9 都先按 source strict 校验，再由默认 loader 转成 latest v9；历史 Popup/Symbol cue 仍由共享 parser/runtime 兼容，但 Layout Editor 不改写 dependency，也不再 author 这些 owner-local 配置。画面和 Event 音频预览继续只走 Scene Layout production runtime/inspector。
三类 Popup 都可在 Popup 工作区设为“程序 Popup”。这只负责让没有 mode/transition 直接引用的 package 仍进入 production `popups`；已有直接引用的 Popup 本来就可从相同 canonical 地址打开。普通 Spine 仍可在具体转场中选择。Popup root 的 placement、order 与统一 open/close 预览由 Layout Editor 配置并随 layout vendor；一个 preview runtime 同时只允许一个 active Popup。
若 package 带单行 prompt，Popup 工作区可输入临时预览文案；留空使用 package 默认值。字体、渲染区域和 image/Spine/VNI overlay 保持只读，须回 Popup Editor 修改。相同字体 bytes 与其它 payload 一样在最终 `assets.map.json` 中按 SHA-256 物理去重。

SymbolsEditor ZIP 同样作为自包含、只读的 symbol 状态机 dependency；Symbols 与 Popup library 都允许导入多个不同 package id，同 id 再上传进入替换并保留现有 mode/transition binding。Layout Editor 只选择
package、reelSet、renderMode，并使用 rendercore 的公开 display/state capability 做校验和预览；
symbol 内部图片、Spine/VNI animation、state layer、value/ImgNumber 和 cascade 只能回
SymbolsEditor 编辑。

## 统一资源工作区

资源 Tab 和上下文 Picker 都调用同一个“导入资源”流程，支持多文件与 ZIP。image、audio、MP4、Spine、VNI runtime bundle、ImgNumber、Symbols 和 Popup 的所有 root/leaf 进入一个扁平 filename-key namespace；ZIP 内目录只用于识别 exact source closure，提交前会被结构化抹平。VNI bundle 只接受 `purpose=runtime` 发布包；只有一个 runtime 时自动选中，多个 runtime 必须明确选择 profile。

Assets 工具栏另有明确的“导入 JSON data”动作，可原子导入一个或多个顶层为 object/array 的 `.json` 文件。它们是 opaque、program-only assets：不会进入画布、背景或资源 Picker，也没有 preview 和渲染地址。只有设置唯一程序键后才进入 production ZIP，runtime 通过 `SceneLayoutPackageResource.loadJsonData(key)` 读取；取消绑定后，无其它引用的数据恢复为不导出。替换要求保持同一 filename key 并重新严格校验，导出、重导和 optimizer 都保留原始 JSON bytes，不扫描或改写其中看似资源路径的字符串。

MP3、OGG、WAV、M4A、AAC 和 WebM 音频先作为未绑定 asset 导入；扩展名、signature 和显式 MIME 必须一致，`.mp4` 固定保留给视频。项目页的“编辑音乐音效”是唯一音频行为 authoring 入口，只能把已导入 asset 绑定到 exact Event；Assets 中的音频也可独立绑定程序键强制导出，但这只提供 exact URL/mediaType，不会创建 scene node、播放行为或渲染地址。预览必须先点“启用声音”，随后 Event 播放只走同一个 production package runtime；preview 重建会把已解锁会话应用到新 runtime。打开含 mode BGM、root effect 的旧 Layout 时先完整 strict 校验，再移除旧配置和仅由其引用的 audio bytes，并显示迁移摘要。
Event 选择器会按当前 Symbols render mode 显示 ReelSpin、GridCell 与 CellSpin 的整体 started/ended、
单元 started/stopped 和 all-stopped；具体轴/cell、列、行和全体 wildcard 均来自 RenderCore shared catalog。
Spin event 默认创建为单次音效，仍可在同一配置中改为音乐或循环播放。

node/transition 直接引用 filename key 或 typed key 组合。node id、package id、mode id 仍是业务身份，但不是第二个资源 id。多个普通节点可引用同一 `BG.jpg`，覆盖一次即可更新全部 bytes，同时各自的稳定 node id、scope 与 placement 保持独立。

Scene node id只允许小写字母、数字和连字符，并禁止`layout/reel/transition/popup`四个RenderLayer保留名。导入旧Layout ZIP时，带点号/下划线和保留名的node会按稳定collision规则迁移，adaptation/mode/nodeStates引用同一事务改写，完成提示列出`old→new`；rendercore仍可直接运行未重导的旧v1包。游戏侧统一取层和坐标接口见[`docs/rendercore-layer-symbol-area-render-object-coordinate-guide.md`](../../docs/rendercore-layer-symbol-area-render-object-coordinate-guide.md)。

layout 大纲选中普通图层后，preview 使用红框和半透明红色斜线显示当前 orientation 中该节点的实时可见范围；斜线裁在渲染区域内，因此图层边界位于画布外时仍有选中提示。黄/绿 focus 与 reel guide 保持原语义。普通图层的每个 orientation placement 可编辑 `x/y/scale`、顺时针角度 `rotation` 和 `[0,1]` normalized `center`；默认 rotation 为 `0`、center 为 `0.5/0.5`，负角度与超过一圈的角度原样保存。Spine 的默认 center 对应 authored 原点。只修改 node/main placement 或 focus 时走 geometry 更新，复用已加载资源、Spine player、reel 和已抽样 symbols，不重新随机排列。

Popup root的`x/y/scale`与Spine transition placement同样走geometry更新；数字输入只在blur、Enter或spinner形成`change`后
提交，输入中的临时空串、负号或小数不会触发preview rebuild。预览分辨率、宽高和右下角拖拽只更新现有runtime viewport，拖拽
事件按animation frame合并；zoom只改变canvas display size。以上操作都保留当前mode、Popup/reel/player和已抽样Symbols。只有资源、
package/binding、transition kind等immutable structure变化才自动重建preview，不需要手动刷新。

普通图层的 `order` 可直接输入安全整数，不会因其它编辑被自动压缩重排；main reel 仍可使用默认 `999`，普通图层允许配置到其上方。node、main reel 与 Popup root 的 order 全局不得重复；Popup root 默认从 `2000` 分配且必须高于全部 node/main reel，其值可在 Popup 工作区或引用它的转场中修改。背景与其它普通节点使用同一大纲和 Inspector，只有 main reel 是特殊项。

普通图层默认勾选“所有状态有效”，对应 v7 `scope` 缺失。取消后先绑定当前编辑 mode 的已有 placements，随后可在 mode × orientation 矩阵中精确增删上下文；至少保留一个有效上下文，scope 不能引用缺失的 placement。当前编辑 mode 或预览方向下不可见的图层在大纲灰显但仍可选中，隐藏不会删除节点或改变全局 `order`。合法旧 layout 先由 RenderCore shared upgrader 把单 `gameMode` 和 per-mode background binding 转为 v7 scope，Editor draft 不保留旧 `gameMode` 双轨。

Editor draft 只保存中心 main 坐标和 focus 四边外扩量；legacy top-left/artSize 仅在 RenderCore upgrader 输入中存在，不进入 v7 preview 或导出。main reel 只提供横竖屏中心 `x/y`，不提供整体缩放；横竖屏适配通过各 mode 的 main/focus 与普通节点 placement 完成。

原始文件上传在任何资源解析前先整批校验 filename：只允许 ASCII 字母、数字、点、下划线和连字符，并统一转为小写。任一文件包含中文、空格、路径分隔符或其它非法字符，或多个文件小写化后重名，整批上传原子拒绝。普通资源合法同名不同 bytes 默认覆盖，引用不变；不建立 `dependencies/**` 目录。ImgNumber ZIP 以 manifest project id 为稳定前缀物化 root 与 glyph filename keys（例如 `digits.image-string.manifest.json`、`digits-0.png`），不同项目可在同一 workspace 并存，同 id 才进入替换流程。Symbols/Popup/Popup Object ZIP 同样先按 standalone schema 校验，再以 manifest id 或 object name 为稳定前缀物化 root/leaf filename keys；相同物理 bytes 最终仍由 `assets.map.json` 的 SHA-256 payload 去重。同 id/name 替换只覆盖该 owner 的独占 keys，并在提交后回收无其它 owner 引用的旧 keys。SymbolsEditor 已验证合法的 owner-owned filename key（包括大小写）在 Layout 导入、替换、导出和重导时原样保留；若与其它 owner 形成大小写 alias 则显式失败。完整 Editor ZIP 验证 map/hash/size 后，只迁移 Layout-owned 旧 logical filename key：先做 Unicode NFKC，ASCII 合法字符转小写，空白和 ASCII 标点转 `-`，非 ASCII 字符按 `u<Unicode 十六进制>` 展开，连续分隔符合并并清理首尾；扩展名同样小写且必须能归一为字母数字。归一后不同 bytes 重名时按稳定源路径顺序添加 `-2/-3`，相同 bytes 复用同一 key；layout 及已识别的 VNI、image-string、Popup JSON 引用同步结构化改写，业务 id 和 atlas page logical name 不变。Symbols/Popup/Popup Object dependency 只保存业务 identity、root key、closure keys 及各自需要的 placement；bytes 只存在全局 asset workspace。

Popup Object ZIP 从 Assets 上传入口导入后只加入对象库，不会自动绑定。项目 Tab 的“Tap info Popup Object”可显式选择一个对象或“未配置”；删除当前已绑定对象会失败，需先清空绑定。只有被选择对象进入导出闭包，重新导入导出 ZIP 会恢复该选择。绑定本身不会在默认黑色或 authored Splash 自动显示对象；需要从资源页将 `OBJ` 手动添加为图层，再在 Layout Inspector 配置中心坐标 placement、Popup 级 order，以及只命中 authored Splash 的 mode/orientation scope。默认黑色 Splash 不是可编辑 mode，不能承载手工图层。普通 Spine Popup 还需在自身 manifest 配置 exact Tap info 父节点，才会额外显示自己的 attached instance。

Popup Spine 的 atlas page logical name 不随物理 filename key 前缀化。导入提交前会用完整 SHA-256 比较 Popup 与 Layout 自有 Spine 中同名的 atlas/texture；同名不同 bytes 时列出冲突，由用户取消整次导入或确认继续隔离导入，不自动覆盖、改名或推断 skeleton JSON 兼容性。

资源列表可把任一已识别的 image、Spine、VNI、ImgNumber、MP4、audio 或 JSON data root 设为“程序资源”。程序键默认取 root filename 去扩展名并转小写；手工输入也会 trim 并转小写。最终键必须唯一，以字母或数字开头，且只允许字母、数字、点、下划线和连字符。该资源即使没有 Scene 引用也会写入 production ZIP。取消绑定后，若没有其它引用，它恢复为不会导出。程序键和 typed resource spec 保存在 `layout.manifest.json` 的 `runtimeResources`，ZIP 重新导入或图片/音频优化后仍保持不变。展开已绑定渲染资源的详情可复制 canonical 地址；ImgNumber 例如 `gamelayout:/resource/image-string/win-amount`。JSON data 只显示 `loadJsonData` API 提示；audio 程序键同时派生 `gamelayout:/audio/effect/<key>`，可用 `playEffect(key)` 默认单次播放，或传 loop、结束 Event，并由返回 handle 停止。同一 audio root 可同时由 Event binding 和一个程序键引用，但 Editor 不保存第二份 loop/Event 程序配置。

手工验收例子：导入一个 ImgNumber ZIP，在资源行填写 `win-amount` 并点“设为程序资源”，展开详情复制 factory 地址；再导入一个未绑定 mode/transition 的 Popup ZIP，在 Popup 工作区点“设为程序 Popup”，复制 `gamelayout:/popup/<id>`，点播放后状态区应显示该 exact 地址。Popup active 时再次播放应明确报错，点“立即关闭”后应可用同一地址再次播放。导出并重导 ZIP 后，两项程序用途和地址应保持。

Spine atlas 的 page 是 atlas 内部逻辑名，texture map 的 value 才是全局 filename key。导入时若旧素材名为 `BG.png`、实际字节为 WebP，atlas 仍保留 `BG.png` page，物理 key 规范化为 `BG.webp`，并由 texture map 精确关联；不会伪造 MIME 或改写 atlas 逻辑页。Spine 背景还必须在 Picker 明确填写完整 `art size`，不能从 skeleton export bounds 或 atlas texture 尺寸推导；例如 game002-s3 使用 `2000 × 2000`，初始 placement 为 `(1000, 1000, 1)`。

一次可上传多个 skeleton JSON，并让它们共享同一份 atlas 与贴图；每个 JSON 会生成独立 Spine 根资源，根资源单向引用共享叶子。整批导入先完整校验再原子提交：任何 JSON、atlas page 或贴图映射失败时都不会留下半批资源。删除或导出单个根资源时只按实际根引用计算闭包，不会反向带上同批但未使用的 sibling JSON。

资源 Picker 的右侧按类型显示预览：图片直接显示，Spine 未选 animation 时显示贴图总览、选中 animation 后播放真实 Spine，VNI 播放真实 timeline，ImgNumber 显示 glyph 总览。预览只使用当前 project bytes，并在切换、关闭或销毁 Picker 时释放 player、ticker 和 Object URL；动画预览 renderer 在 editor app 生命周期内单例复用，只在 app destroy 时释放，避免关闭 Picker 干扰主布局 renderer。预览失败会明确提示且不修改 draft。

普通 Spine 图层必须精确选择一个 animation，并可独立设置是否循环。新建图层时，Spine 的骨架原点默认放在各 variant 的画布中心；它不要求填写或从 skeleton bounds 推导尺寸，左上角坐标项目写入 `artSize / 2`，中心坐标项目写入 `(0, 0)`。普通 VNI 图层播放完整 timeline，也可独立设置是否循环；每个 node 创建独立 player，复用同一资源不会共享播放头。两类动画都复用普通图层的 order、横竖屏可见性和逐 variant node transform。方向可见性关闭时，当前编辑会话会保留完整 `x/y/scale/rotation/center`，并在重新开启时恢复；隐藏值不进入 production ZIP，重新导入后不可恢复。VNI 不允许充当背景或 mode transition。

替换资源或为现有图层重新绑定资源时，编辑器保留稳定 node id、顺序、横竖屏 placement 与可见性；Spine animation、loop、VNI loop 和 ImgNumber 文本/锚点只在新资源仍兼容时保留，否则要求显式修正。图片或背景素材尺寸变化只更新资源尺寸，不自动重置 reel、focus 或已经编辑的 placement；如果旧几何在新尺寸下不再合法，严格校验会阻止提交并指出问题。

## 主状态与转场

新增 mode 的每个 active variant 背景保持未绑定，必须逐 variant 选择。稳定 Spine 背景只使用显式 single loop；相同资源跨 mode 仍保留独立 node/player/placement，切 mode 不释放重建。

默认开启“跟随编辑状态”时，切换编辑状态会让右侧画布直接选择同一稳定状态，不要求存在转场也不播放 overlay；这是仅供 authoring preview 使用的入口。转场工作区仍通过 production 有向边准备和播放真实转场，两条路径不会互相替代。

转场是显式有向边，只自动准备当前 stable source 到所选 target 的直接边；缺边不瞬切、不反向复用、不寻路。Spine overlay 使用 exact animation/event occurrence；MP4 使用 viewport-space video blackout、真实 media-time fadeStart、trusted-click 调用栈内同步 audible `play()`。两者共享单一状态切换动作、预准备、原子切换与 rollback，保持 Task 116 合同。

转场 Promise 完成后，编辑器还会核对 preview 已稳定显示目标状态；开启“跟随编辑状态”时，主状态 Inspector 与 preview selector 一起同步到该目标。settled snapshot 不一致会明确报错，不显示虚假的完成状态。

每次 stable 状态或 preview 目标变化后，编辑器会按 runtime 的 settled source 重新选择精确的 `source → target` 有向边并准备它。因此 BG → FG 完成后可直接选择 BG 并准备 FG → BG，不需要通过切换分辨率重建 preview。

## Production ZIP

`<project-id>-layout.zip` 只包含：

- 根 `layout.manifest.json`；
- 根 `assets.map.json`；
- 一个 `assets/<完整 SHA-256>.<ext>` payload 区。

layout、audio、VNI、image-string、Symbols、Popup 和程序资源的全部配置引用均为 filename keys；production export 只写传递可达 exact closure，不写 nested dependency 目录或 unused key。只有被 Event audio binding 引用的 root audio asset 才写入 ZIP；canonical v8 固定写空 `audio.music/effects/programmaticEffects`、mode 不写 `bgm`、`eventAudio.ignoreLegacyAudio=true`，并无损保留 exact Event binding/address。项目 Tab 的“编辑音乐音效”复用 EditorCore event dialog，只选择 Assets 中已上传的 audio；loop 的结束 event 通过 EditorCore 单 Event picker 选择，并且必须与启动 event 不同。Spine 只要某个 JSON 根被 Scene 或程序键引用，就导出该根及其 atlas/贴图闭包；共享 leaf 只写一份，同批未引用的 sibling JSON 不导出。VNI project 只结构化改写 schema 声明的 asset path。重新导入、Blob preview、package resource 与 CDN URL loader 共享 rendercore map resolver。无 map 的合法 legacy package 继续按 direct-path 合同加载；Editor 导入后升级为新格式。

每个 mode 可独立选择 Symbols 与 award-celebration Popup。每条有向转场显式选择无效果、Spine 顶层特效或黑场视频，并可独立选择“无”或一个普通 Spine `preludePopup`；切换效果类型会保留 Popup binding。未选 Popup 时直接执行效果，无效果分支在目标 scene prepare 成功后原子切换；已选时保持 source mode，复用 Popup 的 start→loop→end 状态机，完整 end 后再继续效果。preview 将完整 canvas 与 window keyboard 绑定到 rendercore：active Popup 可在 canvas 任意位置点击或按任意非 repeat 键，idle 时输入透传。带 Popup 的视频随后进入等待阶段，必须由第二次真实 pointer/key 启动有声媒体。Popup 直接渲染在当前状态的顶层 Popup root，不建立独立 scene。

物理 payload 始终可以是 `assets/<SHA-256>.*`，但它只用于内容寻址；重新导入后的图层名称继续来自 `SceneLayoutNode.id`，资源列表继续显示 logical filename key。

运行：`pnpm --filter gamelayouteditor dev`
