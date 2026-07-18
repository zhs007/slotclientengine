# symbols editor workspace redesign 任务计划

## 1. 任务目标

本任务重构现有纯前端应用：

```text
apps/symbolseditor
```

当前编辑器已经具备严格的 symbol-package v1、typed draft、资源库、per-symbol state、Value/Cascade 配置和全 symbols 预览，但左侧编辑区仍是一条很长的纵向页面：

```text
项目设置
  -> 完整资源库
  -> Display symbols
  -> 当前 symbol 的全部 state 卡片
  -> 项目状态定义
  -> Value presentation
  -> Cascade presentation
```

用户通常会先上传 game config，再集中上传图片。上传后资源列表占据编辑区大部分空间，真正高频的 symbol/state 编辑被推到页面下方；“添加状态”缺少明显反馈，项目级配置与 symbol 级配置也混在同一滚动层级。

本任务把编辑器重构为清晰的工作区：

```text
顶部：项目入口、导入/导出和资源上传

左侧编辑工作区                         右侧固定预览
┌──────────────────────────────┐     ┌─────────────────────┐
│ 资源 | Symbols | 项目配置     │     │ 全 display symbols   │
├──────────────────────────────┤     │ 当前单一 state 预览  │
│ 当前主 Tab 的紧凑内容          │     │ Replay / Fit / Zoom  │
└──────────────────────────────┘     └─────────────────────┘
```

其中 Symbols 工作区进一步拆为：

```text
紧凑 symbol 列表 | 当前 symbol Inspector
                  | 基础 | 状态 | Value | Cascade
```

资源不再长期堆在 symbol 编辑器上方；symbol 绑定图片、Spine、VNI 等资源时，通过可搜索、按类型过滤的资源 Picker 显式选择。

本文件是完整实施合同。执行者不得依赖聊天记录、任务 100、任务 101 或其报告来猜产品行为；历史任务只构成当前代码来源，不是实施本任务所需的额外上下文。

任务完成后必须新增中文任务报告：

```text
tasks/104-symbols-editor-workspace-redesign-[utctime].md
```

