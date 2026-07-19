# game layout editor stateful runtime package 任务计划

## 1. 任务目标

本任务扩展现有纯前端布局编辑器：

```text
apps/gamelayouteditor
```

并补齐 `packages/rendercore` 对编辑器产物的 production 直接消费能力。任务完成后，布局配置人员可以在同一个项目中完成以下工作：

1. 导入 `apps/Imgnumbereditor` 导出的 standalone image-string ZIP，把它加入资源库，并创建一个或多个可命名的图片字符串图层；每个图层可设置任意合法 JavaScript `string`，可编辑 placement/scale/anchor，并在 Pixi 预览中实时显示。
2. 使用静态图片或 Spine 资源作为背景。Spine 背景不再只能选择一个永久循环动画，而是可以配置多个稳定状态和有向切换动画。
3. 在预览中请求 Spine node 状态切换；例如配置 `BG`、`FG` 两个稳定状态，以及 `BG_FG`、`FG_BG` 两个一次性切换动画后，从 BG 切到 FG 时必须先完整播放 `BG_FG once`，完成边界再进入 `FG loop`，反向同理。
4. 可选导入一个自包含 symbols ZIP，并明确选择是否把它随 layout ZIP 一并导出。选择包含时，layout ZIP 必须 vendor 完整 symbols package、game config、symbol manifest 及其精确资源闭包，不依赖原始上传文件或外部目录。
5. `packages/rendercore` 可以直接解析和加载 `layout.manifest.json` 及其传递资源闭包，创建 layout node、image-string、Spine 状态机和绑定的 reel presentation。轮子尺寸、gap、行列数和 art-space 位置只能来自 manifest；app 不再复制坐标或从背景/图片尺寸反推。

目标产物是一份自包含 scene layout package：

```text
<project-id>-layout.zip
  layout.manifest.json
  assets/**
  dependencies/image-strings/<image-string-id>/image-string.manifest.json
  dependencies/image-strings/<image-string-id>/assets/**
  dependencies/symbols/<symbol-package-id>/symbols.package.json
  dependencies/symbols/<symbol-package-id>/**
```

`dependencies/image-strings/**` 只包含被已导出 image-string node 引用的依赖；`dependencies/symbols/**` 只有在用户明确勾选“随布局包导出 symbols package”时才存在。ZIP 的实际文件必须与 manifest 派生的传递闭包精确一致，不能包含 orphan、多余文件、宽泛 glob 结果或未引用的编辑器资源。

本文件是完整实施合同。执行者不得依赖聊天记录、任务 92、98、102、105、106、其它历史任务或口头说明来补齐行为。可以阅读历史代码和报告了解当前实现，但 schema、API、错误策略、实施顺序、测试、验收和交付物均以本文件为准。

任务完成后必须新增中文任务报告：

```text
tasks/107-game-layout-editor-stateful-runtime-package-[utctime].md
```

