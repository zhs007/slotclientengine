# symbols editor bootstrap 任务计划

## 1. 任务目标

本任务新增一个纯前端 symbols 编辑器：

```text
apps/symbolseditor
```

编辑器接收一份本地公开的 game config JSON，建立该游戏的 symbol 项目；用户配置统一的逻辑 cell 宽高、选择需要打包的 display symbols、为每个 symbol 提交基础图片并编辑各状态资源，最终导出一个可重新导入的 symbols ZIP。

同时扩展任务 98 已完成的：

```text
apps/gamelayouteditor
```

使布局编辑器能够导入同一个 symbols ZIP，把 ZIP 声明的 `cellSize.width/height` 原子覆盖到布局项目 `main` grid 的 `cellWidth/cellHeight`，并在现有 scene-layout 预览里按真实 grid geometry 显示 default/normal 状态 symbol。

最终用户流程固定为：

```text
symbols 编辑器
  上传 gameconfig.json
  -> 设置 cell width / height
  -> 选择 display symbols
  -> 上传每个 symbol 的 normal 与状态资源
  -> 单状态预览和严格校验
  -> 导出 <project-id>-symbols.zip

布局编辑器
  导入 layout zip 或创建 layout
  -> 导入 <project-id>-symbols.zip
  -> 使用 symbols zip 的 cellSize 覆盖 main grid cellSize
  -> 在 main grid 中显示 normal symbols
```

`gameconfig.json` 必须打进 symbols ZIP。布局编辑器不再要求用户另外上传第二份 game config，以免 ZIP 内外出现两个互相冲突的数据源。布局编辑器只接受 symbols ZIP 中已经通过严格校验的 game config、symbol manifest 与资源闭包。

本文件是完整实施合同，不依赖聊天记录、任务 98 文本或口头补充才能执行；任务 98 仅作为现有代码基线，不是运行本任务的前置阅读材料。

完成后必须新增中文执行报告：

```text
tasks/100-symbols-editor-bootstrap-[utctime].md
```

