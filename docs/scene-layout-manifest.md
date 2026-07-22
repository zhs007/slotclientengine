# Scene Layout Manifest v1

根 sentinel 为 `layout.manifest.json`。schema version 仍为 `1`，支持 `maximized-focus` / `orientation-focus`、image/image-string/official Spine 4.3 node、reels、plural `symbolPackages`、award-celebration `popups`、game modes 与显式有向 transitions。

## Filename-key package

Game Layout Editor 新导出的所有资源引用是扁平 filename keys：

```json
{
  "resource": {
    "kind": "image",
    "path": "BG.jpg",
    "size": { "width": 2000, "height": 2000 }
  },
  "symbolPackages": {
    "base-symbols": {
      "manifest": "symbols.package.json",
      "reel": "main",
      "reelSet": "main",
      "renderMode": "grid-cell"
    }
  },
  "popups": {
    "base-celebration": {
      "type": "award-celebration",
      "manifest": "popup.manifest.json",
      "placements": { "default": { "x": 0, "y": 0, "scale": 1 } }
    }
  }
}
```

根 `assets.map.json` 将 layout、image-string、Symbols、Popup 的全部 root/leaf keys 统一映射到 `assets/<完整 SHA-256>.<ext>`。ZIP 只有两个 root control files 和 hash payload 区；禁止 `dependencies/image-strings/**`、`dependencies/symbols/**`、`dependencies/popups/**`。

同一个 filename key 全局只有一份 bytes。多个 package 带来同名不同 bytes 时必须覆盖、取消或显式改名并由 owner 结构化改写，不能按 package id 建 namespace。package/mode/node id 保留业务语义，不作为资源 alias。

## 精确闭包与 loader

`collectSceneLayoutPackagePaths()` 验证 layout 与全部 nested package 的传递 exact closure。map 声明的 hash、size、media、payload 和 orphan 均严格验证；map/direct 不得混用。ZIP resource creator、Blob preview 与 `loadSceneLayoutPackageFromUrl()` 使用同一 resolver。父 package 已解析 map 后，image-string/Symbols/Popup 使用 resolved-files bridge，不要求嵌套 map。

无 map 的合法 legacy direct-path/nested dependency package继续加载。Editor import 会在内存中迁移为 flat keys，再导出新格式；不做 basename runtime fallback、404 探测或宽泛 glob。

## Node、模式与转场

多个 mode/variant 可以引用同一资源 key，但稳定 background node 与 placement 必须独立；新增 mode 背景未绑定，node id 按 mode/variant 稳定生成。稳定 Spine node 只使用显式 single loop，mode 切换时保留 player 与 exact bytes。

transition 是独立有向边：

- Spine overlay 声明 skeleton/atlas/page filename keys、exact animation、exact single event occurrence 与 per-variant placement；
- video blackout 声明 MP4 filename key、`mimeType: "video/mp4"`、`fit: "contain"` 与小于真实 duration 的 positive `fadeOutSeconds`。

两分支字段严格互斥。runtime 只准备当前 stable source 到所选 target 的直接边；缺边不瞬切、不反向复用、不寻路。Spine event 或 video media-time fadeStart 边界原子切换 background/reel/displayed mode；prepare/once/ended/play rejection 均可 rollback。audible `play()` 必须在 trusted click 调用栈内同步触发，不自动静音或 wall-clock fallback。

## 安全与确定性

Parser 拒绝 unknown key、非法尺寸/placement/order、path alias、缺资源与 schema/version 错配。导出 JSON/ZIP 固定排序、换行、mtime 和压缩参数；相同 project/bytes 重复导出逐 byte 一致。unused workspace key 不进入 production closure，Object URL、Texture、player 与 cache 不进入 manifest/map。
