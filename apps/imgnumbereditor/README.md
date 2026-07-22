# ImgNumber Editor

纯前端 image-string v1 编辑器。目录固定为 `apps/imgnumbereditor`，package name 为 `imgnumbereditor`。

编辑器只有一个支持多选图片和 ZIP 的“导入资源”入口。资源身份始终是用户文件名（保留大小写、空格和合法 Unicode），字符建议只用于 UI，不改名也不自动绑定。字符、offset、lineHeight、letterSpacing 和 fixed-advance group 是业务配置，不是资源 id。

同名不同 bytes 的 review 主操作是覆盖；key 和全部 glyph 引用保持不变。提交前会验证类型、尺寸和完整 manifest，失败时项目不变。没有文件夹上传、logical id prompt、自动 lowercase 或 `-2/-3` 后缀。

导出 ZIP 包含：

- 根 `image-string.manifest.json`，glyph `path` 为 filename key；
- 根 `assets.map.json`；
- `assets/<完整 SHA-256>.<ext>` 物理 payload，同 bytes 可去重。

导入新格式时严格验证 map/hash/size/media/exact closure；无 map 的合法 legacy direct-path 包仍可由 runtime 加载。只有 hash 且无法证明原文件名的 legacy editor import 会要求用户命名，不把 hash 当作资源名。

运行：`pnpm --filter imgnumbereditor dev`
