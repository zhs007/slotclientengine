# Game Layout Editor State Workspaces 任务计划

## 1. 任务目标

本任务更新现有纯前端应用：

```text
apps/gamelayouteditor
```

在保持 `packages/rendercore/scene-layout`、symbols package、strict
`award-celebration` popup package 和 scene-layout ZIP production 合同清晰分层的前提下，完成以下产品改造：

1. 把“主状态”提升到编辑器最外层。用户可以维护任意合法状态 id，例如 `BG`、`FG`，并选择初始状态；
   shared code 不硬编码这些示例名称。
2. 左侧主工作区固定为 `资源 | 布局 | Symbols | BigWin | 项目` 五个 Tab。Symbols 与 BigWin 不再放在右侧预览区的折叠抽屉里。
3. `资源`、`项目` 是项目级工作区；`布局`、`Symbols`、`BigWin` 明确作用于当前选中的主状态。
4. 每个主状态可以显式绑定自己的背景、symbols package 配置和 BigWin popup；多个状态可以共享同一 dependency，也可以使用不同 dependency，未绑定必须明确显示“无”，不得猜第一个或唯一候选。
5. 背景状态切换复用现有 official Spine 4.3 state-machine 能力。例如同一个背景 node 配置 `BG`、`FG` 稳定动画和
   `BG -> FG: BG_FG`、`FG -> BG: FG_BG` 有向 transition 后，预览和 production runtime 必须播放真实 once transition，完成后进入目标 loop。
6. 右侧预览可以选择稳定主状态、请求切换、查看切换中诊断，并预览目标状态对应的背景、Symbols 和 BigWin。
7. 修复 `高级 cell / gap / placement` 等 `<details>` 在修改内部字段触发 store 重绘后自动收起的 bug；同类 Inspector 折叠区必须统一保留展开状态、滚动位置和可恢复的输入焦点。
8. 预览分辨率预设改为单个下拉选择，不再平铺多个按钮；仍允许显式输入自定义宽高。
9. 顶部只保留一个“新建项目”按钮。点击后弹出对话框，显式选择“单背景适配”或“横竖双背景适配”，确认后才创建项目。
10. layout ZIP 继续是自包含、确定性、精确传递闭包的 production artifact；多状态 symbols / popup dependency 必须无损导入、导出和再次导入。

本文件是完整实施合同。执行者不得依赖聊天记录、任务 105、107、111、历史报告或口头说明补齐产品行为。
可以阅读历史代码理解基线，但数据合同、兼容边界、失败策略、实施步骤、测试、验收和交付物均以本文件为准。

任务完成后必须新增中文任务报告：

```text
tasks/112-gamelayouteditor-state-workspaces-[utctime].md
```

