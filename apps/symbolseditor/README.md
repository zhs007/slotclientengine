# Symbols Editor

纯前端、resource-library-first 的 strict Symbols package 编辑器。外层 `symbols.package.json` 保持 v1，内层 symbol-state-textures manifest 导出为 v2。

资源工作区只有一个支持多文件和 ZIP 的“导入资源”入口。image、Spine、VNI、standalone ImgNumber ZIP 与已有 Symbols ZIP 都进入同一扁平 filename-key namespace；Picker 只提交明确的 filename key/typed descriptor，不从 symbol code 或文件名猜绑定。

symbol code、state、lifecycle、scale、renderPriority、value/cascade 配置仍是业务身份。image state 引用图片 key；Spine 引用 skeleton/atlas/page keys；VNI 引用 project key；image-string dependency 只记录 root key、manifest 与 closure keys，真实 bytes 只存在全局 asset library。

项目状态定义为每个 once state 显式编辑 `afterComplete`：`return-to-default` 完成后回 normal/default，`terminal` 保持终态；stable state 不显示该字段。打开旧 v1 ZIP 时统一由 rendercore upgrader 填充 exact remove=`terminal`、其它 once=`return-to-default`，新导出只写完整 `settings.stateDefinitions` v2。预览与 Replay 直接消费该配置，不按 remove 名称分支。

任意非 value-managed state 都直接提供“增加动画层”，不要求先把旧 visual 重新选择为多图层类型。首次增加时，现有图片会原样保留为 normal/stateTexture base，现有 Spine/VNI 会原样迁移为第一层，再追加一份待绑定的新层；已导入的旧 ZIP 因此不需要重新录入既有资源。附加层按稳定列表顺序逐项选择 `underlay | overlay` 以及 Spine/VNI 资源与播放参数。层 id 必须唯一且为 lowercase kebab-case；至少保留一层。导入、预览、导出与资源覆盖都按 exact layer binding 处理，不按文件名猜层，也不把多层静默降级成单层。

同一导入批次允许多份 Spine skeleton 共用唯一一份 atlas 及其单页 texture；各 skeleton 仍作为独立资源供 state/value tier 显式选择。缺 skeleton、缺 atlas、多 atlas 或 atlas page 不唯一时继续拒绝整批导入。

value-presentation 的编辑顺序固定为“档位 → 状态”：每张档位卡同时选择 Spine skeleton/atlas/texture、阈值、normal ImgNumber JSON，并可为该档生成和绑定 exact non-Spine `spinBlur` profile；normal、win、remove 等动画在状态页选择一次，并要求所有档位存在同名动画。ImgNumber 的 exact slot、transform、颜色跟随和特殊数值图片仍只在 Normal 配置一次，并由全部档位和 Spine state 共用；`spinBlur` symbol 本体静态图仍独立选择。整个 symbol 只设置一个预览数值，预览根据档位阈值自动选择对应 Spine tier 与 normal/blur ImgNumber；该值只属于当前 UI session，新建或打开项目时重置，不进入 manifest 或 ZIP。

新命名 ImgNumber node 使用一个 `spineSlot` 覆盖全部 Spine state；普通 symbol 的候选 slot 是全部 top-level Spine state skeleton 的交集，value-managed symbol 则是全部 tier skeleton 的交集，交集为空时不猜首项。显示、移动和出现时机由 Spine animation 控制。非 Spine state 继续用 exact `targets[]` 决定同一 instance 是否显示在固定顶层 overlay。旧逐 Spine state target 与旧 per-tier 完整 binding 可无损导入、编辑和导出，不会自动扩大状态覆盖。

命名 ImgNumber 配置 non-Spine `spinBlur` target 后，ImgNumber 卡片可在浏览器本地按 rendercore versioned preset 生成并绑定派生模糊 dependency。相同普通 dependency 在项目内只生成和共享一份；glyph 与特殊数值整图按 source key 去重。runtime 预加载 normal/blur profile，并在任务 170 的同一 renderer/container 内切换 assets。普通 dependency 或特殊图片变化会使受影响 binding 失效；旧 target-only package 保持既有 normal-assets 行为并标为 legacy。

value ImgNumber 的每个档位也可显式生成并绑定自己的 `spinBlurProfile`。操作只绑定当前档位；其它同源档位或命名 node 复用已生成 dependency 时不重复处理像素。运行时先按 value 命中档位，再让同一稳定 ImgNumber root 在该档 Spine slot 与顶层 spinBlur overlay 间切换；未绑定档位不会借用相邻档或 normal assets。

当单个 symbol 的 normal 是已绑定且有效的 direct image 时，normal 状态页提供两个互不
联动的纯前端操作：“生成模糊图”只生成/绑定 `spinBlur`，“生成 disable 图”只生成/
绑定 `disabled`。图片在浏览器本地 decode、调用 rendercore versioned preset 处理并
编码为 PNG，不上传服务器，也不遍历其它 symbols。两个目标 state 也可通过 Picker
“上传并使用”自制单图；生成和手传都进入相同 filename-key review，按每个 state 最后
一次成功提交生效。toolbar 和其它 Picker 上传仍只入库，不自动猜 binding。

单文件、多文件和通用资源 ZIP 使用同一导入事务；ZIP 内路径在 review 前扁平为原始 basename。同名不同 bytes 必须先 review：可以逐项或批量覆盖，也可以显式保留两份。覆盖保持所有 state/value/node 引用；保留两份在扩展名前使用最小可用 `-1`、`-2` suffix，且普通新资源不会自动绑定；用户从目标 state 执行“上传并使用”时，review 成功后的 resolved key 会显式绑定回该 state。唯一例外是被覆盖的有效 Spine skeleton 不再包含已选动画：编辑器只清空受影响的 exact `animationName`（包括 composite 的 exact leaf），并提示用户重新选择；tiered Spine 的共享 normal/activeSpine 动画按全部档位交集一起处理。slot、glyph、atlas page、closure 或其它不兼容仍整批回滚。大小写合法文件名原样保留，不生成 logical id、目录前缀或静默后缀。unused key 可留在 draft，但不会进入 production closure。

带根 `manifest.json` 的 VNI export bundle 会先按正式 manifest/profile 合同识别，再进入上述
统一导入事务。只有 `purpose=runtime` 是候选：唯一 runtime 自动选择，多个 runtime 必须在
受控下拉框中明确选择，`purpose=editing` 不入库。所选 project 及其 exact asset closure 在
提交前结构化改写为扁平 filename key，保留 VNI `originalName`、asset/layer identity 和
`exportProfile`；bundle manifest、未选 profile、缺失或 orphan 文件不会成为 workspace
资源。成功导入只增加可选 VNI project，不按 ZIP 名、project 名或 `originalName` 自动绑定
symbol/state。

包含 `symbols.package.json` 的 ZIP 是完整 Symbols project，只能单独打开，并在确认后原子替换当前项目；它不会作为普通素材合并。导入和预览分别显示进度与错误，project 已加载但 Pixi/Spine/VNI preview 初始化失败时保留可编辑配置并提供重试，不用空预览掩盖异常。

导出 ZIP 的 symbol manifest 与所有嵌套 VNI/Spine/image-string 引用均为 filename keys；根 `assets.map.json` 将它们映射到 `assets/<完整 SHA-256>.<ext>`。合法 legacy direct-path package 可导入并结构化升级，新导出不含 nested dependency 资源目录。

预览继续由 rendercore/Pixi/VNI/official Spine owner 驱动，不复制 player、slot 或 state-machine 算法。

运行：`pnpm --filter symbolseditor dev`
