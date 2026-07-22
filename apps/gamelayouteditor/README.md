# Game Layout Editor

纯前端 Scene Layout v1 编辑器，覆盖 layout、mode/variant、稳定背景、Symbols、award-celebration Popup 与 Spine/MP4 有向转场。

## 统一资源工作区

资源 Tab 和上下文 Picker 都调用同一个“导入资源”流程，支持多文件与 ZIP。image、MP4、Spine、ImgNumber、Symbols 和 Popup 的所有 root/leaf 进入一个扁平 filename-key namespace；ZIP 内目录只用于识别 exact source closure，提交前会被结构化抹平。

node/background/transition 直接引用 filename key 或 typed key 组合。node id、package id、mode id 仍是业务身份，但不是第二个资源 id。多个 mode/variant 可引用同一 `BG.jpg`，覆盖一次即可更新全部 bytes，同时各自的稳定 node id 与 placement 保持独立。

同名不同 bytes 默认覆盖，引用不变；冲突只能覆盖、取消或显式改名，不 lowercase、不生成 `-2/-3`、不建立 `dependencies/**` namespace。Symbols/Popup dependency 只保存业务 package id、root key、closure keys 与 placement；bytes 只存在全局 asset workspace。

Spine atlas 的 page 是 atlas 内部逻辑名，texture map 的 value 才是全局 filename key。导入时若旧素材名为 `BG.png`、实际字节为 WebP，atlas 仍保留 `BG.png` page，物理 key 规范化为 `BG.webp`，并由 texture map 精确关联；不会伪造 MIME 或改写 atlas 逻辑页。Spine 背景还必须在 Picker 明确填写完整 `art size`，不能从 skeleton export bounds 或 atlas texture 尺寸推导；例如 game002-s3 使用 `2000 × 2000`，初始 placement 为 `(1000, 1000, 1)`。

## 主状态与转场

新增 mode 的每个 active variant 背景保持未绑定，必须逐 variant 选择。稳定 Spine 背景只使用显式 single loop；相同资源跨 mode 仍保留独立 node/player/placement，切 mode 不释放重建。

转场是显式有向边，只自动准备当前 stable source 到所选 target 的直接边；缺边不瞬切、不反向复用、不寻路。Spine overlay 使用 exact animation/event occurrence；MP4 使用 viewport-space video blackout、真实 media-time fadeStart、trusted-click 调用栈内同步 audible `play()`。两者共享单一状态切换动作、预准备、原子切换与 rollback，保持 Task 116 合同。

## Production ZIP

`<project-id>-layout.zip` 只包含：

- 根 `layout.manifest.json`；
- 根 `assets.map.json`；
- 一个 `assets/<完整 SHA-256>.<ext>` payload 区。

layout、image-string、Symbols 和 Popup 的全部配置引用均为 filename keys；production export 只写传递可达 exact closure，不写 nested dependency 目录或 unused key。重新导入、Blob preview、package resource 与 CDN URL loader 共享 rendercore map resolver。无 map 的合法 legacy package 继续按 direct-path 合同加载；Editor 导入后升级为新格式。

运行：`pnpm --filter gamelayouteditor dev`
