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

闭包从 manifest 结构化派生，包含 display state、Spine/VNI、value presentation、image-string root/glyph 与 `specialValueImages`。新 value ImgNumber 用 `tierResources[]` 逐档声明 normal JSON，并可用等长 `tierSpinBlurProfiles[]` 的 object/null 项绑定该档 exact non-Spine `spinBlur`；全部档位仍共享一份 Normal slot/transform/color/special 配置。旧 per-tier 完整 binding、其可选 `spinBlurProfile` 和旧顶层 special map保持兼容。新旧 variant混写、tier/profile数量错位、normal/blur layout或special集合不一致、缺资源/slot/glyph或不精确closure都显式失败。

新命名 ImgNumber 用一个 `spineSlot` 覆盖全部 top-level Spine state，动画决定显隐和运动；`targets[]` 只列 non-Spine exact overlay state。旧逐 state slot target 不迁移、不扩大覆盖。两种数据都在每个 symbol occurrence 内复用同一个稳定 container。

non-Spine `spinBlur` target 可显式声明 `spinBlurProfile`，引用一份布局与normal ImgNumber严格一致的派生dependency和同value集合的模糊特殊图片。普通/模糊root、glyph和special image都由typed reference进入exact closure并参与mapped rewrite；runtime只在同一container/Sprite pool切换已prepare assets。Symbols Editor按普通dependency与versioned preset生成一次并跨node复用；旧无profile target保持原normal-assets行为。

## Loader 与兼容

`createSymbolPackageResource()`、ZIP/Blob preview 与 URL loader 支持 root map；父 Scene Layout 已验证其全局 map 后使用 resolved-files bridge。map package 不回退 direct path。无 map 的合法 legacy direct package继续加载；Symbols Editor 导入时通过 format owner 结构化抹平 VNI、atlas 和 image-string refs，新导出只写 filename-key + map 格式。

Symbols Editor 只有一个多文件/ZIP importer和一个全局 asset workspace。image-string dependency 只保存 root/keys/manifest 描述，bytes 不另建 namespace。Game Layout vendoring 也只把 dependency root/keys 合并进全局 map。

JSON/ZIP deterministic；同 bytes + extension 可以共享物理 payload，但每个 filename key 和业务绑定保持独立。

## RenderCore 入口

Symbols package 的公开入口按职责拆分为 `@slotclientengine/rendercore/symbol/data`、`/core` 与 `/editor`。旧 `@slotclientengine/rendercore/symbol` 和 root symbol wildcard 已移除。游戏 runtime 使用 data/core；Symbols authoring、mapped package 和 standalone preview 使用 editor。公开 occurrence capability 为 `SymbolHandle`，内部 mutable Pixi player 不属于 package API。
