# Symbol Package v1

根 sentinel 为 `symbols.package.json`。package manifest 继续声明 `id`、`cellSize`、`entrypoints.gameConfig`、`entrypoints.symbolManifest` 和精确 `resources`；package id 是业务身份，不是资源 key。

新 Editor 导出中，两个 entrypoint、`resources`、symbol state、VNI project asset、Spine skeleton/atlas/page、value image 和 image-string manifest/glyph 引用全部使用扁平 filename keys。根 `assets.map.json` 将它们解析到 `assets/<完整 SHA-256>.<ext>`，ZIP 不再包含 `dependencies/**` 子资源区。

```json
{
  "version": 1,
  "kind": "symbol-package",
  "id": "game-symbols",
  "cellSize": { "width": 160, "height": 160 },
  "entrypoints": {
    "gameConfig": "gameconfig.json",
    "symbolManifest": "symbol-state-textures.manifest.json"
  },
  "resources": ["A.PNG", "WL.json", "Symbol.atlas", "Symbol.png"]
}
```

文件名保留合法大小写、空格与 Unicode；ASCII case-fold/NFC alias 不得共存。不同 source directory 抹平为同 key 且 bytes 不同会阻断，不能自动 lowercase、加 prefix 或后缀。

## 精确闭包

闭包从 manifest 结构化派生，包含 display state、VNI project 与 `assets[].path`、official Spine 4.3 skeleton/atlas/pages、value presentation、image-string node/tier root 与 glyph。缺资源、orphan、animation/slot/glyph 错误、decoded size 漂移或 package resources 不精确都失败；禁止 glob、字符串替换、路径猜测和 fallback。

state lifecycle、scale、renderPriority、value/cascade、activeSpine 与 image-string slot 语义不因 container 格式改变。Spine animation 名区分大小写，normal/stable loop 与 once state 仍由 rendercore 校验。VNI 按自身 100% 资源尺寸播放。

## Loader 与兼容

`createSymbolPackageResource()`、ZIP/Blob preview 与 URL loader 支持 root map；父 Scene Layout 已验证其全局 map 后使用 resolved-files bridge。map package 不回退 direct path。无 map 的合法 legacy direct package继续加载；Symbols Editor 导入时通过 format owner 结构化抹平 VNI、atlas 和 image-string refs，新导出只写 filename-key + map 格式。

Symbols Editor 只有一个多文件/ZIP importer和一个全局 asset workspace。image-string dependency 只保存 root/keys/manifest 描述，bytes 不另建 namespace。Game Layout vendoring 也只把 dependency root/keys 合并进全局 map。

JSON/ZIP deterministic；同 bytes + extension 可以共享物理 payload，但每个 filename key 和业务绑定保持独立。
