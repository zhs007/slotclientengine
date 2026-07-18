# game layout editor workspace redesign 任务计划

## 1. 任务目标

本任务重构现有纯前端应用：

```text
apps/gamelayouteditor
```

编辑器目前已经具备 scene-layout v1、单背景/横竖双背景、main reel 配置、图片/Spine 图层、严格 ZIP 导入导出、真实 frame policy 预览、symbols package 随机公开轮带预览等能力，但左侧仍按以下顺序纵向输出全部内容：

```text
背景
  -> main reel
  -> 全部图层大卡片
  -> 项目高级配置
```

图片或 Spine 资源在上传时会立即创建背景或图层；资源本身没有独立资源库，无法先集中维护、查看、复用，再显式添加到图层。图层数量增加后，当前选中对象不明确，编辑位置会被推到长页面下方；symbols 预览包控制又单独占据页面底部。

本任务把编辑器重构为稳定的桌面工作区：

```text
顶部：新建、导入、导出、项目状态

左侧编辑工作区                              右侧固定预览
┌──────────────────────────────────┐      ┌────────────────────────┐
│ 资源 | 布局 | 项目                │      │ page size / zoom / guides│
├──────────────────────────────────┤      │ symbols preview controls │
│ 当前主 Tab 的独立内容              │      │ Pixi scene preview       │
└──────────────────────────────────┘      └────────────────────────┘

布局工作区：
┌────────────────┬────────────────────────┐
│ layout outline │ 当前单一对象 Inspector  │
│ backgrounds    │ 背景 / main reel / layer│
│ main reel      │                        │
│ layers         │                        │
└────────────────┴────────────────────────┘
```

资源工作流改为：

```text
上传资源到独立资源库
  -> 校验并形成 image 或 Spine logical resource
  -> 从资源 Picker 明确选择资源
  -> 创建背景节点或普通图层
  -> 在 Inspector 编辑动画、方向可见性与 placement
```

上传资源不得自动创建图层，不得按文件名猜绑定；删除图层不得顺带删除资源。一个逻辑资源可以被多个普通图层复用。

本文件是完整实施合同。执行者不得依赖聊天记录、任务 98、任务 103、任务 104 或其报告来猜产品行为；历史任务只构成当前代码来源，不是实施本任务所需的额外上下文。

任务完成后必须新增中文任务报告：

```text
tasks/105-game-layout-editor-workspace-redesign-[utctime].md
```