UTC 时间戳必须使用：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/104-symbols-editor-workspace-redesign-260401-181300.md
```

## 2. 核心产品决定

### 2.1 这是信息架构与交互重构，不是数据合同重写

本任务必须保持以下合同不变：

- symbol-package v1 ZIP schema；
- game config、symbol manifest、package cellSize 的职责；
- `SymbolEditorProject` typed draft 的业务语义；
- resource-first、exact manifest path、精确资源闭包；
- 不从 symbol code 或文件名猜资源绑定；
- explicit empty 是正式资源类型，不是 fallback；
- sparse per-symbol states；
- Spine 4.3、VNI、valuePresentation、cascade presentation 的现有严格校验；
- deterministic ZIP import/export 和 round-trip；
- 右侧全 display symbols、单一 state 预览；
- 未配置、explicit empty、资源错误三种预览状态必须区分；
- 不生成 spinBlur/disabled 或其它 state texture；
- 不执行 sequence、cascade timeline、spin、remove/drop/refill 或 Nearwin。

不得借 UI 重构修改 manifest parser、降低资源校验、添加默认资源路径、引入 placeholder、改变 export closure 或重写 rendercore runtime。

### 2.2 顶层只保留三个编辑工作区

项目创建或导入完成后，左侧只有三个主 Tab：

1. `资源`
2. `Symbols`
3. `项目配置`

三个 Tab 在同一时间只渲染一个主工作区，不能继续把三个工作区的完整内容同时纵向输出。

推荐行为：

- 从 game config 新建项目后默认进入 `资源`，符合“先上传图片”的工作习惯；
- 从已有 symbols ZIP 导入后默认进入 `Symbols`，便于继续编辑现有绑定；
- 用户主动切换 Tab 后，普通项目 transaction、preview state 变化和资源加载完成不得把用户强制切回其它 Tab；
- active Tab 是纯 UI session state，不进入 project、manifest 或 ZIP。

### 2.3 资源页只负责资源管理

资源工作区包含：

- 上传文件组；
- 上传目录；
- 搜索；
- 类型筛选；
- 状态筛选：全部、已引用、未使用、错误；
- 按上传批次或资源类型查看；
- 资源缩略图/类型、canonical path、大小、状态；
- 查看引用和依赖诊断；
- 显式替换；
- 显式删除。

默认列表必须紧凑。图片优先显示固定尺寸缩略图；Spine skeleton、atlas、VNI project、未知 JSON 使用稳定类型图标或文字标记。每个资源项默认只展示高频信息：

```text
[缩略图/类型] path
kind · size · 已引用/未使用/错误
[查看详情] [替换] [删除]
```

引用位置、metadata、直接依赖、缺失依赖和详细 diagnostics 放在按需展开区，不让每条资源记录默认变成大卡片。

资源页拥有独立的滚动区域；上传再多图片也不能把 Symbols 或项目配置推到页面下方。

### 2.4 Symbols 工作区是主要编辑区

Symbols Tab 使用双栏布局：

```text
┌────────────────────┬──────────────────────────────────┐
│ symbol rail        │ selected symbol Inspector        │
│                    │                                  │
│ WL   0   ✓         │ WL · code 0                     │
│ H1   1   !         │ 基础 | 状态 | Value | Cascade    │
│ H2   2   ✓         │                                  │
│ ...                │ 当前 inspector 内容              │
└────────────────────┴──────────────────────────────────┘
```

symbol rail 固定紧凑显示：

- include checkbox；
- numeric code；
- symbol name；
- ready / incomplete / error 状态；
- state 数量；
- 当前选中状态。

全选、全不选、反选放在 symbol rail 顶部 sticky 工具栏。symbol 数量增加时只滚动 rail，不拉长整个左侧页面。

选择 symbol 后 Inspector 不显示其它 symbol 的详细配置。切换 symbol 时保留当前 Inspector 子 Tab；如果当前子 Tab 对新 symbol 不适用，例如 Value 尚未启用，也应显示紧凑的启用入口，而不是偷偷跳 Tab。

### 2.5 Inspector 固定为四个子 Tab

当前 symbol Inspector 使用：

1. `基础`
2. `状态`
3. `Value`
4. `Cascade`

#### 基础

只包含：

- symbol code/name 只读摘要；
- included；
- scale；
- renderPriority；
- normal 状态摘要；
- completeness/错误摘要。

normal 的详细资源配置仍在“状态”Tab 编辑，避免同一字段出现两份可编辑 UI。

#### 状态

这是本任务的高频核心界面，详见第 2.6 节。

#### Value

- 未启用时只显示说明和“启用 Value presentation”；
- 启用后显示现有 default values、reel states、tiers、text/slot 等结构化字段；
- tier 可使用紧凑 accordion，一次默认展开一个 tier；
- 不再把完整 Value 表单放在所有 state 卡片和项目状态定义之后。

#### Cascade

- 未启用时只显示 mode 选择和说明；
- 启用后显示 order、mode 派生字段和 state selectors；
- state 候选继续受当前 symbol capability 和 lifecycle 约束；
- 不改变 summary mode 派生规则。

### 2.6 状态编辑改为“状态导航 + 单状态 Inspector”

不得继续把当前 symbol 的全部 state 展开成一列大卡片。

状态 Tab 顶部固定显示紧凑状态导航：

```text
normal   appear   win   remove              [＋ 添加状态]
```

也可以用纵向 state rail，但必须同时只展开一个 state 的详细字段。

状态导航每项至少显示：

- state id；
- stable/once 或 loop/once 生命周期摘要；
- configured / empty / missing-resource / error 状态；
- 非 normal state 的排序和删除入口。

下面只渲染当前选中 state 的：

- visual kind；
- image/layered image/Spine/VNI/static/builtin/activeSpine 对应字段；
- normal base visual；
- transform、animation 等现有配置。

`normal` 始终存在且不可删除。其它 state 的移动和删除继续调用现有 model API，不直接修改 Map/array，也不得绕过 cascade 引用保护。

### 2.7 “添加状态”必须有完整反馈

“添加状态”是一级按钮，不再藏在 scale/renderPriority 下方的普通 `<select>` label 中。

点击后打开小型 menu/popover，只列出当前 symbol 尚未添加的项目 state definitions，并显示 lifecycle：

```text
appear        once / once
win           once / once
dropdown      stable / loop
```

添加成功后的同一交互链必须：

1. 调用现有 `addSymbolState()` transaction；
2. 把新 state 设为当前 selected symbol state；
3. 自动显示该 state 的 Inspector；
4. 把右侧 preview state 同步为该 state；
5. 给出短暂、非阻塞的成功提示，例如“已为 WL 添加 win 状态”；
6. 把键盘焦点移到新 state 的 visual kind 或 state heading；
7. 新 state 初始 explicit empty 的事实必须在 UI 中明确显示。

如果添加失败，错误显示在操作附近或统一 diagnostics，不得显示成功提示、不得切换到不存在的 state，也不得留下半 transaction。

### 2.8 资源绑定统一使用资源 Picker

状态、normal base visual、layer/keyframe、Spine skeleton/atlas/texture、VNI project 和 Value tier 等资源字段不再用包含所有 path 的大下拉框。

统一显示紧凑绑定控件：

```text
Image
[thumbnail] art/wild-final.webp             [选择/更换] [清除]
```

点击“选择/更换”打开 modal dialog 或 anchored picker。Picker 必须包含：

- 当前字段名称和 symbol/state 上下文；
- 搜索；
- 与字段兼容的资源类型过滤；
- 紧凑缩略图/类型列表；
- path、kind、解析状态；
- 当前选择；
- 确认、取消；
- 可选的“上传新资源”入口。

Picker 过滤规则必须复用当前 typed metadata 和 existing compatibility helper：

- image 字段只显示 image；
- skeleton 只显示合法 Spine skeleton；
- atlas 只显示 atlas；
- VNI 只显示 VNI project；
- Spine atlas/texture/animation 候选继续根据 skeleton/atlas metadata 严格约束；
- Value slot 继续来自 tier skeleton intersection；
- 不兼容或有解析错误的资源不能被确认绑定。

打开 Picker、搜索、浏览和取消都不得修改 project。只有明确确认某个资源后才执行一个原子 transaction。

上传新资源后不得按 filename 自动绑定。若 Picker 内上传，应刷新候选并高亮新资源，用户仍需明确确认；不能因为只上传一个文件就偷偷写入 state。

### 2.9 项目配置独立管理全局内容

项目配置 Tab 包含：

- package/project id；
- cell width/height；
- 项目 state definitions；
- custom state 添加/删除；
- legacy texture state order/settings 的只读摘要或现有允许的结构化入口；
- 项目级 diagnostics；
- 高级导出摘要。

项目 state definitions 不再出现在单个 symbol 编辑器下面。新增 custom state 后，Symbols -> 状态 -> 添加状态菜单立即出现该候选；删除仍被 symbol/cascade 引用的 custom state 必须被 model 阻止并报告引用，不能自动删除 per-symbol 配置。

legacy metadata 默认折叠并明确标为导入兼容数据，不把它伪装成现代 state texture 生成配置。

### 2.10 右侧预览保持固定且与编辑上下文协作

右侧继续是全部 included display symbols 的单一 state gallery，不切回 single-symbol preview。

保持：

- state selector；
- Replay；
- preview value；
- Fit all；
- 25%..400% zoom；
- code-order gallery；
- missing/empty/error 明确占位。

新增协作规则：

- 用户在状态 Inspector 选择某 state 时，右侧 preview state 自动同步到该 state；
- 用户在 preview toolbar 主动选择 state 时，不强制改变当前 Inspector 主 Tab；若当前正处于“状态”Tab，则同步选中对应 state；
- 切换 symbol 不改变 preview zoom；
- 普通 transaction 不重复 fit，不重置手动 zoom；
- preview rebuild 失败继续使用现有 request token，不能显示过期资源。

### 2.11 UI session state 不进入 typed project

至少需要以下 UI-only state：

```ts
type WorkspaceTab = "assets" | "symbols" | "project";
type SymbolInspectorTab = "basic" | "states" | "value" | "cascade";