UTC 时间戳格式：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/100-symbols-editor-bootstrap-260401-181300.md
```

## 2. 已确定的产品决定

### 2.1 game config 是否放进 ZIP

结论：放进去，而且是 ZIP 的必需 entrypoint。

原因和边界：

- game config 是 symbol code、paytable 和本地公开 reel 数据的权威输入；不能让布局编辑器再接收一份可能不同的外部 JSON。
- `symbol-state-textures.manifest.json` 仍只描述 symbol 的可展示集合、贴图、scale、renderPriority、动画和 value presentation；不能把 paytable/reels 复制进 symbol manifest。
- 导出时把已解析成功的 game config 稳定格式化为 `gameconfig.json`，不修改数值和数组顺序。
- game config 只能是可公开的本地客户端配置，不能包含服务器真实轮带、token、cookie、玩家下注或本次 spin 数据。

### 2.2 symbol 宽高的语义

symbols package 新增唯一的逻辑尺寸：

```ts
cellSize: {
  width: number;
  height: number;
}
```

- `cellSize` 是 symbol 所在 reel cell 的逻辑宽高，不要求所有 PNG 的 decoded pixel size 与它相同。
- symbol 图片、VNI、Spine 仍按资源原始尺寸与 manifest `scale/transform` 渲染，不允许导入时偷偷 resize 图片。
- symbols 编辑器预览使用该 cell rect 作为真实尺寸参考。
- 布局编辑器导入 symbols ZIP 时，ZIP 的 `cellSize` 必须覆盖当前 layout `main` grid 的 `cellWidth/cellHeight`；不是仅给 warning，也不是布局值反向覆盖 ZIP。
- 覆盖时保留 columns、rows、gap 和 grid x/y placement；按现有 focus offsets 重新派生各 variant focus。若新尺寸让 grid 越出 art/focus，严格校验应立即报错，不得自动缩小、移动或回退旧尺寸。

### 2.3 状态编辑与状态编排

初始化版本包含：

- 编辑顶层 texture states，例如当前 `spinBlur`、`disabled`。
- 编辑每个 symbol 的 `normal`、state texture、`scale`、`renderPriority`。
- 编辑每个 symbol 各 animation state 的资源类型、资源引用、transform 和 playback。
- 单独选择一个 state 进行预览；once 动画可以手动 replay，loop 动画持续更新。

初始化版本不包含：

- 不移植 `apps/symbolsviewer/src/viewer-sequence.ts`。
- 不做 sequence step、hold、next、自动状态切换、cascade timeline 或跨 symbol 状态编排。
- 不做 spin、stop、appear cadence、win carousel、remove/drop/refill 或业务组件编排。

布局编辑器更严格：只显示 default state，即 manifest preset 的 `normal`，不提供 state selector，不播放 sequence。

### 2.4 ZIP 与 layout ZIP 的关系

- symbols ZIP 和任务 98 的 layout ZIP 是两个独立 artifact。
- 布局编辑器可以同时在内存中持有一个 layout project 和一个 imported symbols package。
- layout ZIP 导出合同保持 `layout.manifest.json + layout assets`，不得把 symbols ZIP 或 symbol resources 偷偷嵌进去。
- symbols ZIP 也不得嵌入 scene layout manifest/assets。
- 后续若要做统一游戏美术发布包，另立任务定义，不在本任务猜测。

## 3. 范围

### 3.1 包含

- 新增 `apps/symbolseditor`，使用 Vite + TypeScript + Pixi.js v8。
- 新增 strict symbol-package v1 manifest/parser/resource contract。
- browser 内受限 ZIP 导入、导出、原子 project 替换和 Blob URL 生命周期。
- 上传/解析 game config，建立 symbol code 列表和 display set。
- 新建、编辑、删除/排除 symbol manifest 项。
- normal、state texture、builtin/static、VNI、official Spine 4.3、activeSpine/valuePresentation 现有 manifest 能力的结构化编辑和预览。
- 导入已有 symbols ZIP、继续编辑、重新导出。
- 用当前 game002-s3、game003-s1 manifest/game config/资源构造集成 fixture，证明 package/resource/runtime 可表达现状。
- 扩展 `apps/gamelayouteditor` 导入 symbols ZIP，覆盖 cell size 并显示 normal symbols。
- 将两个 editor 都需要的 bounded ZIP/path 工具提取为小型 browser-safe workspace package，避免跨 app import 或复制安全代码。
- 文档、测试、构建门禁和必要的 `agents.md` ownership 更新。

### 3.2 不包含

- 不修改 game002/game003 production manifest、game config、Vite closure 或运行时接入。
- 不把服务器 scene、真实轮带、otherScene、value、随机数或 spin 结果放进 ZIP。
- 不做账号、后端、数据库、上传 API、云保存、多人协作、版本服务器或 CDN 发布。
- 不做 localStorage、IndexedDB、service worker 或自动恢复草稿。
- 不做 canvas 拖动回写 symbol 配置。
- 不做 symbolsviewer 状态编排、时间线或自动 sequence。
- 不做 layout + symbols 合并发布包。
- 不在 browser 中复制现有 Sharp 状态贴图生成算法。初始化版本的 `spinBlur/disabled` 等成品 PNG 由用户上传或先用现有 `packages/rendercore/scripts/generate-symbol-state-textures.mjs` 生成后上传；编辑器负责引用、校验、预览和打包。
- 不为缺 normal、缺 state texture、缺 animation、缺 VNI asset、缺 Spine animation 或未知版本添加 placeholder、builtin/default fallback。
- 不扩大 Spine 版本；仍只支持 official `4.3.x`。

## 4. 当前实现基线

仓库：

```text
/Users/zerro/github.com/slotclientengine
```

制定计划时：

```text
branch: main
HEAD: 4ebde11c7af7677d9f836095d847959bd8852285
working tree: clean
```

执行时必须重新记录 branch、HEAD 和 `git status --short`。已有修改和未跟踪文件都属于用户，禁止 reset、checkout、stash、clean、覆盖或顺手格式化范围外文件。

工具链：

- Node.js `>=24.0.0`
- pnpm `>=10.0.0`
- turbo、Vite、Vitest、ESLint、Prettier
- Pixi.js v8
- `@esotericsoftware/spine-pixi-v8 ~4.3.10`
- workspace 已包含 `apps/*` 和 `packages/*`

### 4.1 layout editor 基线

主要文件：

```text
apps/gamelayouteditor/src/model/editor-project.ts
apps/gamelayouteditor/src/model/editor-store.ts
apps/gamelayouteditor/src/preview/layout-preview.ts
apps/gamelayouteditor/src/io/imported-layout-zip.ts
apps/gamelayouteditor/src/io/exported-layout-zip.ts
apps/gamelayouteditor/src/io/filename-policy.ts
apps/gamelayouteditor/src/io/object-url-registry.ts
apps/gamelayouteditor/src/ui/app-shell.ts
packages/rendercore/src/scene-layout/**
docs/scene-layout-manifest.md
```

现有 `EditorProject.reel` 已包含：

```ts
columns;
rows;
cellWidth;
cellHeight;
gapX;
gapY;
placements;
```

现有 preview 已通过 `createSceneLayoutRuntime()` 和 `resolveSceneLayoutFrameViewport()` 得到真实 art/reel geometry，并在 Pixi stage 画 focus/reel guides。本任务必须在这套 runtime/geometry 上加 symbol preview，不能另算 grid cell 坐标或 viewport。

现有 layout ZIP 安全限制为：

```text
max entries: 256
max compressed: 50 MiB
max single file: 20 MiB
max total expanded: 100 MiB
```

提取共享 ZIP 工具时必须保持现有 layout 行为与测试，不得放宽。

### 4.2 symbol runtime 与 viewer 基线

权威实现：

```text
packages/rendercore/src/symbol/manifest.ts
packages/rendercore/src/symbol/catalog.ts
packages/rendercore/src/symbol/vni-animation.ts
packages/rendercore/src/symbol/spine-animation.ts
packages/rendercore/src/symbol-value-presentation/**
apps/symbolsviewer/src/symbol-set-config.ts
apps/symbolsviewer/src/symbol-assets.ts
apps/symbolsviewer/src/main.ts
```

必须复用的 rendercore 公共能力包括但不限于：

```text
parseSymbolStateTextureManifest
createSymbolAssetMapFromManifestModules
createSymbolScaleMapFromManifest
createSymbolRenderPriorityMapFromManifest
createSymbolAnimationCapabilityMapFromManifest
createSymbolManifestAnimationResolver
createSymbolValuePresentationResourcesFromManifest
createSymbolStatePresetFromManifest
createSymbolCatalog / createStandaloneSymbolCatalog
RenderSymbol
```

`symbolsviewer` 当前把 game002/game003 资源编译成 Vite modules。编辑器面对的是运行时上传 bytes，所以需要新增通用的“从 package bytes/object URLs 组装同一种 resource”的 API，但不得把 manifest schema、VNI/Spine parser/player、value controller 或 Pixi 私有树操作复制到 editor app。

### 4.3 当前 game config 与 display set 差异

当前两份 game config 顶层均为：

```text
paytable
symbolCodes
reels
```

- game002 game config 有 13 个 symbol，game002-s3 manifest 也有 13 个 display symbol。
- game003 game config 有 27 个 symbol，而 game003-s1 主 manifest 当前只有 14 个 display symbol。

因此不能强制 `gameConfig.symbolCodes === manifest.symbols`。合同必须是：

- manifest 中每个 display symbol 都必须存在于 game config，code/paytable 映射必须一致。
- game config 可以包含未进入该 symbols package 的辅助 symbol。
- 新建项目时默认列出 game config 全部 symbol，由用户显式勾选哪些进入 display set。
- 未勾选项不需要资源，也不能被宽泛文件扫描偷偷打包。

## 5. Ownership 与依赖

```text
packages/rendercore/symbol
  symbol-package manifest parser
  game config / display set 交叉校验
  exact resource classification
  bytes/modules -> catalog/resolver/value resources 的通用组装
  RenderSymbol 与官方 VNI/Spine/value 生命周期

packages/browserartifactio（新增）
  browser-safe bounded zip extract/create
  package path 安全校验
  deterministic JSON/zip entry ordering
  Blob URL registry

apps/symbolseditor
  UI、draft/store、File/Blob、资源上传映射、单状态预览、import/export

apps/gamelayouteditor
  symbol package 导入入口
  cellSize 覆盖事务
  normal-only grid preview
  layout 与 symbol package 各自生命周期

apps/symbolsviewer
  保持现有调试 viewer；本任务不把它改造成 editor
```

`packages/browserartifactio` 的 package name 固定为 `@slotclientengine/browserartifactio`。它必须是无 DOM renderer、无 Pixi、无 Node fs 的小包；依赖当前仓库已有 `fflate ^0.8.3`。两个 app 绝不能各自维护一份 bounded unzip/path security 算法。

`apps/symbolseditor` 依赖控制为：

```text
@slotclientengine/rendercore
@slotclientengine/browserartifactio
pixi.js
```

`apps/symbolseditor` 不直接依赖 logiccore 或 fflate；game config parser 通过 rendercore symbol-package API 复用 logiccore，ZIP 能力由 browserartifactio 封装。

不得依赖 gameframeworks、uiframeworks、netcore、gameloading 或任何 live session 能力。

## 6. Symbols package v1 合同

### 6.1 ZIP 目录

导出文件名：

```text
<project-id>-symbols.zip
```

zip 根目录至少包含：

```text
symbols.package.json
gameconfig.json
symbol-state-textures.manifest.json
<manifest/resource 引用的其它文件和目录>
```

示意：

```text
game002-s3-symbols.zip
  symbols.package.json
  gameconfig.json
  symbol-state-textures.manifest.json
  WL.png
  WL.spinBlur.png
  WL.disabled.png
  WL.json
  Symbol.atlas
  Symbol.png
  CN_1.json
  1.png
  2.png
  ...
```

允许保留当前 manifest 的 `./WL.png`、`./Symbol.atlas` 等相对引用，以便现有 game002/game003 资源经过薄包装即可形成 package。ZIP entry 本身使用规范化后的 `WL.png`，不能包含 `./` segment。

### 6.2 `symbols.package.json`

固定 schema：

```ts
interface SymbolPackageManifestV1 {
  readonly version: 1;
  readonly kind: "symbol-package";
  readonly id: string;
  readonly cellSize: {
    readonly width: number;
    readonly height: number;
  };
  readonly entrypoints: {
    readonly gameConfig: string;
    readonly symbolManifest: string;
  };
  readonly resources: readonly string[];
}
```

示例：

```json
{
  "version": 1,
  "kind": "symbol-package",
  "id": "game002-s3",
  "cellSize": { "width": 120, "height": 120 },
  "entrypoints": {
    "gameConfig": "gameconfig.json",
    "symbolManifest": "symbol-state-textures.manifest.json"
  },
  "resources": [
    "1.png",
    "AF.disabled.png",
    "AF.json",
    "AF.png",
    "AF.spinBlur.png",
    "Symbol.atlas",
    "Symbol.png"
  ]
}
```

规则：

- 所有层级 recursive unknown-key rejection。
- `id` 使用小写 ASCII kebab-case，且导出文件名从 id 派生。
- cell width/height 必须是有限正数；允许小数，不偷偷取整。
- 两个 entrypoint 必填、不同、且不能出现在 `resources`。
- `resources` 必须排序、唯一、非空；它是动态/间接资源也能表达的显式精确闭包，不通过宽泛 glob 猜资源。
- ZIP 实际文件集合必须严格等于：package manifest + 两个 entrypoint + `resources`。多一个或少一个都失败。
- 每个 symbol manifest 直接引用、VNI project 资产、Spine skeleton/atlas/page、value image 候选都必须落在 `resources`；未被任何解析后配置需要的资源视为 orphan，导出失败。
- 对 image value presentation，按 `defaultValues` 和当前 package 明确提供的完整候选值闭包验证 `${prefix}${rawValue}.png`；不能因为 prefix 是动态字符串就接受任意目录文件。
- 当前 production 若存在 server 可返回但不在 `defaultValues` 的合法值，应先通过 manifest/package 明确扩展候选资源合同；不得让 importer 扫目录猜测。

### 6.3 路径安全

symbol code 和现有资源文件名需要保留大小写，所以 symbols package 不沿用 layout editor 的“所有路径小写”约束。新通用规则为：

- 只接受 UTF-8、POSIX 相对路径。
- 拒绝绝对路径、drive prefix、反斜杠、空 segment、`.`、`..`、NUL、URL、query/hash 和 percent-encoded escape。
- ZIP entry 使用 canonical path；manifest 内允许单个前缀 `./`，解析后必须归一到 canonical package path。
- 拒绝 exact duplicate、Unicode normalization collision 和 ASCII case-fold collision，避免 macOS/Windows 解压覆盖。
- 保留资源文件名的合法大小写；symbol code 不强制 lowercase。
- entrypoints 不得逃出 zip 根，VNI project 和 atlas page 的相对引用也按其文件所在目录解析并执行同样边界校验。

### 6.4 ZIP 安全限制

symbols 的 Spine/VNI/value assets 可能比 layout 包多，初始限制固定为：

```text
max entries: 1024
max compressed bytes: 100 MiB
max single file bytes: 25 MiB
max total expanded bytes: 250 MiB
```

实现要求：

- 使用 streaming/bounded unzip，不先无界解压到内存。
- 在 header originalSize 可用时先拒绝，流式解压时再次累计校验。
- 任一 entry 失败立即终止 import，释放已建 Blob URL/runtime。
- 导入成功后才原子替换当前 project。
- layout ZIP 继续使用原来的更小限制；共享工具接收显式 limits，不把 layout 上限改成 symbols 上限。

### 6.5 稳定导出

- package manifest、symbol manifest、game config 使用 UTF-8、2 空格缩进、末尾换行。
- JSON object key 使用稳定排序；game config 内 paytable/reels 数组顺序保持原语义。
- zip entry 按 canonical path 排序，mtime 固定为 ZIP 可表达的 epoch。
- 未修改的上传资源保持原始 bytes，不做重新编码。
- 同一 editor session 中 draft 未变化时连续导出 bytes 必须相同。

## 7. Game config 导入与项目初始化

### 7.1 严格解析

必须调用 `@slotclientengine/logiccore` 已有 `createGameConfig(raw)` 或 rendercore 对它的通用封装，不在 editor 重写 paytable/symbolCodes/reels parser。

导入失败时在 UI 展示带字段上下文的错误，不创建半成品项目。

交叉校验：

- `symbolCodes` 的 key/code、paytable entry 的 symbol/code 必须一致。
- code 必须是唯一非负 safe integer。
- display symbol 必须同时存在于 symbol manifest 和 game config。
- manifest 可少于 game config；少出的项显示为“未打包”，不是错误。
- manifest 不可出现 game config 中不存在的 symbol。
- 不从文件名猜 symbol code，不使用 paytable 数组位置代替 code。

### 7.2 新项目默认值

成功上传 game config 后：

```text
project id: 由上传文件名 stem 规范化为 kebab-case，可编辑
cell width: 160
cell height: 160
texture states: spinBlur, disabled
spinBlur setting: verticalBoxBlur / kernelHeight 21
disabled setting: grayscale / brightness 0.72
symbol scale: 1
renderPriority: 0（manifest 中缺省可不序列化）
display set: 默认全选 game config symbols，用户可显式取消辅助项
```

`160 x 160` 只是新项目输入默认值，不是 runtime fallback。导入 package 时必须使用 package 的真实 cellSize。

### 7.3 display 顺序

UI gallery 和布局 grid 的稳定 symbol 顺序固定为：

```text
game config numeric code ascending
```

只保留 symbol manifest 中的 display symbols。不得依赖 JSON object insertion order、文件上传顺序或文件名排序。

## 8. Symbol 编辑器数据模型与 UI

### 8.1 App 骨架

新增：

```text
apps/symbolseditor/
  index.html
  package.json
  vite.config.ts
  tsconfig*.json
  eslint.config.cjs
  README.md
  src/
    main.ts
    styles.css
    model/
    io/
    preview/
    ui/
  tests/
```

要求：

- Vite `base: "./"`，`dist/` 可部署到任意静态 CDN 子路径。
- 左侧项目/symbol/state 表单独立滚动，右侧 Pixi 预览固定占可视区域。
- 不依赖 server、API、WebSocket 或登录。
- 所有可恢复错误显示在页面，不只 `console.error`。
- 表单修改使用版本号/abort token 防止旧异步 decode/runtime 结果覆盖新 draft。

### 8.2 EditorProject

建议模型至少包含：

```ts
interface SymbolEditorProject {
  id: string;
  cellSize: { width: number; height: number };
  rawGameConfig: unknown;
  gameConfigFileName: string;
  manifestDraft: SymbolManifestDraft;
  includedSymbols: Set<string>;
  assets: Map<string, Uint8Array>;
}
```

store 必须提供显式事务：

```text
createFromGameConfig
replaceFromImportedPackage
setCellSize
setSymbolIncluded
replaceSymbolNormal
replaceStateTexture
setAnimationSpec
removeAnimationSpec
setScale
setRenderPriority
replaceValuePresentation
exportSnapshot
destroy
```

所有 mutation 后重新构建严格 preview snapshot；不完整 draft 可以保留表单和已成功 preview 的部分，但 export 必须等完整 strict validation 通过。

### 8.3 Symbol 列表

每行显示：

- code、symbol、是否进入 display set。
- normal/state/animation 资源完整度。
- scale、renderPriority。
- 错误数量和当前 preview 入口。

批量上传允许使用当前约定文件名进行精确匹配，例如：

```text
WL.png
WL.spinBlur.png
WL.disabled.png
```

但匹配必须以 game config symbol code 和 manifest state 为边界；未知文件只进入“未映射文件”列表，不能自动成为 symbol 或偷偷进入 ZIP。

### 8.4 normal 与 texture states

结构化支持现有 manifest normal：

- single image path。
- layered normal，包含连续 `index`、texture 和 keyframes。
- transparent normal，包含 width/height；仅用于 manifest 明确允许的 value presentation 路径。

texture state：

- 顶层 `states[]` 与 `settings` 可编辑。
- 每个普通 symbol 对已声明 texture state 必须有精确 texture。
- valuePresentation symbol 的 reel states 按现有 parser 规则编辑，禁止同时写顶层 normal/state。
- 图片必须能真实 decode；PNG/JPEG/WebP 的支持范围跟 rendercore 已有 texture loader 一致。若 production 当前只允许 PNG 的路径，editor 不得擅自扩大。
- 不强制图片 pixel size 等于 package cellSize，但预览必须画出 cell bounds 让超界一眼可见。

### 8.5 animation states

每个 state 允许选择：

```text
未配置
builtin
static
vni
spine
activeSpine（仅 valuePresentation）
```

表单字段完全映射当前 rendercore manifest schema：

- builtin/static：positive finite `durationSeconds`。
- VNI：project、range start/end、loop 合法性和项目精确 asset closure。
- Spine：skeleton、atlas、texture、exact case-sensitive animationName、loop、可选 x/y/scale。
- activeSpine：只编辑 semantic playback，复用当前 tier player。

上传 Spine 资源后应读取 skeleton animation names、版本和 atlas page，以下情况立即失败：

- 非 official 4.3 支持版本。
- skeleton/atlas/texture 缺失或 page 不匹配。
- animationName 不存在或大小写不同。
- stable state 配置非 loop，once state 配置 loop。

同一 skeleton/atlas/texture 的多个 state 继续由 rendercore 复用一个 player；editor 不直接操作 Spine track。

### 8.6 value presentation 与高级业务 metadata

为保证当前 game002-s3 ZIP 可以导入、显示、编辑和无损重新导出：

- structured 支持现有 `valuePresentation.defaultValues/reelStates/tiers/text` 全字段。
- image text 的候选 value resources 必须精确列入 package resources，缺图失败，不回退 font。
- symbols 编辑器预览 value symbol 时提供一个 positive integer value 输入；初始值为 `defaultValues[0]`。
- 布局编辑器 normal-only 预览 value symbol 时固定使用 `defaultValues[0]`，不得随机选择、使用 `Math.random` 或猜 server value。

`cascadeWinPresentation` 与状态 sequence 编排不属于本任务的可视编辑目标：

- imported manifest 中的合法 `cascadeWinPresentation` 必须保留并随导出 round-trip。
- UI 只在高级只读摘要中展示其存在和 parser 结果。
- 新项目默认不生成该字段。
- 不提供 raw JSON 逃生编辑框；若未来要编辑，另立专门任务。

### 8.7 预览

symbols 编辑器右侧使用一个外部 `PIXI.Application`：

- 画真实 `cellSize` rect、中心线和透明棋盘背景。
- 使用 rendercore `RenderSymbol`、catalog、animation resolver 和 value controller。
- 默认 state 是 `normal`。
- 用户可以手动选一个 manifest state；once state 提供 Replay，stable state持续 update。
- 可切换单 symbol 和 gallery；gallery 按 numeric code 排序。
- scale/renderPriority/state 切换均来自 manifest draft，不建第二份表。
- 切项目、替换资源、过期异步请求和 destroy 都必须销毁 RenderSymbol/player/texture/Blob URL。

不得加入 sequence list、Play Sequence、Next State、holdSeconds 或自动轮播。

## 9. Rendercore symbol-package 公共能力

在 `@slotclientengine/rendercore/symbol` 增加通用 API，具体命名可按现有风格调整，但职责必须覆盖：

```ts
parseSymbolPackageManifest(value)
collectSymbolPackageEntryPaths(packageManifest)
validateSymbolPackageContents({ packageManifest, files })
createSymbolPackageResource({ packageManifest, files/modules })
```

建议资源对象：

```ts
interface SymbolPackageResource {
  readonly packageManifest: ParsedSymbolPackageManifest;
  readonly rawGameConfig: unknown;
  readonly symbolManifest: ParsedSymbolStateTextureManifest;
  readonly displaySymbols: readonly string[];
  readonly symbolScales: ReelSymbolScaleMap;
  readonly symbolRenderPriorities: ReelSymbolRenderPriorityMap;
  readonly statePreset: SymbolStatePreset;
  createCatalog(): Promise<SymbolCatalog>;
  createValueController?(...): ...;
  destroy(): void;
}
```

实现边界：

- resource builder 负责把 uploaded bytes 分类成 texture URLs、VNI project/assets、Spine skeleton/atlas/texture 和 value text images。
- parser/resource builder 必须复用现有 manifest functions；不能在新的 package 文件中重新实现 animation schema。
- 对所有资源做 exact closure 和 orphan 校验。
- `destroy()` 幂等，创建中失败也释放已建 URL/player/resource。
- 可从 Vite modules 和 browser bytes 两种来源构建，production game 不需要运行时解 ZIP。
- 不在 rendercore 引入 File input、DOM 表单或 download API。

为防止 editor 各自复制 Pixi asset load，必要时把 symbolsviewer 当前 `loadSymbolTextures()` 的通用部分下沉到 rendercore；symbolsviewer 继续调用公共 API，行为不变。

## 10. Symbols ZIP 导入/导出

### 10.1 导入

顺序固定：

1. 校验 compressed bytes 上限。
2. bounded extract，并执行路径/collision 校验。
3. 读取和 strict parse `symbols.package.json`。
4. 校验实际 entries 与声明闭包精确相等。
5. strict parse game config。
6. strict parse symbol manifest。
7. 校验 game config/display set 关系。
8. 解析 VNI/Spine/value 间接资源闭包、图片 decode 和 exact animation。
9. 创建临时 SymbolPackageResource 和 editor project。
10. 全部成功后原子替换当前 project；失败保留原项目。

不得遇到未知 ZIP 时猜测“可能是 layout zip”或“可能是旧 symbols 目录”。缺 package manifest 直接给出明确错误。

### 10.2 导出

导出前必须：

- 生成 strict symbol manifest snapshot。
- 确认每个 included symbol 资源完整。
- 确认所有 resource 引用位于 ZIP 且没有 orphan。
- 创建临时 resource/catalog，真实初始化每种 VNI/Spine/value 路径至少一次。
- 验证 package cellSize。
- 稳定序列化并打包。

导出下载文件名：

```text
<id>-symbols.zip
```

### 10.3 Import -> export round-trip

验收：

- package manifest、game config、symbol manifest 语义完全一致。
- 未修改资源 bytes 完全一致。
- 未修改项目连续两次导出 ZIP bytes 一致。
- import A -> 失败 import B 后，A 的 UI、preview 和 export 保持可用。

## 11. 布局编辑器接入

### 11.1 UI

在 `apps/gamelayouteditor` 增加独立的“Symbols 预览包”区：

```text
导入 symbols zip
当前 package id
cell size
display symbol 数
清除 symbols package
诊断信息
```

不增加单独 game config 上传框。ZIP 已包含唯一 game config。

### 11.2 原子 cell size 覆盖

导入成功后在 editor store 单个 transaction 中：

1. 保存 imported SymbolPackageResource。
2. 设置 `project.reel.cellWidth = package.cellSize.width`。
3. 设置 `project.reel.cellHeight = package.cellSize.height`。
4. 对当前 mode 的所有有效 variant 调用现有 focus 派生逻辑。
5. 重新生成 strict layout preview manifest。
6. 重建 symbol grid preview。

失败时不得只改一半 cell size，也不得销毁之前仍可用的 symbols package。

清除 symbols package：

- 只清理 symbol preview/resource。
- 不把 layout cell size恢复到导入前值；cell size 已成为用户明确应用到 layout 的配置，避免清除预览时意外改布局。

### 11.3 Grid 内容

布局编辑器只为预览构造确定性 scene，不把它写入 layout manifest：

- display symbols 按 game config numeric code ascending。
- 按 `y asc / x asc` row-major 填充 main grid。
- cell 数多于 symbol 数时从头循环。
- cell 数少于 symbol 数时只显示前 N 个，并在诊断显示“当前 viewport 未覆盖全部 symbol”，不是错误。
- 每个 RenderSymbol 请求 `normal`。
- valuePresentation symbol 使用 `defaultValues[0]`。
- 不使用 game config reel stop、不随机抽取、不使用 server scene。

### 11.4 Geometry 与层级

- 每个 cell center、gap、grid placement 必须从 scene-layout runtime `getReelGrid()`/geometry snapshot 派生。
- symbol preview container 使用同一 art/world transform，不能复制 viewport 公式。
- 初始预览层级放在 scene-layout art 内容之上、guide 之下，明确标记为 editor preview overlay；不把这个层级当作 production reel z-order 合同。
- focus/reel/cell guide 继续在最上层。
- variant/viewport resize 时只重新应用公共 geometry，不重建等价 animation player。

### 11.5 生命周期

- layout runtime 和 symbols resource 分开持有、分开 destroy。
- 换 layout 时若 grid 仍合法，可继续使用当前 symbols package并重新布局。
- 换 symbols package 时旧 RenderSymbols/player/textures/URLs 全部释放。
- stale import/preview request 不得覆盖较新的 layout 或 package。
- ticker 每帧 update layout runtime 与当前 RenderSymbols，保证 normal Spine/VNI loop 不冻结。

## 12. 文档与 agents.md

新增：

```text
docs/symbol-package.md
apps/symbolseditor/README.md
```

更新：

```text
apps/gamelayouteditor/README.md
packages/rendercore/README.md
agents.md
```

`docs/symbol-package.md` 必须完整包含：

- v1 schema 和 ZIP 树。
- game config/symbol manifest/cellSize 各自职责。
- path 与 size limits。
- resource closure、VNI/Spine/value 规则。
- editor import/export 和 production 解压/Vite module 接入示例。
- layout editor cell size override/default preview 规则。

`agents.md` 至少增加 ownership 约束：

- `apps/symbolseditor` 只拥有 browser editing/IO/UI，不复制 rendercore parser/player。
- symbols ZIP 必须包含唯一 game config 和 package cellSize。
- layout editor 导入 symbols ZIP 后以 package cellSize 覆盖 main grid，并只显示 normal state。
- symbolsviewer sequence 不属于 symbols editor 初始化范围。
- package 精确闭包和失败即暴露，不允许 fallback/glob 猜测。

更新 `agents.md` 时同时核对已有 layout editor 条目与任务 98 最终实现是否一致；只修正与本任务直接冲突或过期的描述，不顺手重写其它规则。

## 13. 实施步骤

### 阶段 A：基线与合同

1. 记录 branch、HEAD、status、Node/pnpm 版本。
2. 跑相关包现有 lint/typecheck/test/build，记录基线失败。
3. 在 rendercore 定义 strict `SymbolPackageManifestV1`、parser 和 path/resource closure。
4. 写 `docs/symbol-package.md` 初稿和 game002/game003 最小示例。
5. 用 parser tests 锁定 unknown keys、cell size、entrypoint、resource、path/collision 和 game config/display set 规则。

### 阶段 B：共享 browser artifact IO

1. 提取 layout editor 现有 bounded unzip/path/Blob URL 工具到共享 package。
2. 允许调用方分别提交 layout/symbol limits 和 path case policy。
3. 迁移 layout editor，保持所有现有 zip/object URL tests 通过。
4. 增加 ZIP bomb、duplicate、case-fold、Unicode normalization、zip-slip、stale cleanup 测试。

### 阶段 C：SymbolPackageResource

1. 实现 bytes/modules 分类和 Object URL 映射。
2. 复用 manifest API创建 assets、scale、priority、state preset、animation resolver、value resources。
3. 实现 direct/indirect exact resource closure 和 orphan validation。
4. 实现幂等 destroy、partial init rollback 和 stale request cleanup。
5. 用 game002-s3 value/Spine 与 game003-s1 VNI/Spine fixture 验证。

### 阶段 D：symbols editor model/IO

1. 建 `apps/symbolseditor` 脚手架和 package scripts。
2. 实现 game config create、project store、draft clone/transaction。
3. 实现 normal/state/animation/value presentation 资源映射与 validation。
4. 实现 symbol ZIP import/export 和 deterministic round-trip。
5. 实现 dirty/incomplete/error diagnostics 和原子替换。

### 阶段 E：symbols editor UI/preview

1. 项目区：game config、id、cellSize、import/export。
2. symbol list：include、code、completeness、scale、priority。
3. state editor：texture/animation/value fields 和 resource uploads。
4. Pixi 单 symbol/gallery preview，manual state select/replay。
5. 明确不接 sequence controller，不出现状态编排 UI。
6. 验证 resize、resource replace、rapid import 和 destroy。

### 阶段 F：layout editor 集成

1. 增加 imported symbol package state 和 UI。
2. 实现 cell size override transaction 和 focus 重派生。
3. 在 LayoutPreview 接入 normal-only RenderSymbol grid overlay。
4. 使用 code order/row-major/defaultValues[0] 的确定性内容。
5. 保持 layout ZIP schema/export 不变。
6. 增加 import/clear/replace/stale/destroy/resize 测试。

### 阶段 G：文档、全量验收与报告

1. 完成 README、rendercore docs、symbol package docs、agents.md。
2. 执行相关包和根级门禁。
3. 启动静态 HTTP 服务验证任意子路径资源加载。
4. 完成浏览器人工验收矩阵。
5. 检查 git diff、生成物、临时文件和资源污染。
6. 生成 UTC 时间戳并写中文任务报告。

## 14. 测试计划

### 14.1 rendercore

- package manifest valid parse/deep freeze。
- recursive unknown keys。
- 非法 version/kind/id/cellSize。
- entrypoint duplicate/missing/resource overlap。
- resource duplicate/unsorted/orphan/missing。
- `./` manifest ref canonicalization。
- zip root escape、VNI relative escape、atlas page escape。
- case-fold/Unicode collision。
- game config 27 symbols + manifest 14 symbols合法。
- manifest symbol 不在 game config 失败。
- symbol code/paytable 不一致失败。
- image/VNI/Spine/value resource classification。
- unsupported Spine version/exact animation name/atlas page 失败。
- partial init rollback、destroy 幂等。

### 14.2 browser artifact IO

- layout 原 limits 保持。
- symbol 新 limits 生效。
- compressed/single/expanded/entry count 边界。
- directory entry、duplicate、zip-slip、bad UTF-8。
- deterministic archive。
- Object URL create/revoke、失败清理和重复 destroy。

### 14.3 symbols editor

- game config -> default draft。
- include/exclude auxiliary symbol。
- normal/state/animation upload mapping。
- unknown file 留在 unmapped，不进 ZIP。
- cell size validation。
- incomplete draft 可编辑但不可导出。
- imported game002/game003 project round-trip。
- consecutive export bytes stable。
- failed import preserves previous project。
- rapid async mutation stale guard。
- single state preview/replay/value input。
- 界面不存在 sequence/hold/next controller。
- all resource/player/URL cleanup。

### 14.4 layout editor

- symbols ZIP 成功导入并显示 package metadata。
- `120x120` 覆盖 layout `160x160`。
- width 成功/height 失败等场景不产生半更新。
- columns/rows/gap/placement 保持不变。
- focus 按 offsets 重派生。
- 越界时显式 layout validation error，不 auto-fit。
- code-order row-major normal fill。
- cell 少于 symbols 的诊断。
- value symbol 使用 `defaultValues[0]`。
- ticker 更新 Spine/VNI normal loop。
- clear package 不回滚已应用 cell size。
- layout export 不包含 symbol files，schema 不变。
- replace/failed import/stale request/destroy 无泄漏。
- orientation variant resize 继续使用公共 geometry。

### 14.5 静态部署

分别验证：

```text
/symbolseditor/dist/
/gamelayouteditor/dist/
```

- `index.html` 返回 200。
- 所有 JS/CSS/modulepreload 返回 200。
- Vite `base: "./"` 下刷新和资源 URL 正常。
- bundle 不包含 netcore/gameframeworks/WebSocket/session 链路。

## 15. 自动化命令

先确认版本：

```bash
node --version
pnpm --version
```

相关包命令按实际 package name 调整：

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

pnpm --filter symbolsviewer lint
pnpm --filter symbolsviewer typecheck
pnpm --filter symbolsviewer test
pnpm --filter symbolsviewer build
```

根级：

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

若依赖下载失败，按用户指定代理重试：

```bash
export http_proxy=http://127.0.0.1:1087
export https_proxy=http://127.0.0.1:1087
pnpm install
```

不能因为依赖下载失败跳过 lockfile 一致性，也不能改用 npm/yarn。

若测试为了迎合错误实现而出现奇怪 mock、绕过 parser、伪造 fallback 或依赖私有 Pixi/Spine 状态，应修改测试来表达正确 production contract；不要为了让旧测试变绿去改不该改的 production 逻辑。反过来，真实回归不能归咎于测试，必须修 production 实现。

## 16. 人工验收

### 16.1 symbols editor

1. 打开空项目，上传 game002 game config。
2. 确认 13 个 symbol、code 顺序、默认 `160x160`。
3. 设置 `120x120`，上传 normal/state/Spine/value resources。
4. 逐个选择 normal、appear、win 等已配置状态，确认 exact playback。
5. 确认界面没有 sequence/hold/next 编排。
6. 导出 `game002-s3-symbols.zip`，重新导入，内容与预览一致。
7. 导入 game003 fixture，确认 27 个 config symbol 中只打包显式选择的 14 个 display symbols。
8. 删除一个 VNI asset、改错 Spine animation 大小写、加入 orphan 文件，均应阻止导出并给出明确错误。

### 16.2 layout editor

1. 新建默认 `5x3 / 160x160` layout。
2. 导入 `120x120` symbols ZIP，确认 grid 立即变成 `120x120`。
3. 确认 symbols 位于真实 main grid cell center，gap/variant/resize 正确。
4. 确认只播放 normal；没有 state sequence 控件。
5. 导入 cell size 导致越界的 ZIP，确认明确失败且不 auto-fit。
6. 导入坏 ZIP 后，之前有效的 package/preview 仍可用。
7. 清除 symbols package，symbol preview 消失，但 layout cell size仍保持已应用值。
8. 导出 layout ZIP，确认未混入 gameconfig/symbol assets。

## 17. 完成定义

只有全部满足才可标记完成：

- `apps/symbolseditor` 可从 game config 建项目并导入/导出 symbols ZIP。
- ZIP 必含唯一 game config、现有 symbol manifest、cellSize 和精确资源闭包。
- game002/game003 fixture 都能经过同一 package/resource/parser 路径。
- 每个 symbol/state 可结构化编辑并单状态预览。
- 未实现 symbolsviewer 状态编排。
- layout editor 可导入同一 ZIP、以 ZIP cellSize 覆盖 main grid 并显示 normal symbols。
- layout ZIP 合同未被污染。
- 缺资源、坏配置、版本错配、越界和 orphan 均尽早显式失败，无不必要 fallback。
- rendercore/app ownership 没有反转，没有复制 manifest/Pixi/VNI/Spine 算法。
- 相关测试、lint、typecheck、build、format check 通过。
- 根级门禁通过；若有确定的范围外既有失败，报告必须给出命令、首个错误、涉及文件和为何未修改，不能笼统写“环境问题”。
- 静态子路径和浏览器人工验收完成并记录。
- `agents.md`、README、symbol package 文档同步。
- 新增中文 UTC 任务报告。

## 18. 任务报告内容

最终报告至少包含：

- UTC 完成时间、branch、HEAD、最终 status。
- 实际新增/修改文件和 ownership。
- 最终 symbols ZIP schema 与示例树。
- game config 打包和 cellSize override 的最终行为。
- symbols editor 可编辑状态范围与明确未实现的 sequence 范围。
- game002/game003 fixture 结果。
- layout editor normal preview 和资源生命周期结果。
- 每条自动化命令及结果、测试数量/coverage。
- 静态 HTTP 和浏览器人工验收结果。
- 已知限制、范围外失败、后续建议。
- 是否修改 `agents.md` 以及修改原因。
