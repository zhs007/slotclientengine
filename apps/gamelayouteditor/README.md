# Game Layout Editor

纯前端 Scene Layout v5 编辑器，覆盖 layout、mode/variant、optional loop BGM、全局 event 音乐音效、程序音效、稳定背景、普通 VNI/Spine 动画图层、Symbols、award-celebration/普通 Spine/single-state Popup 与 Spine/MP4 有向转场。合法 v1–v4 ZIP 会在打开事务中自动升级；后续预览和导出只生成 v5。

## Splash-first 与 per-mode 适配

新建项目会分别要求为 Splash 和 BaseGame 选择 `maximized-focus`（单背景）或
`orientation-focus`（横竖双背景），未选择时不能创建。Splash 是 initial mode，带一条显式
Splash → BaseGame none transition 和 primary click action；可在转场工作区把该边改为 Spine 或
MP4。实际 preview 必须点击 Splash 才进入 BaseGame。状态管理器新增 mode 时也必须先选择该
mode 的适配类型，不继承当前 mode。

状态管理器也保存每个 mode 的“启用主转轮区域”开关。新建 Splash 默认关闭、BaseGame 与后续
mode 默认开启；关闭的 mode 不显示 reel guide、不能绑定 Symbols，focus 四边相对 art 配置。
开启的 mode 继续以 main reel 为基准配置 focus 外扩。已有 Symbols 时必须先解绑才能关闭。

适配、focus、背景和 main reel placement 都属于各自 mode。单背景 mode 只有 default focus，
双背景 mode 的 landscape/portrait 各有独立 focus。预览尺寸宽高相等时维持当前方向；首次以
正方形启动时选择 landscape。

award-celebration Popup 作为自包含 dependency，通过 `rendercore/popup/editor` 完成 standalone ZIP 校验、flatten、namespace 与 vendor。任一受支持的 Popup v1–v8 都先按 source strict 校验，再由默认 loader 转成 latest v8；Popup/Symbol 音效保持 local name，直到 Scene Layout 按 binding id 聚合为全局 route。画面和音频预览继续只走 Scene Layout production runtime/inspector。
三类 Popup 都可在 Popup 工作区设为“程序 Popup”。这只负责让没有 mode/transition 直接引用的 package 仍进入 production `popups`；已有直接引用的 Popup 本来就可从相同 canonical 地址打开。普通 Spine 仍可在具体转场中选择。Popup root 的 placement、order 与统一 open/close 预览由 Layout Editor 配置并随 layout vendor；一个 preview runtime 同时只允许一个 active Popup。
若 package 带单行 prompt，Popup 工作区可输入临时预览文案；留空使用 package 默认值。字体、渲染区域和 image/Spine/VNI overlay 保持只读，须回 Popup Editor 修改。相同字体 bytes 与其它 payload 一样在最终 `assets.map.json` 中按 SHA-256 物理去重。

SymbolsEditor ZIP 同样作为自包含、只读的 symbol 状态机 dependency；Symbols 与 Popup library 都允许导入多个不同 package id，同 id 再上传进入替换并保留现有 mode/transition binding。Layout Editor 只选择
package、reelSet、renderMode，并使用 rendercore 的公开 display/state capability 做校验和预览；
symbol 内部图片、Spine/VNI animation、state layer、value/ImgNumber 和 cascade 只能回
SymbolsEditor 编辑。

## 统一资源工作区

资源 Tab 和上下文 Picker 都调用同一个“导入资源”流程，支持多文件与 ZIP。image、audio、MP4、Spine、VNI runtime bundle、ImgNumber、Symbols 和 Popup 的所有 root/leaf 进入一个扁平 filename-key namespace；ZIP 内目录只用于识别 exact source closure，提交前会被结构化抹平。VNI bundle 只接受 `purpose=runtime` 发布包；只有一个 runtime 时自动选中，多个 runtime 必须明确选择 profile。