UTC 时间戳必须使用：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/107-game-layout-editor-stateful-runtime-package-260401-181300.md
```

## 2. 已确定的产品与架构决定

### 2.1 不新增第二套图片数字 runtime

- 编辑器 UI 可以称“图片数字”或 `imgnumber`，production manifest 和 TypeScript API 继续使用中性的 `imageString` / `image-string`。
- 必须复用：

```text
packages/rendercore/src/image-string/**
```

- glyph manifest parser、Unicode code-point 拆分、NFC/控制字符校验、缺 glyph 失败、natural/fixed advance、anchor、Pixi Sprite 池和 `setText()` 生命周期均不得复制到 `gamelayouteditor` 或 `scene-layout`。
- 图层的值始终是 string，不得先转 number。`"001"`、`"+12.50"` 等内容只要 glyph 闭包完整就必须原样 round-trip。
- 一个 standalone image-string resource 可被多个布局 node 复用；每个 node 独立保存 text、anchor 和 placement，修改一个 node 的 text 不影响其它 node。
- node 的 `id` 就是该 image-string 图层的唯一 production 名称。UI 应显示“图层名称 / node id”，不再增加一个只存在编辑器、导出后丢失的 displayName 字段。

### 2.2 Spine 状态机是通用 scene node 能力

- 不把 `BG`、`FG`、`BG_FG`、`FG_BG`、`BaseGame`、`FreeGame` 或 game002 写进 shared parser/runtime。
- scene-layout 的任意 Spine node 都可选择“单一 loop”或“状态机”播放模式；背景是状态机最重要的使用场景，但 schema/API 不硬编码 background。
- 稳定状态只允许真实 Spine loop animation；transition 只允许真实 Spine once animation。
- 状态切换仅由调用方显式 `requestNodeState(nodeId, state)` 触发。rendercore 不猜 GMI、free-game、URL query 或服务端字段。
- 只支持直接有向 transition。当前稳定状态到目标状态没有明确 transition 时立即失败，不自动寻路、不瞬切、不回退目标 loop。
- transition 播放期间再次请求状态立即失败；请求当前稳定状态立即 resolve 且不 replay loop。
- transition 完成边界必须先切入目标稳定 loop，再 resolve Promise。preview 控件应在进行中禁用，并通过 snapshot 明确显示 `stableState/targetState/phase`。
- state/transition animation 必须大小写精确存在于 skeleton；缺失、重复有向边、未知状态、自循环、同一 animation 被多个语义槽重复占用都在资源 prepare 前显式失败。

### 2.3 复用 official Spine 4.3 底层，不保留两套状态机

仓库已有：

```text
packages/rendercore/src/spine/runtime-player.ts
packages/rendercore/src/background/**
packages/rendercore/src/scene-layout/**
```

实施时必须把 `background` 已验证的 `stable loop -> transition once -> target loop` 控制逻辑抽成 scene-layout/background 可共同复用的内部能力，或让 scene-layout 直接组合一个不带业务语义的共享 Spine state controller。不得把 `spine-background-player.ts` 复制改名后再维护第二份完成边界、并发请求、destroy rejection 和 snapshot 逻辑。

`@esotericsoftware/spine-pixi-v8` 继续锁定官方 `4.3.x`。不新增 4.2/3.8 adapter，不以 skeleton 第一段动画、静态首帧、默认动画或图片作为 fallback。

### 2.4 scene-layout v1 做向后兼容扩展，不另建平行 manifest

继续使用：

```json
{ "version": 1, "kind": "scene-layout" }
```

原因是旧 manifest 的字段和语义不需要改变；本任务增加新的 discriminated resource 变体和可选 dependency binding。新版 parser 必须继续接受所有当前合法 v1 manifest，解析结果和现有 runtime 行为保持不变。

不新增 `game-layout.manifest.json`、`runtime.manifest.json`、`background.manifest.json` 副本或 editor-only production schema。`layout.manifest.json` 是 art、focus、node、state machine、reel geometry 和可选 package binding 的唯一入口。

所有对象继续递归拒绝 unknown key。新增字段不得保留 alias、历史拼写或 truthy/default 猜测。

### 2.5 symbols ZIP 是可选 vendored dependency，不是临时 preview 状态

- 当前 `gamelayouteditor` 已能导入 symbols ZIP 做随机公开轮带预览；本任务在此基础上保存原始逻辑 package 的 validated file map 和 package id。
- 用户必须明确选择“仅预览，不导出”或“随 layout ZIP 导出”。默认是仅预览，避免无意增大包体。
- 选择导出时，必须把 `symbols.package.json`、game config、symbol manifest、image/Spine/VNI/image-string 等全部传递闭包 vendor 到唯一目录：

```text
dependencies/symbols/<symbol-package-id>/
```

- vendoring 只增加路径前缀，内部文件 bytes 保持不变；nested `symbols.package.json` 中的相对 entrypoint/resource 路径仍以其所在目录为根解析，不重写 game config、symbol manifest 或资源内容。
- 第一版一个 layout package 最多绑定一个 symbols package，并只绑定 manifest 中的 `reels.main`。未来多 reel/multi-package 应通过后续 schema 扩展，不在本任务预留未使用数组或 fallback。
- 必须显式保存 `reelSet` 和 `renderMode`。不能因为 package 只有一个 reel set 就自动选择，也不能根据行列数猜普通 reel 或 grid-cell reel。
- symbols package `cellSize` 必须逐项等于 `reels.main.cellSize`；所选 `reelSet` reel count 必须等于 `reels.main.columns`；任何不兼容均禁止勾选导出并禁止 runtime 初始化。
- symbols package 内只能使用本地公开轮带。layout ZIP 不得保存服务器真实轮带、token、cookie、玩家输入、server scene 或 spin random。

### 2.6 rendercore 负责组合渲染，app 只提交运行期 scene

`packages/rendercore/scene-layout` 新增 package-level resource/runtime，负责：

```text
layout manifest
  -> 精确加载 layout/image-string/symbol dependency
  -> 创建 Pixi scene nodes
  -> 创建 Spine state controllers
  -> 创建 image-string nodes
  -> 创建 symbol catalog/registry
  -> 按 reels.main geometry 创建真实 reel presentation
  -> 把 reel 放到当前 variant 的正确 art-space x/y
```

production app 必须显式提交本轮或初始可见 scene，以及本地视觉 phase/stop y；manifest 不保存服务器本轮结果。scene 中某个服务器目标窗口无法在公开本地轮带中反查时不得失败，rendercore 继续使用“本地公开轮带 + 临时覆盖可见窗口”的既有合同，不能读取或泄露服务器真实轮带。

runtime 不猜 scene、不用 `Math.random()`、不自动从 paytable 生成 fallback scene。编辑器的“重新随机”继续使用 Web Crypto 从所选公开本地 reel 采样，并把采样得到的 scene 与 local phase 明确传给组合 runtime。

## 3. 当前基线与实施前盘点

制定本计划时仓库为：

```text
root:   /Users/zerro/github.com/slotclientengine
branch: main
HEAD:   e41545a
status: clean
```

仓库要求 Node `>=24.0.0`、pnpm `>=10.0.0`。制定计划的非交互 shell 中裸 `node` 不在 PATH，Codex bundled pnpm 为 `11.9.0`；实际实施者必须先按仓库正常开发环境确认 Node 24+，不能通过降低 engines、改测试配置或跳过脚本绕过运行时问题。

实施开始必须重新记录：

```bash
git branch --show-current
git rev-parse --short HEAD
git status --short
node --version
pnpm --version
```

工作区若不再 clean，所有已有修改和 untracked 文件都视为用户输入。禁止 `git reset --hard`、`git checkout --`、自动 stash、清理 untracked、覆盖生成物或对无关目录批量 format。

当前可复用能力：

- `packages/rendercore/src/scene-layout/` 已有 v1 parser、image/单 loop Spine node、精确直接资源闭包、art viewport、frame policy、reel grid geometry、named attachment 和 Pixi runtime。
- `packages/rendercore/src/background/` 已有 game002 所需的通用 Spine 稳定状态、有向 transition、Promise 完成和 destroy 语义。
- `packages/rendercore/src/image-string/` 已有 standalone image-string manifest、资源 loader、严格 text 校验和 Pixi renderer。
- `packages/rendercore/src/symbol/package.ts` 已有 symbols package manifest、transitive resources、catalog、value presentation 和 image-string symbol node 资源准备。
- `apps/gamelayouteditor` 已有 logical image/Spine resource library、typed node draft、单/双背景、random local reel preview、otherScene image-string symbol preview、严格 deterministic ZIP import/export 和固定右侧 Pixi preview。
- 当前 scene-layout runtime 已按 `getReelGrid("main")` 返回 columns/rows/cell/gap/art rect，但 game app 仍需自行创建 reel set；本任务的组合 runtime 应消除坐标和 symbol package 的重复接线，不删除底层 `getReelGrid()` 能力。

实施时至少重新阅读：

```text
apps/gamelayouteditor/src/model/editor-project.ts
apps/gamelayouteditor/src/model/editor-resource.ts
apps/gamelayouteditor/src/model/resource-commands.ts
apps/gamelayouteditor/src/model/validation.ts
apps/gamelayouteditor/src/io/imported-layout-zip.ts
apps/gamelayouteditor/src/io/exported-layout-zip.ts
apps/gamelayouteditor/src/io/imported-symbol-package.ts
apps/gamelayouteditor/src/preview/layout-preview.ts
apps/gamelayouteditor/src/ui/resources-workspace.ts
apps/gamelayouteditor/src/ui/layout-workspace.ts
packages/rendercore/src/scene-layout/**
packages/rendercore/src/background/**
packages/rendercore/src/image-string/**
packages/rendercore/src/symbol/package.ts
packages/rendercore/src/reel/**
docs/scene-layout-manifest.md
docs/image-string-manifest.md
docs/symbol-package.md
AGENTS.md
```

## 4. Ownership 边界

```text
apps/Imgnumbereditor
  standalone image-string glyph/metrics 编辑与 ZIP 导出

apps/symbolseditor
  symbol manifest、symbol 内命名 image-string slot node、symbols ZIP

apps/gamelayouteditor
  layout logical resource library、node/state machine draft、UI、preview、ZIP vendor/import/export

packages/rendercore/image-string
  image-string parser、text/layout、resource、Pixi lifecycle

packages/rendercore/background + shared Spine internals
  可复用 Spine 稳态/transition 控制语义

packages/rendercore/scene-layout
  layout schema、传递闭包、package loader、node/state/runtime、reel binding 和组合渲染

packages/rendercore/symbol + reel
  symbols package、catalog、registry、普通/grid-cell reel 的真实渲染算法

game app
  选择 layout package、提供当前 scene/local phase、请求业务状态、驱动 update/destroy
```

禁止事项：

- `gamelayouteditor` 不复制 glyph 排版、Spine track completion、reel mask/spin 或 symbol state machine。
- scene-layout 不硬编码 `imgnumber`、BG/FG、game002、CN/WL、Nearwin、component name 或服务端语义。
- game app 不再根据 layout package 复制 main reel x/y、cell/gap、symbol scale/priority 或 Spine animation 表。
- 不把 editor selection、展开状态、preview zoom、guide 显隐、临时随机 scene 写进 production manifest。

## 5. Scene layout manifest v1 扩展合同

### 5.1 Image-string node

`SceneLayoutNodeResourceSpec` 新增：

```ts
interface SceneLayoutImageStringResourceSpec {
  readonly kind: "image-string";
  readonly manifest: string;
  readonly text: string;
  readonly anchor: { readonly x: number; readonly y: number };
}
```

示例：

```json
{
  "id": "total-win",
  "order": 20,
  "resource": {
    "kind": "image-string",
    "manifest": "dependencies/image-strings/usd-amount/image-string.manifest.json",
    "text": "$001.25",
    "anchor": { "x": 0.5, "y": 0.5 }
  },
  "placements": {
    "default": { "x": 1000, "y": 1500, "scale": 1 }
  }
}
```

合同：

- `manifest` 必须是 canonical lowercase local path，固定指向 `image-string.manifest.json`，且位于 `dependencies/image-strings/<id>/`。
- `<id>` 必须等于 nested manifest 的 id；不得从 ZIP 文件名、目录之外的字符串或 UI label 猜测。
- `text` 必须在 layout package prepare 时使用 nested manifest 完整验证；空字符串合法。
- `anchor.x/y` 使用现有 `validateImageStringAnchor()` 合同；placement 的 x/y/scale 继续由通用 node placement 控制。
- runtime 提供：

```ts
getImageStringNodeNames(): readonly string[];
setImageStringText(nodeId: string, text: string): void;
getImageStringText(nodeId: string): string;
```

- `setImageStringText()` 必须先完整 layout/validate，再原子提交；失败时旧 text 和 glyph display 不变。
- 非 image-string node、未知 node、destroy 后调用均显式失败，不返回 null、不静默忽略。
- manifest 的 `text` 是初始显示值，也是 ZIP round-trip 值；运行期 setter 不回写 manifest。

### 5.2 Spine node 单 loop 与状态机 union

旧单 loop 结构保持合法：

```json
{
  "kind": "spine",
  "skeleton": "assets/bg/bg.json",
  "atlas": "assets/bg/bg.atlas",
  "textures": { "bg.png": "assets/bg/bg.png" },
  "defaultAnimation": "BG",
  "loop": true
}
```

新增状态机结构，和 `defaultAnimation/loop` 严格互斥：

```json
{
  "kind": "spine",
  "skeleton": "assets/bg/bg.json",
  "atlas": "assets/bg/bg.atlas",
  "textures": {
    "bg.png": "assets/bg/bg.png",
    "bg_2.png": "assets/bg/bg_2.png"
  },
  "stateMachine": {
    "initialState": "BG",
    "states": {
      "BG": { "animation": "BG" },
      "FG": { "animation": "FG" }
    },
    "transitions": [
      { "from": "BG", "to": "FG", "animation": "BG_FG" },
      { "from": "FG", "to": "BG", "animation": "FG_BG" }
    ]
  }
}
```

schema 规则：

- `initialState` 必须引用已声明 state。
- state id 是大小写敏感 ASCII identifier，匹配 `^[A-Za-z][A-Za-z0-9_-]*$`；animation name 是非空 string 并按 Spine 大小写精确验证。
- states 非空；transition 可为空，但仅单状态或业务确实不允许切换时才有意义。
- `(from,to)` 唯一；from/to 都必须存在；from 不等于 to。
- stable animation 与 transition animation 在该 state machine 中全局唯一，避免一个 animation 被赋予冲突完成语义。
- node 使用状态机时不得再出现 `defaultAnimation` 或 `loop`；单 loop node 不得出现 `stateMachine`。
- official Spine resource prepare 必须一次验证全部 state/transition animations 和 atlas page 闭包，不能到第一次点击切换时才发现缺资源。

runtime 增加通用 API：

```ts
requestNodeState(nodeId: string, state: string): Promise<void>;
getNodeStateSnapshot(nodeId: string): {
  readonly stableState: string;
  readonly targetState: string | null;
  readonly phase: "stable" | "transitioning";
};
```

对单 loop、image 或 image-string node 调用状态机 API 必须显式失败。

### 5.3 可选 symbols package binding

顶层新增可选 `symbolPackage`；缺省表示 layout package 不携带 symbol/reel runtime 依赖：

```ts
interface SceneLayoutSymbolPackageBinding {
  readonly manifest: string;
  readonly reel: "main";
  readonly reelSet: string;
  readonly renderMode: "standard" | "grid-cell";
}
```

示例：

```json
{
  "symbolPackage": {
    "manifest": "dependencies/symbols/game002-symbols/symbols.package.json",
    "reel": "main",
    "reelSet": "bg-reel01",
    "renderMode": "grid-cell"
  }
}
```

规则：

- 顶层 key 缺省时 parser 归一为 `null` 或明确的只读缺省值；不得猜相邻文件。
- `manifest` 必须位于 `dependencies/symbols/<id>/symbols.package.json`，`<id>` 与 nested package id 相等。
- 第一版 `reel` 只接受精确字符串 `main`，并要求 `reels.main` 存在。
- `reelSet` 必须非空且存在于 nested game config。
- `renderMode` 必须显式填写；`standard` 创建 `RenderReelSet`，`grid-cell` 创建 `RenderGridCellReelSet`。
- package prepare 时同时验证 cell size、column count、display symbol/code、local public reel 和所有传递资源；错误中必须包含 layout id、binding、nested package id 和具体不兼容项。
- 不把 spin timing、game-specific cascade/effect/anticipation 或 server result 写入该 binding。组合 runtime 只负责可见 reel presentation 的正确构建/定位和通用 reset/update；游戏特有 spin plan 继续由 app 使用 rendercore public reel API 提交。

### 5.4 传递资源闭包

现有：

```ts
collectSceneLayoutAssetPaths(manifest)
```

继续返回 layout manifest 直接声明的 image、Spine skeleton/atlas/textures，以及 nested dependency manifest entrypoint；它无法在没有 nested bytes 的情况下猜 glyph/symbol 传递文件。

新增内容感知入口，命名可按项目风格微调，但职责必须清楚：

```ts
collectSceneLayoutPackagePaths(options: {
  readonly manifest: SceneLayoutManifestV1;
  readonly files: ReadonlyMap<string, Uint8Array>;
}): readonly string[];
```

它必须：

1. 解析每个 image-string dependency manifest；
2. 以 nested manifest 所在目录为根解析 glyph asset paths；
3. 解析 nested `symbols.package.json`；
4. 以 symbols package 所在目录为根解析 entrypoints/resources；
5. 继续使用 symbol package 自身 validator 验证其内部 transitive closure；
6. 返回排序、冻结、无 path/case/NFC collision 的完整 ZIP entry 集合（不含根 `layout.manifest.json`）；
7. 要求 ZIP actual entries 与 expected entries完全相等。

任何 URL、data URL、绝对路径、`..`、反斜杠、空 segment、非 lowercase canonical path、目录逃逸、case/NFC collision、缺文件、多余文件或相同 id 不同 bytes 都立即失败。

## 6. Layout package resource 与组合 runtime

### 6.1 Resource API

在不破坏当前低层 API 的前提下新增 package 入口：

```ts
createSceneLayoutPackageResource(options): Promise<SceneLayoutPackageResource>;
loadSceneLayoutPackageFromUrl(options): Promise<SceneLayoutPackageResource>;
```

`SceneLayoutPackageResource` 至少暴露：

```ts
interface SceneLayoutPackageResource {
  readonly manifest: SceneLayoutManifestV1;
  readonly layout: SceneLayoutResource;
  readonly imageStrings: Readonly<Record<string, ImageStringResource>>;
  readonly symbolPackage: SymbolPackageResource | null;
  destroy(): Promise<void> | void;
}
```

约束：

- 创建必须是原子的。任一 nested dependency 失败时释放已创建 Object URL、Pixi texture、Spine resource、image-string resource 和 symbol package。
- 相同 image-string manifest 被多个 node 引用时共享 resource/texture，只创建一份；每个 node 创建独立 `RenderImageString` view。
- CDN loader 按 manifest URL 所在目录解析相对路径，只请求精确闭包；HTTP 非 2xx、跨根逃逸、MIME/JSON/atlas/image 解码失败都显式失败。
- destroy 幂等；共享资源按 ownership 只释放一次；初始化中的异步请求晚到不得复活已销毁 runtime。

### 6.2 Runtime API 与生命周期

保留 `createSceneLayoutRuntime({resource})` 供只需要布局节点/几何的消费者使用；扩展它以渲染 image-string 和 stateful Spine node。

另新增组合入口：

```ts
createSceneLayoutPackageRuntime({ resource }): SceneLayoutPackageRuntime;
```

建议公共合同：

```ts
interface SceneLayoutInitialReelScene {
  readonly scene: readonly (readonly number[])[];
  readonly localPhaseYs: readonly number[];
  readonly presentationValues?: readonly (readonly (number | null)[])[];
}

interface SceneLayoutPackageRuntime extends SceneLayoutRuntime {
  init(options?: {
    readonly reels?: Readonly<Record<"main", SceneLayoutInitialReelScene>>;
  }): Promise<void>;
  resetReelScene(
    reelId: "main",
    input: SceneLayoutInitialReelScene,
  ): void;
  getReelPresentation(reelId: "main"): Container;
  requestNodeState(nodeId: string, state: string): Promise<void>;
  getNodeStateSnapshot(nodeId: string): SceneLayoutNodeStateSnapshot;
  setImageStringText(nodeId: string, text: string): void;
  getImageStringText(nodeId: string): string;
}
```

最终类型名可以按现有代码风格调整，但以下行为不可改变：

- manifest 无 `symbolPackage` 时，`init()` 不要求 reel scene；调用 reel presentation API 明确失败。
- manifest 有 binding 时，`init()` 必须要求 `reels.main` 输入；不使用随机/default scene fallback。
- `scene` 必须严格为 columns x rows、x-first matrix；code 必须在 nested package paytable/symbol catalog 中可展示。
- `localPhaseYs` 长度必须等于 columns，每项是 finite safe integer 并按公开 local reel normalize；不得通过反查 server scene 得到 stop y。
- `presentationValues` 若提供，矩阵尺寸必须完全一致；具体 symbol 是否接受 value 继续由 symbol package controller 显式校验。
- reel set 的 cellWidth/cellHeight/columnGap/rowGap 只取 `reels.main`；symbol scale/renderPriority 只取 symbol manifest；local reels 只取绑定的 game config reelSet。
- reel root 位于 layout art container 内，位置始终使用当前 variant 的 resolved `reels.main.artRect.x/y`。`applyViewport()` 或 orientation variant 切换后同步 placement，但不重建 catalog、symbol player 或重播等价 animation。
- art clip、node order 和 reel z-order 必须确定。第一版 reel 作为一个明确的 scene slot 渲染；manifest 应增加或复用一个稳定 insertion contract，使 reel 相对 node 的层级可配置，而不是 app 直接 `addChildAt()` 猜 index。推荐为 `SceneLayoutReelGrid` 增加唯一 safe integer `order`，与 node order 在同一排序域验证唯一性。当前旧 manifest 缺 `order` 时按现有行为保持为 named attachment geometry-only；只有带 symbol binding 的新 manifest 才强制 `reels.main.order`。
- `update(deltaSeconds)` 每帧推进 visible Spine node、transition、image-string 无额外 ticker、reel symbol animation 和 reel runtime；不能只在 spin 时更新。
- destroy 时 pending transition Promise reject，reel/catalog/image-string/Spine/Object URL 全部释放；二次 destroy 幂等，destroy 后 public mutation API 全部失败。

### 6.3 Reel order 的明确 schema 决定

为满足“直接读取 manifest 后轮子处于正确层级和位置”，本任务给 `SceneLayoutReelGrid` 新增可选：

```ts
readonly order?: number;
```

规则：

- 旧 v1 manifest 可缺省，继续只提供 geometry，不改变现有消费者。
- 一旦顶层存在 `symbolPackage`，绑定的 `reels.main.order` 必填。
- order 是 safe integer，与 `nodes[].order` 共用同一排序域且全局唯一；值小的先画、位于下方。
- runtime 内部为 node/reel 建统一 stable display slot；不得通过数组索引、backgroundNode 特例或 `zIndex=999` 实现。

## 7. Gamelayouteditor 数据模型与命令

### 7.1 Logical image-string resource

`EditorLayoutResource` 增加：

```ts
interface EditorImageStringLayoutResource {
  readonly id: string;
  readonly kind: "image-string";
  readonly manifestPath: string;
  readonly manifest: ImageStringManifestV1;
  readonly assetPaths: readonly string[];
}
```

raw bytes 仍存入 `project.assets` 或更明确的 package file store。不得把 glyph bytes 嵌进 draft JSON。

新增窄命令：

```text
importImageStringZip()
replaceImageStringResource()
addImageStringLayer()
setImageStringLayerText()
setImageStringLayerAnchor()
```

行为：

- 导入 standalone ZIP 必须复用 bounded ZIP/path policy，要求根目录严格包含 `image-string.manifest.json + assets closure`。
- vendor 目标固定为 `dependencies/image-strings/<id>/...`。
- 相同 id、相同 bytes 可去重；相同 id、不同 manifest 或 glyph bytes 显式冲突。替换是明确的原子命令，失败不能留下部分 bytes。
- 删除仍遵守当前 resource/node 分离：删除 node 不删 resource；resource 被引用时不能删；未引用 resource 不进入导出包。
- node draft 增加互斥的 image-string use fields，建议整理为 discriminated `content/playback`，不得让 image node 带 text 或 Spine node 带 anchor。

### 7.2 Spine node playback draft

把当前 `defaultAnimation?: string` 收敛为明确 union：

```ts
type EditorSpinePlaybackDraft =
  | { readonly kind: "loop"; animation: string }
  | {
      readonly kind: "state-machine";
      initialState: string;
      states: Array<{ id: string; animation: string }>;
      transitions: Array<{ from: string; to: string; animation: string }>;
    };
```

只允许 Spine node 拥有该字段。导入旧 manifest 时 deterministic 转成 `kind: "loop"`；再次导出语义等价，不要求字节等价。

model 命令必须覆盖：切换 playback kind、添加/改名/删除 state、设置 initialState、添加/编辑/删除 transition、选择 exact animation。改名 state 必须原子重写 initialState 和所有 transition 引用；删除被 initial/transition 引用的 state 必须失败，除非用户先清引用。

资源替换时，所有引用 node 的 loop/state/transition animation 都必须存在于新 skeleton，任何一个不兼容则整体 replacement 失败。

### 7.3 Symbols dependency draft

Editor project 保存：

```ts
interface EditorSymbolPackageDependency {
  readonly packageId: string;
  readonly files: ReadonlyMap<string, Uint8Array>;
  reelSet: string;
  renderMode: "standard" | "grid-cell";
  includeInExport: boolean;
}
```

具体实现需避免把 `Map` 放进 `structuredClone` 不支持的临时 JSON 流程；clone/import/replace/destroy 均需显式处理 resource ownership。

导入 symbols ZIP 后先完整 validate，再原子替换当前 dependency。若旧 preview resource 正在使用，先成功建立新 resource，再 swap 并 destroy 旧 resource。选择 reelSet/renderMode/includeInExport 不得重解压 ZIP。

当 `includeInExport=true` 时：

- main reel order 必填；
- reelSet 必须兼容；
- layout export 生成顶层 `symbolPackage` binding；
- dependency files 加前缀后进入 exact closure。

当为 false 时，manifest 不写 `symbolPackage`，ZIP 不含任何 symbols bytes；preview 仍可继续使用当前已导入 package。

## 8. 编辑器 UI 与预览

### 8.1 资源库

资源 Tab 增加：

- “导入 image-string ZIP”按钮；不把 glyph 图片当普通 image resources 分散展示。
- image-string logical resource 行，显示 id、glyph 数、lineHeight、字符预览、引用数和 vendored manifest path。
- “添加为图片字符串图层”动作；普通 image/Spine 的现有动作不变。
- replacement/delete 的严格引用提示。

上传资源仍只加入资源库，不自动创建 node、背景或 symbols binding。

### 8.2 Layout outline 与 Inspector

- image-string node 与普通 image/Spine node 一起按 order 出现在图层列表，类型标识为 `image-string`。
- node id 输入就是可导出的图层名称，继续执行 lowercase canonical node id 和 collision 校验。
- image-string Inspector 提供 text 输入（允许空字符串）、anchor x/y、variant visibility 和 placement x/y/scale。
- text input 的每次提交都先严格校验；错误显示缺 glyph 等明确诊断，preview/manifest 保持上一次成功值。
- Spine Inspector 提供 playback 类型选择：`single loop` / `state machine`。
- 状态机 UI 至少包含稳定状态表、initial 标记、exact animation select、transition 表（from/to/animation）和显式增删按钮；不得按动画名自动生成 BG/FG 语义。
- background Inspector 若资源为 Spine，使用同一 playback editor；图片背景保持无 animation；image-string 不允许设为 background，因为 adaptation 的 backgroundNode 必须覆盖完整 art，parser 应显式拒绝。

### 8.3 Preview 状态切换

右侧 preview 增加“Spine 状态”控制区：

- 列出当前 variant 可见且配置 state machine 的 node。
- 每个 node 显示 stable/transitioning snapshot 和所有 state 按钮。
- 点击非当前 state 调用 runtime public `requestNodeState()`；transition 期间按钮 disabled。
- transition 完成后 UI 只依据 runtime snapshot 更新，不能用 `setTimeout(animationDuration)` 猜结束。
- 修改 state machine draft、替换 Spine resource 或切换整个 layout 时取消旧 preview generation；晚到 init/transition 不得覆盖新 runtime。
- preview ticker 继续统一推进 layout runtime 和 reel runtime，不新增隐藏 canvas、第二 Pixi Application 或独立 requestAnimationFrame。

必须增加 game002 等价 fixture，至少证明：

```text
state BG -> animation BG loop
state FG -> animation FG loop
BG -> FG -> animation BG_FG once -> FG loop
FG -> BG -> animation FG_BG once -> BG loop
```

fixture 只验证通用能力，不自动修改 `apps/game002` production 接入。

### 8.4 Symbols package 导出控制

把现有 symbols preview 控制扩展为：

- 当前 package id / cell size / display symbols / compatible reel sets；
- 显式 reelSet select；
- 显式 renderMode select；
- “随 layout ZIP 导出”checkbox；
- 当前 vendored 大小/entry 数和兼容性诊断；
- 清除/替换 package。

勾选只改变 draft 并重新严格 validate，不立即生成 ZIP。无 package、reelSet 不兼容、cell size 不匹配或 main order 缺失时禁止勾选并给出具体原因。

preview 应改用或至少增加组合 runtime 集成路径，证明同一个 manifest 在 editor 与 production API 下得到相同的 reel artRect、node order、symbol scale/priority 和 image-string/stateful Spine 表现。不得保留一套 editor 手工 `symbolOverlay.position.set(reel.x,reel.y)` 作为唯一实现。

## 9. ZIP 导入、导出与 round-trip

### 9.1 导出

`exportLayoutZip()` 必须：

1. 从 EditorProject 生成严格 manifest；
2. 收集实际被 node 引用的 direct assets；
3. 收集被 image-string node 引用的 standalone vendored closure；
4. 若 includeInExport，收集完整 symbols closure并加固定前缀；
5. 运行 package-level resource prepare，确保 text、Spine animations、atlas、图片尺寸、symbol binding 和 reel 都可初始化；
6. 对 expected/actual 做精确闭包比较；
7. 使用现有 deterministic ZIP helper 输出稳定 bytes。

同一语义 project 连续导出必须字节相同。ZIP entry 按 canonical path 排序；JSON 使用 stable key/order 和尾换行。

### 9.2 导入

`importLayoutZip()` 必须支持：

- 当前旧 v1：只有 image/单 loop Spine/assets；
- 新 v1：image-string、stateful Spine、reel order、可选 symbols binding。

导入流程必须先在临时 ownership scope 中完整解压、parse、闭包比较、decode/prepare，再一次性创建 EditorProject。任何失败都销毁 Object URL/resource，不改变当前已打开项目。

导入后重建：

- image/Spine/image-string logical resource library；
- node playback/text/anchor/placements/order；
- symbols dependency file map、reelSet、renderMode，并将 `includeInExport` 设为 true；
- main reel geometry/order；
- preview runtime。

再次导出必须语义等价，所有 vendored dependency bytes 保持原样。不得把 dependency glyph 或 symbol texture 提升为普通 layout image resource。

### 9.3 ZIP 限额

symbols package 可能显著增大现有 layout ZIP。应根据当前 `SYMBOL_ZIP_LIMITS` 与 layout 直接资源上限制定新的 package 总限额，且满足：

- entry、单文件、压缩总量、解压总量分别有限；
- 限额是常量并有边界测试；
- 先验证 central directory/path，再分配大 buffer；
- 不因加入 symbols 就取消 zip-bomb 防护；
- 错误必须说明超出的维度和限制。

## 10. Rendercore 和 Editor 实施步骤

### 阶段 A：基线与合同测试

1. 记录 branch/HEAD/status/Node/pnpm 和当前测试结果。
2. 为现有 scene-layout v1 parser/runtime/ZIP 增加 legacy fixture，锁住向后兼容。
3. 先写新 schema 的 parser/resource negative tests，确保实现过程中不会靠 fallback 通过。
4. 盘点 background state player 可抽取的最小共享控制器；先用测试锁住 game002 background 现有行为，再重构。

### 阶段 B：rendercore schema 与共享 Spine controller

1. 扩展 `scene-layout/types.ts` 的 resource union、state snapshot、symbol binding 和 reel order。
2. 扩展严格 parser、references/bounds/order 校验。
3. 抽取共享 Spine state controller，background 与 scene-layout 共用。
4. 在 scene-layout resource prepare 中验证全量 animations。
5. 扩展 runtime init/update/request/snapshot/destroy。
6. 确认单 loop旧节点不 replay、不改变现有 runtime snapshot 和测试。

### 阶段 C：image-string dependency 与 node runtime

1. 增加 nested manifest/path resolver 和 package-aware closure collector。
2. 复用 image-string resource 创建/纹理共享。
3. runtime 创建每 node 独立 `RenderImageString`，实现 set/get 和 atomic failure。
4. 增加 URL loader、destroy、异步竞态测试。

### 阶段 D：symbols dependency 与 reel compositor

1. 增加 prefixed nested symbols package resolver，复用现有 validator/resource。
2. 校验 binding、cell size、reel count、reelSet、display code。
3. 创建 catalog/registry 和 standard/grid-cell reel presentation。
4. 用统一 order slot 插入 scene；applyViewport 时同步 variant placement。
5. 实现严格 initial/reset scene、local phase、presentation values 和每帧 update。
6. 使用“服务器窗口临时覆盖公开本地轮带”的现有 reel API；增加 server scene 不在 local strip 仍可显示的测试。

### 阶段 E：editor typed model 与资源命令

1. 增加 image-string logical resource 和 import/replace/delete/reference。
2. 把 Spine playback 收敛为 discriminated union，并更新 clone/import/export/validation。
3. 增加 symbols dependency ownership、includeInExport、binding fields。
4. 所有 command 使用 prepare -> validate all references -> atomic commit。
5. 更新 store/session selection，保持资源库、node 和 dependency 生命周期分离。

### 阶段 F：UI 与 preview

1. 资源 Tab 加 image-string ZIP。
2. Layout Inspector 加 text/anchor 和 state machine 表单。
3. Project/preview 区加 symbols export binding 和状态切换控件。
4. preview 接入组合 runtime，移除重复 placement 接线。
5. 保证键盘、label、aria-live error、disabled transition 状态可用。

### 阶段 G：ZIP、文档和验收

1. 扩展 deterministic import/export 和限额。
2. 增加 legacy/new round-trip、orphan/collision/zip-bomb tests。
3. 更新 README、scene layout/image-string/symbol package 接入文档。
4. 根据第 14 节更新 `AGENTS.md`。
5. 执行完整验证，记录命令和结果。
6. 用 UTC 时间生成中文任务报告。

## 11. 必测用例

### 11.1 Scene manifest/parser

- 旧 image node、旧 single-loop Spine node、无 symbol binding 的 v1 fixture 解析结果不变。
- image-string node 正常解析并 deep-freeze。
- 非 canonical dependency path、错误目录、错误 manifest 文件名、缺 text/anchor、anchor 非法、unknown key 失败。
- state machine BG/FG 双向 transition 正常。
- initialState 不存在、空 states、非法 id、missing animation、重复 pair、自循环、unknown state、animation 重复、与 defaultAnimation/loop 混用失败。
- symbol binding 的 manifest/reel/reelSet/renderMode 和 reel order 规则完整覆盖。
- node/reel order collision 失败；legacy geometry-only reel 无 order 仍合法。

### 11.2 Resource/closure

- 多 node 共享一个 image-string resource，只加载一次纹理，创建独立 view。
- 缺 glyph、glyph 多余、nested manifest id/目录不一致、尺寸漂移、case/NFC collision 失败。
- prefixed symbols ZIP 字节保持不变，nested relative path 正确解析。
- symbols entrypoint/resource 缺失、多余、越界、cell size/reel count/reelSet 不兼容失败。
- create 过程中任一步失败都释放已创建 URL/texture/resource；destroy 幂等。
- CDN 子路径和 query/hash 基准正确；路径逃逸和非 2xx 失败。

### 11.3 Runtime

- image-string 初始 text/anchor/placement 正确；setText 更新；非法新 text 不改变旧 snapshot/view。
- BG 初始化 loop；请求 FG 播放 BG_FG once；官方 completion 边界切 FG loop 并 resolve。
- FG -> BG 对称；请求当前 state 不 replay；缺 direct transition、并发 request、destroy pending promise 明确失败。
- orientation 切换不重建 player、不重播等价 loop；不可见 node 不错误推进或重新 init，行为与现有 scene-layout 合同一致。
- standard/grid-cell reel 使用 manifest columns/rows/cell/gap，art rect 和 order 正确。
- symbol scale/priority 来自 manifest；server scene 不在 local strip 仍通过临时窗口覆盖显示。
- scene/phase/value matrix 维度或 code 非法失败；无 binding 调 reel API 失败。
- update 同时推进 transition 和 symbol animation；destroy 全部清理。

### 11.4 Editor model/UI

- image-string import/add/rename/text/anchor/rebind/replace/delete/clone 全覆盖。
- text `"001"` round-trip 不变；缺 glyph 显示明确错误且保持旧值。
- Spine state CRUD、state rename 引用重写、删除保护、resource replacement incompatibility 原子失败。
- background 可选图片或 Spine；image-string 不能设背景。
- preview 按钮真实等待 completion，不使用 timer；transition 时 disabled。
- symbols include checkbox 与兼容性、order、清除/替换语义。
- app shell generation 防竞态，旧 runtime 晚到不覆盖新项目。

### 11.5 ZIP round-trip/security

- 旧 layout ZIP 可导入并再次导出语义等价。
- 新 ZIP 同时含 image-string/stateful Spine/symbols package 时精确 round-trip。
- include=false 时 ZIP 完全无 `dependencies/symbols/`。
- include=true 时 nested package 完整且无 orphan。
- 连续两次导出 bytes 相同。
- zip slip、absolute path、backslash、duplicate entry、case/NFC collision、CRC/UTF-8/JSON 错误、entry/size limit 失败。

### 11.6 Boundary tests

增加源码边界测试，至少断言：

- `apps/gamelayouteditor` 不复制 image-string layout/glyph Sprite 算法。
- `apps/gamelayouteditor` 不直接依赖 `@esotericsoftware/spine-pixi-v8`。
- editor 不直接操作 Spine track、slot 或 reel 私有 child。
- scene-layout/background 共用 Spine transition controller，不出现两份完成状态机。
- shared code 不出现 game002、BG/FG 业务常量、CN/WL、Nearwin 或 app component name。
- game fixture 不把 server reel 写入 layout ZIP。

## 12. 文档与接入示例

至少更新：

```text
apps/gamelayouteditor/README.md
packages/rendercore/README.md
docs/scene-layout-manifest.md
docs/image-string-manifest.md
docs/symbol-package.md
docs/background-adaptation.md
```

文档必须给出完整、可复制的 production 初始化示例：

```ts
const resource = await loadSceneLayoutPackageFromUrl({ manifestUrl });
const runtime = createSceneLayoutPackageRuntime({ resource });

await runtime.init({
  reels: {
    main: {
      scene: initialScene,
      localPhaseYs,
    },
  },
});

app.stage.addChild(runtime.container);
runtime.applyViewport(frameDesignSize);

app.ticker.add((ticker) => {
  runtime.update(ticker.deltaMS / 1000);
});

await runtime.requestNodeState("bg", "FG");
runtime.setImageStringText("total-win", "$123.45");
runtime.resetReelScene("main", {
  scene: nextScene,
  localPhaseYs: nextLocalPhaseYs,
});
```

示例必须说明：

- scene 与 localPhaseYs 是运行期输入，不写入 manifest；
- frame policy/art viewport/reel placement 来自同一 layout manifest；
- symbols package 可内嵌也可不内嵌；未内嵌时组合 reel API 不可用；
- app 只触发业务状态，不解释 transition animation；
- URL loader 支持静态 CDN 子目录，不要求浏览器运行时解 ZIP。

## 13. 验证命令与依赖失败处理

优先执行受影响包验证：

```bash
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore lint
pnpm --filter @slotclientengine/rendercore build

pnpm --filter gamelayouteditor test
pnpm --filter gamelayouteditor typecheck
pnpm --filter gamelayouteditor lint
pnpm --filter gamelayouteditor build
pnpm --filter gamelayouteditor format:check

git diff --check
```

然后执行仓库级回归：

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm format:check
```

若依赖安装或下载因网络失败，使用用户指定代理后重试原命令：

```bash
export http_proxy=http://127.0.0.1:1087
export https_proxy=http://127.0.0.1:1087
pnpm install
```

也可以在同一 shell 中：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;pnpm install
```

只在确认为 dependency/network failure 时使用代理。不得删除 lockfile、改 registry、放宽版本、改为其它 package manager、静默跳过 prepare/build，或把网络失败伪装为测试通过。

若测试要求 production 写出奇怪 fallback、泄漏私有字段、复制状态机、保留错误 alias 或放宽 parser，应修改测试和 fixture 使其符合本计划；不要破坏正确 production 合同来迎合旧断言。测试失败必须先区分真实回归、测试过时、环境缺失和用户未提交资源，报告中逐项说明。

## 14. `AGENTS.md` 更新要求

本任务会新增长期 ownership，实施完成后有必要同步更新根 `AGENTS.md`，至少加入一条简洁规则：

```text
packages/rendercore/scene-layout 拥有 gamelayouteditor layout manifest 的通用 image-string node、Spine node 稳态/有向 transition、传递 dependency package loader、reel binding/order 和组合 runtime；apps/gamelayouteditor 只拥有 logical resource/draft/UI/preview/ZIP IO，game app 只提交运行期 scene/local phase 和业务状态请求。不得在 editor/app 复制 image-string、official Spine state machine 或 reel placement/runtime，也不得把服务器真实轮带写入 layout package。
```

更新时保留现有全部规则，不重排或压缩与本任务无关的大段内容。若最终实现改变了公共类型名，应按实际 API 调整措辞，但 ownership 不得弱化。

## 15. 完成定义

以下条件全部满足才可判定任务完成：

1. gamelayouteditor 可导入 standalone image-string ZIP、创建可命名 node、设置并预览 string，导入/导出保持精确语义。
2. 背景可使用静态 image 或 official Spine 4.3；Spine node 可配置多个 stable states 和 direct transitions。
3. preview 真实通过 runtime completion 播放 transition once 后进入 target loop，双向切换、并发、destroy 语义有测试。
4. 用户可明确选择是否把当前 symbols package vendor 进 layout ZIP；两种输出都没有多余 entry。
5. rendercore 可从同一个 manifest/package 创建 node、image-string、state machine、symbol catalog 和 standard/grid-cell reel presentation。
6. reel 的 columns/rows/cell/gap/order/variant x/y 均只来自 manifest，symbol scale/priority/local strip 只来自 nested symbols package。
7. server target scene 不要求存在于 local strip；package 不包含服务器真实轮带或运行期 scene。
8. legacy scene-layout v1 继续可用；所有新增错误尽早、明确、无 placeholder/fallback。
9. 受影响包和仓库级 test/typecheck/lint/build/format:check 按第 13 节通过，或环境性失败被如实记录且没有伪造成功。
10. README/docs/AGENTS.md 与实际 API 一致。
11. 新增中文 UTC 时间戳任务报告，包含改动摘要、关键设计、文件列表、测试命令与结果、未完成项/风险；不得只写“完成”。

## 16. 任务报告模板要求

最终报告至少包含：

```text
# 107 game layout editor stateful runtime package 任务报告

## 基线
- branch / HEAD / 初始 status
- Node / pnpm

## 完成内容
- image-string logical resource/node
- Spine state machine/editor preview
- symbols vendoring
- rendercore package/reel runtime

## Manifest 与公共 API
- 最终 schema
- legacy 兼容策略
- 关键生命周期/错误语义

## 主要文件
- 新增
- 修改

## 验证
- 每条实际命令
- exit code / 测试数量 / build 结果
- 代理是否使用

## 资源闭包与安全检查
- ZIP exact closure
- limits/path/collision
- server reel boundary

## 文档与 AGENTS.md
- 更新内容

## 未完成项或风险
- 无则明确写“无”
```

报告时间戳必须在全部实现与验证结束后通过 `date -u` 生成，不能使用本地时区、文件创建时间或手填近似值。
