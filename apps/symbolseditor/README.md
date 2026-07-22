# Symbols Editor

纯前端、resource-library-first 的 strict symbols package v1 编辑器。

资源工作区只有一个支持多文件和 ZIP 的“导入资源”入口。image、Spine、VNI、standalone ImgNumber ZIP 与已有 Symbols ZIP 都进入同一扁平 filename-key namespace；Picker 只提交明确的 filename key/typed descriptor，不从 symbol code 或文件名猜绑定。

symbol code、state、lifecycle、scale、renderPriority、value/cascade 配置仍是业务身份。image state 引用图片 key；Spine 引用 skeleton/atlas/page keys；VNI 引用 project key；image-string dependency 只记录 root key、manifest 与 closure keys，真实 bytes 只存在全局 asset library。

同一导入批次允许多份 Spine skeleton 共用唯一一份 atlas 及其单页 texture；各 skeleton 仍作为独立资源供 state/value tier 显式选择。缺 skeleton、缺 atlas、多 atlas 或 atlas page 不唯一时继续拒绝整批导入。

同名覆盖保持所有 state/value/node 引用；缺 animation、slot、glyph 或 closure 时整批回滚。大小写合法文件名原样保留，不生成 logical id、目录前缀或自动后缀。unused key 可留在 draft，但不会进入 production closure。

导出 ZIP 的 symbol manifest 与所有嵌套 VNI/Spine/image-string 引用均为 filename keys；根 `assets.map.json` 将它们映射到 `assets/<完整 SHA-256>.<ext>`。合法 legacy direct-path package 可导入并结构化升级，新导出不含 nested dependency 资源目录。

预览继续由 rendercore/Pixi/VNI/official Spine owner 驱动，不复制 player、slot 或 state-machine 算法。

运行：`pnpm --filter symbolseditor dev`