UTC 时间戳必须使用：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/112-gamelayouteditor-state-workspaces-260401-181300.md
```

## 2. 制定计划时的仓库基线

制定本计划时现场为：

```text
repository: /Users/zerro/github.com/slotclientengine
branch:     main
HEAD:       bc5693e
status:     clean
date:       2026-07-20 (Asia/Shanghai)
```

实施开始时必须重新记录 branch、HEAD、工作区状态、Node 与 pnpm 版本；上述 hash 只说明计划制定基线，
不得用它覆盖用户后续修改。工作区中的既有修改和 untracked 文件均视为用户输入，禁止 reset、stash、clean、
checkout 覆盖或无关批量 format。

实施时至少重新阅读：

```text
agents.md
apps/gamelayouteditor/README.md
apps/gamelayouteditor/package.json
apps/gamelayouteditor/src/model/editor-project.ts
apps/gamelayouteditor/src/model/editor-store.ts
apps/gamelayouteditor/src/model/game-mode-commands.ts
apps/gamelayouteditor/src/model/validation.ts
apps/gamelayouteditor/src/io/imported-layout-zip.ts
apps/gamelayouteditor/src/io/exported-layout-zip.ts
apps/gamelayouteditor/src/io/imported-symbol-package.ts
apps/gamelayouteditor/src/io/imported-popup-package.ts
apps/gamelayouteditor/src/preview/layout-preview.ts
apps/gamelayouteditor/src/preview/preview-size.ts
apps/gamelayouteditor/src/ui/app-shell.ts
apps/gamelayouteditor/src/ui/ui-session.ts
apps/gamelayouteditor/src/ui/layout-workspace.ts
apps/gamelayouteditor/src/ui/resources-workspace.ts
apps/gamelayouteditor/src/ui/project-workspace.ts
apps/gamelayouteditor/src/styles.css
apps/gamelayouteditor/tests/**
packages/rendercore/src/scene-layout/**
packages/rendercore/src/spine/state-controller.ts
packages/rendercore/src/popup/**
packages/rendercore/src/symbol/**
docs/scene-layout-manifest.md
docs/popup-manifest.md
docs/symbol-package.md
```

## 3. 当前能力与确认缺口

### 3.1 必须复用的现有能力

- `EditorProject.gameModes` 已有 `initialMode`、mode id、stateful node `nodeStates` 和
  `awardCelebrationPopupId`。
- `packages/rendercore/scene-layout` 已有 strict `gameModes` parser、原子 node transition preflight、
  `requestGameMode()`、当前 mode popup lifecycle 和 snapshot。
- scene-layout Spine node 已支持多个稳定 loop state 与直接有向 once transition；底层复用 official Spine 4.3 runtime。
- `popupDependencies` 已是可复用 Map，多个 mode 可以共享或分别绑定 strict `award-celebration` popup。
- editor 已能严格导入、自包含 vendor、真实 prepare 和预览 popup package。
- editor 已能导入一个 symbols package，从本地公开轮带随机 preview，并显式选择 reel set / render mode。
- layout preview 已复用 production scene-layout package runtime，而不是 editor-only transition 或 popup 模拟器。
- editor 已有 `资源 | 布局 | 项目` Tab、右侧固定 preview、scroll/focus restoration、strict deterministic ZIP IO。

### 3.2 必须修复的实际缺口

1. mode 和 popup 控件由 `app-shell.ts` 在初始化时临时创建为右侧 `<details>`；不属于稳定工作区信息架构。
2. Symbols 仍位于右侧 `Symbols 预览与导出` drawer；`EditorProject.symbolDependency` 和 production
   `symbolPackage` 都是全项目单例，不能按主状态选择。
3. 当前 mode 只绑定 stateful node state 与 popup，未显式绑定每个 variant 的背景 node。
   静态图片背景或不同 Spine background node 无法按 mode 激活/隐藏。
4. 当前 `SceneLayoutRuntime` 会显示所有在 active variant 有 placement 的 node；如果加入多个候选背景，
   它们会同时显示，缺少 mode-aware background visibility。
5. preview 的 mode selector、popup 控件和低层 node-state debug 控件相互分散，无法从用户视角验证完整
   `当前状态 -> 请求目标状态 -> transition -> 背景/Symbols/BigWin` 链路。
6. `reelInspector()` 每次 render 都重新生成未带 `open` 的 `<details>`。内部数值字段 `change` 后 store 通知触发
   `panel.innerHTML = ...`，因此“高级 cell / gap / placement”会收起。现有 `symbolsDrawerOpen` 只保存
   Symbols drawer，且 drawer 本身也将被本任务移除。
7. `PREVIEW_SIZE_PRESETS` 当前被渲染成四个按钮，和宽高输入并排。
8. 顶部当前有“新建单背景”和“新建横竖双背景”两个按钮，没有一次性确认适配模式的对话框。
9. 当前 ZIP closure 和 package resource 只处理一个 symbols dependency；多状态 symbols 无法 strict round-trip。

不得把上述缺口描述成“仅 UI 改版”。本任务包含 editor draft、scene-layout schema/package resource/runtime、
ZIP IO、preview 和文档的协调扩展。

## 4. 已确定的产品与架构决定

### 4.1 “主状态”沿用 production `gameModes`，不建第二套状态概念

- UI 文案统一使用“主状态”；TypeScript / manifest 延续 `gameModes`，避免出现 `mainStates`、`screens`、
  `phases` 等平行 schema。
- mode id 继续使用大小写敏感 ASCII 标识规则 `^[A-Za-z][A-Za-z0-9_-]*$`，数组内唯一。
- 新项目默认只有 `BaseGame`，但 shared parser/runtime 不认识 `BaseGame`、`FreeGame`、`BG`、`FG` 的业务含义。
- 新增、重命名、删除、设为 initial 都必须经过窄 model command，并保持引用原子更新。
- 至少保留一个 mode；删除 initial mode 前必须先显式选择另一个 initial mode，不自动选择第一项。

### 4.2 最外层状态选择器与 Tab 的作用域

编辑器左侧结构固定为：

```text
┌──────────────────────────────────────────────────────┐
│ 主状态 [BG ▼]  [管理状态]  initial: BG  stable/ready │
├──────────────────────────────────────────────────────┤
│ 资源 | 布局 | Symbols | BigWin | 项目                │
├──────────────────────────────────────────────────────┤
│ 当前 Tab 内容                                        │
└──────────────────────────────────────────────────────┘
```

- 主状态 selector 位于 Tab 之外；切 Tab 不改变当前状态。
- `资源`：项目级 logical resource library，不因状态切换而复制 bytes。
- `布局`：编辑共享 art/focus/reel/layer geometry，以及当前状态的 background binding / state target。
- `Symbols`：编辑 symbols dependency library，以及当前状态的 package/reelSet/renderMode binding。
- `BigWin`：编辑 popup dependency library、当前状态 binding、per-variant placement 和 production preview 输入。
- `项目`：项目 id、适配模式只读摘要、状态/依赖/导出 closure 诊断。
- 状态切换后，三个 state-scoped Tab 必须立即显示该状态的显式配置；不得沿用上一个状态的控件值制造假象。

### 4.3 背景按状态绑定，art/focus/reel geometry 保持项目共享

第一版不复制整套 layout。一个项目继续只有一份：

```text
adaptation art size / focus
main reel rows / columns / cell / gap / placement / order
scene node library and per-variant placement
```

每个 mode 新增 active variant 到 background node 的精确映射。这样可以让不同状态使用：

- 同一个 stateful Spine background node 的不同稳定状态；
- 不同 image background node；
- 不同 single-loop Spine background node；
- 不同 stateful Spine background node。

严格规则：

- 每个 mode 必须为当前 adaptation 的每个 active variant 恰好绑定一个 background node。
- background node 必须存在，并在对应 variant 有 placement；image 尺寸、Spine resource/animation 继续走现有严格校验。
- 被任意 mode 声明为 background 的 node 是 background-only node，不能同时作为普通 layer；outline 必须按当前 mode 标识激活背景和其它候选背景。
- `adaptation.backgroundNode` 或 orientation variant 的 `backgroundNode` 继续作为 initial mode 的 bootstrap
  background，必须与 initial mode 的映射逐项一致；不得形成第二个可独立编辑的值。
- art size、focus 和 reel geometry 在同一 variant 的所有 mode 间共享。不同背景素材必须服从同一 art-space 合同；
  不因素材尺寸不同自动改 art、缩放或 placement。
- inactive background node 必须 `visible=false` 且 `renderable=false`，不能只用 alpha 0 留下交互或渲染开销。

### 4.4 背景切换动画只复用显式 state-machine transition

当来源和目标 mode 的某个 variant 使用同一个 stateful Spine background node，且目标稳定 state 不同时：

```text
BG mode: nodeStates.bg = BG
FG mode: nodeStates.bg = FG
bg node transition: BG -> FG = BG_FG
bg node transition: FG -> BG = FG_BG
```

`requestGameMode("FG")` 必须在同一 preflight 中确认 `BG -> FG` 的直接有向 transition 存在，随后真实播放
`BG_FG once`，完成边界进入 `FG loop`，最后提交 stable mode。反向同理。

如果两个 mode 使用不同 background node，第一版在全部其它 shared stateful node transition 完成的提交边界做原子显隐切换；
UI 必须显示“直接切换（无跨资源动画）”。不得自动 cross-fade、猜 `BG_FG` 文件名、播放第一段 animation、截取静态首帧
或回退到图片。需要动画的背景必须建模为同一 stateful Spine node 的显式稳定状态与有向 transition。

低层 `requestNodeState()` 可保留给测试/诊断，但主 preview UI 只把 `requestGameMode()` 作为产品级状态切换入口，
避免用户绕过 mode binding 造成画面与 selected mode 不一致。

### 4.5 Symbols 改为 dependency library + per-mode binding

editor draft 固定为以下职责分离，字段名可以按仓库命名风格微调：

```ts
interface EditorSymbolDependency {
  readonly id: string; // 等于 nested symbol package id
  readonly files: ReadonlyMap<string, Uint8Array>;
}

interface EditorModeSymbolBinding {
  readonly packageId: string;
  readonly reelSet: string;
  readonly renderMode: "standard" | "grid-cell";
}

interface EditorGameModeDraft {
  id: string;
  backgroundNodes: Partial<Record<SceneLayoutVariantId, string>>;
  nodeStates: Record<string, string>;
  symbols: EditorModeSymbolBinding | null;
  awardCelebrationPopupId: string | null;
}
```

规则：

- `EditorProject.symbolDependencies` 使用 Map；相同 package id 普通导入失败，替换必须显式操作且原子保留 mode 引用。
- dependency 只拥有 validated files；`reelSet`、`renderMode` 属于 mode binding，因此同一 package 可被不同 mode 选择不同 reel set。
- 绑定时必须严格验证 package cell size 等于共享 main reel cell size、reel count 等于 columns、公开轮带只含 display symbols。
- 绑定的 symbols dependency 必须随 layout ZIP 导出；取消“includeInExport”这种可能产生“已绑定但 production 缺资源”的双重开关。
- 未被任何 mode 引用的 dependency 可以留在 editor library，但不进入 production manifest / ZIP，并在 UI 标记“未引用，不会导出”。
- mode 显式允许 `symbols=null`；preview 显示空 main reel，production 新 API 不得猜其它 mode 的 package。
- otherScene/value mapping 与随机 sampled scene 继续只是 preview session state，不写入 manifest/ZIP。
- 随机预览继续只使用 package 内本地公开轮带和 Web Crypto，不读取服务器真实轮带、不用 `Math.random()`。

### 4.6 BigWin Tab 只配置 strict `award-celebration` popup

本任务中的“BigWin 动画”明确指现有 Popup Editor 导出的 strict `award-celebration` popup package，
继续复用 `packages/rendercore/popup` 的 tier、金额、image/image-string/VNI/official Spine、点击、dismiss 和 drain 生命周期。

BigWin Tab 必须提供：

- dependency 列表、导入、显式替换、受引用保护的删除；
- 当前 mode 的“无 / popup id”显式绑定；
- 当前 dependency 每个 active variant 相对 viewport center 的 root `x/y/scale`；
- `betAmountRaw=100`、`winAmountRaw=6000` 默认 preview 输入；
- `开始 / 重新播放`、`Advance`、`立即清理` 和 production snapshot；
- “内部 tier、layer、金额格式请回 Popup Editor 修改”的明确边界提示。

同一 popup 被多个 mode 共享时，package bytes 与 placement 只保存一份。未引用 popup 不导出。不得把
`assets/**/win-amount` standalone manifest 暗中当成 popup，不得在 Game Layout Editor 复制 popup 算法或增加字体/占位图 fallback。

### 4.7 预览状态选择与切换

右侧 preview toolbar 增加独立的“预览状态” `<select>` 和“切换到该状态”按钮：

- 编辑状态 selector 决定当前左侧 Inspector；预览状态 selector 表示 production runtime 当前/目标状态，两者不得靠 DOM 值暗中同步。
- 提供显式“跟随编辑状态”开关，默认开启。开启时选择另一个编辑状态会请求 preview runtime 切换；关闭时只切左侧配置。
- transition 期间禁用重复 mode 请求、项目替换和 BigWin start；显示 `stableMode`、`targetMode`、`phase`。
- popup active 时状态切换继续明确失败；UI 应先允许用户 Advance/dismiss，而不是自动清理 popup。
- mode 切换如果 symbols binding 不变，保留当前 sampled scene，不重新随机。
- mode 切换如果 symbols binding 改变，preview 必须在 mutation 前从目标 package 的公开轮带生成并校验目标 scene；
  transition 完成的提交边界才替换 reel presentation。
- 目标 mode 无 symbols 时，提交边界移除 reel presentation，但 reel guide 仍按共享 geometry 显示。
- 切换完成后 BigWin 按 production runtime 当前 stable mode 取 binding，不按左侧 selector 或最近选择的 dependency 猜测。

### 4.8 分辨率改为下拉选择

`PREVIEW_SIZE_PRESETS` 继续是唯一预设表，但 UI 改为：

```text
分辨率 [1920×1080 ▼]  宽 [1920] 高 [1080]
```

- 下拉包含当前四个预设和“自定义”。
- 选择预设时一次性提交 width/height 并更新 preview。
- 手工修改任一宽高后：若精确匹配预设则选中该预设，否则选中“自定义”。
- 不保留旧的 preset buttons，不重复维护第二份 label/size 表。
- resize handle 改变页面尺寸时也必须同步下拉状态。
- preview size、zoom、guide 开关继续是 session state，不进入 production manifest。

### 4.9 新建项目改为单按钮 + 对话框

顶部固定为：

```text
[新建项目] [导入 ZIP] [导出 ZIP]
```

点击“新建项目”打开原生 `<dialog>`；内容至少包括：

- `单背景适配（maximized-focus）`；
- `横竖双背景适配（orientation-focus）`；
- “创建”与“取消”。

打开 dialog 不修改项目。只有点击“创建”才调用 `createNewEditorProject(mode)`、清理旧 preview/session dependency owner、
重置编辑状态与预览状态并关闭 dialog。取消、Escape 或 backdrop close 均保持当前项目完全不变。

不得保留两个隐藏的新建按钮作为业务入口，也不得根据页面方向、已导入图片数量或上一次项目自动选择 adaptation。

### 4.10 折叠区展开状态是 editor session state

`EditorUiSession` 增加稳定的 Inspector section state，例如：

```ts
expandedInspectorSections: Set<string>;
```

key 必须绑定稳定语义而不是 DOM index，例如：

```text
layout:reel:main:advanced
layout:background:default:focus
layout:background:landscape:focus
layout:background:portrait:focus
```

所有受 store 重绘影响的 `<details>`：

- render 时从 session state 写入 `open`；
- `toggle` 时更新 session state；
- 修改内部任意字段、preview refresh、validation error 更新和不相关 store transaction 后保持原 open 状态；
- 切换 selection 后按各对象自己的 key 恢复，不把 main reel 的展开状态错误套到 background；
- 新建/导入项目时按明确 session reset 规则清空，而不是沿用旧项目状态。

现有 scroll restoration 和 focus token 逻辑必须覆盖新增 Tab 与 state-scoped controls。对数值字段重绘后应恢复同一
`data-number` 控件和 selection range（若该 input 仍存在）；不得为了避免重绘而绕过 store transaction 或直接修改 Pixi/DOM
成为第二数据源。

## 5. Scene-layout manifest v1 扩展合同

继续使用：

```json
{ "version": 1, "kind": "scene-layout" }
```

这是向后兼容扩展，不新增 v2 或平行 `game-state-layout.json`。新导出物使用 plural symbols library：

```ts
interface SceneLayoutGameMode {
  readonly id: string;
  readonly backgroundNodes: Readonly<
    Partial<Record<SceneLayoutVariantId, string>>
  >;
  readonly nodeStates: Readonly<Record<string, string>>;
  readonly symbolPackage?: string;
  readonly awardCelebrationPopup?: string;
}