MP3、OGG、WAV、M4A、AAC 和 WebM 音频先作为未绑定 asset 导入；扩展名、signature 和显式 MIME 必须一致，`.mp4` 固定保留给视频。当前 mode 的 BGM 在 Layout inspector 选择，新绑定恒为 loop，可编辑 fade in/out；程序音效在 audio asset 行以 strict local name 显式登记。音频不会创建 scene node，也不使用通用 `runtimeResources` 程序键。预览必须先点“启用声音”，随后 initial/authoring/production mode 切换与 effect 试听都走同一个 production package runtime；preview 重建会把已解锁会话应用到新 runtime。

node/background/transition 直接引用 filename key 或 typed key 组合。node id、package id、mode id 仍是业务身份，但不是第二个资源 id。多个 mode/variant 可引用同一 `BG.jpg`，覆盖一次即可更新全部 bytes，同时各自的稳定 node id 与 placement 保持独立。

Scene node id只允许小写字母、数字和连字符，并禁止`layout/reel/transition/popup`四个RenderLayer保留名。导入旧Layout ZIP时，带点号/下划线和保留名的node会按稳定collision规则迁移，adaptation/mode/nodeStates引用同一事务改写，完成提示列出`old→new`；rendercore仍可直接运行未重导的旧v1包。游戏侧统一取层和坐标接口见[`docs/rendercore-layer-symbol-area-render-object-coordinate-guide.md`](../../docs/rendercore-layer-symbol-area-render-object-coordinate-guide.md)。

layout 大纲选中普通图层后，preview 使用红框和半透明红色斜线显示当前 variant 中该节点的实时可见范围；斜线裁在渲染区域内，因此图层边界位于画布外时仍有选中提示。黄/绿 focus 与 reel guide 保持原语义。普通图层与背景的每个 variant placement 可编辑 `x/y/scale`、顺时针角度 `rotation` 和 `[0,1]` normalized `center`；默认 rotation 为 `0`、center 为 `0.5/0.5`，负角度与超过一圈的角度原样保存。Spine 的默认 center 对应 authored 原点。只修改 node/reel placement、focus、art size或坐标类型时走 geometry 更新，复用已加载资源、Spine player、reel 和已抽样 symbols，不重新随机排列。

普通图层的 `order` 可直接输入安全整数，不会因其它编辑被自动压缩重排；main reel 仍可使用默认 `999`，普通图层允许配置到其上方。node、main reel 与 Popup root 的 order 全局不得重复；Popup root 默认从 `2000` 分配且必须高于全部 node/main reel，其值可在 Popup 工作区或引用它的转场中修改。背景和 main reel 继续作为大纲中的特殊项展示。

普通图层默认勾选“所有状态有效”；取消后必须且只能绑定一个大小写精确的主状态。状态范围位于横屏/竖屏可见性外层，实际显示要求状态匹配且当前 variant 存在 placement。当前编辑状态或预览方向下不可见的图层在大纲灰显但仍可选中，隐藏不会删除节点或改变全局 `order`。旧 layout 缺少 node `gameMode` 时继续按全局图层读取和导出。

项目 Tab 可在“左上角”和“中心”全局坐标间切换。切换会在一次事务中转换普通图层、背景、main reel 和 art-space Spine transition 的现有 placement，视觉位置保持不变；popup 与 video 不参与转换。旧包缺少坐标字段时按左上角读取。

main reel 只提供横竖屏 `x/y` placement，不提供整体缩放。双背景适配通过美术调整背景素材宽度、art size 和 reel 位置完成，避免横竖屏分别缩放转轮造成额外布局差异。