interface AssetPickerState {
  readonly context: ResourceBindingContext;
  readonly compatibleKinds: readonly EditorAssetKind[];
  readonly currentPath?: string;
  readonly query: string;
  readonly statusFilter: string;
}
```

以及：

- selected symbol；
- selected symbol state；
- resource list filters；
- expanded resource/tier details；
- transient success message；
- focus restoration target。

这些状态只能存在于 app/UI controller，不得添加到 `SymbolEditorProject`、symbol manifest、package manifest 或 ZIP。

## 3. 当前实现基线

仓库路径：

```text
/Users/zerro/github.com/slotclientengine
```

制定本计划时：

```text
branch: main
HEAD: 14cc927a051c26b673e19829fa262a9747c1d35e
git status --short: clean（新增本计划文件之前）
```

制定计划期间任务 103 已提交为当前 HEAD：

```text
14cc927 feat(gamelayouteditor): implement random reel symbol preview functionality
```

任务 104 不应回退或顺带修改该功能。执行时若工作区存在其它修改或未跟踪文件，它们都属于用户或其它任务，必须保留；禁止 reset、checkout、stash、clean、覆盖或混入无关格式化。

执行任务时必须重新记录：

```bash
git branch --show-current
git rev-parse HEAD
git status --short
node --version
pnpm --version
```

仓库工具链要求：

- Node.js `>=24.0.0`；
- package manager `pnpm@10.0.0`，engines 接受 pnpm `>=10.0.0`；
- Vite、TypeScript、Vitest、ESLint、Prettier；
- Pixi.js v8；
- official Spine runtime 4.3.x 由 rendercore 封装。

### 3.1 当前主要文件

```text
apps/symbolseditor/src/ui/app-shell.ts
apps/symbolseditor/src/styles.css
apps/symbolseditor/src/model/editor-project.ts
apps/symbolseditor/src/model/editor-store.ts
apps/symbolseditor/src/preview/symbol-preview.ts
apps/symbolseditor/src/io/symbol-package-zip.ts
apps/symbolseditor/tests/editor-project.test.ts
apps/symbolseditor/tests/preview-layout.test.ts
apps/symbolseditor/tests/zip-io.test.ts
apps/symbolseditor/README.md
```

### 3.2 当前 UI 实现

`SymbolsEditorApp.render()` 当前把左侧整体替换为：

```ts
panel.innerHTML = projectMarkup(...);
```

`projectMarkup()` 顺序输出：

```text
项目设置
assetLibraryMarkup
Display symbols
symbolEditorMarkup
stateDefinitionsMarkup
valuePresentationMarkup
cascadeMarkup
```

当前具体问题：

- `assetLibraryMarkup()` 默认展开每个上传 batch，并渲染每个资源的大卡片；
- symbol list 下方继续输出当前 symbol 全部 state cards；
- `data-add-state` 只是普通下拉，成功后没有自动定位和反馈；
- 每个 state 的详细配置同时展开；
- 项目 state definitions 混在 symbol 详情后；
- Value/Cascade 始终排在页面最下方；
- image/Spine/VNI/value 资源候选主要使用完整 path `<select>`；
- transaction 后整体 innerHTML 重建，容易丢失滚动、焦点和临时展开状态；
- 当前没有专门的 app-shell DOM 测试，交互重构缺少回归保护。

### 3.3 必须复用的 model API

任务应继续调用已有 model/store API，包括但不限于：

```text
SymbolEditorStore.transact / replace / setExternalError
uploadAssetBatch
replaceAsset
deleteAsset
getAssetReferences
getSymbolResourceStatus
setAllSymbolsIncluded
setSymbolIncluded
setSymbolScale
setSymbolRenderPriority
addSymbolState
moveSymbolState
removeSymbolState
setStateVisual
addCustomStateDefinition
removeCustomStateDefinition
setValuePresentation
setCascadeWinPresentation
exportSnapshot
```

UI 不得直接修改 `project.symbols`、state Map、stateOrder、asset records、value tiers 或 cascade fields 来绕过 clone/transaction 和 model validation。若 UI 需要新的原子操作，应在 model 增加窄 API 与测试，而不是在 DOM handler 拼装半合法状态。

## 4. 范围

### 4.1 包含

- 三个主工作区 Tab。
- 紧凑资源浏览器和筛选。
- Symbols 双栏 rail + Inspector。
- 基础/状态/Value/Cascade 子 Tab。
- 单状态 Inspector。
- 明显的添加状态入口和成功/失败反馈。
- typed resource Picker。
- 项目配置与 state definitions 独立页。
- UI session state、焦点、滚动和 dialog 生命周期。
- 右侧 preview context synchronization。
- 样式、键盘和无障碍交互。
- DOM/UI 测试、现有 model/ZIP/preview 回归。
- README 更新和浏览器人工验收。
- 中文 UTC 任务报告。

### 4.2 不包含

- 不修改 symbol-package v1 schema。
- 不修改 production game002/game003 manifest、game config 或 assets。
- 不改变 rendercore symbol parser/player/runtime。
- 不增加 filename guess、basename fallback、glob binding 或自动匹配。
- 不生成/转换/模糊/灰度化图片。
- 不增加 canvas 拖动写回配置。
- 不做 sequence、timeline、spin、cascade 播放预览。
- 不做 localStorage、IndexedDB、云保存、后端或账号系统。
- 不把 UI tab、选择、filter、展开状态写入 ZIP。
- 不引入 React/Vue/Svelte 等新 UI framework；继续使用当前 TypeScript/DOM，除非另立任务讨论整个技术栈迁移。
- 不为缩短 UI 而隐藏严格错误、丢弃高级字段或增加默认兜底。

## 5. 建议代码结构

当前 `app-shell.ts` 已超过 1600 行。任务应在不引入新框架的前提下拆分 UI 职责，避免在同一文件继续增加一组超长 markup/bind 函数。

建议结构：

```text
apps/symbolseditor/src/ui/app-shell.ts
  - app lifecycle、store subscription、preview coordination
  - top-level workspace navigation
  - import/export/upload orchestration

