# symbols editor workflow redesign 任务计划

## 1. 任务目标

本任务对现有纯前端应用：

```text
apps/symbolseditor
```

进行一次编辑模型和交互流程的大幅重构，使它能够按真实项目的 symbol manifest 工作，而不是依赖 symbol code 推导文件名、要求用户手填资源路径，或默认生成一批尚不存在的 `normal/spinBlur/disabled` 文件引用。

最终编辑流程固定为：

```text
上传公开 gameconfig.json 或导入已有 symbols ZIP
  -> 选择进入 display set 的 symbols
  -> 一次上传一组美术资源，并在资源库中查看、替换、删除和诊断
  -> 为每个 symbol 增加或删除“可见状态”
  -> 为每个状态从资源库下拉选择：空 / 图片 / Spine / VNI / 其它显式 runtime 类型
  -> Spine 从下拉选择 skeleton、atlas、texture 和真实 animation name
  -> 编辑 additional state definition、value presentation 和 cascade presentation
  -> 右侧按一个选定状态一次显示全部 display symbols，并支持缩放/适配
  -> 严格校验并导出可重新导入的 symbols ZIP
```

本文件是完整实施合同。执行者不得依赖聊天记录、任务 100 或其它任务文件来猜产品行为；任务 100 只构成当前代码基线，不是实施本任务的前置上下文。

任务完成后必须新增中文任务报告：

```text
tasks/101-symbols-editor-workflow-redesign-[utctime].md
```