interface SceneLayoutManifestV1 {
  // existing fields
  readonly symbolPackages?: Readonly<
    Record<string, SceneLayoutSymbolPackageBinding>
  >;
  readonly gameModes?: SceneLayoutGameModes;
}
```

manifest 示例：

```json
{
  "version": 1,
  "kind": "scene-layout",
  "id": "game003",
  "adaptation": {
    "mode": "maximized-focus",
    "artSize": { "width": 2000, "height": 2000 },
    "focusRect": { "x": 580, "y": 277, "width": 840, "height": 1200 },
    "backgroundNode": "background"
  },
  "nodes": [
    {
      "id": "background",
      "order": 0,
      "resource": {
        "kind": "spine",
        "skeleton": "assets/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json",
        "atlas": "assets/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.atlas",
        "textures": {
          "BG.png": "assets/cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc.webp"
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
      },
      "placements": { "default": { "x": 1000, "y": 1000, "scale": 1 } }
    }
  ],
  "reels": {
    "main": {
      "order": 1,
      "columns": 5,
      "rows": 5,
      "cellSize": { "width": 160, "height": 160 },
      "gap": { "x": 0, "y": 0 },
      "placements": { "default": { "x": 600, "y": 600 } }
    }
  },
  "symbolPackages": {
    "base-symbols": {
      "manifest": "dependencies/symbols/base-symbols/symbols.package.json",
      "reel": "main",
      "reelSet": "bg-reel01",
      "renderMode": "grid-cell"
    },
    "free-symbols": {
      "manifest": "dependencies/symbols/free-symbols/symbols.package.json",
      "reel": "main",
      "reelSet": "fg-reel01",
      "renderMode": "grid-cell"
    }
  },
  "popups": {
    "base-bigwin": {
      "type": "award-celebration",
      "manifest": "dependencies/popups/base-bigwin/popup.manifest.json",
      "placements": { "default": { "x": 0, "y": 0, "scale": 1 } }
    },
    "free-bigwin": {
      "type": "award-celebration",
      "manifest": "dependencies/popups/free-bigwin/popup.manifest.json",
      "placements": { "default": { "x": 0, "y": -30, "scale": 0.9 } }
    }
  },
  "gameModes": {
    "initialMode": "BG",
    "modes": [
      {
        "id": "BG",
        "backgroundNodes": { "default": "background" },
        "nodeStates": { "background": "BG" },
        "symbolPackage": "base-symbols",
        "awardCelebrationPopup": "base-bigwin"
      },
      {
        "id": "FG",
        "backgroundNodes": { "default": "background" },
        "nodeStates": { "background": "FG" },
        "symbolPackage": "free-symbols",
        "awardCelebrationPopup": "free-bigwin"
      }
    ]
  }
}
```

示例中的 hash 和资源内容仅说明结构；自动化 fixture 必须构造真实合法的 exact closure，不得把示例当成可运行 package。

严格 parser 规则：

- 根对象继续递归拒绝 unknown key。
- 新 manifest 不同时写 legacy singular `symbolPackage` 与 plural `symbolPackages`。
- `symbolPackages` key 是 lowercase package id，必须等于 nested `symbols.package.json.id`；binding manifest path 固定为
  `dependencies/symbols/<id>/symbols.package.json`。
- 每个 mode 的 `symbolPackage` 必须引用已声明 binding；没有引用的 production binding 是 orphan，拒绝。
- mode `backgroundNodes` 的 key 集必须恰好等于 adaptation active variants；node 引用、placement、background-only 约束严格校验。
- initial mode `backgroundNodes` 必须逐项等于 adaptation bootstrap background；initial mode 的 node state 必须等于对应
  state machine initial state。
- 每个 mode 的 `nodeStates` 必须覆盖该 mode 所有 active stateful background node，以及所有非 background 的共享 stateful node；
  不属于该 mode 的候选 background stateful node 必须省略，避免切换隐藏 node。
- mode 切换时，同一 active stateful node 的目标 state 必须有直接有向 transition；不同 background node 走明确的无动画显隐切换。
- popup 引用和 orphan 规则保持任务 111 的严格语义。

## 6. 旧产物兼容与 editor migration

### 6.1 Production parser/runtime 兼容

- 继续接受没有 `gameModes` 的既有 scene-layout v1，低层 API 行为不变；新 mode API 仍明确失败。
- 继续接受 legacy singular `symbolPackage`，其 package resource/runtime 行为保持不变。
- legacy manifest 有 `gameModes` + singular `symbolPackage` 时，production 语义仍是所有 mode 共用该 package。
- production parser 不凭 `BaseGame`、第一项 mode、唯一 background 或唯一 dependency 补全新字段。

### 6.2 Game Layout Editor 导入 migration

Editor 导入后统一升级到新 draft：

1. 没有 `gameModes`：创建显式 `BaseGame`；background 取 adaptation 已声明的 node；stateful target 只从资源
   `initialState` 复制。
2. 旧 mode 没有 `backgroundNodes`：每个 mode 逐 variant 复制 adaptation 明确声明的 background node；不从 node id、
   文件名或 animation 名猜背景。
3. legacy singular `symbolPackage`：导入为一项 dependency，并给所有 mode 建立相同 package/reelSet/renderMode binding，
   保持“旧 package 全局生效”的原义。
4. 旧 popup mode binding 原样保留。
5. UI 显示一次“旧 layout 已升级；再次导出将使用 mode background + plural symbols bindings”的非阻塞说明。

重新导出只写新 canonical 形式。round-trip 测试必须覆盖 legacy import -> canonical export -> canonical reimport；不得同时保留
singular/plural 双写，不得静默丢弃 bytes。

## 7. RenderCore package resource 与 runtime 扩展

### 7.1 精确闭包和资源 owner

- `collectSceneLayoutPackagePaths()` 从 mode 的 symbols / popup 引用集合派生 dependency closure；每个被引用 dependency vendor 一次。
- `SceneLayoutPackageResource.symbolPackage` legacy 字段为兼容可保留；canonical 路径新增只读
  `symbolPackages: Readonly<Record<string, SymbolPackageResource>>`。
- create/prepare 任一 nested dependency 失败时销毁此前创建的全部 resource，不能留下 Blob URL、Pixi texture 或 Spine player。
- ZIP exact equality 继续拒绝缺文件、多余文件、orphan directory、大小写 alias、非法 path、collision 和错误 nested id。

### 7.2 Mode runtime 和 symbols 切换

`requestGameMode` 扩展为显式接收目标 reel 输入：

```ts
requestGameMode(
  modeId: string,
  options?: {
    readonly reels?: Readonly<
      Partial<Record<"main", SceneLayoutInitialReelScene>>
    >;
  },
): Promise<void>;
```

规则：

- target mode 与当前 mode 使用同一 symbols binding 时禁止多余 target reel input，并保留现有 presentation/scene。
- binding 改变且 target 有 symbols 时，`reels.main` 必填；在任何 node transition 或 visibility mutation 前，用目标 package
  严格验证 scene、local phase、presentation values、geometry 和 display symbol。
- target 无 symbols 时禁止 `reels.main` input。
- 目标 catalog/player/reel 必须在 mutation 前成功 prepare；失败时当前 mode、背景、reel 和 popup 完全不变。
- 完成 preflight 后，并行启动所有仍 active 的 shared stateful node transition；同一背景 node 的 BG/FG transition 属于其中之一。
- transition 完成提交边界：切换不同 background node 的 visibility、替换或移除 reel、更新 stable mode；随后 resolve。
- 旧 reel 只在新 reel 已挂入且 stable mode 已提交后 destroy。destroy 中断时所有 pending Promise 必须 reject 并完整释放双方资源。
- transition 期间 `phase=transitioning`，重复 mode 请求失败；popup active 时继续失败。
- `resetReelScene("main", input)` 总是使用当前 stable mode 的 active symbols binding；无 active binding 时明确失败。
- snapshot 至少增加当前/目标 symbols binding id 和 active background node ids，便于 editor/game 诊断，不暴露 Pixi child。

`init()` 对 canonical multi-mode manifest 使用 initial mode binding；initial mode 有 symbols 时必须提供 `reels.main`，无 symbols 时禁止提供。
legacy singular manifest 保持原 API 语义。

### 7.3 Background visibility

- scene runtime 初始化所有 node resource，但 package runtime 根据 initial mode 设置 background visibility。
- mode-owned background visibility 必须通过 rendercore public/internal API 管理，Game Layout Editor 不直接操作 Pixi child。
- viewport/variant 切换后只显示当前 stable mode 在新 variant 绑定的 background；transition 中保持来源背景直到提交边界。
- 普通 layer、reel、popup order 继续按现有 production 合同；inactive background 不得影响 order 计算或命中。

## 8. Editor model、UI 与 preview 实施步骤

按以下顺序实施，每一步都先补 direct model/parser 测试，再接 UI；不得先在 `app-shell.ts` 写临时对象绕过 model。

### 阶段 A：建立基线与最小回归

1. 记录 git/toolchain，运行 Game Layout Editor 与 RenderCore 当前 test/typecheck，确认基线。
2. 为当前折叠 bug 写失败回归：展开 main reel advanced，修改 cell/gap/placement，多次 store render 后仍 open。
3. 为当前 UI 写结构基线，确认旧 Symbols/Popup drawers、四个 preset buttons 和双新建按钮是本任务将移除的入口。

### 阶段 B：扩展 strict scene-layout schema

1. 在 `packages/rendercore/src/scene-layout/types.ts` 增加 mode background 和 plural symbol binding 类型。
2. 扩展 parser、exact closure、package resource 和 validator；覆盖 canonical、legacy、unknown/orphan/missing/collision。
3. 扩展 runtime 的 background visibility、mode preflight、symbols prepare/swap 和 snapshot。
4. 保持 legacy singular package 测试通过；新增 canonical multi-mode tests。

### 阶段 C：重构 editor typed draft 与 commands

1. 把 singular `symbolDependency` 改为 Map library，把 reelSet/renderMode 移入 mode binding。
2. 给 mode 增加 per-variant background binding；补 add/rename/delete/rebind/replace commands。
3. 更新 clone、store transaction、validation、manifest conversion 和 legacy migration；所有 `Uint8Array` 深拷贝合同保持不变。
4. 删除 `includeInExport`；export 只从 mode 引用集合派生 dependency。
5. 任一 replace/delete/bind 失败必须保持旧 project、files、selection 和 preview resource 完全不变。

### 阶段 D：重建工作区信息架构

1. `WorkspaceTab` 扩展为 `assets | layout | symbols | bigwin | project`。
2. 新增稳定的 state bar 与状态管理 dialog；移除右侧临时 game-mode/popup `<details>`。
3. 新建 `symbols-workspace.ts`、`bigwin-workspace.ts` 等窄 markup module，避免继续扩大单体 `shellMarkup()`。
4. Layout outline / Inspector 按当前 mode 显示 background binding、state target 和 transition readiness。
5. Symbols Tab 接入 library、per-mode binding、preview randomization、otherScene controls 和 metadata。
6. BigWin Tab 接入 dependency library、per-mode binding、placement、play/advance/dismiss 和 snapshot。
7. Resource Picker 的“设为背景”必须作用于当前 mode + variant，并清楚显示目标；不能改其它 mode。
8. Project Tab 增加每个 mode 的 background/symbol/popup readiness 表与 export closure 摘要。

### 阶段 E：修复 session state 和 preview toolbar

1. 实现 `expandedInspectorSections`，所有 `<details>` 用稳定 key round-trip。
2. 扩充 scroll/focus token 到 Symbols、BigWin、状态 dialog 和新增 select；输入重绘恢复 selection range。
3. 把预设按钮替换为单个 resolution select；resize handle 与自定义输入双向同步。
4. 把双新建按钮替换为单按钮与 adaptation dialog；覆盖 cancel/confirm/reset ownership。
5. 右侧新增 preview mode selector、follow toggle、transition button/diagnostic；不再暴露产品级低层 node-state buttons。

### 阶段 F：ZIP、文档与清理

1. 更新 import/export，多 symbols dependency deterministic vendor 和 legacy canonical migration。
2. 更新 `docs/scene-layout-manifest.md`、`apps/gamelayouteditor/README.md` 与相关 public JSDoc。
3. 更新 `agents.md` 长期 ownership：mode 拥有 background/symbol/popup binding；RenderCore 拥有 mode-aware visibility、atomic transition、
   active symbol package swap 和 exact closure。删除已经过时的 singular symbols 表述。
4. 删除旧 drawer CSS、旧 query selector、`symbolsDrawerOpen`、dead handlers 和重复文案；不得留下隐藏兼容 UI。

## 9. 测试与验收矩阵

### 9.1 RenderCore direct tests

至少覆盖：

- plural symbol packages parse、deep freeze、collect paths、nested id、missing/more/orphan files；
- legacy singular manifest 保持合法，singular + plural 同时出现失败；
- mode background variants exact coverage、unknown node、missing placement、background-only 冲突；
- initial mode background 与 adaptation 不一致失败；
- same stateful background `BG -> BG_FG once -> FG loop` 和反向真实完成边界；
- 缺直接 transition 在任何 mutation 前失败；
- different background nodes 在提交边界原子显隐，不产生两个同时可见的稳定帧；
- mode A/B 共享 symbols binding 时不重建、不随机、不 replay；
- mode A/B 使用不同 symbols binding 时 target input 必填、先验证、完成后 swap、旧 reel destroy；
- invalid target scene/package/phase 时 source mode/reel/background 完全不变；
- target 无 symbols 时移除 reel，错误提供 input 失败；
- popup active、transition in-flight、unknown mode、destroy in-flight 明确失败并 drain；
- viewport variant 变化后当前 mode background 与 popup placement 正确。

### 9.2 Game Layout Editor model/IO tests

至少覆盖：

- 新项目的 BaseGame、active variants background placeholder、空 symbols/BigWin binding；
- mode add/rename/delete/initial 的完整引用更新和失败原子性；
- background resource 绑定只影响当前 mode/variant；
- symbol library import/replace/delete/reference protection；
- 同 package 不同 mode 选择不同 compatible reelSet；
- 不兼容 cell size/reel count/display symbol 拒绝且 project 不变；
- popup library 与 mode binding 保持现有 strict tests；
- 两 mode 共用一份 symbols/popup 只 vendor 一份；使用不同依赖分别 vendor；未引用 library item 排除；
- deterministic export 两次 bytes 完全一致；canonical reimport 后 project/files/placements/bindings 无损；
- legacy no-gameModes、legacy mode、legacy singular symbols 的 canonical migration；
- ZIP extra/missing/path/collision/unknown key/nested id 全部显式失败。

### 9.3 UI / session tests

至少覆盖：

- Tab 固定为五项且 ARIA keyboard navigation 顺序正确；右侧不再存在 Symbols/Popup drawer；
- outer state selector 切换后 Layout/Symbols/BigWin 显示各自值，Resources/Project 不复制；
- 状态管理 dialog 的 add/rename/delete/set-initial 和 cancel 无 mutation；
- main reel advanced 展开后依次修改 `cellWidth`、`gapX`、两个 variant placement，始终保持 open、scroll 和 focus；
- background advanced focus 同样保持 open，selection 间展开状态不串；
- resolution 下拉选择四个预设、自定义输入、resize handle 回写；页面中不存在旧 preset buttons；
- 新建项目只有一个入口，dialog 取消保持旧项目，两个 adaptation 确认分别创建正确 draft；
- Symbols Tab import/select/randomize/bind/replace/delete；切 mode 不串 scene/binding；
- BigWin Tab import/bind/placement/play/advance/dismiss；只按 runtime stable mode 播放；
- transition 期间和 popup active 时按钮 disabled/错误信息与 production 状态一致；
- async stale symbol/popup/layout prepare 不覆盖较新的项目或 mode selection；destroy 后不更新 DOM。

### 9.4 浏览器人工验收

自动化通过后至少执行一次真实浏览器验收：

1. “新建项目”选择单背景；创建 `BG`、`FG` 两个状态。
2. 导入一份包含 `BG`、`FG`、`BG_FG`、`FG_BG` 的真实 official Spine 4.3 背景，配置稳定状态和有向 transition。
3. 在 BG/FG 分别绑定背景稳定 state；预览双向切换，确认 once transition 完整播放后才进入目标 loop。
4. 导入两个 strict symbols package，分别绑定 BG/FG；确认状态切换后 symbol 资源、reelSet 和随机 preview 对应目标状态。
5. 导入一个或两个 Popup Editor strict BigWin ZIP，分别绑定状态并播放/Advance/dismiss。
6. 展开 main reel advanced，连续修改 cell、gap、default placement，确认不收起、不跳滚动。
7. 用分辨率下拉切换四个预设，再输入自定义宽高；确认 select 状态正确。
8. 导出 layout ZIP，刷新页面后重新导入；重复状态切换、Symbols 和 BigWin preview，确认无损。
9. 再建横竖双背景项目，确认 landscape/portrait 的 state background 与 popup placement 分开、resolution/variant 切换正确。

人工验收使用的素材路径、package id、浏览器、dev URL、操作结果和截图说明写入任务报告。若仓库没有可合法组成某一步的真实素材，
报告必须明确缺什么和已完成哪些自动化替代验证，不能用伪造 fallback 宣称通过。

## 10. 执行命令与环境规则

### 10.1 Node / pnpm

仓库要求 Node `>=24.0.0`，package manager 为现有 pnpm。执行开始先运行：

```bash
git branch --show-current
git rev-parse --short HEAD
git status --short
node --version
pnpm --version
```

如果 shell 中没有 `node`，使用现有 nvm：

```bash
nvm use 24
```

之后在同一个 shell / PATH 中统一使用这套 Node 与它自带的 pnpm。不要强制安装或切换另一个 Node/pnpm 版本，
不要修改 `engines`、`packageManager`、lockfile 或测试配置来绕过环境问题。

### 10.2 依赖下载与代理

没有依赖变化时不要无意义运行 install。确需下载且正常下载失败时，在同一 shell 先执行：

```bash
export http_proxy=http://127.0.0.1:1087
export https_proxy=http://127.0.0.1:1087
```

然后重试原 pnpm 命令。不得把代理写入源码、`.npmrc`、package script、shell profile 或任务产物。

### 10.3 建议验证顺序

先 scoped，后 root：

```bash
pnpm --filter @slotclientengine/rendercore test
pnpm --filter gamelayouteditor test
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter gamelayouteditor typecheck
pnpm --filter @slotclientengine/rendercore lint
pnpm --filter gamelayouteditor lint
pnpm --filter @slotclientengine/rendercore build
pnpm --filter gamelayouteditor build
pnpm --filter @slotclientengine/rendercore format:check
pnpm --filter gamelayouteditor format:check
```

再运行：

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm format:check
pnpm test
git diff --check
```

如果全仓测试资源压力导致异常，允许按 turbo package 串行运行以定位，但最终报告必须列出实际命令和结果，不能只写“应该通过”。

测试若因为旧断言锁定了本任务明确废弃的 UI（双新建按钮、preset buttons、Symbols/Popup drawer、singular symbols binding），
应按新合同修改测试。不得为了保住错误测试而在 production 留隐藏按钮、重复字段、alias、fallback 或 unreachable 兼容分支。
反之，测试暴露真实 production 逻辑错误时必须修 production；不能一概删测试。

## 11. 明确禁止事项

- 不在 `apps/gamelayouteditor` 复制 Pixi reel、symbol manifest、Spine track completion、popup tier 或 image-string glyph 算法。
- 不硬编码 `BG`、`FG`、`BaseGame`、`FreeGame`、具体 symbol、reel set、popup id 或游戏组件名。
- 不从文件名、数组第一项、唯一 dependency、当前 DOM selection 或历史状态猜 binding。
- 不增加静态首帧、默认 animation、placeholder image、字体、自动 cross-fade、自动选 reel set 等兜底。
- 不把 editor selection、details open、preview size/zoom、sampled scene、otherScene preview、token、cookie、服务器 scene 或真实轮带写进 ZIP。
- 不让 app 直接操作 Pixi child visibility 来实现 production mode background；该能力归 rendercore scene-layout runtime。
- 不为了通过测试放宽 strict parser、保留新旧双写、吞掉 Promise rejection 或跳过 exact closure。
- 不手改生成文件；本任务当前不预期修改 `game-static.generated.ts` / `game-loading.generated.ts`。若实施中确有 YAML 变更，必须走生成器和 `--check`。

## 12. 完成定义

以下条件全部满足才算完成：

1. 五个 Tab、outer 主状态、resolution select、新建 dialog 和 details bug 修复均落地，旧入口和 dead CSS/handler 已删除。
2. 每个 mode 可以独立绑定 background、symbols 与 BigWin；共享依赖不复制，缺绑定不猜测。
3. 同一 stateful background 的 BG/FG 有向 transition 在 editor preview 与 production runtime 使用同一真实实现。
4. 多 symbols package 的 manifest、resource、runtime、ZIP import/export 和 deterministic round-trip 完成；legacy singular 仍可读并可 canonical migration。
5. strict parser、exact closure、async rollback、destroy、Blob/resource owner 没有退化或泄漏。
6. scoped 与 root test/typecheck/lint/build/format、`git diff --check` 全部通过，或任务报告逐项记录经证实的外部 blocker；
   不能把未运行写成通过。
7. `apps/gamelayouteditor/README.md`、`docs/scene-layout-manifest.md`、public JSDoc 与实现一致。
8. 因本任务改变长期 ownership 和 singular symbols 约束，`agents.md` 已同步更新并删除过时描述。
9. 已写中文任务报告：

```text
tasks/112-gamelayouteditor-state-workspaces-[utctime].md
```

报告至少包含：起止 branch/HEAD/status、Node/pnpm、是否使用代理、修改文件、schema/API/migration、关键 UI 决策、
测试命令与精确结果、人工验收、未完成项/已知风险、`agents.md` 是否更新及原因。报告时间必须取 UTC 实际完成时间，
不得预填、复用计划制定时间或使用本地时区冒充 UTC。