apps/symbolseditor/src/ui/ui-session.ts
  - workspace/inspector/state selection
  - filters、expanded ids、picker state
  - selection normalization after project changes

apps/symbolseditor/src/ui/assets-workspace.ts
  - compact asset list markup/binding
  - resource status/filter helpers

apps/symbolseditor/src/ui/symbols-workspace.ts
  - symbol rail
  - Inspector tabs
  - basic/state/value/cascade panels

apps/symbolseditor/src/ui/resource-picker.ts
  - binding context
  - compatible candidates
  - dialog lifecycle、focus restore、confirm/cancel

apps/symbolseditor/src/ui/project-workspace.ts
  - id/cell size
  - state definitions
  - legacy/advanced summaries

apps/symbolseditor/src/ui/ui-feedback.ts
  - transient success/status region（若逻辑足够小可并入 app-shell）
```

实际文件名可按现有风格调整，但必须保持：

- 纯 markup/filter helper 可独立测试；
- model mutation 仍通过 store transaction；
- resource compatibility 不在多个组件复制；
- UI 模块不直接操作 preview 的私有 Pixi tree；
- 避免循环依赖。

## 6. 详细交互设计

### 6.1 无项目状态

未上传 game config、也未导入 ZIP 时：

- 顶部保留“新建（game config）”“导入 ZIP”；
- 上传资源和导出 disabled；
- 左侧显示简洁起始说明，不渲染空 Tabs；
- 右侧预览为空；
- 不创建默认项目或 fallback game config。

### 6.2 新建项目后的引导

game config 成功后：

- 默认 active workspace = `资源`；
- 显示“项目已创建，可先上传图片/Spine/VNI，再进入 Symbols 绑定”的非阻塞引导；
- 资源上传完成后显示“已上传 N 个资源”以及“开始配置 Symbols”按钮；
- 点击只切换 Tab，不自动绑定资源。

### 6.3 导入已有 ZIP

ZIP 成功导入后：

- active workspace = `Symbols`；
- 默认选中 numeric code 最小的 included symbol；若无 included symbol，选中 code 最小 draft 并显示 excluded 状态；
- Inspector 默认 `基础`；
- selected state 默认 `normal`；
- resource filters 清空；
- preview 继续 normal gallery；
- 导入失败保留旧项目、旧 UI session 和旧 preview。

### 6.4 资源列表

资源列表必须支持数十到数百条资源而不让页面失控：

- 固定高度/剩余空间滚动；
- 缩略图固定尺寸，不按原图尺寸撑开；
- path 单行省略，hover/title 或详情显示完整路径；
- batch header 默认折叠或只展开最新 batch；
- 搜索和 filter toolbar sticky；
- 资源详情展开状态在普通 transaction 后保留；
- 删除/替换后选中和展开状态规范化，不指向已不存在资源。

不要求本任务引入复杂虚拟列表；若真实资源数性能测试表明需要，可实现简单 windowing，但不能以此牺牲键盘访问或搜索正确性。

### 6.5 Symbol rail

rail 支持：

- 按 numeric code 固定排序；
- 搜索 symbol name/code；
- 过滤全部、included、incomplete、error；
- 全选/全不选/反选；
- 单击整行选择，checkbox 只改变 included；
- 当前项有清晰 selected 样式；
- ready/incomplete/error 不只靠颜色，需有文字或图标加 aria-label；
- transaction 后保持 selected symbol，只在 symbol 不存在时规范化到首项。

### 6.6 状态导航和排序

状态顺序继续以 `symbol.stateOrder` 为权威：

- normal 固定第一且不可移动/删除；
- 当前 state 明确 selected；
- up/down 在边界 disabled；
- 删除前若被 cascade 引用，使用 model 错误展示，不弹“仍然成功”的 toast；
- 删除当前 state 成功后，优先选择同位置后继，否则前一项，否则 normal；
- custom state definition 被删除后 session 不保留无效 selected state。

本任务不要求 drag-and-drop。若实现拖拽，也必须保留键盘可操作的 up/down，并最终只调用同一个 move API。

### 6.7 Value/Cascade 大表单

为了减少视觉重量：

- Value tier 使用摘要 header：threshold、skeleton、animation、ready/error；
- 只展开一个正在编辑 tier，新增 tier 后自动展开新 tier；
- Default values 使用紧凑可排序行；
- Cascade 只显示当前 mode 需要的字段；
- 高级 transform 默认折叠；
- 所有严格校验仍存在，不能因为折叠就跳过字段或 silently normalize。

### 6.8 反馈与错误层级

区分三类反馈：

1. 项目 diagnostics：影响导出或结构合法性，显示在顶部错误区及相关 workspace 摘要。
2. 局部字段错误：靠近发生操作的 Inspector/Picker。
3. 成功状态：aria-live polite 的短暂提示，不占据永久页面高度。

至少为以下动作提供成功反馈：

- 资源批次上传完成；
- 资源替换完成；
- state 添加完成；
- custom state 添加完成；
- ZIP 导入完成；
- ZIP 导出触发。

不得用成功 toast 掩盖仍然存在的 diagnostics。

## 7. Resource Picker 合同

### 7.1 Binding context

Picker 不接收任意回调直接修改 draft，应该用结构化上下文描述目标，例如：

```ts
type ResourceBindingContext =
  | { kind: "state-image"; symbol: string; state: string }
  | {
      kind: "normal-base-image";
      symbol: string;
      state: "normal";
    }
  | {
      kind: "layer-texture";
      symbol: string;
      state: string;
      layerIndex: number;
      keyframeIndex?: number;
    }
  | { kind: "spine-skeleton"; symbol: string; state: string }
  | { kind: "spine-atlas"; symbol: string; state: string }
  | { kind: "spine-texture"; symbol: string; state: string }
  | { kind: "vni-project"; symbol: string; state: string }
  | {
      kind: "value-tier-resource";
      symbol: string;
      tierIndex: number;
      field: "skeleton" | "atlas" | "texture";
    };