UTC 时间戳必须使用：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/105-game-layout-editor-workspace-redesign-260401-181300.md
```

## 2. 核心产品与数据决定

### 2.1 这是编辑器信息架构和 typed draft 重构，不是 production schema 重写

必须保持以下 production 合同不变：

- `SceneLayoutManifestV1` 的 version、kind、adaptation、nodes、reels 结构；
- `maximized-focus` 单背景和 `orientation-focus` 横竖双背景语义；
- manifest node 继续内嵌 image 或 Spine resource descriptor；
- `collectSceneLayoutAssetPaths()` 派生的精确资源闭包；
- layout ZIP 根目录只允许 `layout.manifest.json` 与 manifest 精确引用的 `assets/**`；
- deterministic ZIP、大小/entry/path/collision 限制和严格 round-trip；
- image 真实尺寸校验；
- Spine 4.3.x skeleton、atlas、全部 atlas pages、大小写精确 animation 和显式 textures；
- main reel 的 columns、rows、cellSize、gap 和 per-variant placement；
- rendercore scene-layout 负责 frame policy、art viewport、resource/player/runtime；
- 右侧预览只调用 public scene-layout、RenderSymbol 和 symbols package API；
- symbols package 只用于本地预览，不写入 layout ZIP；
- Web Crypto 随机公开轮带 stop，不读取服务器真实轮带，不使用 `Math.random()`；
- 无服务器连接、WebSocket、账号、数据库、localStorage、IndexedDB 或 File System Access API。

不得为了 UI 重构修改 rendercore parser/runtime、放宽 ZIP 或 Spine 校验、增加资源猜测、增加 placeholder/fallback，或把 app 专属 UI 状态写入 production manifest。

### 2.2 资源库使用逻辑资源，而不是散文件或图层副本

编辑器内部增加 typed logical resource：

```ts
type EditorLayoutResource =
  | {
      readonly id: string;
      readonly kind: "image";
      readonly path: string;
      readonly size: { readonly width: number; readonly height: number };
    }
  | {
      readonly id: string;
      readonly kind: "spine";
      readonly skeleton: string;
      readonly atlas: string;
      readonly textures: Readonly<Record<string, string>>;
      readonly animationNames: readonly string[];
      readonly bounds?: { readonly width: number; readonly height: number };
    };
```

实际字段名可按现有命名风格调整，但必须满足：

- image 文件形成一个 logical resource；
- 一个 skeleton JSON、一个 atlas 和 atlas 精确引用的全部 texture pages 形成一个 Spine logical resource；
- atlas、texture page 不作为可单独添加的图层资源；
- raw bytes 仍按 canonical asset path 单独保存；
- resource metadata 与 bytes 分离，不能从节点或文件名临时反推；
- resource id 是 editor-only identity，不进入 scene-layout manifest；
- node 通过 `resourceId` 引用资源库，导出时才解析为现有 `SceneLayoutNode.resource`；
- 同一 resource 可被多个 node 引用；
- resource replacement 会原子影响全部引用者，任何引用不兼容时整体失败；
- 导入现有 layout ZIP 时，按完整**素材签名**去重并重建资源库：image 使用 kind/path/size，Spine 使用 kind/skeleton/atlas/textures；`defaultAnimation` 和 schema 固定的 `loop: true` 属于 node playback，不参与素材签名。不得按 basename 猜共享关系。

`EditorProject.nodes[]` 应只保留 node 自身职责：

```ts
interface EditorNodeDraft {
  id: string;
  order: number;
  resourceId: string;
  defaultAnimation?: string; // 仅 Spine node
  placements: Partial<Record<SceneLayoutVariantId, Placement>>;
}
```

Spine 的 skeleton/atlas/textures/animationNames 属于资源；`defaultAnimation` 属于使用该资源的 node，因此两个图层可以复用同一个 Spine resource 但播放不同默认动画。

### 2.3 上传资源与添加图层必须彻底分离

资源上传 API 只能完成：

1. 读取文件；
2. canonicalize path；
3. 解码/解析并校验完整资源组；
4. 检查 resource id、asset path 和 lowercase collision；
5. 原子加入 resource library 和 byte store。

它不得：

- 创建 node；
- 设置 `backgroundNode`；
- 写 placement；
- 根据当前 Tab、文件名或“只有一个候选”自动绑定；
- 自动选择 Spine animation；
- 上传失败后留下部分 bytes 或半条资源记录。

普通图层必须通过 `addLayerFromResource()` 一类窄 model API 显式创建。背景也必须先选资源，再通过专门的 `assignBackgroundResource()`/`createBackgroundNode()` 原子操作创建或重绑背景 node。

### 2.4 删除、解绑和替换语义

必须区分：

- **删除图层**：删除 node；若是 background 引用则失败；永远不删除 resource/bytes。
- **清除背景**：显式清除该 variant 的 background 引用；若该 node 不再被其它 variant 作为背景引用，则同一事务删除该 node，否则保留共享 node；resource 始终留在资源库。
- **删除资源**：只允许零引用资源；被任意 node 引用时显示精确 node/variant 引用并失败。
- **替换资源文件**：保持 logical resource identity，重新执行完整解析和 dependency 校验后一次提交；不能只换 skeleton 却保留旧 atlas/texture。
- **重绑图层**：通过 Picker 选择兼容 logical resource；image/Spine 类型切换允许，但必须同步清理仅属于旧类型的 node 字段，Spine 必须重新明确选择 default animation。

Spine replacement 后，如果任一引用 node 的 `defaultAnimation` 在新 skeleton 中不存在，替换整体失败并列出引用；不得静默选第一个 animation。

image replacement 或背景重绑导致已声明 art size 变化时不得偷偷缩放或移动布局：

- 首次设置背景可以用 image 真实尺寸或 Spine bounds 初始化 art、居中 reel、按现有 60 padding 派生 focus；
- 同尺寸背景替换可保留现有布局；
- 不同尺寸必须由用户明确选择“使用新尺寸并重新初始化”，否则操作失败；
- Spine 无 bounds 时允许绑定，但 art size 保持 incomplete，必须由用户在背景 Inspector 显式填写有限正数后才能严格预览/导出；
- 不得猜 2000×2000、使用 texture 尺寸充当 skeleton bounds，或沿用旧背景尺寸作为 fallback。

### 2.5 production layout ZIP 只导出已引用资源

资源库是当前编辑会话的工作集，production layout ZIP 仍是精确运行时交付物，不是“包含所有素材的素材仓库”。导出必须：

1. 从当前 project 生成严格 scene-layout manifest；
2. 用 `collectSceneLayoutAssetPaths()` 得到已引用闭包；
3. 从 byte store 精确挑选该闭包；
4. 对闭包执行现有 `validateLayoutAssets()`；
5. 只写入 manifest 和闭包文件。

未引用资源：

- 不阻止导出；
- 不进入 layout ZIP；
- 在资源页和导出摘要中明确显示“未引用，不会导出”；
- 导出后继续保留在当前会话；
- 重新导入 production layout ZIP 后不会恢复，因为它从未属于 production artifact。

不得把未引用资源塞入 ZIP、伪造隐藏 node、扩大 import 白名单或修改 scene-layout schema。若未来需要持久化完整编辑器工作集，应另立“editor workspace archive”任务，不能在本任务中暗中改变 `<project-id>-layout.zip` 语义。

### 2.6 顶层只保留三个编辑工作区

主工作区固定为：

1. `资源`
2. `布局`
3. `项目`

同一时间只渲染一个主工作区，不得继续把资源、背景、reel、全部 layer cards 和项目高级字段同时纵向输出。

默认规则：

- 新建单背景或双背景项目后默认进入 `资源`；
- 导入已有 layout ZIP 后默认进入 `布局`；
- 普通 transaction、preview 刷新和资源解析完成不得强制切 Tab；
- active Tab 是 UI session state，不进入 project/manifest/ZIP。

### 2.7 布局工作区使用 outline + 单对象 Inspector

布局 outline 固定按以下顺序：

```text
背景
  default
或
  landscape
  portrait
主转轮
  main
图层
  node-a
  node-b
```

outline 行至少显示：

- 对象类型与 id/variant；
- image/Spine 类型；
- ready/incomplete/error；
- order（普通 layer）；
- 当前选中状态。

背景 node 不应在“普通图层”组重复显示。普通图层列表使用 `order` 稳定排序；同 order 必须由 model 严格失败，不由 UI 临时排序掩盖。

Inspector 同时只显示一个对象：

- 背景 Inspector：资源绑定、node id/order、摘要、art/focus；高级区为 focus offsets、frame focus、min margins。
- main reel Inspector：columns/rows；高级区为 cellSize、gap、每 variant placement 和派生尺寸。
- layer Inspector：node id、resource binding、Spine animation、order、variant visibility、每 variant x/y/scale、移动和删除。

切换 outline 对象不得重置 preview page size、zoom、guide、symbols sampled scene 或另一个对象的 project 数据。

### 2.8 添加图层必须有完整反馈链

`＋ 添加图层` 是 layout outline 顶部一级操作。点击后打开 Resource Picker，明确列出 image/Spine logical resources。

确认资源前，Picker/创建表单至少显示：

- resource kind 和完整 canonical primary path；
- image size 或 Spine animations/bounds/dependency 状态；
- 新 node id；
- 初始可见 variant；
- 默认 placement `{ x: 0, y: 0, scale: 1 }`；
- Spine 时必须显式选择大小写精确的 default animation。

node id 默认值可以由 resource id 派生；重复使用时只允许用确定性的 `-2`、`-3` 后缀提出建议，最终值仍可编辑并必须在确认时严格验证。该规则只生成 node identity，不构成资源绑定猜测。

添加成功后的同一交互链必须：

1. 调用 model 的原子 add API；
2. 关闭 Picker；
3. 选中新 node；
4. 保持在 `布局` Tab；
5. 展示该 node Inspector；
6. 显示非阻塞成功提示；
7. 把键盘焦点移到 Inspector heading 或首个可编辑字段；
8. preview 使用同一 store revision 刷新。

失败时不得关闭为“成功”、不得留下 node/bytes、不得切到不存在 node。

### 2.9 Resource Picker 合同

Picker 使用结构化目标，不接收任意字符串对象路径：

```ts
type LayoutResourceBindingContext =
  | { kind: "add-layer" }
  | { kind: "assign-background"; variant: SceneLayoutVariantId }
  | { kind: "rebind-layer"; nodeId: string };
```

候选 view model 至少包含：

```ts
interface LayoutResourcePickerCandidate {
  readonly resourceId: string;
  readonly kind: "image" | "spine";
  readonly primaryPath: string;
  readonly status: "ready" | "incomplete" | "error";
  readonly referenceCount: number;
  readonly summary: string;
  readonly disabledReason?: string;
}
```

Picker 必须支持：

- 搜索 id/path；
- image/Spine 类型过滤；
- ready/incomplete/error 状态；
- 缩略图或稳定类型标记；
- 当前选中项；
- 引用摘要；
- 确认、取消；
- “上传新资源”入口。

打开、搜索、浏览、上传和取消不得修改 node/background。Picker 内上传只刷新并高亮新 resource，用户仍需明确确认；不得因为只剩一个 candidate 自动绑定。

使用原生 `<dialog>` 或等价可访问 modal：Escape 取消，Tab 不逃出，Enter/双击只确认可用候选，关闭后恢复触发按钮焦点；project replace 和 app destroy 必须关闭 Picker 并清理临时状态。

### 2.10 资源工作区

资源页只负责资源管理，不承担 node placement 编辑。包含：

- 上传图片；
- 上传 Spine 文件组；
- 搜索；
- 类型筛选；
- 引用状态筛选：全部、已引用、未使用、错误；
- 固定尺寸缩略图/类型标记；
- resource id、primary path、size/bounds、引用数；
- 按需展开 dependency、animation、引用位置和 diagnostics；
- 显式替换；
- 显式删除；
- 从该资源发起“添加为图层”或“设为某 variant 背景”。

默认行必须紧凑；Spine skeleton/atlas/textures 作为一个 resource 行显示。资源列表拥有独立滚动区域，100 个资源不能把 preview 或主 Tabs 推出页面。

### 2.11 项目工作区

项目 Tab 包含：

- project id；
- mode 只读摘要（单背景/横竖双背景通过“新建”确定，不在已有项目中隐式切换）；
- variants、nodes、已引用/未使用资源计数；
- strict diagnostics；
- export closure 路径摘要；
- “未引用资源不会进入 production layout ZIP”的明确提示；
- layout ZIP 安全限制摘要；
- 高级 manifest preview（只读，可折叠）。

不得把 JSON textarea 作为绕过 typed model 的编辑入口。

### 2.12 symbols package 控制归入右侧预览

现有 symbols 预览包控制从页面底部移动到右侧 preview toolbar 下方的可折叠 `Symbols 预览` drawer，保持：

- 导入 strict symbol-package v1 ZIP；
- 清除 package；
- compatible reel set 列表与显式选择；
- 重新随机；
- package/cellSize/display symbols/stop scene diagnostics；
- 导入 package 后原子应用 cellSize；
- incompatible reel set 和缺 code 显式失败；
- layout ZIP 不嵌入 symbols package。

drawer 是 preview session UI，不进入 EditorProject。普通布局 transaction、Tab 切换、page size/zoom/guide 变化继续复用当前 sampled scene，不得隐式重新随机。

### 2.13 UI session state 不进入 typed project

至少需要：

```ts
type WorkspaceTab = "assets" | "layout" | "project";

type LayoutSelection =
  | { kind: "background"; variant: SceneLayoutVariantId }
  | { kind: "reel"; reelId: "main" }
  | { kind: "layer"; nodeId: string };
```

以及：

- resource query/type/status filters；
- expanded resource ids；
- selected outline item；
- Inspector/outline scroll positions；
- picker state；
- symbols preview drawer open state；
- transient feedback；
- focus restoration target。

这些只能存在于 UI controller/session，不得加入 EditorProject、scene-layout manifest 或 ZIP。

## 3. 当前实现基线

仓库路径：

```text
/Users/zerro/github.com/slotclientengine
```

制定本计划时：

```text
branch: main
HEAD: 6dbee924630231666c7261c89c0e06523b27ad06
git status --short: clean（新增本计划文件之前）
```

执行时若 HEAD 已变化，以实际工作区为准，不得回退后续提交。工作区中已有或新出现的其它修改属于用户或其它任务，必须保留；禁止 reset、checkout、stash、clean、覆盖或混入无关格式化。

执行任务时必须重新记录：

```bash
git branch --show-current
git rev-parse HEAD
git status --short
node --version
pnpm --version
```

工具链要求：

- Node.js `>=24.0.0`；
- pnpm `>=10.0.0`，仓库 packageManager 为 `pnpm@10.0.0`；
- Turbo、Vite、TypeScript、Vitest、ESLint、Prettier；
- Pixi.js v8；
- official Spine runtime 4.3.x 由 rendercore 封装。

### 3.1 当前主要文件

```text
apps/gamelayouteditor/src/ui/app-shell.ts             约 846 行
apps/gamelayouteditor/src/styles.css                  约 368 行
apps/gamelayouteditor/src/model/editor-project.ts     约 509 行
apps/gamelayouteditor/src/model/editor-store.ts
apps/gamelayouteditor/src/model/validation.ts
apps/gamelayouteditor/src/io/exported-layout-zip.ts
apps/gamelayouteditor/src/io/imported-layout-zip.ts
apps/gamelayouteditor/src/io/imported-symbol-package.ts
apps/gamelayouteditor/src/preview/layout-preview.ts
apps/gamelayouteditor/src/preview/random-reel-scene.ts
apps/gamelayouteditor/tests/app-shell.test.ts
apps/gamelayouteditor/tests/editor-store.test.ts
apps/gamelayouteditor/tests/zip-io.test.ts
apps/gamelayouteditor/README.md
```

### 3.2 当前需要替换的行为

- `GameLayoutEditorApp` 初始化 shell 后，每次 store snapshot 都用 `configurationMarkup()` 替换完整左栏。
- 左栏同时输出所有 variant、main reel、全部 layer cards 和项目高级字段。
- background upload 与 layer upload 直接调用 `addImageFileToProject()`/`addSpineFilesToProject()` 并立即创建 node。
- `EditorProject.assets` 只有 path -> bytes，没有独立 logical resource metadata。
- `EditorNodeDraft` 直接拥有 resource descriptor 和 Spine animationNames，资源与使用位置耦合。
- `removeNodeFromProject()` 会删除该 node 的资源 bytes，无法保留资源复用。
- 同一上传资源无法显式创建多个独立图层。
- symbols preview panel 位于整页底部，占据永久高度。
- transaction 后只保留 `<details>` open 状态，缺少统一 tab、selection、scroll、focus 和 picker session。

### 3.3 必须保留并回归的现有能力

- `EditorStore.transact()` clone -> update -> validate -> emit；
- invalid draft 保留并展示 diagnostics，而不是偷偷修正；
- background 首次加载的尺寸、reel 居中和 focus 派生；
- focus offsets 与 focusRect 的双向派生；
- main reel gap/cell/placement；
- preview manifest 在项目未完整时只预览可用 variant；
- stale preview revision 防护；
- preview presets、自定义 page size、resize handle、25%..400% zoom、focus/reel guides；
- symbols ZIP prepare/commit、cellSize 原子覆盖、reel compatibility、randomize 和 destroy；
- layout ZIP bounded streaming import、deterministic export、strict exact closure；
- import 失败保留旧项目，destroy 幂等。

## 4. 范围

### 4.1 包含

- 资源/布局/项目三个主 Tabs。
- typed logical resource library 与 byte store 分离。
- image 和 Spine resource-first 原子上传。
- 紧凑资源浏览、筛选、详情、引用、替换、删除。
- Resource Picker 与显式确认。
- background/reel/layers outline。
- 单一对象 Inspector。
- 从 resource 创建、复用、重绑和删除 layer。
- background 显式资源选择与尺寸初始化规则。
- UI session、scroll、focus、dialog 生命周期。
- symbols preview 控制迁入右侧 drawer。
- production ZIP 仅选择已引用闭包。
- 旧 ZIP 导入时重建 resource library。
- model/UI/IO/preview 回归测试。
- README、必要时 agents.md、浏览器验收和中文任务报告。

### 4.2 不包含

- 不修改 `SceneLayoutManifestV1` 或 production ZIP schema。
- 不增加 editor workspace archive；未使用资源不随 production ZIP 持久化。
- 不修改 production game002/game003 assets、YAML、generated config 或 manifest。
- 不修改 rendercore frame policy、scene-layout runtime、Spine player 或 RenderSymbol 算法。
- 不增加 canvas drag-to-edit、selection box、snapping、undo/redo 或 timeline。
- 不增加多 reel set 编辑；只保留 `main`。
- 不增加 VNI layout node；当前 scene-layout node 仍只支持 image/Spine。
- 不从 symbols package 复制资源到 layout resource library。
- 不连接 live server，不读取服务器 scene/轮带。
- 不增加 filename/basename guess、placeholder、transparent fallback、默认 animation 或 auto-fit。
- 不引入 React/Vue/Svelte 等新框架；继续使用 TypeScript + DOM。
- 不为旧测试保留隐藏 legacy UI、双套 handler 或不可达 compatibility 分支。

## 5. 建议代码结构

在不引入新 UI framework 的前提下拆分职责：

```text
apps/gamelayouteditor/src/ui/app-shell.ts
  - app lifecycle、store subscription、preview coordination
  - import/export 和 top-level navigation

apps/gamelayouteditor/src/ui/ui-session.ts
  - active workspace、outline selection、filters、expanded ids
  - picker、scroll/focus、selection normalization

apps/gamelayouteditor/src/ui/resources-workspace.ts
  - compact resource list、filters、references、actions

apps/gamelayouteditor/src/ui/layout-workspace.ts
  - outline、background/reel/layer Inspector

apps/gamelayouteditor/src/ui/project-workspace.ts
  - project id、diagnostics、export summary

apps/gamelayouteditor/src/ui/resource-picker.ts
  - typed context、candidate view model、dialog lifecycle

apps/gamelayouteditor/src/model/editor-resource.ts
  - logical resource types、metadata、signature、references

apps/gamelayouteditor/src/model/resource-commands.ts
  - upload/replace/delete/add layer/rebind/background 原子操作
```

实际文件名可以调整，但必须保持：

- app-shell 不继续堆积资源卡片和全部 Inspector markup；
- 纯 filter/view-model helper 可独立测试；
- resource dependency/parser 只实现一份；
- mutation 只通过窄 model command + store transaction；
- UI 不直接修改 Map、node array 或 preview 私有 Pixi tree；
- 避免循环依赖。

## 6. 详细交互设计

### 6.1 新项目与导入

新建项目：

- 点击“新建单背景”或“新建横竖双背景”后进入资源 Tab；
- 显示“先上传资源，再添加背景和图层”的引导；
- 右侧 preview 保持空白而不是 placeholder；
- 上传完成显示“已加入 N 个资源”，不创建 node；
- 提供“设置背景”和“添加图层”的明确下一步。

导入 layout ZIP：

- prepare/validation 全部成功后才 replace project；
- 从每个 node 的 resource descriptor 拆出素材签名和 node playback，重建 logical resources；
- 默认进入布局 Tab；
- 默认选择 active variant 的背景；没有背景选择 main reel；
- 保留 imported node id/order/defaultAnimation/placement；
- 导入失败保留旧 project、resource library、UI session、preview 和 symbols package。

### 6.2 资源列表

- toolbar 和 filter sticky；
- 列表使用剩余高度独立滚动；
- image thumbnail 固定尺寸；
- Spine 用类型图标和 skeleton primary path；
- path 单行省略，title/详情保留完整值；
- ready/incomplete/error 和 referenced/unused 不只靠颜色；
- dependency、animations、bounds、引用 node 放在展开详情；
- ordinary transaction 后保留 query、filter、expanded resource 和 scroll；
- resource replace/delete 后规范化 selection，不指向已删除项。

### 6.3 Layout outline

- outline 顶部固定 `＋ 添加图层`；
- background、main reel、layers 分组清晰；
- layer 数量增加时只滚动 outline；
- 单击行选择，action button 不触发错误的父级选择；
- up/down 是必要的键盘可用排序方式，不要求 drag-and-drop；
- 移动以完整 node render order 为权威并只调用同一个 model reorder API；会让任一可见 variant 的 background 不再是最低 order 的方向必须 disabled 并说明原因；
- 选中 layer 删除后优先选择同位置后继，否则前一项，否则 main reel；
- 普通 transaction 保持 selected item，只在目标不存在时规范化。

### 6.4 背景 Inspector

每个 variant 单独显示：

- 当前 resource binding；
- node id、order 和 image/Spine 摘要；
- “选择/更换资源”“清除背景”；
- image size 或 Spine bounds；
- art size、focusRect 派生摘要；
- 高级 focus offsets；
- orientation 模式下的 frameFocusRect/minFocusMargin。

背景资源绑定、尺寸初始化和不同尺寸替换必须遵守第 2.4 节，不得在 DOM handler 中复制尺寸算法。

### 6.5 main reel Inspector

高频区只显示 columns/rows 和当前派生尺寸。高级区显示：

- cell width/height；
- gap x/y；
- default 或 landscape/portrait placement；
- 当前 symbols package cellSize 来源摘要；
- reel 与 focus/art 越界 diagnostics。

改变 columns 后继续重新计算 symbols package reel compatibility；改变 rows 后继续按新高度重新抽样；page/zoom/guide 变化不得抽样。

### 6.6 Layer Inspector

只渲染当前 layer：

- id；
- order 和 up/down；
- resource binding 与“更换”；
- Spine exact default animation；
- 单背景 placement；或横竖 visibility + placement；
- x/y/scale；
- 删除。

关闭某 orientation visibility 时删除该 placement；重新打开时可以使用明确固定初值 `{x:0,y:0,scale:1}`，UI 必须提示这是新 placement，不得从另一方向猜坐标。

### 6.7 反馈与错误层级

区分：

1. 项目 diagnostics：影响预览/导出，显示在顶部摘要和项目 Tab。
2. 局部错误：显示在 resource row、Picker 或当前 Inspector 附近。
3. 成功反馈：aria-live polite 的短暂提示，不占永久页面高度。

至少对以下动作反馈：资源上传、资源替换、资源删除、背景绑定、图层添加/重绑/删除、ZIP 导入和导出触发。

成功提示不得掩盖仍存在的 strict diagnostics；操作失败不得显示假成功或增加 store revision。

## 7. Model 与原子事务要求

### 7.1 窄 model commands

至少提供并测试等价能力：

```text
uploadImageResource
uploadSpineResource
replaceLayoutResource
deleteLayoutResource
getLayoutResourceReferences
addLayerFromResource
rebindLayerResource
assignBackgroundResource
clearBackground
moveLayer
removeLayer
```

命名可以变化，但 UI 不得直接拼装半合法对象。

### 7.2 引用与导出解析

- reference helper 必须扫描所有 node，并额外标记 variant backgroundNode；
- `editorProjectToManifest()` 对每个 node 的 resourceId 做精确解析；未知 resource、缺 bytes、缺 animation 必须 throw；
- image resource 转成现有 `{kind,path,size}`；
- Spine resource 与 node animation 合成现有 descriptor；
- manifest parser 仍是最终 structural authority；
- preview manifest 和 strict export 必须复用同一解析 helper，不能各自复制 resource 拼装逻辑。

### 7.3 Import normalization

从 scene-layout manifest 导入时：

- resource signature 必须包含完整素材字段，不只比较 skeleton/path；image 为 kind/path/size，Spine 为 kind/skeleton/atlas/textures；
- 素材签名完全相同、仅 `defaultAnimation` 不同的 nodes 必须共享一个 resource record，同时各自保留 animation；
- image 同 path 但 size 不同必须作为非法输入被现有 validation 拒绝或在 normalization 显式失败；
- Spine 同 skeleton 但 atlas/textures 不同不得误合并；
- node defaultAnimation 从 descriptor 拆回 node；
- raw bytes 必须复制，ImportedLayoutPackage destroy 后 project 仍可用；
- re-export 的 production manifest/closure 必须与输入语义等价且 deterministic。

### 7.4 严格失败与禁止兜底

至少保持或新增以下明确失败：

- 非法 ZIP 不替换项目；
- upload batch 的任一文件错则整批零 mutation；
- resource id/path/lowercase collision；
- 图片无法解码；
- Spine 文件组数量错误；
- atlas page 缺失或多余 texture；
- skeleton JSON/UTF-8/animations/bounds 非法；
- Spine node 未明确选择 animation；
- 删除被引用 resource；
- node 引用不存在 resource；
- order 重复/非法；
- 不同背景尺寸未明确选择重新初始化；
- art/focus/reel 越界；
- export closure 缺 bytes 或出现额外选择；
- Picker target 在确认前被删除或替换。

禁止：

- 找不到资源时取列表第一项；
- 只有一个 candidate 就自动确认；
- 按 filename、basename、node id 猜 resource；
- atlas 缺页时用任意 texture；
- animation 缺失时选第一个、`Idle`、`Loop` 或首帧；
- Spine bounds 缺失时猜 art size；
- preview 失败时显示静态图/透明 placeholder；
- 删除 layer 时垃圾回收 resource；
- export 时偷偷包含未引用资源；
- hidden legacy DOM 或第二套 production handler。

若旧测试断言“上传立即创建图层”“删除图层同时删资源”或依赖旧 DOM 顺序，应修改测试表达本任务的新合同。不要为了通过旧测试保留兼容分支或奇怪写法；测试若约束了错误实现，应修测试，不应改坏 production model。

## 8. 渲染、性能与生命周期

### 8.1 DOM 更新

顶层 shell、主 Tabs、preview、symbols drawer、dialog/status mount point 只初始化一次。store transaction 可以重绘 active workspace，但必须保存并恢复：

- active Tab；
- outline selection；
- resource/outline/Inspector scroll；
- expanded details；
- current focus（目标仍存在时）；
- Picker state。

不得让任一数字字段 change 把用户送回资源 Tab、outline 顶部或关闭无关 details。

### 8.2 Object URL

image thumbnail 使用单一 Object URL registry，按 resource path + bytes identity/fingerprint 复用。replace/delete/project replace/import/destroy 时撤销相应 URL；不得每次 render 为同一 bytes 新建 URL。

优先复用现有 `apps/gamelayouteditor/src/io/object-url-registry.ts` 或提取共享 owner，不在 resource row 私建 registry。

### 8.3 Preview

UI 重构不得导致：

- 第二个 Pixi Application；
- 切 Tab 重建 LayoutPreview；
- stale async layout 覆盖新 revision；
- manual zoom 被 transaction 重置；
- symbols package 被普通 project replace 之外的 UI rerender释放；
- Spine ticker 或 RenderSymbol update 因左栏操作冻结；
- preview partial manifest 使用与 strict manifest 不同的 resource 解析规则。

### 8.4 数据规模

至少用以下数据做浏览器观察：

- 100 个 logical resources，其中至少 10 个 Spine group；
- 30 个 ordinary layers；
- orientation 模式两套 placement；
- 一个含真实 RenderSymbol 的 symbols package。

不强制引入虚拟列表或脆弱毫秒 CI 阈值；若不使用虚拟列表，也必须确认 DOM 数量、Object URL 数量和交互无明显卡顿。

## 9. 无障碍与视觉要求

### 9.1 Tabs 和 outline

主 Tabs 使用正确的 `role="tablist"`、`role="tab"`、`aria-selected`、`aria-controls` 和 `role="tabpanel"`，支持方向键、Home/End。

layout outline 可使用 listbox/tree/navigation pattern，但必须选择一种正确 ARIA 模式并支持键盘上下移动、Home/End、Enter/Space 选择；不能只靠鼠标点击任意 `<div>`。

### 9.2 Dialog 和反馈

- Picker 打开时 focus 搜索或当前项；
- Escape 取消且零 mutation；
- 关闭恢复触发点；
- 错误区和成功区有合适 aria-live；
- destructive delete 有明确对象名与引用影响；
- status 不只靠红/黄/绿颜色；
- icon-only button 有中文 aria-label。

### 9.3 布局尺寸

右侧 preview 是主要视觉区域。建议桌面尺寸：

```text
editor pane: min 460px, preferred 42vw, max 720px
preview: remaining width
outline: 180px..240px
Inspector: editor pane remaining width
```

至少检查 1080、1280、1440、1920 宽度；窗口高度较小时各 toolbar 固定、内容独立滚动，不允许 body 纵向滚动把 preview 推走。当前 app 的桌面编辑器定位可以保留合理 `min-width`，但不能只在单一开发分辨率可用。

## 10. 测试计划

### 10.1 Resource model 单元测试

至少覆盖：

1. image upload 只增加 resource/bytes，不创建 node。
2. Spine upload 形成一个 logical resource，严格校验 JSON/atlas/pages/animations/bounds。
3. 任一上传错误时 project revision/data 不变。
4. 同 resource 创建两个 layer，node id/order/placement 独立。
5. 两个 Spine layer 可选择不同 animation。
6. remove layer 保留 resource/bytes。
7. delete referenced resource 失败并报告 node/variant。
8. delete unused resource 清理 metadata 和精确 bytes。
9. rebind layer 原子切换并清理旧类型 node 字段。
10. replacement 在 animation/background size 不兼容时原子失败。
11. first background assignment 初始化 art/reel/focus。
12. same-size replace 保留 geometry；different-size 只有显式 reinitialize 才改变。
13. clear background 与 resource 生命周期分离。
14. clone/replace 不共享 mutable Map/bytes/metadata。

### 10.2 Import/export 测试

至少覆盖：

- 现有 image/Spine layout ZIP 导入后重建 logical resource library；
- 素材签名相同但 defaultAnimation 可不同的多个 nodes 共享资源；
- defaultAnimation 保持 per-node；
- unused library resource 不进入 exported ZIP；
- used closure 精确且缺 bytes 失败；
- 导出后当前 session 的 unused resource 仍存在；
- 导出再导入后 production manifest 语义等价，unused resource 明确不恢复；
- deterministic bytes；
- game002/game003 fixture、single/dual mode、Spine atlas pages 回归；
- zip limits、path/collision、extra entry 拒绝不回归。

### 10.3 UI session 和 Picker 测试

新增独立测试覆盖：

- new project 默认 assets，ZIP import 默认 layout；
- transaction 后 active Tab 和 outline selection 保留；
- selected layer 删除后的规范化；
- filter/expanded/picker/drawer 不进入 EditorProject/export；
- image/Spine candidate 搜索、过滤、状态和引用摘要；
- Picker open/search/cancel 零 store revision；
- Picker upload 不自动绑定；
- confirm 只产生一次原子 transaction；
- stale target 显式失败；
- dialog focus restore 和 destroy 幂等。

### 10.4 App shell DOM 测试

重写/扩充 `apps/gamelayouteditor/tests/app-shell.test.ts`，通过 mock LayoutPreview 隔离 Pixi，覆盖：

1. shell、三个主 Tabs 的 ARIA/键盘。
2. 新项目只渲染 active 资源 workspace，不输出全部 layout cards。
3. 上传 image/Spine 只出现 resource row，不出现 layer。
4. 资源 search/filter/details/reference/delete/replace。
5. 从 Picker 添加 layer 后自动选择、聚焦和成功反馈。
6. layout outline 的 background/reel/layer selection。
7. 单对象 Inspector，不同时展开全部 layer。
8. background first assign、different-size strict action。
9. layer animation、visibility、placement、move、rebind、delete。
10. project diagnostics/export summary。
11. symbols preview drawer import/select/randomize/clear。
12. preview size/zoom/guides/resize handle 不回归。
13. transaction 后 scroll/focus/tab 不跳转。
14. import/export/resource/preview failure 保留旧 UI。
15. app destroy 幂等。

测试优先断言用户可见行为、ARIA、store revision 和 typed mutation，不对整段 HTML 做大 snapshot。

### 10.5 现有回归

现有测试必须继续覆盖：

- editor store invalid state 与 clone atomicity；
- focus/reel geometry；
- preview manifest/variant fallback；
- LayoutPreview lifecycle；
- symbols package cellSize、compatible reel、Web Crypto stop 和 RenderSymbol；
- filename/path policy；
- Object URL registry；
- bounded ZIP 和 production fixture。

如果内部 draft 结构改变，应更新 fixture builder 与测试 helper，不得降低最终 manifest/ZIP/runtime 断言。

## 11. 实施阶段

### 阶段 A：基线、合同和失败测试

1. 记录 branch、HEAD、status、Node、pnpm。
2. 识别工作区现有用户修改并隔离任务范围。
3. 运行 gamelayouteditor 专项 format/lint/typecheck/test/build，记录基线。
4. 为 logical resource、引用、closure 和 UI session 先添加失败测试。

### 阶段 B：typed resource library

1. 增加 resource metadata 与 node `resourceId`。
2. 重写 clone、manifest conversion、preview conversion 和 import normalization。
3. 提供 resource references 与窄 model commands。
4. 把 image/Spine upload 改为 resource-only 原子操作。
5. 实现 unused closure selection，保持 production ZIP schema 不变。
6. 完成 model/IO 单测后再接 UI。

### 阶段 C：UI session 和顶层工作区

1. 新增 UI-only session。
2. shell 固定初始化主 Tabs、active workspace、preview、drawer、dialog/status mount。
3. 实现 new/import 默认 Tab 和 selection normalization。
4. 实现 Tab ARIA、键盘、scroll/focus preservation。

### 阶段 D：资源工作区和 Picker

1. 实现紧凑 resource list、thumbnail、filters、details、references。
2. 接入 resource-only image/Spine upload。
3. 实现 replace/delete strict actions。
4. 实现 typed Picker、上传后刷新、确认/取消和 focus lifecycle。

### 阶段 E：layout outline 和 Inspectors

1. 实现 background/main/layers outline。
2. 实现单一 background Inspector 和 resource assignment。
3. 实现 main reel Inspector。
4. 实现单 layer Inspector。
5. 实现 add/reuse/rebind/move/delete 完整反馈链。

### 阶段 F：preview、样式和文档

1. 把 symbols panel 迁入 preview drawer。
2. 验证 LayoutPreview 与 symbols sampled scene 生命周期。
3. 完成桌面尺寸、独立滚动、键盘和 aria。
4. 更新 README，判断 agents.md 是否需要更新。
5. 跑专项、受影响 package 和根级门禁。
6. 完成真实浏览器验收。
7. 写 UTC 中文任务报告。

每个阶段结束都应先跑最近的窄测试；不要等全部 UI 完成后才发现 model/ZIP 合同已漂移。

## 12. 自动化验收命令

至少运行：

```bash
pnpm --filter gamelayouteditor format:check
pnpm --filter gamelayouteditor lint
pnpm --filter gamelayouteditor typecheck
pnpm --filter gamelayouteditor test
pnpm --filter gamelayouteditor build
```

如果修改 `packages/rendercore`、`packages/browserartifactio` 或其它 shared package，必须额外运行该 package 的 format/lint/typecheck/test/build，以及依赖它的 gamelayouteditor、game002、game003 等必要回归。原则上本任务不需要修改 shared package；如果只是为了 UI 方便准备改 parser/runtime，应先重新检查 ownership。

最终运行：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

根级 `format:check` 若被范围外既有文件阻断，应记录首个错误和文件，不得顺手格式化无关代码。任务涉及文件和 gamelayouteditor 的 format check 必须通过。

依赖安装或下载失败时使用用户指定代理：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
pnpm install
```

不得改用 npm/yarn，不得删除或重建 lockfile，不得用不受控升级掩盖下载问题。

如果测试因旧 DOM selector、旧纵向顺序、上传立即建层或删除层连带删资源而失败，应修改测试表达本计划的新正确行为；不要在 production 留两套 UI、隐藏 compatibility DOM、无意义 wrapper 或不可达分支。测试不应迫使业务代码出现后续难以排查的奇怪写法。

## 13. README 与 agents.md

必须更新：

```text
apps/gamelayouteditor/README.md
```

README 必须描述真实新流程：

```text
新建/导入
  -> 资源 Tab 上传 image/Spine logical resources
  -> 布局 Tab 选择资源并创建背景/图层
  -> outline 选择单一对象并在 Inspector 编辑
  -> 右侧真实 scene/symbol preview
  -> 项目 Tab 检查 strict diagnostics/closure
  -> 导出 production layout ZIP
```

还要明确：

- 上传不自动建层；
- 同资源可复用；
- 删除 layer 不删除 resource；
- 被引用 resource 不能删除；
- 未引用 resource 不进入 production ZIP，重新导入不会恢复；
- Picker 不自动绑定、不猜 animation；
- UI Tab/filter/selection/symbols drawer 不进入 ZIP。

执行时检查根级 `AGENTS.md`/实际 agents instructions：

- 如果只形成 gamelayouteditor 内部 UI 与 draft 结构，现有 scene-layout ownership 仍准确，报告说明“无需更新 agents.md”；
- 如果新增跨 package ownership、改变 production artifact 或形成所有 consumer 必须长期遵守的新约束，则同步更新；
- 不把 CSS class、Tab 文案、pane 像素宽度或临时文件名写入仓库级规则。

## 14. 浏览器人工验收

必须使用真实 Chromium 系浏览器，不能用 happy-dom 代替 Pixi/Spine/视觉验收。至少记录浏览器版本、viewport、fixture、通过项、失败项、控制台和必要截图。

### 14.1 新项目和资源优先工作流

1. 新建单背景项目，确认默认进入资源 Tab、preview 为空。
2. 上传 30+ image，确认只有资源行，没有自动 layer。
3. 上传至少两个真实 Spine 4.3.x 组，检查 atlas pages/animations/bounds。
4. 搜索、类型/引用状态筛选、展开 details。
5. 从 image 设置 default 背景，确认首次尺寸初始化、reel 居中、focus 外扩。
6. 从同一 image 创建两个普通 layer，确认 node/placement 独立。
7. 删除一个 layer，确认资源和另一个 layer 不受影响。
8. 删除仍被引用资源，确认精确失败；删除 unused resource 成功。

### 14.2 横竖双背景和严格尺寸

1. 新建 orientation-focus 项目。
2. 分别为 landscape/portrait 选择资源。
3. 验证 outline 与 Inspector 一次只显示当前 variant。
4. 用不同尺寸资源尝试重绑，确认必须显式 reinitialize。
5. 用无 bounds Spine 设置背景，确认明确 incomplete 且不猜 art size。
6. 填写 art/focus/frame/min margin 后验证横竖切换和真实黑边。

### 14.3 图层与 Picker

1. 只用键盘打开 Picker、搜索、切 filter、选择、确认和 Escape 取消。
2. Picker 内上传新资源，确认不自动绑定。
3. 添加 image/Spine layer，确认自动选中 Inspector 和成功反馈。
4. 对同一 Spine resource 创建两个 layer 并选择不同 animation。
5. 编辑 visibility、x/y/scale、order，检查 preview。
6. 快速 rebind/delete/switch selection，确认无 stale preview 或焦点跳失。

### 14.4 symbols preview 与 round-trip

1. 导入 game002 或 game003 strict symbols ZIP。
2. 选择 compatible reel set、随机多次并记录 stop 变化。
3. 修改 page size、zoom、guides、Tab、Inspector，确认 scene 不隐式重抽。
4. 修改 rows/columns，确认既有 compatibility/重新抽样规则。
5. 导出 layout ZIP，检查 symbols package 与 unused resource 均不在包内。
6. 重新导入，确认 used resources、nodes、animations、placements、reel、focus 语义等价。
7. 确认导出前留在 session 的 unused resource 在重新导入后不恢复，并有明确产品提示。

### 14.5 尺寸、性能和生命周期

在 1080、1280、1440、1920 宽度及较低窗口高度检查：

- preview 始终是主要区域；
- 主 Tabs、outline toolbar、preview toolbar 可见；
- resource list、outline、Inspector 独立滚动；
- 100 resources/30 layers 无明显输入卡顿；
- Object URL 数量不会随重复 render 无限增长；
- import/replace/delete 后旧 URL、Pixi/Spine/RenderSymbol owner 被释放；
- console 无 unhandled rejection、destroy-after-use 或 stale async 错误。

## 15. 完成定义

仅当以下全部满足才算完成：

- 左侧不再是背景/reel/全部 layers/项目设置的单一长页面；
- 资源/布局/项目三个主工作区可用且 session 稳定；
- image/Spine 上传只进入独立 logical resource library；
- 上传不自动创建 node/background；
- Resource Picker 明确确认、严格过滤、取消零 mutation、无 filename/first-candidate fallback；
- 同 resource 可创建多个 layer；
- 删除 layer 保留 resource，删除被引用 resource 明确失败；
- layout 使用 outline + 单对象 Inspector；
- background/reel/layer 所有现有 typed 字段仍可编辑；
- 不同背景尺寸和 Spine animation 无静默修复；
- symbols preview 控制位于右侧并保持原有语义；
- unused resources 不进入 production ZIP，UI/README 明确其 round-trip 边界；
- `SceneLayoutManifestV1`、strict closure、ZIP 安全、frame policy、preview 和 symbols random scene 合同不变；
- 无不必要 fallback、隐藏 legacy DOM、双套 handler 或测试驱动怪代码；
- model/UI/IO/preview 测试通过；
- gamelayouteditor format/lint/typecheck/test/build 通过；
- 根级门禁通过，或仅有明确记录的范围外基线问题；
- README 已更新，agents.md 已按实际必要性处理并在报告说明；
- 真实浏览器视觉、键盘、性能和生命周期验收已记录；
- 已生成符合 UTC 命名规则的中文任务报告。

## 16. 任务报告内容要求

任务报告至少包含：

- UTC 完成时间、branch、起始/最终 HEAD、Node、pnpm；
- 起始/最终 `git status --short`；
- 与其它用户修改的隔离情况；
- 实际修改文件；
- 最终三个工作区、outline/Inspector 和 preview drawer 信息架构；
- logical resource/node typed model 最终结构；
- 上传、Picker、添加/复用/重绑/删除的最终语义；
- unused resource 与 production ZIP closure 的最终处理；
- scene-layout manifest/ZIP/shared package 是否变化；
- 自动化测试、测试数量和 coverage；
- 专项/受影响 package/根级门禁结果；
- 浏览器版本、viewport、fixture 和人工验收结果；
- Object URL、Pixi、Spine、RenderSymbol 生命周期检查；
- 代理是否使用；
- agents.md 是否更新及理由；
- 已知限制、未完成项和范围外问题。

报告不得把“代码完成”“单测通过”“build 成功”或“页面可打开”冒充真实视觉、Pixi/Spine 交互和性能验收通过。
