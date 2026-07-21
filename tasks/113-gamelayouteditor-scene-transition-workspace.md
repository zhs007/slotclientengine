# Game Layout Editor Scene Transition Workspace 任务计划

## 1. 任务目标

本任务更新现有纯前端应用：

```text
apps/gamelayouteditor
```

并同步扩展：

```text
packages/rendercore/src/scene-layout/**
packages/rendercore/src/spine/**
```

任务完成后，布局配置人员必须能够先按现有主状态工作流分别完成 BG、FG 等稳定场景的背景、
Symbols、BigWin 和布局配置，再在独立的“转场”Tab 中配置有向场景转场。例如：

```text
BG -> FG: 播放顶层 Spine animation BG_FG
FG -> BG: 播放顶层 Spine animation FG_BG
```

每个转场 animation 必须声明一个真实存在、大小写精确、且在该 animation 时间轴中恰好出现一次的
Spine event。production runtime 请求切换主状态时必须执行以下唯一流程：

```text
完整预校验并准备目标场景
  -> 在当前场景最上层启动 transition Spine once
  -> event 前继续显示来源场景
  -> event 触发边界原子切换下层完整场景
  -> transition Spine 继续覆盖在目标场景上播放
  -> once 完成后移除 overlay，并完成 requestGameMode()
```

这里的“原子切换下层完整场景”至少包括 mode-aware 背景显隐、Symbols reel 的保留/替换/移除、
当前 displayed mode 和后续 BigWin binding 归属；不得只换一张背景而让 reel 或 mode 状态滞后。

旧的“同一个背景 Spine node 内配置 BG/FG 稳定状态，再播放 node state-machine transition，动画完成后
切到目标 loop”不再属于 Game Layout Editor 的产品能力。本任务必须从编辑器、preview 和
`SceneLayoutPackageRuntime.requestGameMode()` 主流程中移除旧方式，不保留隐藏入口、自动迁移、文件名猜测
或运行时 fallback。底层通用 scene-layout Spine state-machine 若仍有独立低层 consumer，可以保留其 parser/runtime，
但不得再被 Game Layout Editor 生成，也不得参与 game-mode transition。

本文件是完整实施合同。执行者不得依赖聊天记录、任务 107、111、112、历史报告或口头说明补齐行为；
可以阅读现有代码了解基线，但 schema、生命周期、失败策略、实施顺序、测试、验收和交付物均以本文件为准。

任务完成后必须新增中文任务报告：

```text
tasks/113-gamelayouteditor-scene-transition-workspace-[utctime].md
```