```

实际 union 可根据现有 visual/value model调整，但每个 target 必须可验证、可测试，不能使用字符串 DOM path 执行任意对象写入。

### 7.2 Candidate 计算

candidate helper 输入：

- current project；
- binding context；
- query/filter。

输出 immutable candidate view models：

```ts
interface ResourcePickerCandidate {
  readonly path: string;
  readonly kind: EditorAssetKind;
  readonly status: "ready" | "error";
  readonly thumbnail?: string;
  readonly summary: string;
  readonly disabledReason?: string;
}
```

不得在 Picker markup 中临时复制一套 Spine atlas page、animation 或 VNI dependency 判断。候选约束应复用/提取当前 `assetsOfKind()`、metadata 和 value intersection helper，并补单元测试。

### 7.3 Dialog 与键盘

使用原生 `<dialog>` 或等价可访问 modal：

- 打开时 focus 搜索框或当前选择；
- Tab focus 不逃出 modal；
- Escape 取消且不修改 project；
- Enter/双击确认 ready candidate；
- 关闭后 focus 回到触发按钮；
- project replace/destroy 时强制关闭并清理临时 Object URL/selection；
- dialog 不允许背景误操作。

若 happy-dom 对原生 dialog 支持不足，可封装最小 adapter 供测试，不得因此在 production 写不可访问的绝对定位 div。

## 8. 渲染与性能要求

### 8.1 避免无条件重建全部 DOM 状态

当前每个 transaction 都整体替换 left panel。实施可以继续使用 string markup，但必须保留和恢复：

- active workspace；
- Inspector tab；
- selected symbol/state；
- rail/asset/inspector scroll positions；
- expanded details/tier；
- picker state；
- keyboard focus（若目标仍存在）。

更推荐把顶层 shell、workspace tabs、preview 和 dialog mount point 初始化一次，只替换当前 workspace body。无需引入 virtual DOM，但不能让每个数字字段提交都把用户送回页面顶部。

### 8.2 Object URL 与缩略图

资源缩略图必须复用 browser-safe Object URL 生命周期；不得为每次 render 无限创建新 URL。替换、删除、project replace、import 和 app destroy 时释放对应 URL。

优先复用 `@slotclientengine/browserartifactio` 现有 `ObjectUrlRegistry` 或现有 symbol package resource owner。若需要 UI thumbnail registry，应有单一 owner 和幂等 destroy，不在每个 resource row 私自创建 URL。

### 8.3 Preview 生命周期

UI 拆分不得导致：

- 创建第二个 Pixi Application；
- 每次切 Tab 重建 preview；
- 重复加载同一 resource；
- stale async preview 覆盖新 transaction；
- 切换资源页时停止 normal Spine/VNI ticker；
- Fit/zoom 被 UI rerender 重置。

## 9. 无障碍与视觉要求

### 9.1 Tabs

主 Tabs 和 Inspector Tabs 使用正确的：

- `role="tablist"`；
- `role="tab"`；
- `aria-selected`；
- `aria-controls`；
- 对应 `role="tabpanel"`。

支持方向键切换、Home/End，且焦点样式清晰。

### 9.2 可读性

- ready/warning/error 不只依赖绿/黄/红颜色；
- button 有明确中文 label 或 aria-label；
- path 截断不丢失完整可访问名称；
- 状态、资源、symbol 选择有清晰 hover/focus/selected 差异；
- 小按钮点击区域至少保持合理尺寸；
- 错误文字与背景对比度可读。

### 9.3 布局

保持右侧 preview 为主要视觉区域。建议桌面布局：

```text
workspace editor: min 460px, preferred 44vw, max 720px
preview: remaining width
symbol rail: 180px..240px
Inspector: remaining editor width
```

仓库当前 `body min-width: 1040px`，本任务至少保证 1040、1280、1440、1920 宽度可用；不得只在开发者单一分辨率下美观。

窗口高度较小时，toolbar、Tab bar、symbol rail filters 保持可见，各内容区独立滚动，不出现整页 body 滚动与 preview 被推走。

## 10. 严格失败与禁止兜底

至少保持以下失败行为：

- 非法 game config/ZIP 不创建半项目；
- 资源 path 冲突的上传批次原子失败；
- 删除仍被引用资源失败；
- 删除仍被引用 state/custom definition 失败；
- 错 Spine/VNI/atlas/animation/slot 明确失败；
- 当前 visual kind 需要资源但未绑定时显示 incomplete/error；
- export 在严格快照失败时 disabled 并显示原因。

禁止新增：

- 找不到资源时取列表第一个；
- Picker 无结果时回退任意图片；
- 文件名与 symbol 相同就自动绑定；
- state 添加后自动绑定 normal；
- missing state 预览 normal；
- 错误资源预览 transparent/empty；
- Value/Cascade 字段隐藏后使用 UI 私有默认值覆盖导入值；
- 为满足旧测试保留两套并行 UI 或不可达 legacy 分支。

如果测试断言与新信息架构冲突，应修改测试表达正确的新行为；不要为了旧 selector 或旧 DOM 顺序写奇怪 production 代码。

## 11. 测试计划

### 11.1 UI session 单元测试

新增测试覆盖：

- 新项目默认 assets Tab；
- ZIP import 默认 symbols Tab；
- active workspace/Inspector tab 在 transaction 后保留；
- selected symbol/state 删除或失效后的规范化；
- filters 和 expanded ids 只属于 UI state；
- UI session 不进入 export snapshot；
- project replace 清理 picker/transient state。

### 11.2 Resource Picker 测试

至少覆盖：

- image context 只返回 image；
- skeleton/atlas/VNI 类型过滤；
- atlas page -> texture candidate 精确约束；
- query/path/status filter；
- error resource disabled 并显示原因；
- cancel 不产生 store revision；
- confirm 只产生一次原子 transaction；
- upload 后不自动绑定；
- target symbol/state/tier 已被删除时确认失败且不修改其它字段；
- dialog close/destroy 恢复焦点并清理 owner。

### 11.3 App shell DOM 测试

新增：

```text
apps/symbolseditor/tests/app-shell.test.ts
```

通过 mock `SymbolEditorPreview` 隔离 Pixi，覆盖：

1. 无项目时 toolbar/button 状态。
2. 新建项目后只显示资源 workspace，不同时输出全部 symbol/state/value/cascade 详情。
3. 三个主 Tabs 的 aria 和切换。
4. resource list 紧凑 filter、详情展开、替换、删除。
5. “开始配置 Symbols”切换。
6. symbol rail 搜索/筛选/批量 include。
7. 选择 symbol 与四个 Inspector Tabs。
8. 添加 state 后自动选中、preview 同步、成功提示和焦点。
9. state 删除/排序和 model error。
10. resource picker confirm/cancel。
11. Value/Cascade 未启用时不渲染大表单，启用后字段可编辑。
12. custom state 在项目配置创建后出现在添加菜单。
13. transaction 后 active tab、scroll/focus 不跳回顶部。
14. import/export/upload failure 保留旧 UI。
15. destroy 幂等。

测试应优先断言用户可见行为、ARIA 和 store mutation，不要大面积 snapshot 整段 HTML；整段 snapshot 会让后续小样式调整成本过高。

### 11.4 Model/ZIP/preview 回归

现有测试必须继续证明：

- code-order symbols；
- empty normal 可无资源导出；
- resource exact closure；
- upload conflict 原子性；
- resource/state 引用保护；
- custom/sparse states；
- game002/game003 manifest round-trip；
- store transaction 原子性；
- deterministic ZIP；
- all-symbol gallery layout和 zoom clamp。

UI 重构不应修改这些预期。若必须新增窄 model API，要在 `editor-project.test.ts` 补语义测试。

### 11.5 性能测试/检查

构造至少：

- 100 个 image resource；
- 30 个 symbols；
- 每个 symbol 7 个 states；
- 4 个 value tiers。

确认：

- 初始只渲染 active workspace；
- 资源搜索和 Tab 切换无明显卡顿；
- 不创建成倍 Object URL；
- preview ticker 未因左侧操作冻结；
- transaction 后没有明显滚动闪跳。

不要求建立脆弱的毫秒级 CI 阈值，但应在浏览器人工验收中记录体验和开发工具观察。

## 12. 文档和 agents.md

必须更新：

```text
apps/symbolseditor/README.md
```

README 说明新的实际流程：

```text
game config / ZIP
  -> 资源 Tab 上传和管理
  -> Symbols Tab 选择 symbol、添加 state、通过 Picker 绑定资源
  -> 项目配置 Tab 管理 cellSize 和 state definitions
  -> 右侧全 symbols 预览
  -> strict export