UTC 时间戳必须使用：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/101-symbols-editor-workflow-redesign-260401-181300.md
```

## 2. 已确定的产品决定

### 2.1 不再从文件名猜资源绑定

以下旧行为必须移除：

- 新建项目不再自动写入 `./WL.png`、`./WL.spinBlur.png`、`./WL.disabled.png` 等假定路径。
- 上传文件不再通过 `${symbol}.png` 或 `${symbol}.${state}.png` 与 manifest 自动配对。
- normal、状态图片、VNI project、Spine skeleton/atlas/texture、value image 目录不再使用可编辑文本框填写路径。
- Spine animation name 不再允许手填。

新的唯一绑定方式是：资源先进入项目资源库，用户再从受类型和依赖约束的下拉列表中显式选择。文件名可以由用户任意命名，只要它是安全的 package path、扩展名和内容合法，并且 manifest 显式引用它。

不得保留“下拉找不到时允许手填路径”的逃生口，也不得在导出时退回旧的 symbol-code 文件名匹配。

### 2.2 一次上传一组资源，并始终显示资源库

资源上传必须支持多选文件；为支持 VNI 子目录资源，还必须提供保留相对路径的目录上传入口。每次上传形成一个仅用于 UI 分组的 `uploadBatchId`，不写入最终 ZIP schema。

资源库至少显示：

- canonical package path；
- 文件类型；
- 文件大小；
- 上传批次；
- 解析状态；
- 被哪些 symbol/state/value tier 引用；
- 直接依赖和缺失依赖；
- 未使用、有效、错误三类状态；
- 替换和删除入口。

未使用资源可以留在编辑草稿中，但不得进入导出 ZIP 的 `resources`。导出资源闭包只能从 manifest 引用精确派生，不能把整个资源库或整个上传批次打包进去。

同 canonical path 的再次上传不得静默覆盖。普通批量上传遇到冲突应原子失败并列出冲突项；用户从资源列表显式执行“替换”时才允许保留 path 并替换 bytes。删除仍被引用的资源必须被阻止，并列出所有引用位置，不能悄悄清空状态或改成其它资源。

### 2.3 新项目默认全空，但可以立即导出

从 game config 新建项目后：

- package id 继续从文件名规范化得到；
- `cellSize` 默认仍为 `160 x 160`；
- game config 中的 symbols 按 numeric code 升序展示，默认进入 display set；
- 提供全选、全不选、反选，方便排除 game003 这类不属于主 display set 的辅助 symbol；
- 每个 included symbol 默认只有 `normal` 可见状态；
- `normal` 的资源类型默认为显式“空”；
- scale 默认为 `1`，renderPriority 默认为 `0`；
- 不默认创建 `spinBlur`、`disabled`、`appear`、`win`、`remove`、`dropdown` 或任何资源路径。

“空”不是错误恢复和 fallback，而是用户可见、可选择、可序列化的正式资源类型。新项目的空 normal 编译为：

```json
{
  "normal": {
    "kind": "transparent",
    "width": 160,
    "height": 160
  },
  "scale": 1
}
```

因此一个完全未上传美术资源的新项目必须能导出。对应 `symbols.package.json.resources` 可以是合法的空数组，ZIP 仍包含 package manifest、game config 和 symbol manifest 三个 JSON entrypoint。

空资源不能被实现为编辑器私藏的一张透明 PNG、data URL、宽泛 builtin/default 动画或缺资源时的自动替代。若用户已经选择某个图片、Spine 或 VNI 资源，则该资源及依赖缺失必须显式失败，不能回退为空。

### 2.4 “项目状态定义”和“symbol 可见状态”必须分层

UI 和数据模型必须区分：

1. 项目状态目录：定义可用 state id 及其生命周期。
2. 单个 symbol 的可见状态：决定该 symbol 实际配置哪些 state。
3. manifest 顶层 `states[]`：只是 state texture 序列化所需的技术字段，不再直接作为逗号分隔文本暴露给用户。

项目状态目录包含 rendercore 既有基础状态：

| state      | phase  | playback |
| ---------- | ------ | -------- |
| `normal`   | stable | static   |
| `spinBlur` | stable | static   |
| `disabled` | stable | static   |
| `appear`   | once   | once     |
| `win`      | once   | once     |
| `remove`   | once   | once     |
| `dropdown` | stable | loop     |

用户可以在项目级增加或删除 custom state definition。custom state id 是业务命名，允许使用受校验的文本输入；phase/playback 只能通过以下两个下拉选项创建：

- `once / once`；
- `stable / loop`。

custom state 不得覆盖基础 state，不得重复。它们编译到 `settings.additionalStateDefinitions`。

每个 symbol 的状态区使用“添加状态”下拉框增加状态；已添加的状态显示为可排序状态卡片并可删除。`normal` 始终存在且不可删除，其它状态均可独立增删。删除被 cascade presentation 或其它结构化配置引用的状态时必须阻止并显示引用，不能自动改写编排。

### 2.5 状态资源类型

每个 symbol/state 都有一个资源类型下拉框。至少支持：

- `empty`：显式空资源；
- `image`：单张图片；
- `spine`：official Spine 4.3；
- `vni`：VNI project；
- `static`：显式静态状态和 duration，不引用美术；
- `builtin`：仅在 rendercore 对该 state 有明确 builtin 实现时可选；
- `activeSpine`：仅 valuePresentation symbol 可选，复用当前 tier player。

normal 的 image 还要支持现有 layered normal：用户通过增加/删除 layer 和 keyframe，从图片资源下拉选择每一项；不得按 `${symbol}-{index}.png` 猜路径。

game002/game003 现有 manifest 中，normal 可以同时有一份基础图片和一份 normal Spine animation。typed draft 和 UI 必须能表达这种组合：状态的主展示类型选择 Spine/VNI 时，normal 额外提供“基础视觉”配置，可显式选择 empty、single image 或 layered image。导入 `normal path + animations.normal` 时必须还原为该组合，不能丢掉基础图片；新建 Spine/VNI normal 时基础视觉默认 empty，但这是用户看得见的显式值，不是运行时 fallback。

UI 必须按 state lifecycle 和 symbol 类型过滤不兼容选项。例如：

- `activeSpine` 不得出现在普通 symbol；
- rendercore 当前 VNI manifest 只支持的 playback 组合之外不得伪装成可用选项；
- stable loop state 的 Spine 必须导出 `loop: true`；
- once state 的 Spine 必须导出 `loop: false`；
- loop 值从状态定义派生，不再让用户用自由 checkbox 制造矛盾配置；
- builtin 只能出现在已有明确实现的 state，不能成为任意 state 的兜底。

如果产品希望 stable state 使用循环 VNI，而当前 rendercore schema 不支持，则实施时必须先在 rendercore 设计、实现和测试正式 schema/runtime 能力；在此之前 UI 应禁用该组合并说明原因，不能输出 runtime 无法正确播放的 manifest。

### 2.6 图片状态必须是稀疏的

同一个 state 可以只在部分 symbol 上使用图片。例如 `spinBlur` 可以在 A 上选择图片、在 B 上不存在或为空。rendercore manifest/parser/resource builder 必须支持这种稀疏状态，不得继续因为顶层 `states[]` 包含 `spinBlur` 就强制每个 symbol 都提供一张图片。

序列化规则：

- `normal + empty`：transparent normal；
- `normal + image`：normal path；
- 非 normal `image`：该 state path 写入 symbol entry，并把 state id 加入顶层 `states[]` 的稳定并集；
- once/loop state 需要纯图片播放时，显式生成兼容该 lifecycle 的 static animation spec；
- 非 normal `empty`：编译为 rendercore 新增的显式 empty animation spec；该 spec 隐藏 normal/base art，并按 state lifecycle 正确产生 once completion 或 loop boundary，保证导入后仍能区分“已添加但为空”和“未添加”；
- 未添加状态：不生成 texture path，也不生成 animation capability。

导入已有 game002/game003 manifest 时必须保持其当前语义；稀疏规则是向后兼容扩展，不能要求修改 production manifest。

### 2.7 模糊图和 disabled 图只允许用户上传

symbols editor 不生成、派生或修改 spin blur、grayscale、disabled 图片：

- 删除新项目默认的 `settings.spinBlur`、`settings.disabled`；
- 删除 kernelHeight、brightness 等“看似会生成图片”的编辑控件；
- `spinBlur`、`disabled` 与其它图片状态一样，只能选择资源库中的用户成品图片；
- 不调用 Sharp，不在浏览器做 canvas filter，不自动复制 normal；
- 导入旧 manifest 时，合法的 legacy state settings 必须无损保留并在高级摘要中标记为 legacy metadata，但不提供生成动作。

### 2.8 复杂状态编排必须可编辑，但本任务不预览编排

本任务必须把 game002 正在使用的以下字段从“只读 round-trip”提升为结构化编辑：

- `settings.additionalStateDefinitions`；
- `symbols.<code>.cascadeWinPresentation.order`；
- `playback.mode = group | sequentialCollect`；
- group 的 `winState/removeState`；
- sequential collect 的 `startState/loopState/collectState/removeState`；
- 与 mode 对应的 summary mode。

编排 UI 规则：

- mode 使用下拉框；
- state 引用只能从当前 symbol 已添加且具有 animation capability 的状态下拉选择；
- once/loop 候选按 state definition 过滤；
- summary mode 由 playback mode 唯一派生并只读展示，不允许产生不兼容组合；
- state 引用必须互不重复，沿用 rendercore strict parser 规则；
- order 必须是非负安全整数；
- 关闭 cascade presentation 时显式删除整个字段，不保留半结构。

右侧预览只播放用户当前选择的一个 state。它不执行 group/sequential collect、跨 symbol cadence、sequence、hold、next、spin、remove/drop/refill 或 reel timeline。`assets/game002-s3/reel.manifest.json` 的 Nearwin、anticipation、refill sweep 和 timing 不属于 symbol state manifest，不能被拉进本编辑器。

### 2.9 右侧始终是全部 symbols 的单状态预览

移除现有 single/gallery 切换。右侧预览固定为：

- 默认选择 `normal`；
- 一次渲染 display set 中全部 symbols；
- 按 game config numeric code 升序；
- 自动计算行列，尽可能在当前 viewport 一次显示完整；
- 显示 cell 边界和 symbol code/name；
- 提供“适配全部”、缩小、放大和连续 zoom slider；
- viewport resize 后重新 fit，但用户手动 zoom 后不得在每次状态变化时强制重置；
- once state 提供统一 Replay，全部具有该 state 的 symbol 在同一边界重播；
- valuePresentation symbol 提供合法 preview value；
- 缺少当前状态的 symbol 显示显式“未配置”空 cell，不静默显示 normal 冒充当前状态；
- 当前状态资源类型为 empty 时显示明确空占位，而不是错误。

状态编排的展示不在本任务范围。

## 3. 当前实现基线与必须修复的问题

执行前必须重新记录 branch、HEAD、`git status --short`、Node 和 pnpm 版本。已有修改和未跟踪文件都属于用户，禁止 reset、checkout、stash、clean 或覆盖。

制定本计划时，仓库为：

```text
/Users/zerro/github.com/slotclientengine
```

工具链约束：

- Node.js `>=24.0.0`；
- pnpm；
- turbo、Vite、Vitest、ESLint、Prettier；
- Pixi.js v8；
- official `@esotericsoftware/spine-pixi-v8` 4.3.x；
- `apps/symbolseditor` 当前 package name 为 `symbolseditor`。

### 3.1 当前 symbolseditor 数据流

主要文件：

```text
apps/symbolseditor/src/model/editor-project.ts
apps/symbolseditor/src/model/editor-store.ts
apps/symbolseditor/src/io/symbol-package-zip.ts
apps/symbolseditor/src/preview/symbol-preview.ts
apps/symbolseditor/src/ui/app-shell.ts
apps/symbolseditor/tests/editor-project.test.ts
apps/symbolseditor/tests/zip-io.test.ts
apps/symbolseditor/src/styles.css
apps/symbolseditor/README.md
```

当前问题包括：

- `createDefaultSymbolEntry()` 按 symbol code 直接生成 normal、spinBlur、disabled 路径；
- `DEFAULT_TEXTURE_STATES` 默认写入 spinBlur、disabled；
- `replaceUploadedFiles()` 只把文件名等于当前 manifest 直接引用的文件放入 assets，其余进入 unmapped；
- UI 用文本框编辑资源路径；
- Spine animation name 用文本框填写；
- texture states 用逗号分隔文本编辑；
- 状态列表硬编码 normal/appear/win/remove/dropdown 加 texture states，不能逐 symbol 增删；
- `cascadeWinPresentation` 只读保留；
- 右侧默认单 symbol，gallery 需要额外勾选；
- 导出要求资源非空且所有默认推导路径已上传，空项目不能导出。

实施时应重构为明确的 typed editor draft 和资源索引，不要继续在 DOM event handler 中直接拼 raw manifest object。

### 3.2 rendercore 当前限制

权威文件：

```text
packages/rendercore/src/symbol/manifest.ts
packages/rendercore/src/symbol/package.ts
packages/rendercore/src/symbol/catalog.ts
packages/rendercore/src/symbol/vni-animation.ts
packages/rendercore/src/symbol/spine-animation.ts
packages/rendercore/src/symbol-value-presentation/**
packages/rendercore/tests/symbol/**
packages/rendercore/tests/symbol-value-presentation/**
```

必须处理的限制：

- `SymbolPackageManifestV1.resources` 当前拒绝空数组；
- `createSymbolAssetMapFromManifestModules()` 强制 normal basename 为 `${symbol}.png`；
- state texture 强制 basename 为 `${symbol}.${state}.png`；
- module splitter 会按文件名结构猜 symbol/state，并拒绝合法但任意命名的图片；
- manifest 顶层 `states[]` 当前要求每个普通 symbol 都声明每个 state texture；
- catalog 的 required state texture policy 是全局数组，不能表达稀疏 per-symbol state；
- editor 尚无公共资源 introspection API 来安全列出 Spine animations、slots、atlas pages 和 VNI metadata。

这些是 shared manifest/package/resource contract 问题，必须在 rendercore 修复；不得只在 symbolseditor 内改名、复制 parser 或构造假 module key 绕过。

### 3.3 两份 production manifest 的能力矩阵

实施和验收必须使用以下真实文件作为 fixture：

```text
assets/game002-s3/symbol-state-textures.manifest.json
assets/game002-s3/reel.manifest.json
assets/gamecfg002/gameconfig.json
assets/game003-s1/symbol-state-textures.manifest.json
assets/gamecfg003/gameconfig.json
```

两份 symbol manifest 的关键差异：

| 能力                 | game002-s3                                   | game003-s1                        |
| -------------------- | -------------------------------------------- | --------------------------------- |
| display symbols      | 13                                           | 14（game config 另有辅助 symbol） |
| texture states       | spinBlur、disabled                           | spinBlur、disabled                |
| normal art           | 图片 + Spine；CN 为 tier Spine               | 图片、Spine、VNI 混合             |
| 基础动画状态         | normal/appear/win/remove/dropdown 的不同子集 | normal/appear/win 的不同子集      |
| custom states        | winStart、winLoop、collect                   | 无                                |
| activeSpine          | CN 使用                                      | 无                                |
| valuePresentation    | CN 四档 tier、image value、Num slot          | 无                                |
| cascade presentation | group 和 sequentialCollect                   | 无                                |
| renderPriority       | WL                                           | WL、CL、SC                        |
| VNI                  | symbol manifest 当前无                       | L1-L5 win                         |
| 缺状态合法性         | 各 symbol 状态集合不同                       | H2-H5 没有 appear，不能伪造       |

game002 的 reel manifest 仅用于确认 symbol editor 的范围边界；其中 cell effect、anticipation、refill 和 timing 不进入本任务的数据模型。

## 4. 范围

### 4.1 包含

- 重构 symbolseditor typed project model、store、UI 和 preview。
- 新增持久于当前内存项目的资源库与上传批次视图。
- 支持文件多选和目录上传，保留安全相对路径。
- 支持任意合法资源名和子目录，不依赖 symbol code 命名。
- 支持 per-symbol visible states 的增删和排序。
- 支持 empty、image、layered image、Spine、VNI、static、受限 builtin、activeSpine。
- Spine skeleton/atlas/texture/animation/slot 下拉选择和严格兼容性校验。
- VNI project 下拉选择、range 编辑和精确 indirect asset closure。
- 完整保留并结构化编辑 game002 当前 valuePresentation。
- 结构化编辑 additional state definitions 和 cascadeWinPresentation。
- 空资源项目的合法导出和重新导入。
- 固定全 symbols 单状态预览、fit 和 zoom。
- rendercore package/manifest/resource 能力的向后兼容扩展。
- 更新 symbol package 文档、symbolseditor README、必要测试和必要的 `agents.md` ownership 规则。
- 用 game002/game003 production fixture 做无修改 round-trip 和 runtime 初始化回归。

### 4.2 不包含

- 不修改 game002/game003 production manifest、game config、Vite/loading closure 或美术资源。
- 不编辑 `reel.manifest.json`。
- 不生成 spinBlur/disabled 或任何派生图片。
- 不做图片裁切、缩放、重编码、压缩、格式转换或 AI 生成。
- 不做 sequence/hold/next、cascade timeline 播放、spin/stop、remove/drop/refill、Nearwin 或跨 symbol cadence 预览。
- 不接服务器、WebSocket、账号、数据库、云保存、CDN 发布或多人协作。
- 不把服务器真实轮带、scene、otherScene、随机数、token、cookie 或玩家数据写进项目。
- 不新增 raw JSON 编辑框绕过结构化校验。
- 不扩大 Spine runtime 版本，仍只支持 official 4.3.x。
- 不为资源错误增加 filename guess、normal copy、transparent fallback、font fallback、builtin fallback 或 glob 扫描。
- 不改变 gamelayouteditor 的用户流程；但 shared symbol package contract 改动后必须跑其回归测试，确保它可以加载空资源和任意命名资源 package。

## 5. 目标数据模型

具体命名可按仓库风格调整，但职责和不变量必须保留。

### 5.1 资源库

建议模型：

```ts
type EditorAssetKind =
  | "image"
  | "spine-skeleton"
  | "spine-atlas"
  | "vni-project"
  | "json-unknown"
  | "unsupported";

interface EditorAssetRecord {
  path: string;
  bytes: Uint8Array;
  kind: EditorAssetKind;
  size: number;
  uploadBatchId: string;
  metadata?:
    | ImageMetadata
    | SpineSkeletonMetadata
    | SpineAtlasMetadata
    | VniProjectMetadata;
  diagnostics: readonly string[];
}

interface EditorAssetLibrary {
  records: Map<string, EditorAssetRecord>;
  batches: readonly UploadBatch[];
}
```

metadata 至少覆盖：

- image：可 decode、mime、width、height；
- Spine skeleton：version、animation names、slot names；
- Spine atlas：page paths；
- VNI project：version、duration、stage metadata、asset paths；
- JSON 无法唯一分类时标为错误，不猜成 Spine 或 VNI。

资源引用始终保存 canonical project path，不保存临时 Object URL。Object URL 只由 preview resource 生命周期持有。

### 5.2 项目状态目录

```ts
interface EditorStateDefinition {
  id: string;
  source: "builtin" | "custom";
  phase: "stable" | "once";
  playback: "static" | "loop" | "once";
}
```

基础定义来自 rendercore 公共 state preset，不能在 app 建第二份容易漂移的表。若 rendercore 暂无适合 editor 的只读导出 API，应新增公共 API，而不是复制 literal。

### 5.3 单状态视觉 draft

```ts
type EditorBaseVisual =
  | { kind: "empty"; size: "cell" | { width: number; height: number } }
  | { kind: "image"; imagePath: string }
  | { kind: "layered-image"; layers: readonly EditorImageLayer[] };

type EditorStateVisual =
  | EditorBaseVisual
  | {
      kind: "spine";
      baseVisual?: EditorBaseVisual;
      skeletonPath: string;
      atlasPath: string;
      texturePath: string;
      animationName: string;
      transform?: EditorTransform;
    }
  | {
      kind: "vni";
      baseVisual?: EditorBaseVisual;
      projectPath: string;
      startTime: number;
      endTime: number;
    }
  | { kind: "static"; durationSeconds: number }
  | { kind: "builtin"; durationSeconds: number }
  | { kind: "activeSpine"; animationName: string };
```

loop 不存为任意布尔值，由 state definition 派生。对于 imported manifest，解析后也要验证 manifest loop 与 definition 一致。

`baseVisual` 只用于 schema 本来就要求 normal/base texture 的场景。它是 manifest 的显式组成，不得在资源加载失败时临时启用。非 normal empty 不复用 normal base，而是使用下文定义的正式 empty animation spec。

### 5.4 单 symbol draft

```ts
interface EditorSymbolDraft {
  code: number;
  symbol: string;
  included: boolean;
  scale: number;
  renderPriority: number;
  stateOrder: readonly string[];
  states: ReadonlyMap<string, EditorStateVisual>;
  valuePresentation?: EditorValuePresentationDraft;
  cascadeWinPresentation?: EditorCascadeWinPresentationDraft;
}
```

不再以 `manifestDraft: Record<string, unknown>` 作为主要可变业务模型。raw manifest 只可用于导入输入、严格 parser 输出或最终编译结果。所有 mutation 通过 store transaction 修改 typed draft，然后统一编译、验证和生成 preview/export snapshot。

### 5.5 状态到 manifest 的编译器

新增单一纯函数编译入口，例如：

```ts
compileSymbolEditorManifest(project): unknown
```

它负责：

- 按 numeric code 升序稳定输出 included symbols；
- 生成 additional state definitions；
- 从全部 symbol 的 image states 和需要无损保留的 legacy state settings 派生稳定、唯一的顶层 `states[]`；
- 把 empty normal 编译为 transparent normal；
- 保留 normal 基础图片/layer 与 normal Spine/VNI animation 的组合；
- 把 state visual 编译为现有 rendercore animation spec；
- 编译 valuePresentation 和 cascadeWinPresentation；
- 只写非默认 renderPriority，scale 按现有 production 要求显式输出 `1`；
- 不写上传批次、UI selection、zoom、diagnostic 等 editor-only 字段；
- 不引用任何未在资源库中的 path；
- 不把未引用资源加入 export snapshot。

导入方向必须有对应的反编译/归一化入口，把 game002/game003 当前合法 manifest 转为 typed draft。导入后未修改项目再导出要求语义等价、资源 bytes 不变、两次导出 ZIP bytes 一致。

## 6. rendercore 公共合同改造

### 6.1 允许真正的空资源 package

修改 `parseSymbolPackageManifest()` 和文档：

- `resources` 仍必填且必须为数组；
- 允许 `[]`；
- 非空时仍要求 canonical、唯一、无 collision、稳定排序；
- entrypoints 仍不得出现在 resources；
- ZIP 实际 entry 集合仍必须精确匹配；
- `createSymbolPackageResource()` 必须能用全 transparent normal 创建 catalog 和 RenderSymbol，不创建无意义 Object URL。

这不是放宽缺资源校验。manifest 只要引用了一个资源，闭包仍必须精确包含该资源及全部间接依赖。

### 6.2 移除 symbol-code 文件名限制

重构 `createSymbolAssetMapFromManifestModules()`：

- normal/state/layer/keyframe 必须按 manifest path 解析 module，而不是按 basename 推导；
- 支持合法子目录；
- 支持任意合法 PNG/JPEG/WebP 文件名，最终允许范围以现有 texture loader 和 manifest schema 为准；
- module key 与 manifest path 的解析规则必须兼容 production Vite modules 和 browser package canonical paths；
- 不扫描未引用文件、不做 basename fallback；
- 同 basename 不同目录不得串资源；
- 找不到 exact path 时明确报 manifest path。

现有 production manifest 和 symbolsviewer/game runtime 必须保持行为不变。

### 6.3 支持稀疏 state textures

调整 parsed manifest 和 asset map：

- `ParsedSymbolManifestSymbol.states` 继续为 partial record；
- 顶层 `states[]` 表示允许出现的 state texture ids，不表示每个 symbol 必须全部提供；
- 对 symbol entry 中存在的 path 做 strict string/path/resource 校验；
- 缺少某个可选 state path时不创建 texture；
- valuePresentation 的 `reelStates` 遵循同样的稀疏非 normal state 规则，`reelStates.normal` 仍必须是 explicit transparent normal；
- package catalog 不再把 manifest 顶层 states 作为全 symbol required texture policy；
- symbol 已声明 state path但资源缺失仍立即失败；
- 需要“所有 symbol 都必须有某些 states”的 generator/production 调用方若确有需求，应使用显式 strict option，不能让 package/editor contract隐式承担。

必须检查 catalog、reel symbol registry、state texture generator 和现有 tests，避免稀疏支持意外放宽 production generator 的明确合同。

### 6.4 新增显式 empty state spec

transparent normal 已能表达 normal 为空，但非 normal state 不能用现有 `static` spec 冒充 empty：`static` 会重置并继续显示 normal/base art。rendercore 必须新增一个正式、严格解析的 empty animation spec，建议合同为：

```ts
interface SymbolManifestEmptyAnimationSpec {
  readonly kind: "empty";
  readonly durationSeconds: number;
}
```

要求：

- 加入 `SymbolManifestAnimationSpec` union 和 recursive strict parser；
- `durationSeconds` 为有限正数，新建空 state 默认使用 `1 / 60`；
- runtime reset 时显式隐藏 base layer、state sprite、underlay 和 overlay；
- once state 到 duration 后真实上报 once completion；
- loop state按 duration 上报 loop boundary；
- stable static state保持空显示；
- 不收集任何资源 path；
- 不在缺图片、缺 VNI、缺 Spine 或 resolver error 时自动切到 empty；
- imported manifest 只有显式 `kind: "empty"` 才反编译为非 normal empty state。

如果实施时选择等价的 manifest 表达方式，必须同时满足“无隐藏 PNG、能隐藏已有 normal art、生命周期正确、可 round-trip、绝不作为错误 fallback”五项，并在文档和报告中给出最终 schema；不能继续使用会显示 normal art 的现有 static spec。

### 6.5 资源 introspection

在 rendercore/vnicore 的合适公共边界提供 browser-safe introspection，供 editor 下拉列表使用。职责至少包括：

- 严格识别 VNI project；
- 读取 VNI duration 和 indirect asset paths；
- 严格识别 Spine skeleton JSON 和 official version；
- 列出 Spine exact animation names 和 slot names；
- 解析 atlas pages；
- 校验 skeleton/atlas/texture 组合；
- 产生结构化 diagnostics。

symbolseditor 只消费结构化结果，不直接 import Spine runtime 私有 parser、不复制版本判断、不用 `Object.keys(raw.animations)` 建另一套松散 parser。

### 6.6 Spine 下拉约束

Spine 状态配置顺序：

1. skeleton 下拉只列有效 4.3 skeleton；
2. atlas 下拉只列可解析 atlas；
3. texture 下拉只列能满足所选 atlas page 的 image；
4. animation 下拉只列所选 skeleton 的 exact animation names；
5. transform 使用结构化数字输入；
6. loop 从 state lifecycle 自动得到。

如果当前 symbol manifest schema 只支持 single-page atlas，multi-page atlas 必须明确报“不受当前 schema 支持”，不能只取第一页。若扩展 multi-page，需要先正式升级 manifest/resource types 和全部 runtime tests，不能只在 editor 特判。

valuePresentation 多 tier 使用 activeSpine 时：

- active animation 下拉只列所有已配置 tier skeleton 的 animation name 交集；
- text slot 下拉只列所有 tier skeleton 的 slot name 交集；
- 某档不含已选 animation/slot 时立即显示具体 tier 错误；
- 不允许手填一个只在部分 tier 存在的名字。

## 7. UI 与交互规格

### 7.1 页面布局

保持左右两栏，但重新组织左栏：

```text
顶部 toolbar
  新建（game config）/ 导入 ZIP / 上传文件组 / 上传目录 / 导出 ZIP

左侧滚动区
  项目设置
  资源库
  Display symbols 列表
  当前 symbol 状态列表与状态编辑器
  项目状态定义
  Value presentation（按需）
  Cascade presentation（按需）

右侧固定区
  当前预览 state
  Replay
  Fit all / - / zoom slider / +
  全 symbols Pixi gallery
```

复杂区域允许折叠，但资源列表、当前 symbol 和当前 state 必须始终有明确上下文。错误应显示在对应资源、symbol 或 state 附近；顶部可以汇总，但不能只有一条无法定位的全局 parser 错误。

### 7.2 资源库

资源库必须支持：

- 按上传批次折叠；
- 按 path/type/status 搜索或过滤；
- 显示引用数量；
- 点击引用跳到 symbol/state；
- 未使用资源删除；
- 显式替换同 path bytes；
- 显示 VNI assets、Spine animation/slot、atlas page 摘要；
- 明确区分“尚未被使用”和“解析失败”。

上传一个文件组时，所有文件先在临时 map 中做 path、collision、UTF-8/JSON 和基础类型检查；通过后一次 transaction 加入资源库。组内一项失败不得留下半个批次。

### 7.3 Display symbols

列表按 numeric code 排序，每行显示：

- code 和 symbol；
- included checkbox；
- 已配置状态数量；
- normal 类型；
- 当前错误数量；
- scale；
- renderPriority；
- 编辑按钮。

取消 included 时保留该 symbol 的 draft 配置，便于重新勾选；它不进入 manifest 和 export closure。不能删除 game config symbol，也不能创建 game config 中不存在的 display symbol。

若 display set 为空，允许继续编辑，但导出应明确失败，因为没有可展示 symbol；不要自动重新勾选任何项。

### 7.4 单 symbol 状态编辑

状态列表：

- normal 固定第一项；
- 其它状态按用户顺序显示；
- 添加下拉排除已存在状态；
- 可上移/下移，保证键和 UI 稳定；
- 删除前检查引用；
- 每个状态卡显示 lifecycle 和资源类型。

资源类型切换必须是原子 transaction。切换类型时不得把旧类型的 path 残留到新 manifest；可以在 editor undo 之外直接丢弃旧 type-specific fields，但切换前 UI 应明确提示。

所有资源字段使用下拉：

- image/layer/keyframe -> image assets；
- VNI -> vni-project assets；
- Spine skeleton -> spine-skeleton assets；
- Spine atlas -> spine-atlas assets；
- Spine texture -> compatible image assets；
- Spine animation -> skeleton animation names；
- activeSpine animation -> tier intersection；
- cascade state -> compatible current symbol states；
- value text slot -> tier slot intersection。

数值、颜色、font family、custom state id 等本来不是资源引用的字段仍使用合适的 number/color/text/select 控件。

### 7.5 valuePresentation

必须能从 UI 新建、编辑和删除 valuePresentation，并覆盖 game002 CN 当前结构：

- defaultValues 增删、排序、positive safe integer、去重；
- reel normal transparent width/height；
- 稀疏 reel state image 下拉；
- tiers 增删、排序；
- 非末档 maxExclusive 严格递增，末档无上限；
- 每档 Spine 资源下拉、Loop animation 下拉、transform；
- text type font/image；
- slot 下拉；
- x/y；
- font 样式字段；
- image value prefix/目录从资源库候选目录中选择，并逐个显示 `${rawValue}.png` 是否存在；
- preview value 必须是 positive safe integer；
- image value 缺图不回退 font。

普通 symbol 转为 valuePresentation 时必须先显示结构变化说明；确认后 normal 变为 transparent reel normal、state textures 移到 reelStates，active art 来自 tiers。反向删除 valuePresentation 不得猜 normal 图片，应回到 explicit empty normal。

### 7.6 导出按钮和 diagnostics

空美术项目是合法的，因此“没有上传资源”不能禁用导出。以下情况必须禁用导出并显示精确位置：

- display set 为空；
- 非法 cellSize/id/state id/scale/priority/duration/range/threshold；
- 选择的资源不存在或解析失败；
- VNI indirect asset 缺失；
- Spine version、atlas page、texture、animation 或 slot 不兼容；
- state lifecycle 与 playback 类型冲突；
- cascade state 引用缺失、重复或 phase 不匹配；
- value tier/value image 不完整；
- package path collision；
- manifest parser、game config/display cross validation 或 exact closure 失败。

unused resource 只显示 warning，不阻止导出，因为它不会进入 ZIP。不得通过把错误资源自动改为空来恢复导出。

## 8. Preview 设计

### 8.1 使用公共 runtime

preview 必须继续使用：

- `createSymbolPackageResource()`；
- `createCatalog()`；
- `RenderSymbol`；
- rendercore animation resolver；
- rendercore value controller；
- 一个由 app 拥有的外部 `PIXI.Application`。

不得直接在 app 中创建 Spine player、解析 VNI layer、操作 track、复制 state machine 或把独立 canvas 转 texture。

### 8.2 部分可预览草稿

preview snapshot 必须从 typed draft 编译。规则：

- 空 normal 的 symbol 可立即预览为空 cell；
- 一个 symbol 当前 state 合法时可以预览；
- 其它 symbol/state 错误不应让整个 gallery 消失，应在对应 cell 显示错误占位；
- 但 preview 使用的每个临时 package/resource 仍必须自身闭包严格，不得塞入缺资源后依赖 fallback；
- 可以按有效 symbol 子闭包创建 runtime，再由 gallery view model 合并错误/未配置 cell；
- stale revision/request token 必须阻止旧资源覆盖新 draft；
- 每次替换 resource、切项目和 destroy 必须释放 RenderSymbol、player、Pixi texture 和 Object URL。

### 8.3 Gallery geometry

- cell 逻辑尺寸来自 package `cellSize`；
- symbol scale 来自 draft/manifest；
- columns 根据有效 viewport 宽高、symbol 数量和 cell aspect ratio 计算；
- Fit all 以包含全部 cell 为目标；
- zoom 设定统一作用于 gallery container，不能改写 symbol manifest scale；
- zoom 最小/最大值显式定义并测试，例如 `25%..400%`；
- label 和 cell guide 不应随 symbol animation 被清除；
- renderPriority 只影响同一 cell 内 symbol art，不改变 gallery 排序。

## 9. ZIP 导入、导出和迁移

### 9.1 导入

沿用当前 bounded ZIP/path/collision 安全，顺序固定：

1. bounded extract；
2. strict package manifest；
3. exact ZIP entry closure；
4. game config parser；
5. symbol manifest parser；
6. game config/display cross validation；
7. direct/indirect resource closure；
8. image/VNI/Spine/value 初始化；
9. manifest -> typed editor draft；
10. 建立完整资源库 metadata/ref graph；
11. 全部成功后原子替换当前项目。

失败导入不得清空旧项目、旧 preview 或旧 Object URL owner。

### 9.2 旧 package 兼容

必须能导入任务 100 格式和当前 production fixture：

- 按 symbol code 命名的旧图片仍能用，因为 manifest 显式引用它们，而不是因为保留旧自动匹配；
- 旧 manifest 的 spinBlur/disabled settings 原样保留；
- game002 additional states、CN valuePresentation、activeSpine、cascade metadata 全部进入结构化 draft；
- game003 VNI/Spine/缺 appear 的差异不被补齐；
- import -> export 不新增不存在的状态或资源；
- production files不因测试被重写。

### 9.3 导出

导出固定执行：

1. typed draft -> raw symbol manifest；
2. rendercore strict parse；
3. game config/display cross validation；
4. 从 manifest 收集 exact resource closure；
5. 从资源库拷贝仅被引用 bytes；
6. 构造允许空 resources 的 package manifest；
7. 创建临时 SymbolPackageResource；
8. 对非空 display set 创建 catalog；
9. 稳定 JSON 和 deterministic ZIP；
10. 释放临时资源并下载。

连续两次未修改导出 bytes 必须一致。未引用资源、upload batch、UI zoom 和 selected state 不进入 ZIP。

## 10. Ownership 与文件边界

### 10.1 `packages/rendercore`

拥有：

- symbol manifest schema/parser；
- sparse state texture 语义；
- arbitrary manifest path 到 modules/files 的 exact resolution；
- package manifest/resource/closure；
- Spine/VNI introspection 与严格兼容性校验；
- catalog、RenderSymbol、animation resolver、value controller；
- state preset 和 cascade presentation schema。

### 10.2 `packages/browserartifactio`

继续拥有：

- canonical path；
- collision；
- bounded ZIP；
- deterministic ZIP；
- Object URL registry。

若目录上传需要把 `webkitRelativePath` 规范化为 package path，应复用或扩展这里的通用 path API，不在 app 写第二套安全规则。

### 10.3 `apps/symbolseditor`

拥有：

- typed editor draft；
- transaction/store；
- 资源库和引用图 UI；
- symbol/state/value/cascade 表单；
- manifest 编译/反编译的 editor mapping；
- gallery layout/zoom/UI state；
- browser file input 和 download。

它不拥有 manifest parser、Spine/VNI parser/player、Pixi symbol 状态机或 ZIP 安全算法。

### 10.4 其它 app

- `apps/symbolsviewer` 保持 production manifest viewer 和 sequence 能力；不把其 sequence controller复制到 editor。
- `apps/gamelayouteditor` 继续只消费 symbols package normal preview；本任务只做兼容回归。
- `apps/game002`、`apps/game003` 不因 editor 重构增加 fallback、资源别名或特殊分支。

## 11. 实施步骤

### 阶段 A：基线、fixture 和合同测试

1. 记录 branch、HEAD、status、Node、pnpm。
2. 跑 rendercore、symbolseditor、symbolsviewer、gamelayouteditor 当前 lint/typecheck/test/build，记录基线。
3. 从 game002/game003 production manifest 建只读 fixture，不复制或简化关键字段。
4. 先写失败测试锁定：空 resources、transparent-only package、任意资源名、nested path、稀疏 state texture、旧 package 回归。
5. 更新 `docs/symbol-package.md` schema 草稿，明确本任务的兼容扩展。

### 阶段 B：rendercore package/manifest 改造

1. 允许 package resources 空数组。
2. 把 image/state/layer module resolution 改成 exact manifest path。
3. 移除 basename/symbol-code 约束和文件名 splitter 依赖。
4. 支持稀疏 per-symbol state textures。
5. 新增正式 empty state spec 和 runtime 生命周期。
6. 保留 generator 或显式 strict caller 的 required-state 能力。
7. 增加 resource introspection API。
8. 验证 official Spine 4.3 animation/slot/atlas page 列表。
9. 跑全部 rendercore tests，确认 game002/game003 fixture 不变。

### 阶段 C：typed editor model 和编译器

1. 新增 asset library、state catalog、symbol draft、state visual、value/cascade draft types。
2. 实现 game config -> blank project。
3. 实现 manifest -> typed draft。
4. 实现 typed draft -> manifest。
5. 实现引用图、used/unused/error resource status。
6. 实现 display include、state add/remove/reorder 和引用保护。
7. 实现空项目 strict export snapshot。
8. 用纯 model tests 覆盖所有 transaction 和序列化规则。

### 阶段 D：资源上传与下拉 view model

1. 实现多文件上传和目录上传。
2. 实现上传批次原子校验。
3. 实现 path conflict、explicit replace、referenced delete guard。
4. 构建 image/VNI/Spine/atlas metadata 索引。
5. 构建每类表单的 filtered dropdown options。
6. 删除文本资源路径和 animation-name 输入。
7. 删除默认 filename mapping、unmapped expected-name 模型和 state image generator settings UI。

### 阶段 E：symbol/state/value/cascade UI

1. 重做 display symbols 列表和批量选择。
2. 重做 per-symbol state list、add/remove/reorder。
3. 实现 empty/image/layered/Spine/VNI/static/builtin/activeSpine 表单。
4. 实现 project custom state definitions。
5. 实现完整 valuePresentation 编辑。
6. 实现 cascadeWinPresentation 编辑和 state-compatible dropdown。
7. 将 diagnostics 精确挂到资源、symbol 和 state。
8. 保证 DOM re-render 后 selection 和 transaction revision 一致。

### 阶段 F：全 symbols preview

1. 移除 single/gallery toggle，固定 gallery。
2. 实现 global state selector、Replay 和 preview value。
3. 实现 fit-all geometry、zoom buttons、slider、resize。
4. 对未配置/empty/error cell 使用不同显式占位。
5. 对有效子闭包继续走真实 RenderSymbol runtime。
6. 验证 rapid upload/state switch/import/destroy 无 stale result 或泄漏。

### 阶段 G：ZIP、兼容和文档

1. 接回原子 import、strict export 和 deterministic ZIP。
2. 导入/导出 game002 fixture。
3. 导入/导出 game003 fixture。
4. 验证旧 task-100 package。
5. 跑 symbolsviewer、gamelayouteditor、game002、game003 相关回归。
6. 更新 README、symbol package docs 和必要的 `agents.md`。
7. 完成浏览器人工验收。
8. 生成 UTC timestamp 并写中文任务报告。

## 12. 自动化测试计划

### 12.1 rendercore

- package `resources: []` 合法；缺字段或非数组仍失败。
- transparent-only symbols package 可创建 resource/catalog/RenderSymbol。
- 任意 normal 文件名，例如 `art/base-wild-final.webp`。
- 任意 state 文件名，例如 `art/blur-v2.png`。
- 相同 basename 不同目录 exact resolution。
- manifest 引用不存在时失败且错误包含完整 path。
- 稀疏 spinBlur：A 有、B 无，合法且 B 不产生 state texture。
- 已声明 state path 缺资源失败。
- existing required-state strict option 仍能要求全量 state。
- non-normal explicit empty 会隐藏已有 normal art，并按 once/loop lifecycle 上报完成边界。
- 缺图片/VNI/Spine 时绝不自动使用 empty spec。
- normal image + normal Spine/VNI 组合 round-trip 不丢基础视觉。
- layered normal 任意 path/keyframe。
- VNI project 任意名称、indirect asset exact closure。
- Spine skeleton/atlas/texture 任意名称、4.3 version、animation names、slots、page。
- multi-page 不支持时显式失败。
- activeSpine tier animation/slot 交集。
- existing game002/game003 manifest parser/resource tests 全部通过。
- symbolsviewer/game runtime module mapping不回归。

### 12.2 symbolseditor model

- game config -> code-ordered blank project。
- 默认每个 included symbol 只有 empty normal。
- 空项目可 export snapshot，resources 为空。
- display set 为空时导出失败。
- all/none/invert selection。
- batch upload 原子性。
- arbitrary path assets 不自动绑定。
- unused resource 不进 export。
- explicit resource selection 进入 exact closure。
- duplicate path 不静默覆盖。
- referenced delete 被阻止。
- explicit replace 保留 references 并更新 bytes/metadata。
- per-symbol state add/remove/reorder。
- referenced state delete 被阻止。
- empty/image/Spine/VNI/static/builtin/activeSpine 编译。
- sparse top-level states union。
- custom state definition round-trip。
- group cascade round-trip。
- sequentialCollect cascade round-trip。
- incompatible cascade state 不进入 export。
- valuePresentation tier/defaultValues/text/reel states round-trip。
- manifest -> draft -> manifest 对 game002/game003 语义等价。
- store transaction 抛错时 atomic。
- preview/export snapshot 不持有可变 bytes alias。

### 12.3 ZIP IO

- blank package deterministic export/import。
- old task-100 package import。
- game002 package import/export。
- game003 package import/export。
- unused library assets 不进 ZIP。
- missing referenced direct/indirect resource 失败。
- failed import preserves old project。
- collision/zip-slip/size limits 保持。
- consecutive export bytes stable。

### 12.4 UI/preview

尽量把 dropdown option、gallery grid 和 diagnostics 提取为纯 view-model 测试；不要用脆弱 DOM selector mock 代替 production validation。

至少覆盖：

- 页面不存在资源 path 和 animation name 自由文本框；
- 资源列表显示 used/unused/error；
- Spine animation options exact case-sensitive；
- state add 下拉排除已用 state；
- cascade state options 按 once/loop 过滤；
- fixed gallery code order；
- state selector 默认 normal；
- missing/empty/error cell 分类；
- fit/zoom clamp；
- manual zoom 不改 manifest scale；
- stale preview request 不覆盖新 revision；
- destroy 释放 resource/player/URL。

### 12.5 受影响 app 回归

- symbolsviewer 继续加载 game002/game003 manifest 和现有 sequence。
- gamelayouteditor 继续导入普通 package；并能导入 transparent-only package 显示空 cell，不报缺图片。
- game002/game003 production build 不因 arbitrary-path/sparse-state 改动改变 closure 或 runtime 行为。
- state texture generator 仍保留其明确命名/全量生成合同；editor 不调用它。

## 13. 浏览器人工验收

### 13.1 空项目

1. 打开 symbolseditor，上传 game003 game config。
2. 确认 symbols 按 code 排序，全部 normal 为 empty，没有默认 spinBlur/disabled 路径。
3. 不上传任何资源直接导出 ZIP。
4. 重新导入，确认 display set、cellSize、empty normal 和 scale 不变。
5. 右侧一次显示全部空 cell，可 fit 和 zoom。

### 13.2 任意命名图片

1. 一次上传 `wild-final.png`、`blur-pass-03.png`、`disabled-approved.webp`。
2. 确认三者先显示为 unused，不自动绑定 WL。
3. 给 WL normal/spinBlur/disabled 分别从下拉选择。
4. 确认 current state gallery 显示对应图片。
5. 确认导出 manifest 使用实际文件名，ZIP 只包含已引用文件。

### 13.3 Spine

1. 一次上传 game002 或 game003 的 skeleton、atlas、texture。
2. 确认 skeleton version、animations、slots 和 atlas page 可见。
3. 为 normal/appear/win 选择 Spine。
4. 确认 animation 只能下拉 exact name，不能手填。
5. 故意选择不匹配 texture、错版本或缺 page，确认立即失败且不回退图片/empty。

### 13.4 VNI

1. 上传 game003 L1 VNI project 和 assets 目录。
2. 确认 project 及依赖列表可见。
3. 为 win state 选择 project 和合法 range。
4. 删除一个 indirect asset，确认 preview/export 指向具体缺失 path。
5. 恢复后确认真实 VNI win 播放。

### 13.5 per-symbol states 和 cascade

1. 给不同 symbols 配置不同状态集合。
2. 确认全局选择 appear 时，没有 appear 的 symbol 显示“未配置”，不是 normal。
3. 新增 winStart/winLoop/collect custom states。
4. 配置 CN sequentialCollect 和普通 symbol group presentation。
5. 确认 state 下拉按 lifecycle 过滤。
6. 尝试删除被引用 state，确认被阻止。
7. 确认右侧不播放 cascade 编排，只预览单一 state。

### 13.6 valuePresentation

1. 导入 game002 fixture。
2. 确认 CN 四档、defaultValues、reel states、image values 和 Num slot 全部可编辑。
3. 确认 tier animation 和 slot 来自交集下拉。
4. 改 preview value，确认档位和数字图片更新。
5. 删除一个 value image，确认不回退 font。

### 13.7 资源生命周期

1. 连续上传、替换、切 state、切 symbol、导入 ZIP。
2. 快速触发两个 preview rebuild，确认旧结果不闪回。
3. 尝试删除 referenced asset，确认列出引用。
4. 删除 unused asset，确认资源列表和导出闭包更新。
5. 切项目和关闭 app 时确认无 stale canvas、player、texture 或 Blob URL。

## 14. 自动化命令与执行约束

先确认环境：

```bash
node --version
pnpm --version
git status --short
```

相关包：

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

pnpm --filter symbolsviewer lint
pnpm --filter symbolsviewer typecheck
pnpm --filter symbolsviewer test
pnpm --filter symbolsviewer build

pnpm --filter gamelayouteditor lint
pnpm --filter gamelayouteditor typecheck
pnpm --filter gamelayouteditor test
pnpm --filter gamelayouteditor build

pnpm --filter game002 typecheck
pnpm --filter game002 test
pnpm --filter game002 build

pnpm --filter game003 typecheck
pnpm --filter game003 test
pnpm --filter game003 build
```

若某个 package 没有对应 script，应在报告中明确记录；不能伪造通过结果。按变更实际影响补跑 vnicore 或其它共享包门禁。

根级：

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

若依赖下载失败，使用用户指定代理重试：

```bash
export http_proxy=http://127.0.0.1:1087
export https_proxy=http://127.0.0.1:1087
pnpm install
```

不能因为下载失败跳过 lockfile 一致性，也不能改用 npm/yarn。

如果测试导致奇怪的 production 写法，应修改测试来表达正确合同，不要为旧 snapshot、脆弱 mock 或错误假设修改不该改的 production 逻辑。特别禁止：

- 为让旧测试通过而恢复 symbol-code 文件名限制；
- 在测试里伪造资源 dropdown，production 仍允许手填；
- mock 掉 manifest/resource parser 后声称严格校验通过；
- 为 incomplete fixture 加透明/normal/builtin fallback；
- 依赖 Pixi/Spine 私有字段验证 UI 状态；
- 修改 game002/game003 production manifest 来迎合 editor。

反过来，真实 runtime 回归不能归咎于测试，必须修复 production 实现。

## 15. 文档和 agents.md

必须更新：

```text
apps/symbolseditor/README.md
docs/symbol-package.md
```

文档至少说明：

- 新资源库优先流程；
- 任意合法文件名和 exact path；
- empty normal 和空 resources package；
- per-symbol visible states；
- sparse texture states；
- Spine/VNI 下拉约束；
- value/cascade 编辑范围；
- fixed all-symbol single-state preview；
- 不生成 blur/disabled；
- 不预览 sequence/cascade timeline；
- 导入旧 package 的兼容规则。

本任务改变了 editor/rendercore ownership 的具体描述，因此原则上需要同步更新根级 `agents.md` 中 symbolseditor 条目，至少补充：

- editor 拥有资源库、typed draft、per-symbol state assignment 和结构化 cascade 表单；
- rendercore 拥有 arbitrary-path/sparse-state manifest contract 和 Spine/VNI introspection；
- empty 是显式 manifest 资源类型，不是缺资源 fallback；
- editor 不生成 state texture；
- preview 固定 all-symbol single-state，不执行编排。

若执行者确认现有 `agents.md` 已完整覆盖且无需修改，任务报告必须逐条说明为什么；不能只写“无必要”。

## 16. 完成定义

只有全部满足才能标记完成：

- 新项目不再生成 symbol-code 资源路径或默认 spinBlur/disabled。
- 新项目全部 empty normal，未上传资源也能导出并重新导入。
- package resources 合法支持空数组，但 referenced resource 仍 exact strict。
- 用户可一次上传一组文件并始终看到完整资源库。
- 未使用资源不自动绑定、不进入 ZIP。
- 所有美术资源引用和 Spine animation/slot 使用下拉，不是自由文本。
- 任意合法文件名和子目录可由 manifest exact 引用。
- 每个 symbol 可独立增加、删除和排序状态。
- sparse per-symbol image states 可用。
- empty/image/layered/Spine/VNI/static/builtin/activeSpine 按兼容规则工作。
- game002 additional states、valuePresentation 和 cascade presentation 可结构化编辑。
- game003 图片/Spine/VNI/缺状态组合可无损导入和导出。
- 右侧固定一次渲染全部 display symbols，默认 normal，可 fit/zoom/replay。
- 未配置 state 和 empty state 在预览中明确区分。
- 状态编排不在 preview 中执行。
- blur/disabled 不生成、不复制 normal、不做 filter。
- 没有新增不必要 fallback、glob 或 filename guess。
- game002/game003 production files未被修改。
- shared ownership 没有反转或复制算法。
- 相关 package 和根级门禁通过；范围外既有失败必须在报告中给出命令、首个错误、文件和未修改原因。
- 浏览器人工验收完成并记录，不得只用 jsdom 单测代替 Pixi/VNI/Spine 实播。
- README、symbol package docs 和必要的 `agents.md` 已同步。
- 新增符合命名规则的中文 UTC 任务报告。

## 17. 任务报告内容

最终报告至少包含：

- UTC 完成时间、branch、起始 HEAD、最终 `git status --short`；
- 实际修改文件和 ownership；
- 最终 editor typed model 与 manifest 编译规则；
- 空项目导出的 package/manifest 示例；
- arbitrary path 和 sparse state 的 rendercore 合同；
- 资源库上传、冲突、替换、删除、unused/export 行为；
- per-symbol state、custom state、valuePresentation、cascade presentation 的实现范围；
- Spine/VNI introspection 和下拉过滤规则；
- game002/game003/旧 package fixture 结果；
- 全 symbols preview、fit/zoom、empty/missing/error 行为；
- 每条自动化命令、测试数量和 coverage；
- 浏览器人工验收逐项结果；
- 是否修改 `agents.md` 及理由；
- 已知限制、范围外既有失败和后续建议。
