# image string editor bootstrap 任务计划

## 1. 任务目标

本任务新增一个纯前端图片字符串资源编辑器：

```text
apps/Imgnumbereditor
```

应用目录名按产品要求保留 `Imgnumbereditor`；应用的 pnpm package name 使用全小写 `imgnumbereditor`。由于资源不只显示数字，还必须支持小数点、正负号、乘号、加号等字符，rendercore 公共能力、manifest kind、类型和文档统一使用中性的 `image-string`，不得把运行时写成只认识数字的 `image-number` 特例。

编辑器用于维护一套“字符 -> 图片”美术资源库。用户可以上传类似：

```text
0-1.png
1-1.png
2-1.png
...
9-1.png
```

的图片，显式确认每张图片映射的字符，配置行高、字符间距和可选的等距字符组，实时预览任意单行字符串，并导出一个可以重新导入的 ZIP。等距字符组通过统一的逻辑 advance width 实现：窄图在固定宽度单元内按配置对齐，图片本身不拉伸、不重采样；未加入等距组的字符继续使用自身图片宽度。

同时在 `packages/rendercore` 新增通用、严格、manifest-driven 的图片字符串解析、资源闭包和 Pixi.js v8 渲染能力，并扩展现有：

```text
apps/symbolseditor
apps/gamelayouteditor
```

使它们可以导入图片字符串 ZIP，并分别在 symbol manifest 的 value presentation、scene layout manifest 的图片字符串节点中使用。用户口述中的 `gamelayereditor` 对应仓库真实项目 `apps/gamelayouteditor`；不得新建一个拼写相近的重复应用。

最终工作流：

```text
Imgnumbereditor
  上传字符图片
  -> 显式确认字符映射
  -> 配置自然宽度 / 等距组
  -> 静态字符串和计数变化预览
  -> 导出 <id>-image-string.zip

symbolseditor
  导入 image-string ZIP
  -> 在 valuePresentation.text 选择 image-string
  -> 单 symbol 预览
  -> 导出自包含 symbols ZIP

gamelayouteditor
  导入 image-string ZIP
  -> 添加 image-string layout node
  -> 配置初始字符串、位置、层级和 scale
  -> 导出自包含 layout ZIP
```

本文件是完整实施合同，不依赖聊天记录、旧任务文本或口头说明才能执行。

任务完成后必须新增中文任务报告：

```text
tasks/102-image-string-editor-bootstrap-[utctime].md
```