```

并说明：

- 资源上传不会自动绑定；
- Picker 只显示兼容资源；
- 添加 state 后自动进入编辑但初始仍是 explicit empty；
- Value/Cascade 属于单 symbol Inspector；
- UI Tab/筛选不进入 ZIP。

`agents.md` 当前已经正确声明 symbolseditor 的 browser UI、typed draft、资源库、per-symbol state、Value/Cascade 和固定全 symbol preview ownership，本任务预计不需要增加具体 Tab/组件布局规则。执行时：

- 如果只调整 UI 信息架构，报告中明确“无需更新 agents.md，现有 ownership 仍准确”；
- 如果新增跨 package ownership、改变导出合同或形成必须长期遵守的新边界，则同步更新；
- 不把像素尺寸、CSS class、Tab 名称或临时组件文件名写成仓库级长期规则。

## 13. 实施阶段

### 阶段 A：基线与行为测试

1. 记录 branch、HEAD、status、Node、pnpm。
2. 明确任务 103 和其它已有修改，限定任务 104 文件范围。
3. 运行 symbolseditor 当前 format/lint/typecheck/test/build，记录基线。
4. 为 UI session、Picker 和新 app shell 行为先写失败测试。

### 阶段 B：UI session 与顶层工作区

1. 引入 UI-only session model。
2. shell 初始化一次主 Tab、workspace body、preview、dialog/status mount point。
3. 实现无项目、新建、ZIP import 的默认 Tab 规则。
4. 实现 Tab ARIA、键盘和状态保留。

### 阶段 C：资源工作区与 Picker

1. 把现有 asset library markup/binding 拆出。
2. 实现紧凑 resource list、缩略图、筛选、details。
3. 实现 resource binding context/candidate helper。
4. 实现 Picker dialog、确认/取消、焦点和上传后刷新。
5. 把 state/value/layer 的资源 `<select>` 迁移到 Picker。

### 阶段 D：Symbols rail 与 Inspector

1. 实现 symbol rail、搜索、筛选、bulk include。
2. 实现基础/状态/Value/Cascade Tabs。
3. 把全部 state cards 改成 state navigation + 单状态 Inspector。
4. 实现添加 state 的完整反馈链。
5. 实现 Value tier accordion 和 Cascade 按需字段。

### 阶段 E：项目配置与预览协作

1. 移动 id/cell/state definitions/legacy summary 到项目配置。
2. 实现 custom state 与 Symbols 添加菜单同步。
3. 实现 state Inspector 与 preview state 双向协调。
4. 检查 zoom、Replay、value 和 request token 不回归。

### 阶段 F：样式、测试、文档和验收

1. 完成 1040/1280/1440/1920 桌面布局。
2. 完成键盘、焦点、ARIA 和颜色非唯一表达。
3. 跑专项/根级门禁。
4. 更新 README，按需要判断 agents.md。
5. 执行真实浏览器矩阵。
6. 写 UTC 中文任务报告。

## 14. 自动化验收命令

至少运行：

```bash
pnpm --filter symbolseditor format:check
pnpm --filter symbolseditor lint
pnpm --filter symbolseditor typecheck
pnpm --filter symbolseditor test
pnpm --filter symbolseditor build
```

若修改 `packages/browserartifactio` 或 `packages/rendercore`，必须额外运行对应 package 的 format/lint/typecheck/test/build，以及依赖它的 symbolseditor/symbolsviewer/game002/game003 必要回归。原则上本任务不需要改 shared package；如果只是为了 UI 方便而准备修改 parser/runtime，应先重新审视范围。

最终运行：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

根级 `format:check` 若被任务范围外既有文件阻断，应记录首个错误及相关文件，不得顺手格式化范围外代码。任务 104 涉及文件和 `symbolseditor` package 的 format check 必须通过。

如果依赖安装或下载失败，使用：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
pnpm install
```

