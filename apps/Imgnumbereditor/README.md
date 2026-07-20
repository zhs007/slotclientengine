# Imgnumbereditor

资源入口统一为“上传资源 / 上传文件夹”。图片先以 lowercase ASCII kebab-case
logical image id 进入待映射库，上传不会自动创建 glyph；已知 ZIP 按根 manifest
进入顶层项目导入。来源名只保存在 provenance。新导出以 canonical bytes 的完整
SHA-256 生成 `assets/<64-hex>.<png|webp>`；legacy code-point path 重导会确定性升级。

纯前端图片字符串资源编辑器。目录名按产品命名保留 `Imgnumbereditor`，pnpm package name 为 `imgnumbereditor`。运行时合同统一称为 `image-string`，并不限定为数字。

## 使用

```bash
pnpm --filter imgnumbereditor dev -- --host 0.0.0.0
pnpm --filter imgnumbereditor test
pnpm --filter imgnumbereditor build
```

1. 批量选择 PNG/WebP；文件先进入“待映射”区，文件名建议不会自动写入 manifest。
2. 显式确认每张图片对应的单个 Unicode scalar。
3. 配置 `lineHeight`、`letterSpacing`、offset 和可选 fixed advance group。
4. 用静态字符串、自由输入与 `001 -> 100` RAF 计数模板检查资源。
5. 导出 `<id>-image-string.zip`；导出前会走 rendercore production 等价解码与尺寸校验。

ZIP 根只包含 `image-string.manifest.json` 与精确的 `assets/**` glyph 闭包。应用不保存到 localStorage、不上传网络、不修改原始图片。

导出的 standalone ZIP 可由 `symbolseditor` 的专用“导入 Imgnumber ZIP”入口安装为 logical dependency，再绑定到 symbol 的命名 Spine slot 节点。consumer 会按 manifest 的精确 glyph closure vendoring；不需要也不应手工拆 ZIP 后逐个上传 JSON/PNG。