`utctime` 必须使用 UTC 年月日时分秒：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/102-image-string-editor-bootstrap-260401-181300.md
```

## 2. 已确定的产品与技术决定

### 2.1 字符串与字符边界

- runtime 输入是任意单行 JavaScript `string`，不是 number；`0123` 的前导零必须保留。
- manifest 的每个 glyph key 必须恰好是一个 Unicode scalar value；用 `Array.from(text)` 按 code point 切分，不按 UTF-16 code unit 切分。
- v1 不做多 code-point ligature、字形 shaping、RTL 排版、换行、自动换行、富文本或多字体 fallback。
- manifest key 和待渲染文本必须是 Unicode NFC；不得静默 normalize 后继续。
- 拒绝 `\r`、`\n`、tab、NUL、其它控制字符、未配对 surrogate 和空 glyph key。
- `0-9`、`.`、`,`、`+`、`-`、`×`、`*`、`/`、`%`、货币符号等都只是普通 glyph；rendercore 不维护任何内置符号表。
- 空字符串允许用于主动清空显示，得到宽度 `0`、无 sprite 的有效渲染结果；非空字符串含未映射字符时必须在提交任何可见变化前显式失败。

### 2.2 等距的精确定义

- 默认 glyph 使用图片声明宽度作为 advance，称为 natural width。
- manifest 可声明零个或多个 fixed advance group；每组列出字符、统一 `advanceWidth` 和单元格内 `align=start|center|end`。
- 一个字符最多属于一个 fixed advance group；组不能引用不存在的 glyph，不能为空，组 id 必须唯一。
- fixed group 只统一排版单元宽度，不改变纹理像素尺寸。当前 `0-1.png ... 9-1.png` 可放在 digits 组内，`.`、`+`、`-`、`×` 可留在组外继续使用自然宽度。
- `advanceWidth` 必须能容纳组内每个 glyph 的声明宽度及水平 offset；不能依靠裁切、负缩放或自动缩小掩盖错误。
- 每对相邻 glyph 之间只加一次 manifest `letterSpacing`；字符串末尾不追加间距。
- runtime 必须同时给出 logical bounds 和 visual bounds，方便 symbol slot、layout anchor 与测试精确定位。

### 2.3 图片与尺寸合同

- v1 glyph 只接受 PNG 和 WebP；不得接入 SVG、GIF、JPEG、字体、data URL 或远程 URL。
- 每个 glyph 在 manifest 显式记录 decoded `width/height`；导入、导出、CDN loader 和运行时资源准备都要核对真实解码尺寸。
- 图片不能在导入时自动裁透明边、resize、转码、改色或重命名原文件后覆盖用户文件。
- ZIP 内部资源路径由字符 code point 派生为 ASCII lowercase 路径，例如 `0 -> assets/u0030.png`、`+ -> assets/u002b.png`、`× -> assets/u00d7.png`。原始上传文件名仅作为编辑器提示，不作为 runtime 映射合同。
- 替换 glyph 图片时必须更新声明尺寸并重新验证所有 fixed group；不能保留旧尺寸骗过测试。

### 2.4 ZIP 与 consumer 包关系

- 独立 ZIP 根目录固定为 `image-string.manifest.json + assets/**`，不增加第二份 package wrapper。
- 文件名固定为 `<manifest-id>-image-string.zip`。
- `image-string.manifest.json` 是字符映射、尺寸和 spacing 的唯一来源。
- `symbolseditor` / `gamelayouteditor` 导入后，在各自 draft 中持有一个按 id 索引的 image-string dependency。
- consumer 导出时把 dependency 的 manifest 与 glyph 资源原样 vendor 到自身 ZIP 的专用子目录，使 symbols/layout ZIP 可独立部署和运行；不能要求 production 再额外寻找用户机器上的原 ZIP。
- symbols 中 vendor 路径固定为 `dependencies/image-strings/<id>/...`；layout 中固定为 `assets/image-strings/<id>/...`。
- dependency 内部相对路径保持不变。consumer manifest 只引用 vendored `image-string.manifest.json`，不得复制 glyph map、尺寸表或 fixed group 表。
- 同一 editor project 内 image-string id 必须唯一。相同 id、不同内容必须显式冲突；替换只能通过明确的“替换资源库”操作原子完成。
- 旧 symbol manifest 的 `font` 和按完整数值图片查找的 `image` 模式继续兼容；不自动迁移 game002，不删除旧 API。
- 现有 layout ZIP 仍不嵌入 symbols package；image-string 只有在 layout node 实际引用时才作为该 layout 自身的精确资源闭包进入 ZIP。

### 2.5 预览变化效果只属于编辑器

- rendercore 只负责给定字符串的布局、纹理实例和 `setText()`，不提供计时器、计数器或模板动画。
- `Imgnumbereditor` 提供静态模板和计数变化模板，用于验证资源配置。
- 计数变化模板字段固定为 `startText`、`endText`、`step`、`intervalMs`、`repeat`。
- `startText/endText` 必须是可安全解析的十进制整数文本；允许前导零，显示宽度取两端数字位数的最大值并用 `0` 补齐。符号位不计入补零位数。
- `step` 必须是非零安全整数，方向必须能从 start 走向 end，并且差值必须能被 step 整除；不允许越过终点后偷偷 clamp。
- `intervalMs` 必须是有限正数；播放由 `requestAnimationFrame` 的累计时间驱动，支持 pause/reset，不用 `setInterval` 制造漂移。
- start 与 end 都按 inclusive 显示。`repeat=false` 到终点停止，`repeat=true` 在完整显示终点后下一 tick 回到 start。
- 动态模板只能调用 rendercore public `setText()`；不得复制 glyph 布局公式或直接改 sprite 私有节点。

## 3. 范围

### 3.1 包含

- `packages/rendercore/src/image-string/`：类型、严格 manifest parser、资源闭包、文件/URL/Vite 资源装配、Pixi renderer、snapshot、生命周期。
- rendercore 根出口与 `@slotclientengine/rendercore/image-string` 子路径出口。
- `apps/Imgnumbereditor`：Vite + TypeScript + Pixi.js v8 脚手架、draft/store、图片导入、字符映射、spacing 配置、静态/动态预览、ZIP 导入导出、错误 UI、测试和 README。
- `apps/symbolseditor`：image-string dependency 导入/替换/清理、value presentation 新模式、preview、symbols ZIP 精确闭包和 round-trip。
- `apps/gamelayouteditor`：image-string dependency 导入/替换/清理、layout node 编辑/preview/runtime、layout ZIP 精确闭包和 round-trip。
- rendercore symbol value presentation、scene layout、相关 generator/resource loader 的精确接入。
- neutral fixtures 和当前 `game002-s3/0-1.png ... 9-1.png` 的手工验收流程。
- rendercore README、三个编辑器 README、image-string manifest 文档和必要的 `agents.md` ownership 更新。

### 3.2 不包含

- 不修改 game002/game003 production manifest、YAML、generated closure 或实际游戏展示；生产迁移另立任务。
- 不把当前未跟踪的 `assets/game002-s3/*-1.png` 擅自移动、重命名、覆盖、删除或提交为 generator 输出。
- 不做后端、账号、数据库、上传 API、云素材库、多人协作、CDN 发布、File System Access API、localStorage、IndexedDB 或 service worker。
- 不做图片编辑、裁切、描边、滤镜、自动抠图、位图字体生成、atlas 合图或压缩优化。
- 不做 Spine/VNI/sequence；glyph 是普通透明位图。
- 不做 kerning pair、ligature、文字 shaping、RTL、多行、换行、富文本、自动缩放到 max width 或省略号。
- 不提供缺字占位框、问号、空白纹理、字体 fallback、相近字符 fallback 或文件名猜测 fallback。
- 不在 editor 内复制 rendercore layout 算法，不在 consumer app 内直接操作 glyph sprite。
- 不为了通过测试放宽 production parser 或加入与合同冲突的特殊分支。

## 4. 当前仓库基线与执行保护

仓库根目录：

```text
/Users/zerro/github.com/minecart2
```

工具链：Node.js `>=24.0.0`、pnpm `>=10.0.0`、turbo、Vite、Vitest、ESLint、Prettier、Pixi.js v8。`pnpm-workspace.yaml` 已覆盖 `apps/*` 和 `packages/*`。

制定计划时：

```text
branch: main
HEAD: 02ca3591845e6982e0c9487385ec913c8389a50a
working tree:
?? assets/game002-s3/0-1.png
?? assets/game002-s3/1-1.png
?? assets/game002-s3/2-1.png
?? assets/game002-s3/3-1.png
?? assets/game002-s3/4-1.png
?? assets/game002-s3/5-1.png
?? assets/game002-s3/6-1.png
?? assets/game002-s3/7-1.png
?? assets/game002-s3/8-1.png
?? assets/game002-s3/9-1.png
```

执行开始和结束都必须重新记录：

```bash
git branch --show-current
git rev-parse HEAD
git status --short
```

全部已有修改和未跟踪文件都属于用户。禁止 `git reset`、`git checkout --`、`git clean`、stash、批量覆盖或顺手格式化任务范围外文件。

当前十张图片真实尺寸是 `26-37 px` 宽、`48-49 px` 高，正好用于验证“图片宽度不一致，但 digits fixed group 逻辑等距”。这些文件只作为手工导入验收输入；自动测试必须使用 tests/fixtures 自带的小型 neutral PNG/WebP，不能依赖用户未跟踪文件存在。

现有关键实现：

```text
packages/browserartifactio/src/path.ts
packages/browserartifactio/src/zip.ts
packages/browserartifactio/src/object-url-registry.ts
packages/rendercore/src/symbol/package.ts
packages/rendercore/src/symbol/manifest.ts
packages/rendercore/src/symbol-value-presentation/**
packages/rendercore/src/scene-layout/**
apps/symbolseditor/src/**
apps/gamelayouteditor/src/**
```

ZIP/path/Object URL 通用安全能力必须复用 `@slotclientengine/browserartifactio`，不得在 `Imgnumbereditor` 再写一套 unzip、zip-slip 检查或 URL registry。

## 5. Ownership 与依赖边界

```text
packages/rendercore/image-string
  manifest schema/parser
  exact asset closure
  glyph metrics 与字符串布局
  Pixi texture/sprite lifecycle
  files/Vite/CDN resource loader
  atomic setText 与 snapshot

packages/browserartifactio
  canonical package path
  collision detection
  bounded ZIP
  deterministic ZIP
  Blob URL registry

apps/Imgnumbereditor
  browser draft/store/UI
  文件选择与显式字符映射
  fixed group 编辑
  静态模板和计数模板
  standalone ZIP IO

apps/symbolseditor
  dependency 管理 UI
  valuePresentation image-string 表单
  symbols package vendoring

apps/gamelayouteditor
  dependency 管理 UI
  layout image-string node 表单
  layout package vendoring
```

`Imgnumbereditor` 依赖固定为：

```text
@slotclientengine/browserartifactio: workspace:*
@slotclientengine/rendercore: workspace:*
pixi.js: 与根工具链已有版本一致
```

不要直接依赖 fflate、logiccore、gameframeworks、uiframeworks、netcore、Spine 或 vnicore。fflate 只能继续由 browserartifactio 封装。

## 6. image-string manifest v1

ZIP 根目录固定为：

```text
<id>-image-string.zip
  image-string.manifest.json
  assets/
    u002b.png
    u002d.png
    u002e.png
    u0030.png
    ...
    u0039.png
    u00d7.png
```

建议 TypeScript 合同：

```ts
interface ImageStringManifestV1 {
  readonly version: 1;
  readonly kind: "image-string";
  readonly id: string;
  readonly metrics: {
    readonly lineHeight: number;
    readonly letterSpacing: number;
  };
  readonly glyphs: Readonly<Record<string, ImageStringGlyphSpec>>;
  readonly fixedAdvanceGroups: readonly ImageStringFixedAdvanceGroup[];
}

interface ImageStringGlyphSpec {
  readonly path: string;
  readonly size: { readonly width: number; readonly height: number };
  readonly offset: { readonly x: number; readonly y: number };
}

interface ImageStringFixedAdvanceGroup {
  readonly id: string;
  readonly characters: readonly string[];
  readonly advanceWidth: number;
  readonly align: "start" | "center" | "end";
}
```

示例：

```json
{
  "version": 1,
  "kind": "image-string",
  "id": "game002-gold-digits",
  "metrics": {
    "lineHeight": 49,
    "letterSpacing": 0
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
      "path": "assets/u0031.png",
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

### 6.1 parser 必须严格校验

- 顶层和全部嵌套对象递归拒绝未知字段。
- `version === 1`、`kind === "image-string"`。
- `id` 为 lowercase ASCII kebab-case。
- `lineHeight` 为有限正数；`letterSpacing` 为有限非负数。
- glyph map 非空；key 唯一、NFC、恰好一个允许的 Unicode scalar value。
- path 为 canonical、ASCII lowercase、POSIX 相对路径，必须位于 `assets/`，扩展名只能 `.png|.webp`。
- 不同 glyph 不能引用同一路径；拒绝 exact、case-fold、Unicode normalization collision。
- size width/height 为正安全整数；offset x/y 为有限数。
- glyph visual vertical rect 必须落在 `0..lineHeight`；不自动扩大行高。
- fixed group id 为 lowercase kebab-case；字符列表非空、唯一、稳定排序；每个字符存在且最多属于一组。
- `advanceWidth` 为有限正数并能容纳每个成员的 visual horizontal rect；align 只接受三个枚举值。
- 返回值递归 freeze；错误包含 manifest 路径和具体 glyph/group，便于 editor 定位字段。

### 6.2 资源闭包 API

rendercore 至少公开：

```ts
parseImageStringManifest(value)
collectImageStringAssetPaths(manifest)
validateImageStringPackageContents({ manifest, files })
createImageStringResource({ manifest, imageModules })
createImageStringResourceFromFiles({ manifest, files, decodeImage? })
loadImageStringResourceFromUrl({ manifestUrl, fetchImpl?, decodeImage? })
```

合同：

- standalone files 必须精确等于 `image-string.manifest.json + glyph closure`，缺文件和 orphan 文件都失败。
- Vite `imageModules` keys 必须与 glyph closure 精确一致，不接受 glob 带入额外美术。
- files loader 通过 Object URL 加载，失败时回收已创建 URL。
- URL loader 只允许 http/https，同源目录内相对资源，不允许 path escape；任何 fetch/JSON/decode/size 错误都释放已创建资源。
- resource 创建后所有 glyph texture 都已可用并完成尺寸核对；renderer 不在第一次 `setText()` 时才随机暴露缺图。
- resource 与 renderer ownership 明确：resource 可被多个 renderer 共享；renderer destroy 不销毁共享 resource；resource destroy 后创建新 renderer 或加载纹理必须失败。

## 7. rendercore 图片字符串 renderer

模块目录建议：

```text
packages/rendercore/src/image-string/
  errors.ts
  types.ts
  manifest.ts
  resource.ts
  layout.ts
  render-image-string.ts
  index.ts
```

公共 API 建议：

```ts
interface RenderImageStringOptions {
  readonly resource: ImageStringResource;
  readonly text: string;
  readonly anchor?: { readonly x: number; readonly y: number };
}

interface RenderImageString {
  readonly container: Container;
  setText(text: string): void;
  setAnchor(anchor: { readonly x: number; readonly y: number }): void;
  getSnapshot(): ImageStringSnapshot;
  destroy(): void;
}

createRenderImageString(options): RenderImageString
```

### 7.1 精确布局公式

按 `Array.from(text)` 从左到右处理。对第 `i` 个 glyph：

```text
cellAdvance = fixed group advanceWidth ?? glyph.size.width
alignOffset = start  -> 0
              center -> (cellAdvance - glyph.size.width) / 2
              end    -> cellAdvance - glyph.size.width
spriteX = cursorX + alignOffset + glyph.offset.x
spriteY = glyph.offset.y
cursorX += cellAdvance
if not last glyph: cursorX += letterSpacing
```

logical rect：

```text
x = 0
y = 0
width = sum(cellAdvance) + letterSpacing * max(0, glyphCount - 1)
height = lineHeight
```

anchor pivot：

```text
pivot.x = logicalWidth * anchor.x
pivot.y = lineHeight * anchor.y
```

anchor x/y 必须是 `0..1` 有限数，默认 `{x: 0.5, y: 0.5}`。visual bounds 由所有 sprite 实际矩形 union 得出；空字符串 visual bounds 为 null。

### 7.2 生命周期和性能

- 构造和 `setText()` 先完整校验输入，再改变 container，确保失败时旧字符串、sprite 列表和 snapshot 原封不动。
- 重复字符共享 Texture，但每个可见 occurrence 使用独立 Sprite。
- `setText()` 复用可用 Sprite 或小型池，不能每次计数 tick 都重新 Assets.load、泄漏 sprite 或增长监听器。
- 相同字符、相同位置可复用；实现不要求复杂 diff，但 snapshot、顺序和 Pixi child order 必须稳定。
- snapshot 至少包含 text、glyphCount、logicalBounds、visualBounds、anchor、每个 occurrence 的 character/path/x/y/width/height/advance/groupId。
- `destroy()` 幂等，清理 sprite/pool/container 引用；destroy 后 `setText/setAnchor` 显式失败。
- renderer 不创建 `PIXI.Application`、renderer、canvas、DOM 或 RAF；consumer 提供 parent/update 环境。
- 不使用 Text、BitmapText、Canvas 2D、字体或隐藏 canvas 作为 fallback。

## 8. `apps/Imgnumbereditor` 初始化

### 8.1 项目结构

```text
apps/Imgnumbereditor/
  index.html
  package.json
  tsconfig.json
  tsconfig.eslint.json
  vite.config.ts
  eslint.config.cjs
  .prettierignore
  README.md
  src/
    main.ts
    styles.css
    vite-env.d.ts
    model/editor-project.ts
    model/editor-store.ts
    io/image-string-zip.ts
    io/image-decoder.ts
    preview/image-string-preview.ts
    preview/counter-template.ts
    ui/app-shell.ts
  tests/
    fixtures/**
    editor-project.test.ts
    editor-store.test.ts
    image-string-zip.test.ts
    image-string-preview.test.ts
    counter-template.test.ts
    app-shell.test.ts
```

Vite `base` 固定为 `./`，`dist/` 可放任意静态 CDN 子路径。应用不发业务网络请求、不连接 WebSocket、不需要服务器。

### 8.2 编辑状态

draft 至少维护：

```ts
interface ImageStringEditorProject {
  id: string;
  metrics: { lineHeight: number; letterSpacing: number };
  glyphs: Map<string, GlyphDraft>;
  fixedAdvanceGroups: FixedAdvanceGroupDraft[];
  unmappedFiles: Map<string, UploadedImageDraft>;
}
```

- 新建项目默认 id `new-image-string`、lineHeight `64`、letterSpacing `0`、无 glyph、无 group。
- 多选上传后先真实 decode；文件进入 unmapped 区，不因文件名自动成为有效 glyph。
- 对 `0-1.png` 这类 basename，可把最后 `-<digits>` 去掉后生成“建议字符”；只有建议结果恰好一个 Unicode scalar 时显示“一键确认”候选。候选不是 manifest 数据，用户未确认前不能导出。
- 显式映射字符后按 code point 生成目标 path。重复字符、目标 path 冲突、非法字符都在 commit 前失败。
- 支持替换图片、修改 offset、取消映射、删除 unmapped 文件、增加/删除/编辑 fixed group。
- 增加 fixed group 时提供“使用成员最大 visual width”按钮；它只填写 draft 数值，仍走同一严格 parser。
- 所有用户动作通过 store transaction：clone -> mutate -> validate applicable draft state -> commit -> 通知 preview。失败不污染当前项目。
- 导入 ZIP 必须在完整 parser、资源闭包、图片 decode 和尺寸校验通过后原子替换项目；失败保留旧项目和 preview。

### 8.3 UI 布局

建议三栏或两栏加底部模板区：

- 项目区：id、新建、导入 ZIP、导出 ZIP、全局错误。
- 美术库区：批量上传、unmapped 列表、原文件名、建议字符、映射输入、真实尺寸、缩略图、替换/删除。
- glyph 配置区：字符、path、width/height 只读、offset x/y、所属 fixed group。
- spacing 区：lineHeight、letterSpacing、group id、成员、advanceWidth、align、最大宽度填充按钮。
- preview 区：Pixi canvas、背景明暗切换、zoom、logical/visual bounds guide、当前 snapshot。
- template 区：静态模板列表、自由输入、计数模板、play/pause/reset。

预览 canvas 不允许拖动 glyph 改配置；所有配置来自表单。zoom 只改变 editor 显示比例，不写进 manifest。

### 8.4 默认验证模板

新项目默认创建以下可编辑模板：

```text
0123456789
9876543210
001234567890
+123.45
-678.90
12×34
```

- 模板不属于 manifest，不进入 ZIP。
- 缺 glyph 时该模板显示具体缺少字符的错误，不隐藏、不跳过、不使用字体替代。
- 自由输入框实时调用同一个 rendercore renderer。
- 默认计数模板：`001 -> 100`、`step=1`、`intervalMs=50`、`repeat=true`。
- 每个模板 renderer/resource 必须在切项目、重新导入和 destroy 时释放。

### 8.5 ZIP 安全合同

复用 browserartifactio，限制固定为：

```text
max entries: 512
max compressed: 50 MiB
max single file: 20 MiB
max total expanded: 100 MiB
```

- path policy 要求 ASCII lowercase canonical POSIX path。
- 拒绝绝对路径、反斜杠、`.`、`..`、空 segment、NUL、URL/query/hash、case-fold collision、NFC collision。
- `__MACOSX`、`.DS_Store`、`._*`、未引用图片和目录 entry 不是“可忽略文件”，都导致精确闭包失败。
- 使用 streaming bounded unzip，不对未知输入调用无限制 `unzipSync`。
- 导出使用 deterministic zip：稳定 key order、稳定 entry order、固定 mtime。
- 导出前必须用 rendercore files loader 做一次 production 等价的完整校验；不能只相信 editor draft。

## 9. `symbolseditor` 接入

### 9.1 symbol manifest 新模式

扩展现有 `SymbolValuePresentationTextSpec`，新增：

```ts
interface SymbolValuePresentationImageStringTextSpec
  extends SymbolValuePresentationTextBaseSpec {
  readonly type: "image-string";
  readonly manifest: string;
  readonly scale: number;
  readonly anchor: { readonly x: number; readonly y: number };
}
```

示例：

```json
{
  "type": "image-string",
  "slot": "Num",
  "x": 0,
  "y": 0,
  "scale": 1,
  "anchor": { "x": 0.5, "y": 0.5 },
  "manifest": "./dependencies/image-strings/game002-gold-digits/image-string.manifest.json"
}
```

合同：

- `font`、旧 `image(prefix + 完整数值.png)`、新 `image-string` 三种模式是显式 union，不互相 fallback。
- 新模式仍接收现有 positive safe integer value，严格用 `String(value)` 交给 image-string renderer；不丢数字、不做 locale formatting、不补零。
- x/y/scale/anchor 作用于挂到 configured Spine slot 内的同一个 RenderImageString container；数字必须继续继承 slot/bone 动画。
- 缺 glyph、dependency manifest、glyph 图片或尺寸错配必须在 symbol package prepare/preview/export 阶段失败。
- `createSymbolValueDisplay` 不复制 glyph 布局，只装配 image-string resource/renderer。
- controller clear/destroy、tier player 切换和异步 init 必须清理/保留正确的 image-string 实例，不能让旧数字残留或把 reel texture 隐藏为空格。

### 9.2 symbols package vendoring

- editor 增加“图片字符串资源库”面板：导入、列出 id/glyph/group、替换、清除未引用库。
- value presentation 表单新增 `image-string` 选项和 dependency selector；不能让用户手填一个并不存在的 manifest 路径冒充已导入资源。
- 导入 standalone ZIP 后 vendor 为 `dependencies/image-strings/<id>/image-string.manifest.json + assets/**`。
- `symbols.package.json.resources` 必须包含 dependency manifest 与所有 glyph，稳定排序、无 orphan。
- symbol package parser/resource 创建要读取 nested manifest、解析相对路径、核对完整 closure，并为每个引用共享同一个 dependency resource。
- `collectSymbolManifestResourcePaths()`、`createSymbolPackageResource()`、editor export/import round-trip 和 CDN/Vite consumer helper 同步支持。
- `generate-symbol-state-textures.mjs` 必须严格保留新 text union，不得在重生成时删掉或退回 font/image。
- `generate-symbol-value-vite-resources.mjs` 必须精确生成 nested manifest 与 glyph imports/loading URLs；禁止宽泛 glob。
- symbols ZIP 重新导入后恢复 dependency 列表和 selector，不把 vendored 文件显示成 unmapped/orphan。
- 未被任何 symbol 引用的 dependency 不进入导出；UI 可保留 draft，但导出前应要求清理或显式失败，不能悄悄打包。

### 9.3 backward compatibility

- 现有 game002 `text.type=image` 合同保持不变，`${value}.png` 完整值图片仍按原规则校验。
- 现有 symbols fixtures、game002/game003 manifests 不批量重写。
- 新 union 只在显式配置 `type: image-string` 时生效。
- rendercore public 类型变化不能迫使未使用 image-string 的 consumer 提供空 dependency map。

## 10. `gamelayouteditor` 与 scene layout 接入

### 10.1 scene layout node 新资源类型

扩展 `SceneLayoutNodeResourceSpec`：

```ts
interface SceneLayoutImageStringResourceSpec {
  readonly kind: "image-string";
  readonly manifest: string;
  readonly initialText: string;
  readonly anchor: { readonly x: number; readonly y: number };
}
```

示例：

```json
{
  "id": "credit-label",
  "order": 20,
  "resource": {
    "kind": "image-string",
    "manifest": "assets/image-strings/game002-gold-digits/image-string.manifest.json",
    "initialText": "+123.45",
    "anchor": { "x": 0.5, "y": 0.5 }
  },
  "placements": {
    "default": { "x": 1000, "y": 1700, "scale": 1 }
  }
}
```

- initialText 必须在 parse/resource prepare 时完整覆盖 glyph；缺字失败。
- placement x/y/scale 继续复用 scene layout 通用 node 逻辑，不能为 image-string 复制 variant/focus 映射。
- node order 与 image/Spine 一起稳定排序。
- scene runtime 创建 RenderImageString 并挂在 node container；不创建额外 canvas。
- 公共 runtime 新增 `setImageStringText(nodeId, text)` 和只读 snapshot/query；对非 image-string node 调用必须失败。
- 更新文本不改变 manifest initialText；initialText 是初始/重建值，业务运行期字符串仍由 app 通过 public API 提交。
- `applyViewport()`、variant 切换、attachChild/before/after 和 destroy 必须继续正常工作。

### 10.2 layout package vendoring

- editor 增加 image-string library 面板和“添加图片字符串图层”。
- node 表单只从已导入 id 选择 dependency，配置 initialText、anchor、order 和各 variant placement/scale。
- preview 必须使用 scene runtime 的真实 node，不在 app 内再组 sprite。
- 导入 ZIP vendor 到 `assets/image-strings/<id>/...`；导出 layout ZIP 时只包含被 node 引用的 dependency 闭包。
- `collectSceneLayoutAssetPaths()` 保持现有直接资源 API 兼容；新增能读取 dependency manifest/files 的 package closure API，用于 nested manifest + glyph 资源精确收集。不得通过 glob 猜 dependency 内容。
- `createSceneLayoutResource()` 增加显式 image-string manifest/resource maps；`loadSceneLayoutResourceFromUrl()` 先 fetch nested manifest，再 fetch 精确 glyph closure并核对尺寸。
- layout ZIP importer/exporter、resource classifier、Blob URL registry 和 exact closure 校验同步扩展。
- 重新导入 layout ZIP 后恢复 image-string dependencies 与 node 表单；缺 nested manifest、额外 glyph、同 id 不同 manifest、path escape 均失败。
- 未引用 dependency 不进入 layout ZIP；不能改变“layout ZIP 不嵌入 symbols package”的既有合同。

## 11. 测试计划

### 11.1 rendercore unit tests

manifest/parser：

- 最小 natural width manifest、digits fixed group、多个 group。
- unknown key、错误 version/kind/id、空 glyph map、非法 Unicode key、NFD key、控制字符。
- 非 canonical path、错误扩展名、重复路径、case/NFC collision、资源逃逸。
- 非法 size/offset/lineHeight/letterSpacing。
- group 空成员、重复成员、未知 glyph、跨组重复、非法 align、advanceWidth 太小。
- parse 后递归 immutable。

resource：

- files/Vite/CDN 三种输入的 exact closure。
- 缺 manifest、缺 glyph、orphan、坏 JSON、坏 PNG/WebP、声明/实际尺寸漂移。
- fetch 非 2xx、跨目录 URL、部分失败后的 Object URL 清理。
- 多 renderer 共享 resource、destroy 顺序和 use-after-destroy。

layout/renderer：

- natural width 公式、fixed center/start/end 公式、letterSpacing、offset、anchor。
- 当前风格 `36/26/37/...` digits 在统一 advance 下 logical position 等距，纹理宽度保持原值。
- `+123.45`、`-678.90`、`12×34` 的混合 natural/fixed 布局。
- surrogate pair glyph 按一个 code point；NFD 输入和控制字符失败。
- 空字符串、重复字符、相同文本、长文本。
- 未映射字符 setText 原子失败，旧 child/snapshot 不变。
- sprite 复用、child order、snapshot、幂等 destroy、destroy 后调用失败。

### 11.2 Imgnumbereditor tests

- `0-1.png` 仅产生建议，确认后才进入 glyph map。
- code point path 派生、字符/path 冲突、替换图片、尺寸更新、offset/group transaction。
- 导入成功原子替换；导入失败保留旧 project/resource/preview。
- ZIP traversal、zip bomb limits、orphan、deterministic export、round-trip bytes/manifest 等价。
- default templates 的缺字错误和成功 snapshot。
- `001 -> 100` 前导零、inclusive endpoint、step/方向/整除校验、interval 累计、pause/reset/repeat。
- UI smoke：上传、映射、建 digits group、预览、导出、再导入。
- base `./` build 后 HTML/JS/CSS 不含根绝对 asset URL。

### 11.3 symbol integration tests

- 三种 text type union 均能解析，字段不可串用。
- nested dependency closure、relative path resolve、同 id 冲突、未引用资源失败。
- numeric value -> exact string -> RenderImageString snapshot。
- image-string container 真正挂入 configured Spine slot；tier/Loop/Start 切换不丢失或复制 display。
- prepare/show/update/clear/destroy 和异步 init race。
- symbols editor import/select/export/re-import，dependency 不成为普通 symbol asset/unmapped file。
- generator output 精确包含 nested manifest/glyph，`--check` 能抓漂移。
- 原有 font/image fixtures 全部继续通过。

### 11.4 layout integration tests

- scene parser 新 node strict fields、initialText 缺字、node order、variant placement。
- layout resource files/Vite/CDN nested load 和 exact closure。
- runtime initialText、`setImageStringText()`、非目标 node 错误、snapshot、viewport/variant/destroy。
- gamelayouteditor 导入/select/add node/export/re-import，未引用 dependency 不打包。
- 既有 image/Spine/reel/symbol preview tests 不回归。

### 11.5 fixture 原则

- 自动测试 fixture 放在各 package/app tests 下，使用有明确来源的小型透明 PNG/WebP。
- 不从 `assets/game002-s3` 复制用户未跟踪文件进 snapshot，也不对它们做 hash 锁定。
- 几何断言使用中性 glyph 名和不同宽度，证明 rendercore 没硬编码数字、game002 或文件名 `-1`。
- 若测试迫使实现写出奇怪 production 分支，修改错误的测试/fixture；不要改坏 parser、放宽缺字或加入 fallback 来迎合测试。

## 12. 实施步骤

### 阶段 A：基线与合同测试

1. 记录 branch/HEAD/status、Node/pnpm 版本和现有相关 package test baseline。
2. 阅读并保留 browserartifactio、symbol package、value presentation、scene layout 的当前 public contract。
3. 先添加 neutral fixture 与 image-string parser/layout/resource contract tests，再实现最小通过代码。
4. 在 rendercore package exports、root index 和 README 建立明确模块边界。

### 阶段 B：rendercore image-string

1. 实现 types/errors/manifest parser/deep freeze/asset closure。
2. 实现 files/Vite/CDN resource loader、图片解码尺寸校验和 ownership。
3. 实现纯布局函数与 RenderImageString Pixi renderer。
4. 完成 atomic setText、anchor、snapshot、sprite reuse 和 destroy tests。
5. 跑 rendercore format/lint/typecheck/test/build，先稳定公共 API。

### 阶段 C：Imgnumbereditor

1. 建 Vite/TS/Pixi 脚手架、package scripts、relative base 和 README。
2. 实现 project/store transaction、图片 decode、suggestion/confirm mapping、fixed groups。
3. 实现 rendercore-backed preview、bounds guide、静态模板和 counter driver。
4. 实现 bounded deterministic ZIP import/export 和原子替换。
5. 完成 UI、错误展示、资源销毁、tests 和静态 build。

### 阶段 D：symbolseditor 接入

1. 扩展 symbol manifest text union 和 parser tests。
2. 扩展 value presentation resource/display/controller 与 nested dependency loader。
3. 扩展 symbol package closure、files/Vite generator 和状态贴图 generator preservation。
4. 扩展 editor project/store/UI/preview/ZIP round-trip。
5. 证明旧 font/image 行为无回归。

### 阶段 E：gamelayouteditor 接入

1. 扩展 scene layout node type、parser/resource/runtime/public setter。
2. 扩展 nested package closure、files/Vite/CDN loader。
3. 扩展 editor project/store/UI/preview/ZIP round-trip。
4. 证明 image/Spine node、focus/reel geometry 和 symbols preview 无回归。

### 阶段 F：文档、协作规则与验收

1. 新增 `docs/image-string-manifest.md`，写 schema、布局公式、ZIP、Vite/CDN/consumer 示例。
2. 更新 rendercore、Imgnumbereditor、symbolseditor、gamelayouteditor README。
3. 更新 `agents.md`：image-string runtime ownership 属于 rendercore，三个 editor 只做各自 UI/IO，禁止 fallback/glob/复制 glyph 算法。
4. 用当前 `assets/game002-s3/0-1.png ... 9-1.png` 手工导入，建立 digits fixed group，验证 `0123456789` 和 `001 -> 100`；只读使用，不改源文件。
5. 执行全部门禁，检查 git diff/status，写 UTC 中文报告。

## 13. 执行与验收命令

先确认版本：

```bash
node --version
pnpm --version
```

依赖安装：

```bash
pnpm install
```

如果依赖下载失败，使用指定代理后重试同一命令：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
pnpm install
```

定向门禁：

```bash
pnpm --filter @slotclientengine/browserartifactio format:check
pnpm --filter @slotclientengine/browserartifactio lint
pnpm --filter @slotclientengine/browserartifactio typecheck
pnpm --filter @slotclientengine/browserartifactio test
pnpm --filter @slotclientengine/browserartifactio build

pnpm --filter @slotclientengine/rendercore format:check
pnpm --filter @slotclientengine/rendercore lint
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore build

pnpm --filter imgnumbereditor format:check
pnpm --filter imgnumbereditor lint
pnpm --filter imgnumbereditor typecheck
pnpm --filter imgnumbereditor test
pnpm --filter imgnumbereditor build

pnpm --filter symbolseditor format:check
pnpm --filter symbolseditor lint
pnpm --filter symbolseditor typecheck
pnpm --filter symbolseditor test
pnpm --filter symbolseditor build

pnpm --filter gamelayouteditor format:check
pnpm --filter gamelayouteditor lint
pnpm --filter gamelayouteditor typecheck
pnpm --filter gamelayouteditor test
pnpm --filter gamelayouteditor build
```

受影响根门禁：

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

generator 的真实命令以实施时 package script/README 为准，但必须至少执行受影响的生成与漂移检查；不能手改 generated 文件冒充生成成功。若某个 generator 没有 `--check`，本任务应补上可重复的 check 入口或在报告中说明等价漂移校验。

手工 QA：

```bash
pnpm --filter imgnumbereditor dev -- --host 0.0.0.0
pnpm --filter symbolseditor dev -- --host 0.0.0.0
pnpm --filter gamelayouteditor dev -- --host 0.0.0.0
```

手工检查：

1. 导入十张不同宽度数字图片，确认 natural 模式不等距、digits fixed group 后 logical cell 等距且图片没有拉伸。
2. 添加 `. + - ×` 后验证它们可以保持 natural width。
3. 静态模板缺字符时看到明确错误，补齐后正常渲染。
4. `001 -> 100` 按 step/interval 变化，前导零稳定，pause/reset/repeat 正确。
5. standalone ZIP 导出后重新导入，manifest、资源和预览等价。
6. symbolseditor 导入同一 ZIP，在 valuePresentation 中选择并预览，symbols ZIP 重导入仍可用。
7. gamelayouteditor 导入同一 ZIP，添加 layout node，改变 initialText/variant placement，layout ZIP 重导入仍可用。
8. 删除/破坏 glyph、修改尺寸、加入 orphan 或 path traversal 后都显式失败，无 fallback。

## 14. 完成定义

- [ ] `apps/Imgnumbereditor` 是可独立部署的纯前端 Vite 应用，目录大小写和 package name 符合合同。
- [ ] rendercore 提供通用 image-string manifest/resource/renderer/public subpath，未硬编码数字或 game002。
- [ ] 字符映射支持数字、点、正负号、乘号、加号及其它单 Unicode scalar。
- [ ] natural width 与可选 fixed advance group 可同时使用；固定组只统一 advance，不拉伸图片。
- [ ] 任意未映射字符、缺资源、坏尺寸、坏路径、未知字段均尽早失败，没有占位或字体 fallback。
- [ ] standalone ZIP 可 bounded import、deterministic export、原子替换和 round-trip。
- [ ] 默认静态模板和 `001 -> 100` 变化模板可用于验证配置，且没有进入 rendercore。
- [ ] symbolseditor 能导入 ZIP、配置 `valuePresentation.text.type=image-string`、预览并导出自包含 symbols ZIP。
- [ ] gamelayouteditor 能导入 ZIP、配置 image-string layout node、预览、运行时 setText 并导出自包含 layout ZIP。
- [ ] 旧 symbol font/image、旧 layout image/Spine、现有 ZIP 合同与 production manifests 无回归。
- [ ] 所有 consumer 使用 rendercore public API，没有复制 glyph layout、Pixi sprite 或 ZIP 安全实现。
- [ ] `docs/`、四个 README 和必要的 `agents.md` 已同步。
- [ ] 定向与根级 format/lint/typecheck/test/build 全通过；任何环境性跳过都在报告中逐条说明且不能伪报通过。
- [ ] 用户已有和未跟踪文件未被覆盖、移动、删除或顺手提交。
- [ ] 已生成符合命名规则的中文 UTC 任务报告。

## 15. 任务报告要求

报告必须至少包含：

1. UTC 完成时间、branch、起止 HEAD、最终 `git status --short`。
2. 实际新增/修改文件和公共 API 摘要。
3. 最终 manifest 示例、等距公式和 ZIP 目录实例。
4. Imgnumbereditor 静态/动态模板结果。
5. symbolseditor 与 gamelayouteditor 的导入、引用、导出、重导入结果。
6. automated tests、generator checks、build 和手工 QA 的命令及真实结果。
7. 是否使用代理；若使用，说明仅用于依赖下载，不记录敏感信息。
8. 是否修改 `agents.md` 及原因。
9. 保留的用户 working tree 修改/未跟踪文件清单。
10. 未完成项、已知限制和后续生产迁移建议；不得把未验证项写成已完成。

如果测试失败是因为旧断言与本任务明确新合同冲突，应修改测试使其验证正确合同；不得通过 production fallback、吞异常、`as any`、跳过测试、降低 strictness 或复制第二套实现来让测试变绿。