不得改用 npm/yarn，不得删除 lockfile，也不得通过不受控升级掩盖下载问题。

如果测试为了旧 DOM 顺序、旧 selector 或旧长页面 snapshot 失败，应修改测试表达本任务的新交互，不要在 production 留两套 UI、隐藏兼容 DOM 或不可达分支。

## 15. 浏览器人工验收

至少使用 Chromium 系浏览器，在 1040、1280、1440、1920 宽度各检查一次主要布局。

### 15.1 新项目和资源工作流

1. 上传 game003 game config。
2. 确认默认进入资源 Tab。
3. 一次上传 30 个以上图片/Spine/VNI 资源。
4. 确认资源列表独立滚动，右侧 preview 和主 Tab 不被推走。
5. 搜索、类型/status filter、详情展开、替换、删除。
6. 确认上传不自动绑定任何 symbol/state。
7. 点击“开始配置 Symbols”进入 Symbols。

### 15.2 Symbol 和状态编辑

1. 在 rail 搜索并选择 WL/H1/L1。
2. 切换基础/状态/Value/Cascade，确认无整页长滚动。
3. 为 WL 添加 appear/win/remove。
4. 确认每次添加后自动打开新 state、preview 同步、焦点正确并出现成功提示。
5. 通过 Picker 为 normal/appear/win 选择图片/Spine/VNI。
6. 确认 Picker 只显示兼容资源，取消不修改项目。
7. 删除被 cascade 引用 state，确认严格失败且没有假成功提示。
8. 切换 symbol 后 Inspector Tab、preview zoom 和 rail scroll 合理保留。

