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

闭包从 manifest 结构化派生，包含 display state、composite 的 base 与全部有序 Spine/VNI leaf、VNI project 与 `assets[].path`、official Spine 4.3 skeleton/atlas/pages、value presentation、image-string node/tier root、glyph 与 `specialValueImages` 整图。value ImgNumber 的 dependency、slot、transform、颜色跟随和 special map 都属于对应 tier binding；按 value 命中 Spine tier 后只读取同 index binding。特殊映射值必须在所属 binding 内唯一且为 safe integer，路径必须是 contained local 图片；exact value 命中本档整图时不要求该值的 glyph，未命中仍执行本档严格 glyph closure。旧顶层 value `specialValueImages` 在 parse/materialize 边界复制到各档，canonical package 只写 per-tier 字段；新旧位置并存失败。缺资源、orphan、animation/slot/glyph 错误、decoded size 漂移或 package resources 不精确都失败；禁止 glob、字符串替换、路径猜测和 fallback。

state lifecycle、scale、renderPriority、value/cascade、activeSpine 与 image-string target 语义不因 container 格式改变。Spine-backed ImgNumber target 必须声明 exact slot；其余 visual kind 使用 state 级顶层 overlay，composite 不绑定内部 leaf。Spine animation 名区分大小写，normal/stable loop 与 once state 仍由 rendercore 校验。Composite 要求一个显式 base 和非空、有唯一 kebab-case id 的有序 leaf 列表；leaf 只能是 Spine/VNI，placement 只能是 underlay/overlay。VNI 按自身 100% 资源尺寸播放。

## Loader 与兼容

`createSymbolPackageResource()`、ZIP/Blob preview 与 URL loader 支持 root map；父 Scene Layout 已验证其全局 map 后使用 resolved-files bridge。map package 不回退 direct path。无 map 的合法 legacy direct package继续加载；Symbols Editor 导入时通过 format owner 结构化抹平 VNI、atlas 和 image-string refs，新导出只写 filename-key + map 格式。

Symbols Editor 只有一个多文件/ZIP importer和一个全局 asset workspace。image-string dependency 只保存 root/keys/manifest 描述，bytes 不另建 namespace。Game Layout vendoring 也只把 dependency root/keys 合并进全局 map。

JSON/ZIP deterministic；同 bytes + extension 可以共享物理 payload，但每个 filename key 和业务绑定保持独立。
