# Image String Manifest v1

`image-string` 是 Unicode code-point 图片字符串格式。root sentinel 固定为 `image-string.manifest.json`，inner schema 版本仍为 `1`。

Pixi renderer 的 anchor 以当前字符串的 `visualBounds` 为准；`anchor: { x: 0.5, y: 0.5 }` 会把实际 glyph 组合的中心放在容器原点。`setText()` 改变位数、glyph 尺寸或左右留白时会原子重算 pivot，因此绑定到 Spine slot 的 ImgNumber 始终保持动态内容中心对齐。official Spine slot attach 使用仅跟随 bone matrix 的外层 wrapper，ImgNumber 作为内层保留自身 pivot、`x/y` offset 与 scale；`x=0,y=0` 表示内容中心正好对齐 slot 原点。空字符串没有 `visualBounds` 时才使用 `logicalBounds`。

```json
{
  "version": 1,
  "kind": "image-string",
  "id": "usd-digits",
  "metrics": { "lineHeight": 64, "letterSpacing": 2 },
  "glyphs": {
    "0": {
      "path": "0.PNG",
      "size": { "width": 40, "height": 64 },
      "offset": { "x": 0, "y": 0 }
    }
  },
  "fixedAdvanceGroups": []
}
```

新 editor package 中 `glyphs.*.path` 是扁平 filename key，不是 hash path。根 `assets.map.json` 将 key 映射到 `assets/<完整 64 位 lowercase SHA-256>.<canonical-ext>`。map 的 hash、byteLength、mediaType、payload existence、orphan 和 exact closure 全部严格验证；有 map 时不得混入 direct path。

无 `assets.map.json` 的既有合法 direct-path package 继续加载。Editor 导入 legacy package 后会用结构化 glyph 引用抹平目录并升级；无法从 hash-only legacy 恢复名称时必须由用户命名。

## 布局

字符遍历使用 Unicode code point。每个 glyph 的 visual rect 为 `offset + size`；natural advance 使用图片宽度，fixed group 可为指定字符共享 `advanceWidth` 和对齐方式。相邻 glyph 加 `letterSpacing`。logical bounds 从 `(0,0)` 开始，高为 `lineHeight`；anchor 通过 logical size 计算 pivot。缺 glyph、重复字符、非法 group、非正尺寸或 decoded size 漂移均失败，不回退字体或占位图。

## Package 与生命周期

ZIP 只允许 root manifest、`assets.map.json` 与 map 声明的 payload。deterministic JSON/ZIP 固定 key/entry 顺序、换行、mtime 和压缩参数。同 bytes + extension 可由多个 filename keys 共享同一 payload。

`createImageStringResourceFromFiles()` 同时支持新 map package和 legacy direct package；父 Popup/Symbols/Layout 已验证全局 map 后使用 `createImageStringResourceFromResolvedFiles()`，避免要求嵌套第二份 map。Vite、Blob 和 URL loader 都使用同一 manifest/parser/closure 语义。

`RenderImageString` 支持原子 `setText()`、anchor、snapshot 与 sprite 复用，不创建 Application、canvas、DOM、RAF 或字体 fallback。destroy 会释放 owned Object URL/Texture；共享 resource 与 occurrence renderer 生命周期分离。

## Editor vendoring

ImgNumber、Popup、Symbols 与 Game Layout Editor 都把 manifest root 和 glyph 放进同一个 flat workspace。Symbols 的 image-string binding 与 Layout node 直接引用 manifest filename key；业务 dependency id、slot、tier、node id 不得成为资源 alias。production export 只包含实际引用的 glyph closure。