原始文件上传在任何资源解析前先整批校验 filename：只允许 ASCII 字母、数字、点、下划线和连字符，并统一转为小写。任一文件包含中文、空格、路径分隔符或其它非法字符，或多个文件小写化后重名，整批上传原子拒绝。普通资源合法同名不同 bytes 默认覆盖，引用不变；不建立 `dependencies/**` 目录。Symbols/Popup ZIP 先按 standalone schema 校验，再以 manifest id 为稳定前缀物化 root/leaf filename keys，使多个包在同一扁平 workspace 并存；相同物理 bytes 最终仍由 `assets.map.json` 的 SHA-256 payload 去重。同 id 替换只覆盖该 owner 的独占 keys，并在提交后回收无其它 owner 引用的旧 keys。SymbolsEditor 已验证合法的 owner-owned filename key（包括大小写）在 Layout 导入、替换、导出和重导时原样保留；若与其它 owner 形成大小写 alias 则显式失败。完整 Editor ZIP 验证 map/hash/size 后，只迁移 Layout-owned 旧 logical filename key：先做 Unicode NFKC，ASCII 合法字符转小写，空白和 ASCII 标点转 `-`，非 ASCII 字符按 `u<Unicode 十六进制>` 展开，连续分隔符合并并清理首尾；扩展名同样小写且必须能归一为字母数字。归一后不同 bytes 重名时按稳定源路径顺序添加 `-2/-3`，相同 bytes 复用同一 key；layout 及已识别的 VNI、image-string、Popup JSON 引用同步结构化改写，业务 id 和 atlas page logical name 不变。Symbols/Popup dependency 只保存业务 package id、root key、closure keys 与 placement；bytes 只存在全局 asset workspace。

Popup Spine 的 atlas page logical name 不随物理 filename key 前缀化。导入提交前会用完整 SHA-256 比较 Popup 与 Layout 自有 Spine 中同名的 atlas/texture；同名不同 bytes 时列出冲突，由用户取消整次导入或确认继续隔离导入，不自动覆盖、改名或推断 skeleton JSON 兼容性。

资源列表可把任一已识别的 image、Spine、VNI、ImgNumber 或 MP4 root 设为“程序资源”。程序键默认取 root filename 去扩展名并转小写；手工输入也会 trim 并转小写。最终键必须唯一，以字母或数字开头，且只允许字母、数字、点、下划线和连字符。该资源即使没有 Scene 引用也会写入 production ZIP。取消绑定后，若没有其它引用，它恢复为不会导出。程序键和 typed resource spec 保存在 `layout.manifest.json` 的 `runtimeResources`，ZIP 重新导入或图片优化后仍保持不变。展开已绑定资源的详情可复制 canonical 地址；ImgNumber 例如 `gamelayout:/resource/image-string/win-amount`。Audio 使用上一段的 `audio.effects` / `programmaticEffects` typed binding，不进入这套通用程序资源 union。

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

layout、audio、VNI、image-string、Symbols、Popup 和程序资源的全部配置引用均为 filename keys；production export 只写传递可达 exact closure，不写 nested dependency 目录或 unused key。只有被 mode BGM、程序音效或 event audio binding 引用的 root audio asset 才写入 ZIP；重新导入会恢复 audio resource、exact binding、event 地址与旧音频忽略开关。项目 Tab 的“编辑音乐音效”复用 EditorCore event dialog，只选择 Assets 中已上传的 audio；loop 必须配置不同的结束 event。Spine 只要某个 JSON 根被 Scene 或程序键引用，就导出该根及其 atlas/贴图闭包；共享 leaf 只写一份，同批未引用的 sibling JSON 不导出。VNI project 只结构化改写 schema 声明的 asset path。重新导入、Blob preview、package resource 与 CDN URL loader 共享 rendercore map resolver。无 map 的合法 legacy package 继续按 direct-path 合同加载；Editor 导入后升级为新格式。

每个 mode 可独立选择 Symbols 与 award-celebration Popup。每条有向转场显式选择无效果、Spine 顶层特效或黑场视频，并可独立选择“无”或一个普通 Spine `preludePopup`；切换效果类型会保留 Popup binding。未选 Popup 时直接执行效果，无效果分支在目标 scene prepare 成功后原子切换；已选时保持 source mode，复用 Popup 的 start→loop→end 状态机，完整 end 后再继续效果。preview 将完整 canvas 与 window keyboard 绑定到 rendercore：active Popup 可在 canvas 任意位置点击或按任意非 repeat 键，idle 时输入透传。带 Popup 的视频随后进入等待阶段，必须由第二次真实 pointer/key 启动有声媒体。Popup 直接渲染在当前状态的顶层 Popup root，不建立独立 scene。

物理 payload 始终可以是 `assets/<SHA-256>.*`，但它只用于内容寻址；重新导入后的图层名称继续来自 `SceneLayoutNode.id`，资源列表继续显示 logical filename key。

运行：`pnpm --filter gamelayouteditor dev`