UTC 时间戳必须使用：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/113-gamelayouteditor-scene-transition-workspace-260401-181300.md
```

## 2. 制定计划时的仓库基线

制定本计划时现场为：

```text
repository: /Users/zerro/github.com/slotclientengine
branch:     main
HEAD:       ca4e626
status:     clean
date:       2026-07-21 (Asia/Shanghai)
```

实施开始时必须重新记录：

```bash
git branch --show-current
git rev-parse --short HEAD
git status --short
node --version
pnpm --version
```

上述 hash 只说明计划制定基线，不得用它覆盖用户后续修改。工作区中的既有修改和 untracked 文件都视为
用户输入；禁止 `git reset --hard`、`git checkout --`、自动 stash、`git clean` 或无关批量 format。

仓库要求 Node.js `>=24.0.0`，包管理器为 pnpm。若当前 shell 中没有 `node`，执行：

```bash
nvm use 24
```

之后统一使用这套环境自带的 `node`、`pnpm`，不要强制安装、升级、降级或改写仓库版本约束。

若依赖下载失败，先在当前 shell 执行用户指定代理后重试原命令：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

不要因为网络失败删除 lockfile、切换包管理器、放宽依赖版本或把下载产物手工塞进仓库。

实施时至少重新阅读：

```text
AGENTS.md
apps/gamelayouteditor/README.md
apps/gamelayouteditor/package.json
apps/gamelayouteditor/src/model/editor-project.ts
apps/gamelayouteditor/src/model/editor-resource.ts
apps/gamelayouteditor/src/model/editor-store.ts
apps/gamelayouteditor/src/model/game-mode-commands.ts
apps/gamelayouteditor/src/model/resource-commands.ts
apps/gamelayouteditor/src/model/validation.ts
apps/gamelayouteditor/src/io/imported-layout-zip.ts
apps/gamelayouteditor/src/io/exported-layout-zip.ts
apps/gamelayouteditor/src/preview/layout-preview.ts
apps/gamelayouteditor/src/ui/app-shell.ts
apps/gamelayouteditor/src/ui/ui-session.ts
apps/gamelayouteditor/src/ui/layout-workspace.ts
apps/gamelayouteditor/src/ui/project-workspace.ts
apps/gamelayouteditor/src/styles.css
apps/gamelayouteditor/tests/**
packages/rendercore/src/spine/runtime-player.ts
packages/rendercore/src/spine/state-controller.ts
packages/rendercore/src/scene-layout/**
packages/rendercore/tests/scene-layout/**
docs/scene-layout-manifest.md
```

## 3. 当前能力与确认缺口

### 3.1 必须复用的现有能力

- Game Layout Editor 已有最外层主状态 selector；每个 mode 已显式绑定 active variant 背景、Symbols package
  和 strict `award-celebration` BigWin popup。
- 左侧当前有 `资源 | 布局 | Symbols | BigWin | 项目` 五个工作区，右侧 preview 使用 production
  `SceneLayoutPackageRuntime` 请求 mode 切换。
- logical Spine resource 已拥有 official Spine 4.3 skeleton、atlas、全部 atlas page、animation name、完整
  SHA-256 content-addressed owned payload 和严格替换/删除生命周期。
- scene-layout package 已有 strict manifest、精确资源闭包、mode-aware background visibility、目标 Symbols
  reel 预准备/交换、相同 binding 保留、popup lifecycle、viewport adaptation 和逐帧 update。
- `RendercoreSpinePlayer` 已使用 official `@esotericsoftware/spine-pixi-v8` 4.3.x，能够报告 once completion 和
  loop boundary；不得新建第二套 Spine parser/player。
- layout ZIP 已支持 deterministic export、bounded import、exact closure、logical resource 重建和 strict
  round-trip。

### 3.2 当前实现与新需求的冲突

1. 现有 Layout Inspector 把 Spine node 切成 `loop | state-machine`，并在 state-machine 内维护稳定状态和
   有向 transition；这正是本任务要求移除的旧产品方式。
2. 相同 variant 的不同 mode 选择同一 Spine logical resource 时，现有命令会复用一个背景 node 并自动形成
   BG/FG state mapping；新需求要求各稳定场景继续独立布局，transition 是另一个固定顶层 overlay。
3. 当前 `requestGameMode()` 预校验 node transition，等待全部 node once 完成后才提交背景/reel/mode；它没有
   “动画中间 event 边界切场”的阶段。
4. `RendercoreSpinePlayer.update()` 只返回 `completed/loopCompleted`，没有把当前 track 的 Spine event 按真实
   触发顺序上报给 scene-layout。
5. 当前 manifest 没有 mode-to-mode overlay resource、animation、switch event 和 per-variant placement。
6. 当前 layout runtime 没有专用且不可被普通 node order 覆盖的 scene-transition 顶层容器。
7. editor Spine metadata 只记录 `animationNames`，无法在 UI 中只列出所选 animation 的真实 event，也无法
   在资源替换时确认切场 event 仍然存在且唯一。
8. 当前 snapshot 只有 `stableMode/targetMode/phase`，无法区分“overlay 正在 event 前播放”和“下层已经切到
   目标场景、overlay 仍在收尾”。

## 4. 产品与架构决定

### 4.1 稳定场景与转场 overlay 必须彻底分离

- BG、FG、Bonus 等 mode 继续通过当前 Layout、Symbols、BigWin 工作区分别配置稳定内容。
- 每个 mode/variant 的背景都是独立 background node。即使两个 mode 选择同一个 Spine logical resource，
  也只共享 resource bytes，不共享 playback node，不自动创建 state-machine。
- 稳定背景 Spine node 第一版只播放一个显式选择、大小写精确存在的 loop animation。
- 转场 overlay 不是普通 `SceneLayoutNode`，不出现在 Layout outline，不参与普通 node `order`，也不能作为
  background、named attachment 或业务 layer 使用。
- runtime 拥有专用 `scene-transition-overlay` 容器；它固定在 scene nodes、background、reel 和其它普通
  layout 内容之上。BigWin 在转场期间禁止启动，因此不需要用 popup 与 transition 争夺顶层顺序。
- overlay 使用与当前 scene 相同的 art-space、viewport transform 和 art clip。placement 坐标相对完整 art，
  不是 DOM page、frame focus 或 viewport center。

### 4.2 一条有向转场只使用一套 Spine 时间轴

每条 transition 固定包含：

```text
from mode id
to mode id
一个 official Spine 4.3 logical resource
一个 once animation
一个 switch event name
每个 active variant 的 x/y/scale placement
```

- `from` 与 `to` 必须引用已声明 mode，且不得相同。
- 同一 `from -> to` 最多一条；反向是另一条独立配置，不根据命名自动生成。
- transition graph 允许稀疏。没有显式有向边时，`requestGameMode(target)` 必须在任何 mutation 前失败；
  不得瞬切、反向复用、自动寻路、cross-fade、播放第一段 animation 或猜 `BG_FG`。
- 一条 transition 的所有 variant 复用同一 Spine resource、animation 和 event，只保存不同 placement。
  这样 orientation 在转场期间变化时可保留同一真实时间轴和 player，只更新 placement，不中途换素材或重播。
- orientation-focus 必须同时配置 `landscape`、`portrait` placement；maximized-focus 必须只配置 `default`。
- overlay 没有可编辑 order；“最上层”由 runtime 结构保证，不用极大 zIndex 或 magic number 模拟。

### 4.3 switch event 必须是 animation 内恰好一次的真实事件

- event name 大小写敏感，按 Spine skeleton/animation 的真实数据保存；不接受空字符串、控制字符、trim alias
  或文件名推断。
- editor 中 event 只能通过所选 animation 的真实 event 下拉框选择，不提供自由文本输入、prompt、可编辑
  combobox 或粘贴任意名称的入口。animation/resource 改变后，如果旧 event 不再是新 animation 的唯一合法
  occurrence，必须立即清空选择并要求用户重新下拉选择。
- selected animation 必须真实存在，并作为 once 播放。
- selected switch event 必须在该 animation 的 event timeline 中恰好出现一次。只在 skeleton 全局 event
  definitions 中存在、但没有放进该 animation 时间轴，仍视为缺失。
- 同名 event 在该 animation 出现零次或多次都必须在 editor validation、package prepare 和 production
  preflight 中失败，不能运行到一半再“取第一次”。
- event 的 int/float/string/audio payload 不参与切场语义；第一版只按 exact event name 识别。
- event 在 `time=0` 合法。player 必须缓存 `play()` 内 `update(0)` 产生的 event，直到下一次 runtime update
  被消费，不能丢失。
- 单次较大 delta 同时跨过 event 与 animation complete 时，必须按 official Spine listener 的真实顺序先提交
  event，再处理 complete；Promise 完成前目标场景必须已经提交。
- animation complete 时若从未收到 switch event，必须拒绝当前 transition，移除 overlay，并保持来源场景；
  不得在 completion 边界补切目标场景。

### 4.4 mode 切换的阶段和原子边界

`requestGameMode(target, options)` 必须遵循：

1. 验证 runtime ready、目标 mode、有向 transition、当前无 transition、当前无 active BigWin。
2. 验证输入规则。不同 Symbols binding 或显式 `recreateReel` 时，仍要求目标 `reels.main`；相同 binding
   不接受多余 target input；目标无 Symbols 不接受 reel input。
3. 在可见 mutation 前完成目标 SymbolCatalog、reel presentation、scene/value/local phase、overlay official
   Spine resource、animation、唯一 switch event 和 active variant placement 的全部 prepare。
4. 把 overlay player 挂到固定顶层并播放 once；event 前来源背景、reel 和 displayed mode 不变。
5. 收到唯一 switch event 的同一 update 边界，同步执行：目标背景 active 集合切换、目标 reel attach/swap/remove、
   `displayedMode=target`。该提交路径不得包含 await、资源加载或其它可失败异步工作。
6. event 后 overlay 继续处于最顶层，直到 once 真正 complete。
7. completion 边界移除/隐藏 overlay，提交 `stableMode=target`、清空 target/transition snapshot，并 resolve Promise。

相同 Symbols binding 继续保留同一个 reel/scene/player，event 边界不重建。不同 binding 的旧 reel 必须在 event
提交后才 detach/destroy；event 前即使 overlay 已播放，也仍是完整来源 scene。

失败语义：

- 预校验或 prepare 失败：来源场景完全不变，不显示 overlay，不泄漏目标 reel/player/texture owner。
- event 前 playback 异常：移除 overlay、销毁 prepared target，来源场景不变并 reject。
- event 后的提交必须设计成不可失败的同步操作；禁止把“提交一半后回滚”作为正常控制流。
- destroy 必须拒绝 pending Promise、销毁 overlay 与 prepared target；不得留下 listener、ticker 或 Pixi child。
- 重复请求、请求当前稳定 mode、popup active、缺边、未知 mode 的既有明确语义必须各有直接测试。

### 4.5 snapshot 必须表达 event 前后

扩展 `SceneLayoutGameModeSnapshot`，至少能无歧义表达：

```ts
interface SceneLayoutGameModeSnapshot {
  readonly stableMode: string;
  readonly displayedMode: string;
  readonly targetMode: string | null;
  readonly phase: "stable" | "transitioning";
  readonly transitionPhase: "before-switch" | "after-switch" | null;
  readonly transition: { readonly from: string; readonly to: string } | null;
  readonly stableSymbolPackage: string | null;
  readonly displayedSymbolPackage: string | null;
  readonly targetSymbolPackage: string | null;
  readonly activeBackgroundNodes: readonly string[];
}
```

- stable 时 `stableMode === displayedMode`、`targetMode/transition/transitionPhase` 为 `null`。
- event 前 `stableMode=from`、`displayedMode=from`、`transitionPhase=before-switch`。
- event 后、complete 前 `stableMode=from`、`displayedMode=to`、`transitionPhase=after-switch`。
- complete 后 `stableMode=displayedMode=to`。
- 字段名若因现有 public API 风格需要微调，必须保留上述可观察语义，不能只给 UI 一个模糊 boolean。

转场期间继续禁止 BigWin start 和第二个 mode request。BigWin 只能在 Promise resolve 后按新的 stable mode 绑定启动。

## 5. Scene-layout manifest 合同

### 5.1 继续使用 scene-layout v1 的严格扩展

继续使用：

```json
{ "version": 1, "kind": "scene-layout" }
```

在 `gameModes` 中新增 `transitions`，不新增平行 `transition.manifest.json` 或 editor-only runtime schema。
建议 TypeScript 合同：

```ts
interface SceneLayoutGameModeTransition {
  readonly from: string;
  readonly to: string;
  readonly overlay: {
    readonly resource: {
      readonly kind: "spine";
      readonly skeleton: string;
      readonly atlas: string;
      readonly textures: Readonly<Record<string, string>>;
    };
    readonly animation: string;
    readonly switchEvent: string;
    readonly placements: Readonly<
      Partial<Record<SceneLayoutVariantId, SceneLayoutNodePlacement>>
    >;
  };
}

interface SceneLayoutGameModes {
  readonly initialMode: string;
  readonly modes: readonly SceneLayoutGameMode[];
  readonly transitions: readonly SceneLayoutGameModeTransition[];
}
```

示例：

```json
{
  "version": 1,
  "kind": "scene-layout",
  "id": "game002",
  "adaptation": {
    "mode": "maximized-focus",
    "artSize": { "width": 2000, "height": 2000 },
    "focusRect": { "x": 580, "y": 277, "width": 840, "height": 1200 },
    "backgroundNode": "bg-base"
  },
  "nodes": [],
  "reels": {},
  "gameModes": {
    "initialMode": "BG",
    "modes": [
      {
        "id": "BG",
        "backgroundNodes": { "default": "bg-base" },
        "nodeStates": {}
      },
      {
        "id": "FG",
        "backgroundNodes": { "default": "bg-free" },
        "nodeStates": {}
      }
    ],
    "transitions": [
      {
        "from": "BG",
        "to": "FG",
        "overlay": {
          "resource": {
            "kind": "spine",
            "skeleton": "assets/<sha256>.json",
            "atlas": "assets/<sha256>.atlas",
            "textures": { "BG.png": "assets/<sha256>.webp" }
          },
          "animation": "BG_FG",
          "switchEvent": "SwitchScene",
          "placements": {
            "default": { "x": 1000, "y": 1000, "scale": 1 }
          }
        }
      }
    ]
  }
}
```

示例为字段形状说明，实施文档和测试 fixture 必须补齐合法 nodes/reels/resource，不能复制其中的省略内容当作
完整合法 package。

### 5.2 严格 parser 规则

- `gameModes.transitions` 对新建和 Game Layout Editor 导出的项目必须显式存在；没有转场时写 `[]`。
- `from/to` 使用现有 mode id 规则、大小写敏感，必须引用 `modes`，不得自循环，directed pair 唯一。
- `overlay`、`resource`、`placements` 递归拒绝 unknown key；不接受 `event`、`changeEvent`、`animationName`、
  `position` 等 alias。
- resource 只允许 official Spine，不允许 image、VNI、image-string、popup 或普通 scene node 引用。
- skeleton/atlas/texture path 继续使用 scene-layout owned asset path policy；atlas page 和 textures key 必须精确一致。
- placements 必须恰好覆盖 active variants，数值为有限数，scale 为有限正数；不允许额外 inactive variant。
- parser 只验证结构和引用；package resource prepare 必须再验证 Spine 4.3、atlas、animation 和 event timeline。
- transition overlay 资源进入 `collectSceneLayoutAssetPaths()` 精确闭包。多个 transition/node 引用相同 path 时只保留
  一份；额外 orphan 文件仍失败。

### 5.3 旧 mode state transition 的移除边界

- Game Layout Editor 新建/导出的 mode 必须保存 `nodeStates: {}`；不再创建 mode-scoped stateful node。
- `EditorSpinePlaybackDraft`、Layout Inspector 和相关 command 删除 `state-machine` 分支，编辑器 Spine node 只保留
  explicit single loop。
- editor 导入含非空 `gameModes.modes[*].nodeStates`、或依赖旧背景 state-machine 完成 mode 切换的 layout ZIP 时，
  必须给出明确不可迁移错误：旧 transition 没有可确定的 switch event，用户需把稳定背景拆成各 mode 独立配置并
  在“转场”Tab 重新选择资源/animation/event。不得猜 event 或把旧 completion 当 event。
- `SceneLayoutPackageRuntime.requestGameMode()` 不再调用 `canRequestNodeState/requestNodeState`，也不在没有 overlay
  edge 时走旧 node transition。
- 底层 `SceneLayoutRuntime.requestNodeState()` 和 state-machine parser 只有在确认仓库其它 consumer/测试仍需要时
  才保留；若无 consumer 可以顺带删除，但不得为了本任务扩大到 background package 或 game app 的无关重写。
- 对应旧测试应删除或改写为新产品合同测试，不能保留一个只有测试会走到的旧实现。

## 6. Editor typed draft 与 command 合同

新增：

```ts
interface EditorGameModeTransitionDraft {
  fromModeId: string;
  toModeId: string;
  resourceId: string;
  animation: string;
  switchEvent: string;
  placements: Partial<
    Record<SceneLayoutVariantId, { x: number; y: number; scale: number }>
  >;
}
```

`EditorProject.gameModes` 固定包含：

```ts
{
  initialMode: string;
  modes: EditorGameModeDraft[];
  transitions: EditorGameModeTransitionDraft[];
}
```

Spine resource metadata 增加 animation-specific event occurrence 信息，必须保留 time 和重复项，不能只存去重后的
名字：

```ts
interface EditorSpineAnimationEvent {
  readonly name: string;
  readonly time: number;
}

interface EditorSpineLayoutResource {
  // existing fields
  readonly animationEvents: Readonly<
    Record<string, readonly EditorSpineAnimationEvent[]>
  >;
}
```

上传和 layout ZIP 重建必须复用同一个 metadata reader，从 Spine 4.3 JSON 的每个 animation event timeline
读取 occurrence。不得在 UI、validation、import 各写一份略有差异的 JSON 解析。

新增窄 command，名称按现有风格确定，至少覆盖：

- create directed transition；
- delete transition；
- set/replace Spine resource；
- set once animation，并在变更时清空不再合法的 switch event；
- set exact switch event；
- set active-variant placement；
- mode rename 时原子更新 transition `from/to`；
- mode delete 若仍有 inbound/outbound transition 必须失败并列出引用，要求先删边，不静默级联；
- resource replace 必须预验证所有 transition 引用的 animation/event，任一失效则整体失败；
- resource delete 必须把 transition 引用加入 reference graph 和错误消息；
- clone/import/export 必须深拷贝 placements，不共享可变对象。

新项目 `transitions=[]`。未完成 draft 可以留在内存并显示 error，但 strict preview/export 必须拒绝空 resource、空 animation、
空/重复 event、缺 placement 或 dangling mode。

## 7. “转场”独立工作区

左侧固定改为六个 Tab：

```text
资源 | 布局 | 转场 | Symbols | BigWin | 项目
```

`转场`位于`布局`之后。主状态 selector 继续在 Tab 外，切 Tab 不改变当前编辑状态。

新增独立模块，建议：

```text
apps/gamelayouteditor/src/ui/transitions-workspace.ts
```

不得继续把大段 transition HTML 和业务 handler 堆回 `app-shell.ts`。

工作区至少包含：

1. 有向 transition 列表，稳定显示 `from -> to`、animation、switch event、ready/error。
2. “新建转场”，显式选择 from 和 to；不得默认第一项、自动补反向边或按当前资源命名猜 animation。
3. 删除当前 transition；删除前不修改 mode 或资源。
4. Spine resource picker，只显示已有 logical Spine resource。资源上传仍属于“资源”Tab，不复制上传实现。
5. once animation 下拉，只显示该 resource 的真实 animation name。
6. switch event 使用严格 `<select>` 下拉，只显示所选 animation 的真实且名称唯一的 event；不提供文本输入。
   同名重复项要标为非法并禁止选择/保存，不能让两个同名 option 看起来可用；animation 没有 event 时显示明确
   空状态并禁止 preview/export。
7. 每个 active variant 的 `x/y/scale` Inspector；orientation 项目同时编辑 landscape/portrait。
8. 明确说明 overlay 固定顶层、placement 为 art-space、event 时切下层 scene、once 完成后移除。
9. “播放当前转场”按钮必须调用 production preview runtime。只有 preview 的 stable mode 等于 `from` 且当前无
   transition/BigWin 时可用；不允许为了预览先暗中瞬切到来源 mode。
10. snapshot/diagnostics 显示 stable、displayed、target、before-switch/after-switch、active background 和 symbol binding。

UI session 增加稳定 selected transition key（使用 `from\0to` 或等价 typed key）与转场 Inspector details 展开状态；
切换 store、preview refresh、输入修改后保持 selection、scroll 和 focus。session-only selection 不进入 manifest/ZIP。

Layout Tab 同步删除：

- `playback: state-machine` 选项；
- 稳定 state 的增删改；
- 旧有向 transition builder；
- mode node-state selector；
- “匹配 transition 播放一次，再进入目标稳定状态”的旧提示。

背景选择同一 Spine logical resource 时必须为当前 mode 创建/保留独立 loop node；resource bytes 可共享，node placement
和 loop animation 独立。资源列表 reference diagnostics 应能区分 background/layer/scene-transition 引用。

## 8. RenderCore 实施合同

### 8.1 official Spine event 上报

扩展 `RendercoreSpinePlayer`，让 `update()` 返回当前调用内按真实触发顺序发生的 event，例如：

```ts
interface RendercoreSpinePlaybackEvent {
  readonly name: string;
}

update(deltaSeconds: number): {
  readonly completed: boolean;
  readonly loopCompleted?: boolean;
  readonly events: readonly RendercoreSpinePlaybackEvent[];
};
```

- official player 的 entry listener 同时处理 `event` 与 `complete`，只接收当前 track entry，不泄漏旧 entry listener。
- event 队列每次 `update()` 返回后清空；返回值冻结，调用方不能修改内部队列。
- `play/reset/destroy` 清理旧 event；但 `play()` 内 `spine.update(0)` 新产生的 event 必须保留到下一次 update。
- 现有 symbol/background/popup consumer 未使用 events 时行为保持不变；统一补测试或类型适配，不复制 player。
- `validateOfficialSpineResource()` 或同层 helper 增加 animation event occurrence introspection，使 package prepare 能
  验证“指定 animation 内 exact event 恰好一次”。不要靠运行一遍动画做静态校验。

### 8.2 transition overlay runtime

在 scene-layout 内实现通用、无 BG/FG 业务语义的 transition overlay owner。它负责：

- 从 manifest/resource 创建 official Spine player；
- 挂到固定顶层容器；
- 按当前 viewport variant 应用 placement；
- once play、逐帧 event/complete drain、snapshot；
- event exactly-once guard；
- completion、error 和 destroy cleanup。

不要把此逻辑写进 `apps/gamelayouteditor` preview，也不要直接在 game app 操作 Pixi child 或 Spine track。

`SceneLayoutPackageRuntime.update()` 必须驱动 overlay。现有 `SceneLayoutRuntime.update()`、reel、popup 等仍在同一 ticker
正常更新，不能因为 transition overlay 活跃而冻结下层动画。

### 8.3 scene commit 与 top ordering

- package runtime 必须预先持有/创建一个 transition overlay root，并保证它在 scene layout 普通内容与 reel 之上。
- 不使用 `sortableChildren + 999999` 作为合同；通过固定 child insertion/专用 container ownership 保证顺序。
- transition root 应遵守同一 art mask。preview guides 是 editor chrome，可继续显示在 runtime 之外，不写入 production order。
- event commit 抽成单一同步方法，统一更新 background active set、reel ownership、displayed binding 和 snapshot。
- background/reel 的旧对象只在 commit 后销毁；prepared target 在 commit 前不可见。
- viewport resize 在 transition 中继续作用于 scene 和 overlay。因为一条边的所有 variant 共享同一 player，variant 改变
  只更新 placement，不 reset/replay 时间轴。

## 9. Preview、导入导出与精确闭包

### 9.1 Preview

- `LayoutPreview` 继续只调用 production `SceneLayoutPackageRuntime`，不得实现 editor-only event timer 或 CSS overlay。
- preview ticker 继续驱动完整 runtime；before/after event 的场景切换必须来自 production snapshot。
- 当目标 Symbols binding 不同，沿用现有公开本地轮带 + Web Crypto sampled scene 预准备；不读取服务器真实轮带，
  不用 `Math.random()`。
- preview rebuild、import 或 destroy 时必须取消 pending transition owner，旧 async request 不能回写新项目。
- 右侧“预览状态”selector 可以保留，但只有存在当前 stable -> target 有向 transition 时按钮可用；缺边显示明确诊断。

### 9.2 Export

- `editorProjectToManifest()` 写出稳定排序的 directed transitions。排序固定按 from mode declaration order、to mode
  declaration order，不能依赖 Map/DOM 选择历史。
- overlay resource 从 logical resource materialize 为 manifest owned paths；同 bytes 继续使用现有 SHA-256 payload 去重。
- transition 所引用的 skeleton、atlas、全部 texture 必须进入 exact closure；未引用 logical resource 和 orphan payload 不导出。
- 导出前必须用 production parser/resource prepare 校验 animation/event/placement，不允许只靠 form validation。
- deterministic ZIP 测试必须证明相同 project 多次导出的 manifest bytes、entry order 和 payload bytes 一致。

### 9.3 Import

- strict layout ZIP import 必须验证 transition schema、owned path、Spine 4.3、atlas closure、animation 和 event occurrence。
- transition-only Spine resource 也要重建到 editor logical resource library；若其完整资源签名与已有 background/layer resource
  一致，复用同一 logical resource record，不复制 bytes。
- manifest 没有 editor logical resource id 时，使用稳定、可读、无 prompt 的 kebab-case 建议 id；冲突按现有 `-2/-3`
  规则。不得从 hash 截断生成不稳定 id。
- import -> export -> import 后 directed pair、resource binding、animation、event、placements 和 payload bytes 无损。
- 旧 state-machine mode transition ZIP 按 5.3 的明确错误拒绝，不静默变成 event-at-completion。

## 10. 实施步骤

### 阶段 A：基线与可执行 fixture

1. 记录 git、Node、pnpm 和 scoped baseline test/typecheck 结果。
2. 盘点当前 state-machine 在 Game Layout Editor、scene-layout package runtime 和其它 consumer 的真实引用；只移除
   game-mode 产品链路，避免误伤无关 background/symbol runtime。
3. 在测试 fixture 中新增最小 official Spine 4.3 transition skeleton，至少包含：
   - `BG_FG`，`SwitchScene` 恰好一次；
   - `FG_BG`，另一个合法 event；
   - 一个没有 event 的 once animation；
   - 一个同名 event 出现两次的非法 animation。
4. fixture 必须是合法 skeleton/atlas/texture 闭包，不能只靠 mock 证明 official event listener 行为。

### 阶段 B：Spine event 基础能力

1. 扩展 metadata/validation introspection，返回 animation-specific event occurrence。
2. 扩展 official player event queue 与 update result。
3. 更新现有 consumer 类型和 fake player；只对必要字段做兼容，不加 `events ?? []` 宽泛猜测掩盖错误。
4. 完成 official event、time=0、large delta、reset、replay、destroy 测试。

### 阶段 C：manifest、resource closure 与 runtime

1. 增加 `gameModes.transitions` types 和 strict parser。
2. 将 overlay assets 纳入 exact path collector、URL loader、package resource prepare、rollback/destroy。
3. 实现专用 transition overlay owner 和固定顶层容器。
4. 重写 `requestGameMode()` 为 prepare -> overlay -> event commit -> complete settle。
5. 扩展 snapshot，并保持 same/different/no Symbols binding 合同。
6. 删除 package runtime 的 mode node-transition preflight/request 路径和相应旧测试。

### 阶段 D：editor model 与 IO

1. 增加 transition draft、Spine event metadata 和 typed commands。
2. 删除 editor state-machine playback、mode node-state 同步和同-resource background node 自动复用。
3. 更新 resource reference/replace/delete、mode rename/delete、project clone/migration validation。
4. 更新 manifest materialize、strict preview manifest、ZIP export/import 和 logical resource reconstruction。
5. 对旧 ZIP 给出不可迁移的具体错误，不做猜测。

### 阶段 E：独立工作区和 preview

1. 新增 `transitions-workspace.ts`，把 Tab 数改为六个并补键盘左右/Home/End 导航。
2. 完成 directed edge list、resource/animation/event、per-variant placement、删除和 readiness UI。
3. 删除 Layout Tab 旧 state-machine controls 和 handlers/CSS/dead commands。
4. 把 preview controls 接到 production request/snapshot，显示 before-switch/after-switch。
5. 保证 scroll/focus/details/session 状态不因 store redraw 丢失。

### 阶段 F：文档、规则与清理

1. 更新 `apps/gamelayouteditor/README.md` 的六 Tab 工作流、资源合同和 production 消费示例。
2. 更新 `docs/scene-layout-manifest.md` 的 schema、event lifecycle、snapshot 和 API 示例，删除旧 mode transition 说明。
3. 必须同步更新 `AGENTS.md`：将旧的“stateful scene node / transition 完成后切 mode”约束替换为“独立稳定场景 +
   top overlay + Spine event 原子切场”所有权边界。
4. 使用 `rg` 清理旧 UI 文案、data attribute、dead commands、测试名称和 README 说明；不得留下隐藏旧入口。
5. 写任务报告，包含实际改动、测试、人工验收、已知限制和 UTC 文件名。

## 11. 自动化测试要求

### 11.1 RenderCore

至少覆盖：

- parser 接受合法双向 transition，拒绝 unknown key、未知 mode、自循环、重复 directed pair、缺/多 variant placement、
  非 Spine resource、非法数值；
- exact closure 包含所有 overlay Spine files，拒绝缺 atlas page、额外 payload 和 path collision；
- package prepare 拒绝 wrong Spine version、未知 animation、event 零次、event 多次；
- event 前来源 background/reel/displayed mode 不变；
- event 同一 update 原子切目标 background/reel/displayed mode；
- event 后 overlay 仍存在且继续 update，complete 后才移除并 resolve；
- event 与 complete 同一大 delta 时仍先切场再完成；
- completion 未收到 event 时 reject，且不补切；
- same symbols binding 保持 reel identity；different binding 在 event 才 swap；target no symbols 在 event 才 remove；
- `recreateReel` 仍在 event 才替换；
- prepare failure、concurrent request、popup active、missing edge、destroy 不泄漏资源；
- transition 中 viewport variant 改变只重放 placement，不 replay player；
- overlay child ordering 始终高于普通 scene/reel，且遵守 art clip；
- snapshot 在 stable/before-switch/after-switch/final 四个边界精确变化；
- `requestGameMode()` 不再调用 node state transition fake/spies。

### 11.2 Game Layout Editor

至少覆盖：

- 六个 Tab 的文本、ARIA、键盘导航和 state scope；
- 新项目 `transitions=[]`，增删/编辑/rename/delete reference command 原子行为；
- 同一 Spine resource 给 BG/FG 创建独立 loop background node，不生成 state-machine；
- Layout Inspector 不再出现 state-machine/旧 transition builder/mode node-state 控件；
- transition event 严格下拉按所选 animation 过滤，没有自由文本入口；animation/resource 变化会清空失效选择，
  重复同名 event 明确不可用；
- resource replacement 缺 animation/event 时整体失败并保留旧资源和 draft；
- resource/mode delete 引用保护错误列出 directed edge；
- active variant placements、validation、project diagnostics；
- preview 只调用 production runtime，UI 正确显示 before/after event；
- missing edge 不瞬切、不调用旧 requestNodeState；
- deterministic ZIP export、strict import、round-trip 和 transition-only logical resource 重建；
- 旧 state-machine mode package 给出明确不可迁移错误；
- import/new project/destroy 取消旧 pending preview，不发生 stale async overwrite。

### 11.3 测试修改原则

- 如果旧测试只是在锁定已废弃的 state-machine 产品方式，应删除或改写测试，不得为了让旧测试继续通过而保留死代码、
  双 schema、optional chaining 兜底或只在测试使用的 adapter。
- 如果测试暴露真实 production bug，应修 production；如果是 fixture/mock 没按新合同提供 event/placements，应修测试 fixture。
- 不得改无关业务实现去迁就脆弱 selector、时间假设或错误 mock。
- 不使用假 `setTimeout` 模拟 Spine event 作为 production 验收；event 边界必须至少有 official runtime fixture 测试。

## 12. 验证命令

先执行 scoped 验证：

```bash
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore lint
pnpm --filter @slotclientengine/rendercore format:check
pnpm --filter @slotclientengine/rendercore build

pnpm --filter gamelayouteditor test
pnpm --filter gamelayouteditor typecheck
pnpm --filter gamelayouteditor lint
pnpm --filter gamelayouteditor format:check
pnpm --filter gamelayouteditor build
```

再执行根级回归：

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
git diff --check
```

若全仓测试存在与本任务无关的既有失败，任务报告必须记录精确命令、失败文件、错误摘要和为何确认无关；不得笼统写
“测试失败”。若失败由本任务引起，必须修复后才能完成。

## 13. 浏览器人工验收

启动：

```bash
pnpm --filter gamelayouteditor dev -- --host 0.0.0.0
```

至少完成以下真实浏览器验收：

1. 新建单背景项目，创建 BG、FG 两个主状态，分别绑定并布局稳定背景 loop；确认选择同一 resource 仍是两个独立 node。
2. 确认左侧为六个 Tab，Layout 中没有旧 state-machine transition UI。
3. 在“转场”Tab 新建 `BG -> FG`，选择真实 Spine、`BG_FG`、真实 switch event 和 default placement。
4. 新建 `FG -> BG`，选择 `FG_BG` 和对应 event；确认不会自动复用反向配置。
5. 从 BG 播放到 FG：event 前下层仍是 BG，event 边界切到 FG，overlay 继续播放，完成后消失。
6. 反向验证 FG -> BG；快速重复点击、缺边、popup active 时均给明确错误且不破坏当前 scene。
7. 给 BG/FG 绑定不同 Symbols package，确认 reel 只在 event 边界替换；再绑定相同 package，确认 reel identity/scene 保留。
8. 新建 orientation-focus 项目，配置 landscape/portrait placement；转场中改变 viewport 方向，确认动画不重播且 placement 更新。
9. 导出 ZIP、刷新、重新导入，再次双向播放；确认 animation/event/placement/资源 bytes 无损。
10. 尝试导入旧 state-machine mode transition ZIP，确认显示明确不可迁移错误，没有隐式 completion 切场。

人工验收需在任务报告记录浏览器、dev URL、素材/package id、实际 event name、每项结果和必要截图路径。若执行环境无法
完成浏览器操作，报告必须写“未执行/待用户验收”，不能写成已通过。

## 14. 完成定义

同时满足以下条件才可结束任务：

- Game Layout Editor 已有独立“转场”Tab，稳定 BG/FG layout 与 transition overlay 配置完全分离。
- 旧 state-machine game-mode transition UI、自动同-node复用、preview/runtime 主路径和过时文档已移除。
- manifest/ZIP 完整保存 directed overlay resource、once animation、唯一 switch event 和 per-variant placement。
- production runtime 在真实 Spine event 边界原子切换下层完整 mode scene，overlay 在 event 后继续到 once completion。
- 缺 edge、缺/重复 event、资源错误、并发、popup active 等均尽早显式失败，无瞬切或 completion fallback。
- transition overlay 固定处于普通 scene/reel 最上层，viewport resize 不重播动画。
- exact closure、deterministic round-trip、resource owner 和 destroy 无泄漏。
- scoped 与 root 自动化验证完成，浏览器验收有真实记录或明确标为待用户验收。
- `apps/gamelayouteditor/README.md`、`docs/scene-layout-manifest.md` 和 `AGENTS.md` 已同步新合同。
- 已新增中文任务报告：

```text
tasks/113-gamelayouteditor-scene-transition-workspace-[utctime].md
```

报告必须包含基线、实施摘要、关键 schema/API、删除的旧能力、测试命令与结果、浏览器验收、已知限制和遗留事项。