### 15.3 Value/Cascade 和项目配置

1. 对 game002 CN 启用/编辑 Value presentation。
2. 检查四档 Spine、animation、slot、image prefix/default value 仍可完整表达。
3. 检查 tier accordion 不丢字段，导入值不会被隐藏默认覆盖。
4. 配置 group/sequentialCollect cascade，并验证 state 下拉生命周期约束。
5. 在项目配置新增 custom state，确认立即出现在 symbol 添加菜单。
6. 删除仍被引用 custom state，确认明确失败。

### 15.4 导入、导出和 round-trip

1. 导入 game002/game003 已有 symbols ZIP。
2. 确认默认进入 Symbols，所有 state/value/cascade/legacy 配置仍存在。
3. 修改若干绑定后导出 ZIP。
4. 重新导入导出的 ZIP，确认 typed semantics 和 exact closure 不变。
5. 确认 UI active Tab、filter、expanded state 不进入 ZIP。
6. 构造缺资源、错 Spine animation、坏 VNI，确认无 fallback。

### 15.5 键盘与生命周期

1. 只用键盘切换主 Tabs、Inspector Tabs、symbol/state、Picker。
2. Escape 取消 Picker，焦点回到触发按钮。
3. 快速切换 state/symbol/resource，确认无旧 preview 闪回。
4. 多次 import/replace/delete，检查 Object URL、Pixi/Spine/VNI player 无明显泄漏。
5. 页面高度较小时确认各区独立滚动，preview ticker 不冻结。

人工验收报告必须记录浏览器版本、viewport、使用的 fixture、通过项、失败项，以及必要的截图/控制台信息。不能用 happy-dom 单测代替真实 Pixi/Spine/VNI 和视觉交互验收。

## 16. 完成定义

仅当以下条件全部满足，任务才算完成：

- 左侧不再同时渲染资源、全部 symbol details、项目 state、Value 和 Cascade 的长页面；
- 资源/Symbols/项目配置三个主工作区可用且状态稳定；
- 资源列表紧凑、独立滚动，支持搜索/筛选/详情/替换/删除；
- Symbols 使用紧凑 rail + 单 symbol Inspector；
- Inspector 使用基础/状态/Value/Cascade 子 Tabs；
- 状态区同时只展开一个 state；
- 添加 state 有可发现入口、自动定位、preview 同步、焦点和成功/失败反馈；
- resource Picker 严格过滤、明确确认、取消零 mutation、不自动 filename binding；
- 项目 state definitions 和全局设置已移出 symbol 长页面；
- 右侧全 symbols 单状态 preview、Replay/Fit/Zoom/value 保持正确；
- typed project、strict validation、ZIP schema、exact closure 和 round-trip 不变；
- 无不必要 fallback、隐藏 legacy DOM 或测试驱动的奇怪 production 分支；
- app-shell/session/picker/model/ZIP/preview 测试通过；
- symbolseditor format/lint/typecheck/test/build 通过；
- 根级门禁通过，或仅有明确记录的范围外基线问题；
- README 已更新，agents.md 已按实际必要性处理并在报告说明；
- 浏览器视觉、键盘和资源生命周期验收已记录；
- 已生成符合 UTC 命名规则的中文任务报告。

## 17. 任务报告内容要求

任务报告至少包含：

- UTC 完成时间、branch、起始/最终 HEAD、Node、pnpm；
- 起始和最终 `git status --short`；
- 与任务 103/其它用户修改的隔离情况；
- 实际修改文件；
- 最终工作区信息架构；
- 状态添加和 resource Picker 最终交互；
- typed model/ZIP/schema 是否变化；
- 自动化测试和 coverage；
- 专项及根级门禁结果；
- 浏览器、viewport 和人工验收结果；
- Object URL/Pixi/Spine/VNI 生命周期检查；
- 代理是否使用；
- agents.md 是否更新及理由；
- 已知限制、未完成项和范围外问题。

报告不得把“代码完成”“自动化通过”或“页面能打开”冒充视觉与真实浏览器交互验收通过。
