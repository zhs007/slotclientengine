# Symbols Editor

纯前端、resource-library-first 的 strict symbols package v1 编辑器。

资源工作区只有一个支持多文件和 ZIP 的“导入资源”入口。image、Spine、VNI、standalone ImgNumber ZIP 与已有 Symbols ZIP 都进入同一扁平 filename-key namespace；Picker 只提交明确的 filename key/typed descriptor，不从 symbol code 或文件名猜绑定。

symbol code、state、lifecycle、scale、renderPriority、value/cascade 配置仍是业务身份。image state 引用图片 key；Spine 引用 skeleton/atlas/page keys；VNI 引用 project key；image-string dependency 只记录 root key、manifest 与 closure keys，真实 bytes 只存在全局 asset library。

任意非 value-managed state 可选择多图层动画：base 明确沿用 normal 或使用当前 state 图片，附加层按稳定列表顺序逐项选择 `underlay | overlay` 以及 Spine/VNI 资源与播放参数。层 id 必须唯一且为 lowercase kebab-case；至少保留一层。导入、预览、导出与资源覆盖都按 exact layer binding 处理，不按文件名猜层，也不把多层静默降级成单层。

同一导入批次允许多份 Spine skeleton 共用唯一一份 atlas 及其单页 texture；各 skeleton 仍作为独立资源供 state/value tier 显式选择。缺 skeleton、缺 atlas、多 atlas 或 atlas page 不唯一时继续拒绝整批导入。

value-presentation 的编辑顺序固定为“档位 → 状态”：每档只选择 Spine skeleton/atlas/texture 和阈值；normal、win、remove 等动画在状态页选择一次，并要求所有档位存在同名动画。`spinBlur`、`disabled` 等静态 reel state 独立选择图片。ImgNumber 在编辑器中只有一个共享 dependency/slot/transform 节点，固定按动态可视内容中心对齐；稳定 production manifest 仍会把这份配置精确物化到每个 tier binding。

当单个 symbol 的 normal 是已绑定且有效的 direct image 时，normal 状态页提供两个互不
联动的纯前端操作：“生成模糊图”只生成/绑定 `spinBlur`，“生成 disable 图”只生成/
绑定 `disabled`。图片在浏览器本地 decode、调用 rendercore versioned preset 处理并
编码为 PNG，不上传服务器，也不遍历其它 symbols。两个目标 state 也可通过 Picker
“上传并使用”自制单图；生成和手传都进入相同 filename-key review，按每个 state 最后
一次成功提交生效。toolbar 和其它 Picker 上传仍只入库，不自动猜 binding。

单文件、多文件和通用资源 ZIP 使用同一导入事务；ZIP 内路径在 review 前扁平为原始 basename。同名不同 bytes 必须先 review：可以逐项或批量覆盖，也可以显式保留两份。覆盖保持所有 state/value/node 引用；保留两份在扩展名前使用最小可用 `-1`、`-2` suffix，且普通新资源不会自动绑定；用户从目标 state 执行“上传并使用”时，review 成功后的 resolved key 会显式绑定回该 state。唯一例外是被覆盖的有效 Spine skeleton 不再包含已选动画：编辑器只清空受影响的 exact `animationName`（包括 composite 的 exact leaf），并提示用户重新选择；tiered Spine 的共享 normal/activeSpine 动画按全部档位交集一起处理。slot、glyph、atlas page、closure 或其它不兼容仍整批回滚。大小写合法文件名原样保留，不生成 logical id、目录前缀或静默后缀。unused key 可留在 draft，但不会进入 production closure。

包含 `symbols.package.json` 的 ZIP 是完整 Symbols project，只能单独打开，并在确认后原子替换当前项目；它不会作为普通素材合并。导入和预览分别显示进度与错误，project 已加载但 Pixi/Spine/VNI preview 初始化失败时保留可编辑配置并提供重试，不用空预览掩盖异常。

导出 ZIP 的 symbol manifest 与所有嵌套 VNI/Spine/image-string 引用均为 filename keys；根 `assets.map.json` 将它们映射到 `assets/<完整 SHA-256>.<ext>`。合法 legacy direct-path package 可导入并结构化升级，新导出不含 nested dependency 资源目录。

预览继续由 rendercore/Pixi/VNI/official Spine owner 驱动，不复制 player、slot 或 state-machine 算法。

运行：`pnpm --filter symbolseditor dev`
