# Scene Layout Manifest v1

根 sentinel 为 `layout.manifest.json`。schema version 仍为 `1`，支持 `maximized-focus` / `orientation-focus`、image/image-string/official Spine 4.3/runtime VNI node、reels、plural `symbolPackages`、award-celebration `popups`、game modes 与显式有向 transitions。

## 坐标原点

根级可选 `coordinateOrigin` 为 `"top-left"` 或 `"center"`；旧包缺失时严格按 `"top-left"` 读取。Game Layout Editor 的新导出会显式保存该值。

- `top-left`：art 左上角是 `(0, 0)`；image/VNI placement 表示资源左上角，Spine/image-string placement 表示各自 authored origin。
- `center`：art 中心是 `(0, 0)`；image/VNI placement 表示缩放后资源中心，Spine/image-string placement 表示 authored origin 相对 art center 的偏移。
- focus、frame focus、min margin 仍是以 art 左上角描述的矩形，不随坐标类型转换。
- Spine transition overlay 使用与 node 相同的 art-space origin；popup 仍是 viewport center offset，video blackout 仍是 viewport-space。

`reels.main.placements.<variant>` 只包含 `x/y`。placement 在 `top-left` 模式表示转轮矩形左上角，在 `center` 模式表示转轮矩形中心相对 art center 的偏移。scene-layout 不提供主转轮整体缩放；横竖屏适配应调整背景素材、art size 和 reel placement。

```json
{
  "coordinateOrigin": "center",
  "reels": {
    "main": {
      "columns": 5,
      "rows": 3,
      "cellSize": { "width": 160, "height": 160 },
      "gap": { "x": 0, "y": 0 },
      "placements": {
        "landscape": { "x": 0, "y": 20 },
        "portrait": { "x": 0, "y": -40 }
      }
    }
  }
}
```

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

根 `assets.map.json` 将 layout、VNI、image-string、Symbols、Popup 的全部 root/leaf keys 统一映射到 `assets/<完整 SHA-256>.<ext>`。ZIP 只有两个 root control files 和 hash payload 区；禁止 `dependencies/image-strings/**`、`dependencies/symbols/**`、`dependencies/popups/**`。

Game Layout Editor 导入旧 mapped ZIP 时，在验证 map/hash/size/orphan 后将不符合当前 filename-key 合同的 logical key 做确定性迁移，并同步改写 layout 与已知 nested manifest 的 path 字段；业务 id、animation、symbol state 和 atlas page logical name 不参与文件名迁移。迁移后的再次导出只包含规范化 key。

同一个 filename key 全局只有一份 bytes。多个 package 带来同名不同 bytes 时必须覆盖、取消或显式改名并由 owner 结构化改写，不能按 package id 建 namespace。package/mode/node id 保留业务语义，不作为资源 alias。导出与重新导入不得用 physical hash payload path 重建 node id 或资源列表标签。

## 程序资源

根级可选 `runtimeResources` 是程序按稳定业务键读取、但不一定被 node 或 transition 引用的 typed root：

```json
{
  "runtimeResources": {
    "nearwin.spine": {
      "kind": "spine",
      "skeleton": "nearwin.json",
      "atlas": "symbols.atlas",
      "textures": { "symbols.png": "symbols.png" }
    },
    "help.image": {
      "kind": "image",
      "path": "help.png",
      "size": { "width": 512, "height": 256 }
    }
  }
}
```

键必须以小写字母或数字开头，且只包含小写字母、数字、点、下划线和连字符。value 只接受现有 image、Spine、VNI、image-string、video 五类严格 spec；程序 Spine 不要求默认 animation，consumer 在实际使用时选择动画。

`SceneLayoutResource.runtimeResources` 和 `SceneLayoutPackageResource.runtimeResources` 保存已准备的 readonly typed 资源。consumer 应调用 `requireSceneLayoutRuntimeResource(resource, key, kind)` 做精确 key/kind 检查，不得猜 filename、basename 或 physical hash path。资源中的 URL、image-string/VNI 对象由父 resource 拥有，父 resource `destroy()` 后不得继续使用。

## 精确闭包与 loader

`collectSceneLayoutPackagePaths()` 验证 layout、程序资源与全部 nested package 的传递 exact closure，包括 VNI project 声明的每个 asset。map 声明的 hash、size、media、payload 和 orphan 均严格验证；map/direct 不得混用。ZIP resource creator、Blob preview 与 `loadSceneLayoutPackageFromUrl()` 使用同一 resolver。父 package 已解析 map 后，VNI/image-string/Symbols/Popup 使用 resolved-files bridge，不要求嵌套 map。

无 map 的合法 legacy direct-path/nested dependency package继续加载。Editor import 会在内存中迁移为 flat keys，再导出新格式；不做 basename runtime fallback、404 探测或宽泛 glob。

Spine atlas page 是 atlas 内部的逻辑标识，`textures` map 的 value 才是 filename key。legacy 输入允许 page 名后缀与真实图片编码不一致：导入边界按 bytes 规范化物理 key（例如 atlas page `BG.png` 映射到 WebP key `BG.webp`），同时保持 atlas page 文本不变。这样 runtime 仍按 page 精确查 map，`assets.map.json` 的扩展名、media type 与 payload 内容保持一致。

## Node、模式与转场

多个 mode/variant 可以引用同一资源 key，但稳定 background node 与 placement 必须独立；新增 mode 背景未绑定，node id 按 mode/variant 稳定生成。稳定 Spine node 只使用显式 single loop，mode 切换时保留 player 与 exact bytes。

普通 Spine node 声明 exact `defaultAnimation` 和 boolean `loop`。普通 VNI node 声明 runtime project filename key 和 boolean `loop`，播放完整 timeline；同一 project 被多个 node 引用时仍创建独立 player/playhead。VNI node 可使用普通 placement/order/variant visibility，但不得作为 background 或 transition。

transition 是独立有向边：

- Spine overlay 声明 skeleton/atlas/page filename keys、exact animation、exact single event occurrence 与 per-variant placement；
- video blackout 声明 MP4 filename key、`mimeType: "video/mp4"`、`fit: "contain"` 与小于真实 duration 的 positive `fadeOutSeconds`。

两分支字段严格互斥。runtime 只准备当前 stable source 到所选 target 的直接边；缺边不瞬切、不反向复用、不寻路。Spine event 或 video media-time fadeStart 边界原子切换 background/reel/displayed mode；prepare/once/ended/play rejection 均可 rollback。audible `play()` 必须在 trusted click 调用栈内同步触发，不自动静音或 wall-clock fallback。

## 安全与确定性

Parser 拒绝 unknown key、非法尺寸/placement/order、path alias、缺资源与 schema/version 错配。导出 JSON/ZIP 固定排序、换行、mtime 和压缩参数；相同 project/bytes 重复导出逐 byte 一致。unused workspace key 不进入 production closure，Object URL、Texture、player 与 cache 不进入 manifest/map。
