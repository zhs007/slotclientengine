# Image String Manifest v1

`image-string` 用普通透明 PNG/WebP glyph 渲染任意单行 JavaScript 字符串。它不等同于数字类型：数字、`.`、`+`、`-`、`×`、货币符号和其它单 Unicode scalar 都走相同合同。

## ZIP 目录

独立资源包根目录固定如下：

```text
neutral-glyphs-image-string.zip
  image-string.manifest.json
  assets/
    u002b.png
    u0030.png
    u0031.webp
```

路径必须是 canonical、ASCII lowercase、POSIX 相对路径，并位于 `assets/`。包内容必须精确等于 manifest 与所有 glyph 的闭包；缺文件、orphan、目录 entry、case/NFC collision 或 path escape 都会失败。

## Manifest

```json
{
  "version": 1,
  "kind": "image-string",
  "id": "neutral-glyphs",
  "metrics": {
    "lineHeight": 49,
    "letterSpacing": 1
  },
  "glyphs": {
    "+": {
      "path": "assets/u002b.png",
      "size": { "width": 20, "height": 20 },
      "offset": { "x": 0, "y": 14 }
    },
    "0": {
      "path": "assets/u0030.png",
      "size": { "width": 36, "height": 49 },
      "offset": { "x": 0, "y": 0 }
    },
    "1": {
      "path": "assets/u0031.webp",
      "size": { "width": 26, "height": 48 },
      "offset": { "x": 0, "y": 1 }
    }
  },
  "fixedAdvanceGroups": [
    {
      "id": "digits",
      "characters": ["0", "1"],
      "advanceWidth": 36,
      "align": "center"
    }
  ]
}
```

所有对象递归拒绝未知字段。glyph key 和 runtime text 必须是 NFC；key 必须恰好是一个 Unicode scalar。控制字符、未配对 surrogate、多 code-point ligature、换行和缺字均显式失败。

声明尺寸必须与图片真实解码尺寸一致。`offset.y .. offset.y + height` 必须落在 `0..lineHeight`。fixed group 的 advance 必须容纳每个成员的水平 visual rect，一个字符最多属于一组。

## 布局公式

字符串以 `Array.from(text)` 按 code point 从左到右处理：

```text
cellAdvance = fixedGroup.advanceWidth ?? glyph.size.width
alignOffset = start  ? 0
            : center ? (cellAdvance - glyph.size.width) / 2
            :          cellAdvance - glyph.size.width

spriteX = cursorX + alignOffset + glyph.offset.x
spriteY = glyph.offset.y
cursorX += cellAdvance
非末尾 glyph 再加 letterSpacing
```

logical bounds 固定从 `(0, 0)` 开始，宽度为全部 advance 与相邻 spacing 之和，高度为 `lineHeight`。visual bounds 是实际 sprite rect 的 union。anchor 通过 `pivot=(logicalWidth * anchor.x, lineHeight * anchor.y)` 应用。空字符串宽度为 `0`、visual bounds 为 `null`。

## API

```ts
import {
  createImageStringResourceFromFiles,
  createRenderImageString,
  loadImageStringResourceFromUrl,
  parseImageStringManifest,
} from "@slotclientengine/rendercore/image-string";

const manifest = parseImageStringManifest(rawManifest);
const resource = await createImageStringResourceFromFiles({
  manifest,
  files,
});

const display = createRenderImageString({
  resource,
  text: "+001",
  anchor: { x: 0.5, y: 0.5 },
});

parent.addChild(display.container);
display.setText("+002");
console.log(display.getSnapshot());

display.destroy();
await resource.destroy();
```

resource 可被多个 renderer 共享；renderer 销毁时不销毁共享 resource。resource 创建完成前会解码并核对全部图片，destroy 后不能创建 renderer 或继续 `setText()`。

Vite 输入必须只包含 glyph closure；CDN loader 只接受 http/https manifest URL，资源必须留在同源 manifest 目录。任何部分失败都会回收已创建 Object URL 和纹理。

## 编辑器

`apps/Imgnumbereditor` 负责显式字符映射、offset/fixed group 表单、静态模板、RAF 计数模板和 standalone ZIP。文件名仅提供候选建议，不会自动成为 manifest 数据；编辑器不裁图、不 resize、不转码，也不把模板写入 ZIP。

## Symbol 命名节点

symbol manifest 的每个 symbol 可声明稳定有序的 `imageStringNodes`。节点通过唯一 `name` 寻址，`resource` 指向 symbol package 内 vendored 的 `image-string.manifest.json`，并显式绑定一个真实 Spine state 和大小写精确的真实 slot：

```json
{
  "imageStringNodes": [
    {
      "name": "coin-value",
      "resource": "./dependencies/image-strings/coin-digits/image-string.manifest.json",
      "target": { "state": "normal", "slot": "Num" },
      "initialText": "001",
      "anchor": { "x": 0.5, "y": 0.5 },
      "transform": { "x": 0, "y": 0, "scale": 1 },
      "followSlotColor": true
    }
  ]
}
```

只有 `kind: "spine"` 的 state 可作为 target。package prepare 会校验 nested glyph 精确闭包、`initialText`、skeleton 和 slot；缺 glyph、缺 slot、路径漂移或多余文件都会失败。运行时通过 `RenderSymbol.getImageStringNodeNames()`、`setImageStringText(name, text)` 与 `getImageStringText(name)` 操作；setter 先完整校验再原子提交，因此失败不会改变旧显示，前导零也不会丢失。节点仅在目标 state 可见时挂到 slot，state 切换、等价 Loop、异步 init、pool/reset 和 destroy 都由 rendercore 管理。

## Value tier ImgNumber

`valuePresentation.text` 是 `font|image|image-string` 严格 union。image-string 分支只含 `type` 与 `tiers`；其 binding 数量必须与 Spine `valuePresentation.tiers` 完全一致，每项显式配置 dependency、该档 skeleton 的 exact slot、anchor、transform 和 `followSlotColor`。binding 只消费已经由 `maxExclusive` 解析出的 tier index，不声明第二份阈值，也没有首档/上一档 fallback。

同一 dependency 可被多档显式复用，并由一个可销毁 resource pool 去重；每个 symbol occurrence 的 `RenderImageString` 仍相互独立。raw positive integer 按 `String(value)` 渲染，default value 在资源准备时校验，服务器值在创建/更新展示前再次校验。缺 glyph、slot、nested manifest、exact glyph file 或 decoded size 漂移都会失败，不回退完整图片或字体。symbol package、Vite generator、loading 与 dist 都必须只携带 nested manifest 声明的精确 glyph closure。
