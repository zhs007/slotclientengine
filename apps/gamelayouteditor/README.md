# Game Layout Editor

纯前端 Scene Layout v1 编辑器，覆盖 layout、mode/variant、稳定背景、普通 VNI/Spine 动画图层、Symbols、award-celebration Popup 与 Spine/MP4 有向转场。

## 统一资源工作区

资源 Tab 和上下文 Picker 都调用同一个“导入资源”流程，支持多文件与 ZIP。image、MP4、Spine、VNI runtime bundle、ImgNumber、Symbols 和 Popup 的所有 root/leaf 进入一个扁平 filename-key namespace；ZIP 内目录只用于识别 exact source closure，提交前会被结构化抹平。VNI bundle 只接受 `purpose=runtime` 发布包；只有一个 runtime 时自动选中，多个 runtime 必须明确选择 profile。

node/background/transition 直接引用 filename key 或 typed key 组合。node id、package id、mode id 仍是业务身份，但不是第二个资源 id。多个 mode/variant 可引用同一 `BG.jpg`，覆盖一次即可更新全部 bytes，同时各自的稳定 node id 与 placement 保持独立。

layout 大纲选中普通图层后，preview 使用红框和半透明红色斜线显示当前 variant 中该节点的实时可见范围；斜线裁在渲染区域内，因此图层边界位于画布外时仍有选中提示。黄/绿 focus 与 reel guide 保持原语义。只修改 node/reel placement、focus、art size或坐标类型时走 geometry 更新，复用已加载资源、Spine player、reel 和已抽样 symbols，不重新随机排列。

项目 Tab 可在“左上角”和“中心”全局坐标间切换。切换会在一次事务中转换普通图层、背景、main reel 和 art-space Spine transition 的现有 placement，视觉位置保持不变；popup 与 video 不参与转换。旧包缺少坐标字段时按左上角读取。

main reel 只提供横竖屏 `x/y` placement，不提供整体缩放。双背景适配通过美术调整背景素材宽度、art size 和 reel 位置完成，避免横竖屏分别缩放转轮造成额外布局差异。

同名不同 bytes 默认覆盖，引用不变；冲突只能覆盖、取消或显式改名，不 lowercase、不生成 `-2/-3`、不建立 `dependencies/**` namespace。Symbols/Popup dependency 只保存业务 package id、root key、closure keys 与 placement；bytes 只存在全局 asset workspace。

Spine atlas 的 page 是 atlas 内部逻辑名，texture map 的 value 才是全局 filename key。导入时若旧素材名为 `BG.png`、实际字节为 WebP，atlas 仍保留 `BG.png` page，物理 key 规范化为 `BG.webp`，并由 texture map 精确关联；不会伪造 MIME 或改写 atlas 逻辑页。Spine 背景还必须在 Picker 明确填写完整 `art size`，不能从 skeleton export bounds 或 atlas texture 尺寸推导；例如 game002-s3 使用 `2000 × 2000`，初始 placement 为 `(1000, 1000, 1)`。

一次可上传多个 skeleton JSON，并让它们共享同一份 atlas 与贴图；每个 JSON 会生成独立 Spine 根资源，根资源单向引用共享叶子。整批导入先完整校验再原子提交：任何 JSON、atlas page 或贴图映射失败时都不会留下半批资源。删除或导出单个根资源时只按实际根引用计算闭包，不会反向带上同批但未使用的 sibling JSON。

资源 Picker 的右侧按类型显示预览：图片直接显示，Spine 未选 animation 时显示贴图总览、选中 animation 后播放真实 Spine，VNI 播放真实 timeline，ImgNumber 显示 glyph 总览。预览只使用当前 project bytes，并在切换、关闭或销毁 Picker 时释放 player、ticker 和 Object URL；动画预览 renderer 在 editor app 生命周期内单例复用，只在 app destroy 时释放，避免关闭 Picker 干扰主布局 renderer。预览失败会明确提示且不修改 draft。

普通 Spine 图层必须精确选择一个 animation，并可独立设置是否循环。新建图层时，Spine 的骨架原点默认放在各 variant 的画布中心；它不要求填写或从 skeleton bounds 推导尺寸，左上角坐标项目写入 `artSize / 2`，中心坐标项目写入 `(0, 0)`。普通 VNI 图层播放完整 timeline，也可独立设置是否循环；每个 node 创建独立 player，复用同一资源不会共享播放头。两类动画都复用普通图层的 order、横竖屏可见性和逐 variant `x/y/scale`。方向可见性关闭时，当前编辑会话会保留该方向的 placement，并在重新开启时恢复；隐藏值不进入 production ZIP，重新导入后不可恢复。VNI 不允许充当背景或 mode transition。

替换资源或为现有图层重新绑定资源时，编辑器保留稳定 node id、顺序、横竖屏 placement 与可见性；Spine animation、loop、VNI loop 和 ImgNumber 文本/锚点只在新资源仍兼容时保留，否则要求显式修正。图片或背景素材尺寸变化只更新资源尺寸，不自动重置 reel、focus 或已经编辑的 placement；如果旧几何在新尺寸下不再合法，严格校验会阻止提交并指出问题。

## 主状态与转场

新增 mode 的每个 active variant 背景保持未绑定，必须逐 variant 选择。稳定 Spine 背景只使用显式 single loop；相同资源跨 mode 仍保留独立 node/player/placement，切 mode 不释放重建。

转场是显式有向边，只自动准备当前 stable source 到所选 target 的直接边；缺边不瞬切、不反向复用、不寻路。Spine overlay 使用 exact animation/event occurrence；MP4 使用 viewport-space video blackout、真实 media-time fadeStart、trusted-click 调用栈内同步 audible `play()`。两者共享单一状态切换动作、预准备、原子切换与 rollback，保持 Task 116 合同。

转场 Promise 完成后，编辑器还会核对 preview 已稳定显示目标状态；开启“跟随编辑状态”时，主状态 Inspector 与 preview selector 一起同步到该目标。settled snapshot 不一致会明确报错，不显示虚假的完成状态。

## Production ZIP

`<project-id>-layout.zip` 只包含：

- 根 `layout.manifest.json`；
- 根 `assets.map.json`；
- 一个 `assets/<完整 SHA-256>.<ext>` payload 区。

layout、VNI、image-string、Symbols 和 Popup 的全部配置引用均为 filename keys；production export 只写传递可达 exact closure，不写 nested dependency 目录或 unused key。Spine 只要某个 JSON 根被引用，就导出该根及其 atlas/贴图闭包；同批未引用的 sibling JSON 不导出。VNI project 只结构化改写 schema 声明的 asset path。重新导入、Blob preview、package resource 与 CDN URL loader 共享 rendercore map resolver。无 map 的合法 legacy package 继续按 direct-path 合同加载；Editor 导入后升级为新格式。

物理 payload 始终可以是 `assets/<SHA-256>.*`，但它只用于内容寻址；重新导入后的图层名称继续来自 `SceneLayoutNode.id`，资源列表继续显示 logical filename key。

运行：`pnpm --filter gamelayouteditor dev`
