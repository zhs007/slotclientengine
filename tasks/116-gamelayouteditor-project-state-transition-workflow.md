# Game Layout Editor Project、State 与 Transition Workflow 任务计划

## 1. 任务目标

本任务更新现有纯前端应用：

```text
apps/gamelayouteditor
```

目标是修复三个相互关联的编辑流程，并保持现有 `scene-layout v1`、owned resource、严格有向边和
iOS 带声音视频播放合同不退化：

1. “新建项目”对话框不再平铺 radio；适配模式改为与编辑器其它选择控件一致的单个下拉框。
2. “管理主状态”对话框必须显示项目当前的完整状态列表。新增成功后，新状态立即出现在列表中并成为当前选择，
   用户不需要关闭对话框后从背后的页面猜测操作是否成功。
3. MP4 转场预览不再要求用户理解“手动预加载 → 手动播放”两步调试 API。编辑器自动准备当前可切换的直接有向边，
   用户像 Spine 转场一样通过状态切换入口发起一次切换；UI 用中文阶段状态说明准备、可播放、转场和完成过程。
4. 文档必须准确说明 MP4 “缓存”的含义：它不仅是设置 URL，也包括浏览器 media readiness、真实 metadata 校验、
   Pixi video presentation 和目标 scene 准备；浏览器不保证整段媒体永久驻留缓存。
5. 保持现有 editor 两阶段安全边界：视频可以提前准备，编辑器的有声 `video.play()` 由真实 click/pointer
   调用栈内的 `requestGameMode()` 同步触发，不能在一个异步 prepare 完成回调里自动播放。production 不得把
   “页面曾经点过一次”当成永久、全页面媒体授权；即使复用已成功播放过的同一个 media element，也仍以每次
   `play()` Promise 的实际结果为准。

本文件是完整实施合同。执行者可以阅读仓库代码确认基线，但不得依赖聊天记录、历史 task 或任务报告补齐行为。

任务完成后必须新增中文任务报告：

```text
tasks/116-gamelayouteditor-project-state-transition-workflow-[utctime].md
```

UTC 时间戳必须使用：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/116-gamelayouteditor-project-state-transition-workflow-260401-181300.md
```

## 2. 制定计划时的仓库基线

制定本计划时现场为：

```text
repository: /Users/zerro/github.com/slotclientengine
branch:     main
HEAD:       5bfd27c
status:     clean
Node.js:    v24.14.0（nvm use 24，计划制定时只读观测）
pnpm:       10.0.0（同一 nvm 环境自带，计划制定时只读观测）
date:       2026-07-22 (Asia/Shanghai)
```

实施开始时必须重新记录 branch、HEAD、`git status --short`、Node 与 pnpm 版本。上述版本只记录计划制定现场，
不得用来覆盖用户后续修改。工作区中的既有修改和 untracked 文件全部视为用户输入；禁止 reset、stash、clean、
checkout 覆盖或无关批量 format。

仓库要求 Node.js `>=24.0.0`、包管理器使用 pnpm。实施命令必须统一使用同一套 Node/pnpm 环境：若 shell 中没有
`node`，先执行：

```bash
nvm use 24
```

之后使用这套环境自带、实际解析到的 `node` 和 `pnpm` 完成本任务，并记录 `node --version`、`pnpm --version`。
不得因为计划制定时观测到的版本、根 `packageManager` 字段或工具提示而强制安装、升级、降级、切换 pnpm，
也不得运行会重建 `node_modules` 的版本调整命令。除非依赖确实缺失且正常任务命令明确报错，否则不要执行 install。
不得通过降低 engine、切换 npm/yarn 或修改 lockfile 绕过。

若依赖下载失败，使用：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

然后重试原 pnpm 命令。不得删除 lockfile、放宽依赖版本或手工复制下载产物。

如果测试迫使 production 写出奇怪分支，应修改测试、fixture 或依赖注入边界；不得为测试增加静默 fallback、
假 media readiness、magic timeout、自动静音、自动瞬切或假完成。

实施前至少重新阅读：

```text
agents.md
apps/gamelayouteditor/README.md
apps/gamelayouteditor/package.json
apps/gamelayouteditor/src/model/editor-project.ts
apps/gamelayouteditor/src/model/editor-store.ts
apps/gamelayouteditor/src/model/game-mode-commands.ts
apps/gamelayouteditor/src/model/validation.ts
apps/gamelayouteditor/src/preview/layout-preview.ts
apps/gamelayouteditor/src/ui/app-shell.ts
apps/gamelayouteditor/src/ui/transitions-workspace.ts
apps/gamelayouteditor/src/ui/ui-session.ts
apps/gamelayouteditor/src/ui/ui-markup.ts
apps/gamelayouteditor/src/styles.css
apps/gamelayouteditor/tests/app-shell.test.ts
apps/gamelayouteditor/tests/transitions-workspace.test.ts
apps/gamelayouteditor/tests/ui-session.test.ts
packages/rendercore/src/scene-layout/types.ts
packages/rendercore/src/scene-layout/package-runtime.ts
packages/rendercore/src/scene-layout/video-transition-player.ts
packages/rendercore/tests/scene-layout/package-runtime-video.test.ts
packages/rendercore/tests/scene-layout/video-transition-player.test.ts
```

## 3. 当前实现与已确认问题

### 3.1 新建项目

当前 `shellMarkup()` 在 `[data-new-project-dialog]` 内使用两个同名 radio：

```text
maximized-focus  单背景适配
orientation-focus 横竖双背景适配
```

编辑器其它枚举选择已经统一使用 `<select>`。新建项目这里形成独立设计语言，也不利于后续增加适配策略。

### 3.2 管理主状态

当前 `[data-mode-dialog]` 只有一个状态 id 输入框和“添加 / 重命名当前 / 设为 initial / 删除当前”按钮，
没有状态列表。`EditorStore.transact()` 同步 emit 后会重绘主工作区，但 mode dialog 自身是 `shellMarkup()` 创建的静态 DOM；
所以 `addGameMode()` 已成功提交，用户仍看不到新状态。

此外，当前新增 handler 在 transaction emit 完成后才修改 `#selectedGameMode`，容易出现 UI 已按旧 selection 重绘、
字段随后变化却没有对应对话框重绘的问题。不得用延时器、强制关闭 dialog 或重复 transaction 掩盖该顺序错误。

### 3.3 MP4 转场

当前转场 Inspector 暴露三个调试按钮：

```text
预加载当前转场
取消预加载
播放当前转场
```

用户必须理解 rendercore 的底层两阶段 API，和 Spine 直接请求状态切换的使用方式不一致。

现有 rendercore 合同本身是正确且必须保留的：

- `prepareGameModeTransition()` 在画面不变时准备目标 scene 和 transition media。
- `requestGameMode()` 对已准备的视频在任何 `await` 前同步调用 audible `video.play()`。
- prepare 可以创建 Pixi `VideoSource` / texture / view，但 view 必须保持未挂载或不可见；这不算开始转场。
- runtime 必须先等待 `play()` Promise resolve，之后才设置 target、挂载并显示 video blackout。`play()` reject 时不得产生
  任何可见黑层、视频帧或目标 scene mutation。
- 未准备的视频请求显式失败；不得静音重试、自动瞬切或假成功。
- MP4 转场按 media currentTime 推进，在 `fadeStart = duration - fadeOutSeconds` 原子切换 displayed scene，
  `ended` 后才稳定完成。

问题位于 editor orchestration 和 UI，而不是 manifest union。任务默认不修改 scene-layout manifest、ZIP schema、
owned MP4 path、contain/blackout/fade 语义。

### 3.4 “缓存 MP4”的准确含义

编辑器导入的 MP4 已作为完整 owned bytes 存在项目资源中；package resource 通常会为精确 bytes 创建 Blob URL。
video prepare 仍会完成以下工作：

1. 创建和配置 audible inline `HTMLVideoElement`；
2. 赋值 URL 并设置 `preload=auto`；
3. 等待 metadata / 可播放状态；
4. 校验真实 duration、videoWidth、videoHeight 和 fade 边界；
5. 创建 Pixi `VideoSource` / texture / presentation；
6. 同时准备目标 mode 对应的 reel/catalog/scene owner。

因此 UI 不应把所有过程都含糊写成“URL 已缓存”。production 从 CDN 加载时可以在游戏初始化后尽早下载和预热
静态 MP4；但浏览器决定实际 buffer 和淘汰策略，不能承诺“一定整段永久驻留”。真正切换前仍必须确认匹配的目标 scene
和 transition owner 已准备完成。

### 3.5 iOS 用户手势、连续播放与前后台恢复

必须按以下事实设计，不能只靠“用户进入游戏时点过一次”的经验假设：

- WebKit 对 audible media 的用户手势要求强调 `play()` 必须直接来自 `touchend/click/keydown` 等 handler；
  `canplaythrough` 等异步回调里再调用不等价。
- 用户 activation 不是任意新建 `<video>` 的永久全局许可证。WebKit 对连续媒体的公开建议是尽量复用同一个
  media element 并切换 source，而不是为每段视频创建新 element；但 `play()` Promise 仍是唯一权威结果。
- 同一个 element 已由用户成功启动后，连续换源或继续播放通常更可靠。这是可利用的优化，不是可以删除错误处理
  和恢复 UI 的保证。
- iOS 页面切到后台时可能被完整 suspend；video 可能 pause，`requestAnimationFrame` 会停止。回到前台时不能假定
  audio session、media timeline 或 Pixi texture 会自动恢复。
- 回前台应读取 `document.visibilityState`、media `paused/ended/error/readyState` 和 runtime transition boundary。
  可以尝试继续同一个 element 的 `play()`，但必须处理 Promise rejection。
- 如果恢复 `play()` 被拒绝，应暂停在确定状态并显示“点按继续转场”。这个入口是显式错误恢复，不是静音、
  跳过动画或瞬切 fallback。
- before-switch 中断时保留来源 scene；after-switch 中断时保留已提交的目标 scene。不得因回前台重复提交边界、
  从头重播或让来源/目标同时可见。

## 4. 范围与非目标

### 4.1 必须完成

- 新建项目适配模式改为一个 strict select，并覆盖键盘、取消和创建行为。
- 管理状态 dialog 增加可选择、可感知 initial 和配置完整度的状态列表。
- 新增、选择、重命名、设置 initial、删除后，dialog 内列表和操作目标立即同步。
- editor 增加明确的 transition preparation session state 和竞态保护。
- 当前 preview stable source 到所选 target 存在直接有向边时，自动 prepare；用户只保留一个产品级“切换状态”动作。
- Spine 与 video 共用同一套状态切换入口和中文进度区；video 仍遵守 trusted-click 同步 play。
- 项目替换、preview 重建、edge/resource 修改、target 修改和 destroy 时取消/失效旧 prepare，不允许旧 Promise 回写新项目 UI。
- 更新测试、README；按第 10 节判断并更新 `agents.md`；生成任务报告。

### 4.2 明确非目标

- 不增加新的适配模式，不改变 `maximized-focus` / `orientation-focus` 数据语义。
- 不创建第二套“状态”model；继续使用 `EditorProject.gameModes` 和现有 command。
- 不修改 scene-layout manifest version、transition strict union、ZIP 路径或资源闭包。
- 不自动生成反向边，不倒放 MP4，不为缺边状态自动寻路。
- 不支持远程 URL、HLS、WebM、MOV、poster、seek、转码、音量或静音配置。
- 不把 `muted autoplay` 当成 iOS 方案；不在 prepare 完成的异步回调里自动播放带声音视频。
- 不把一次历史点击或一次成功播放当成永久的页面级 audible media 授权。
- 不承诺浏览器把完整 MP4 永久保存在 HTTP cache、memory 或 GPU texture。
- 不接入 game002/game003 live 流程；production 预热建议写入文档，但本任务不擅自修改游戏启动链路。
- 不在本任务中把现有 per-transition player 擅自改成全游戏 persistent media pool；该改动涉及并发、换源、
  texture ownership、内存预算和前后台恢复，必须由独立 runtime 任务及 iOS 真机验收驱动。
- 不为了 UI 测试修改 `packages/rendercore` 已验证的 media-time、rollback 或资源销毁语义。

## 5. 产品行为合同

### 5.1 新建项目对话框

对话框固定包含一个字段：

```text
适配模式 [ 请选择适配模式                 ▼ ]
          单背景适配（maximized-focus）
          横竖双背景适配（orientation-focus）
```

规则：

- 使用 `<select data-new-project-mode>`，不保留 `name="new-project-mode"` radio。
- 第一项 value 为空，用于要求显式选择；未选择时“创建”按钮 disabled。
- 每次打开对话框重置为空选择，避免上一次选择导致误覆盖当前项目。
- select change 后只更新按钮 enabled，不修改 project。
- “取消”、Esc 和 dialog cancel 都不修改 project。
- 点击“创建”只调用一次 `createProject(selectedMode)`，成功后关闭 dialog。
- 继续复用全局 `label/select/button` 样式；只增加必要的 dialog layout class，不造另一套 select 皮肤。
- 新项目默认 game mode 仍为 `BaseGame`；不得因为 UI 改造改变 model 默认值。

### 5.2 管理主状态对话框

对话框至少包含以下结构：

```text
管理主状态
┌ 状态列表 ─────────────────────────────┐
│ BaseGame          initial   incomplete │
│ FreeGame          selected  incomplete │
└────────────────────────────────────────┘
新状态 id [                    ] [新建]
选中状态：FreeGame
[重命名] [设为 initial] [删除]
操作结果 / 禁用原因
[完成]
```

精确规则：

- 列表数据只来自 `project.gameModes.modes`，保持 model declaration order。
- 列表使用可键盘操作的 listbox/option 或等价语义化 button list；选中项有 `aria-selected=true` 和清晰视觉状态。
- 每行至少显示 mode id、是否 initial，以及 readiness：当前 adaptation 的每个 active variant 是否已有背景绑定；
  symbols/popup 允许为空，不得因此伪报错误。若复用项目级 validation 摘要，文案必须区分 mode incomplete 与 project error。
- 打开 dialog 时选择当前 `#selectedGameMode`；若它已不存在，回到 `initialMode`。
- 点击列表项同时更新 `#selectedGameMode`、顶部主状态 select 和当前 state-scoped workspace；不写 project。
- “新建”读取独立的 new id 输入。成功后新 mode 立即成为 selected、列表立即出现、输入框清空，并在 dialog 内
  `aria-live` 输出“已创建状态 <id>”。
- 新建失败时保留输入和当前 selection，显示原始 command 错误；不得生成修正版 id 或自动加 `-2`。
- “重命名”必须明确输入新 id，成功后 selection 跟随新 id；所有引用继续由现有 `renameGameMode()` 原子维护。
- “设为 initial”只调用现有 `setInitialGameMode()`；成功后 initial badge 立即移动。
- 只有一个 mode 时禁用删除并显示原因。选中 initial 时，在先选择另一个 initial 之前禁用删除；不得自动选择第一项。
- 删除成功后 selection 明确切到仍存在的 `initialMode`，列表立即刷新。
- 每次 mutation 必须先确认 transaction 成功，再提交 session selection 并重绘。建议让 `runTransaction()` 返回
  `boolean`，或新增窄的 mode mutation helper；不得用 `setTimeout()` 修复 emit 顺序。
- dialog 保持打开，除非用户点击“完成”、取消或 Esc。

建议把纯 markup/状态派生抽到 `src/ui/state-manager-dialog.ts`，由 `app-shell.ts` 负责事件和 store；这样可以独立测试
列表、disabled 原因与 selection，而不继续膨胀 `shellMarkup()`。文件名可按现有代码风格微调，但职责必须分离。

### 5.3 统一转场操作

用户可见流程统一为：

```text
选择目标状态
  -> 编辑器后台准备直接有向边
  -> 状态显示“已准备，可切换”
  -> 用户点击一次“切换到该状态”
  -> Spine once 或 MP4 blackout 自动进入 production runtime 流程
  -> 状态显示边界和完成结果
```

规则：

- Transition Inspector 移除产品级“预加载当前转场”和“取消预加载”按钮。
- Inspector 与右侧 preview toolbar 的“切换到该状态”必须调用同一个 controller，不能维护两份 prepare/play 状态机。
- 当前 stable mode 到 target 没有显式直接边时，按钮 disabled 并显示“缺少 <from> → <to> 直接有向转场”；
  不允许瞬切、反向复用、自动寻路或回退旧 node state-machine。
- target 等于 stable mode 时显示“当前已是 <mode>”，不 prepare、不播放。
- edge 配置不完整或 project preview 不可创建时显示原始 strict diagnostic，不进入 preparing。
- 选中有效 edge 后自动调用 `prepareGameModeTransition(target)`。Spine 也可走相同 prepare，以统一 UI；
  不允许 editor 通过资源名猜 transition kind。
- prepare 期间切换 target、修改 transition/resource、重建 preview 或替换 project 时，旧请求 token 必须失效；
  如 runtime owner 仍属于当前 preview 且尚未 started，应调用 `cancelPreparedGameModeTransition()`。
- prepare 成功且 snapshot 的 `preparedTargetMode/transitionKind` 与当前 stable source、target、edge 一致后，按钮才可用。
- click listener 必须直接、同步执行 `const pending = preview.requestGameMode(target)`；在这次调用之前不能 `await`、
  `queueMicrotask` 或 `setTimeout`。随后才监控并 await `pending`。
- `requestGameMode()` 内部以原生 `play()` Promise 作为可见转场 gate：resolve 前允许 prepared Pixi texture 存在，
  但不得显示或提交 target；reject 时直接释放 prepared owner，用户继续看到完整来源 scene。
- 不把 `requestVideoFrameCallback` 当成第二个强制开始 gate。prepare 已等待 media can-play 与 Pixi presentation ready；
  强制再等首个 presented-frame 可能让部分 Safari 永久卡住。frame callback 只用于诊断，开始后以 media currentTime、
  ended 和 fatal media error 驱动生命周期。
- prepare 尚未完成时不得记录一个“完成后自动播放”的 audible video intent；这会丢失 iOS trusted gesture。
  UI 应保持按钮 disabled，并清楚显示准备阶段。
- video `play()` 拒绝时保留来源 stable scene，清理旧 prepared owner，显示原始错误；不得静音重试或自动切目标。
- 完成后 selected preview mode 与 stable mode 对齐，并自动开始准备新 stable source 下当前所选的下一个直接 edge。

### 5.4 自动准备的目标选择

为避免自动准备多个完整目标 scene 造成不可控内存，本任务继续遵守 rendercore 当前“一个 prepared owner”合同：

- 明确的 preview target select 是准备目标的唯一来源。
- 开启“跟随编辑状态”时，编辑状态成为 preview target；关闭时两者独立。
- stable source 或 target 变化后，只准备精确的 `<stable source> → <selected target>`。
- 若 target 尚未选择，或等于 source，不准备任何 edge。
- 对话框中的状态列表只改变编辑 selection；是否跟随 preview 继续服从现有“跟随编辑状态”开关。
- 不在 editor 初始化时同时实例化全部目标 reel/player。production 若未来需要预热多个 MP4，应新增独立任务设计
  media-only cache 与动态 target scene 的所有权，不能把多个重型 prepared scene 偷塞进本任务。

这意味着“后台准备完成后，一次点击直接转场”；不意味着用户点击一个尚未准备的带声音视频后可以无第二次手势自动播放。
这是浏览器媒体策略边界，UI 必须如实表达。

### 5.5 中文运行状态

新增 editor-only session phase；不得写入 `EditorProject`、manifest 或 ZIP。建议的 strict union：

```ts
type PreviewTransitionUiState =
  | { phase: "idle"; message: string }
  | { phase: "preparing"; from: string; to: string; kind: "spine" | "video" }
  | { phase: "ready"; from: string; to: string; kind: "spine" | "video" }
  | { phase: "starting"; from: string; to: string; kind: "spine" | "video" }
  | {
      phase: "transitioning";
      from: string;
      to: string;
      boundary: "before-switch" | "after-switch";
    }
  | { phase: "complete"; stableMode: string }
  | { phase: "error"; message: string };
```

用户文案至少覆盖：

| UI phase      | Spine 文案                     | MP4 文案                       |
| ------------- | ------------------------------ | ------------------------------ |
| preparing     | 正在准备目标场景与 Spine 转场  | 开始准备 MP4 与目标场景        |
| ready         | Spine 转场已准备，可切换       | MP4 媒体可播放，目标场景已准备 |
| starting      | 开始 Spine 转场                | 开始 MP4 转场                  |
| before-switch | 转场播放中，尚未切换场景       | MP4 播放中，等待 fadeStart     |
| after-switch  | 已切换目标场景，等待 once 完成 | 已切换目标场景，MP4 收尾中     |
| complete      | 转场完成，当前状态：X          | 转场完成，当前状态：X          |

video transitioning 时追加真实 `currentTime / duration` 和 fade progress；没有值时显示“等待首帧”，不得显示 `NaN`。
开发诊断可继续保留英文 snapshot，但产品主状态必须是上述中文摘要。

### 5.6 production 预热说明

README 必须增加一个不依赖 editor UI 的说明：

- layout package/ZIP 的完整 owned MP4 bytes 可以在游戏初始化和 phased loading 期间下载。
- 静态资源下载完成不等于 transition 已完整 prepared；HTMLVideoElement readiness、Pixi texture 和目标 scene 仍有生命周期。
- 当业务已知道下一次可能切到哪个 mode、并已拿到构造目标 scene 所需输入时，应尽早调用
  `prepareGameModeTransition(modeId, options)`。
- 玩家最终确认的真实 click/pointer listener 直接调用 `requestGameMode(modeId, sameOptions)`。
- 如果业务希望在首次“进入游戏”点击后自动播放后续转场，应优先复用已经成功启动过的同一个 media element，
  而不是为每段 MP4 新建 element；但仍必须检查每次 `play()` Promise，不能把首次点击当作永久授权。
- spin click 后经过网络请求/Promise 再发生的转场不再处于原始 click 的同步调用栈，不能仅凭“本轮由点击开始”推定
  audible play 一定获准。
- 必须监听 `visibilitychange/pagehide/pageshow` 以及 media pause/error/stalled/playing。回前台先尝试恢复同一 element；
  Promise 拒绝时展示明确的“点按继续”入口。
- 恢复操作遵守原子边界：before-switch 保持来源，after-switch 保持目标；不静音、不跳过、不重复切场。
- 如果游戏未来要同时预热多个可能目标，需另行设计 media-only pool、内存预算、淘汰和动态 scene owner；
  不得假设浏览器 HTTP cache 等价于可立即播放。

## 6. 实施步骤

### 阶段 A：建立测试基线

1. 记录 git、Node、pnpm 现场。
2. 运行现有 gamelayouteditor 测试、typecheck、lint，确认失败是否为基线问题。
3. 阅读现有 app-shell test fake preview，确认 fake snapshot 与真实 `SceneLayoutGameModeSnapshot` 字段一致。
4. 不在同一步修改 production 和大批 snapshot fixture；先写能复现 radio、静态 mode dialog、手动 video controls 的测试。

### 阶段 B：新建项目 select

1. 修改 `shellMarkup()` 或抽取 dialog markup，radio 改为 strict select。
2. 增加 open/reset、change/enable、cancel 和 confirm handler。
3. 保证创建只发生一次，并保持现有 `createProject()` 的 session reset 行为。
4. 更新 CSS，只复用现有设计 token。

### 阶段 C：状态管理列表

1. 新增纯状态管理 markup/派生函数，输入为 `EditorProject + selectedModeId + local feedback`。
2. 在 `renderWorkspace()` 或专用 render path 中刷新打开的 mode dialog，同时保留输入 focus 和 dialog open 状态。
3. 绑定列表选择、新建、重命名、initial、删除事件。
4. 修正 transaction 成功与 session selection 更新顺序。
5. 为 disabled 操作提供文本原因，错误继续进入 store external error，同时 dialog 内显示可见反馈。

### 阶段 D：转场准备 controller

1. 在 `ui-session.ts` 增加 editor-only transition UI state，或在 app-shell 建立职责明确的窄 controller。
2. 使用递增 request token 处理 prepare 竞态；token 必须同时覆盖 project revision、preview runtime replacement、source、target。
3. stable source/target/edge 确定后自动 prepare；重复相同目标且 snapshot 已 ready 时幂等，不重建 player。
4. 移除 Inspector 的手动 prepare/cancel UI，保留一个共享的切换动作。
5. 重构 `requestPreviewMode()`：同步取得 request Promise 后才进入 async monitor，不能让 helper 在调用前 await。
6. 使用 snapshot 推进中文阶段；transitioning 时锁定会改变 edge/resource 的 Inspector 控件。
7. settle、error、project replacement 和 destroy 路径清理 token、monitor 和 prepared owner。

### 阶段 E：文档和仓库规则

1. 更新 `apps/gamelayouteditor/README.md`，删除“手动预加载 / 取消 / 播放”产品流程描述。
2. 写明 automatic prepare、single prepared target、trusted click、媒体 readiness 和 production 预热边界。
3. 补充 iOS 连续播放与前后台恢复说明：复用 element 是优化，`play()` Promise 才是事实，rejection 需要点按继续。
4. 检查 `agents.md`。由于本任务形成长期 editor 交互约束，若最终实现确实落地，应在 gamelayouteditor/scene-layout
   相关段落最小化补充：“editor 自动准备当前所选直接边、单一状态切换动作、中文阶段提示；audible play 仍同步发生在真实点击”。
5. 不复制整份 task 内容到 `agents.md`，不改无关游戏规则。

### 阶段 F：验证和报告

1. 运行第 8 节自动测试。
2. 执行第 9 节手工验收，至少覆盖一个 Spine edge 和一个带声音 MP4 edge。
3. 检查 `git diff --check` 和 `git status --short`。
4. 使用 UTC 命令生成任务报告文件名，写清变更、测试、手工验收、已知限制和最终 git 状态。

## 7. 自动测试要求

### 7.1 app-shell / dialog

必须覆盖：

- 新建项目 dialog 不存在 `input[type=radio][name=new-project-mode]`。
- select 只有空值、`maximized-focus`、`orientation-focus` 三项。
- 未选择不能创建；选择每种模式分别创建正确项目。
- cancel/Esc 不改变 project。
- 管理状态 dialog 打开时显示 BaseGame 和 initial badge。
- 新建 FreeGame 后 dialog 不关闭，列表立即出现 FreeGame 且它被选中。
- 重名或非法 id 失败时不生成新项、不改 selection、原始错误可见。
- rename、set initial、delete 后列表、顶部 select 和 selected mode 一致。
- 只有一个 mode、或当前为 initial 时，删除 disabled 且原因可见。

### 7.2 transition workspace / controller

必须覆盖：

- Inspector 不再出现手动 prepare/cancel 按钮，只出现共享状态切换动作和 status。
- direct edge 缺失、edge 不完整、target=source、preview unavailable 时不 prepare。
- 有效 Spine/video edge 自动调用一次 prepare；重复 render 不重复 prepare。
- target 在 prepare pending 时改变：旧完成结果被忽略，只有新 target 可进入 ready。
- project replace / preview rebuild / destroy 后旧 Promise 不回写 UI。
- video ready 前切换按钮 disabled；ready 后 enabled。
- 点击 ready video 时 `requestGameMode()` 在 handler 同步调用栈发生；测试不得通过虚假 async autoplay 绕过。
- play Promise pending 时 video/blackout 不可见、targetMode 仍为空；resolve 后才一次性进入 visible transition。
- play reject 后来源 mode 保持 stable、video/blackout 从未可见、UI 进入 error、prepared snapshot 清空。
- active transition 期间 hidden/visible 不靠 UI timer 假完成；可见状态恢复后只按 runtime snapshot 更新 UI。
- before-switch / after-switch / complete 中文文案与 snapshot 一致；time/fade 为有限数值。
- transitioning 时 transition Inspector 编辑控件锁定，settle 后恢复。

### 7.3 rendercore 回归

默认不需要修改 rendercore。若实现过程中发现必须调整 public runtime，先证明 editor 层无法解决，并补齐：

- video prepare 零 visible mutation；
- audible play 同步调用；
- media-time fadeStart；
- play reject rollback；
- before/after switch fatal error 语义；
- destroy/cancel 资源释放；
- snapshot backward compatibility。

不得为了让 editor 测试简单而放宽上述 production 测试。

## 8. 验证命令

在仓库根目录运行：

```bash
pnpm --filter gamelayouteditor test
pnpm --filter gamelayouteditor typecheck
pnpm --filter gamelayouteditor lint
pnpm --filter gamelayouteditor build
pnpm --filter gamelayouteditor format:check
git diff --check
```

如果修改了 `packages/rendercore`，额外运行：

```bash
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore lint
pnpm --filter @slotclientengine/rendercore build
```

若 pnpm 因网络失败，先设置第 2 节代理再重试。若 format check 只报告本任务文件，按仓库 Prettier 配置格式化精确文件；
不得格式化全仓库或改无关文件。

## 9. 手工验收

### 9.1 新建项目

1. 打开编辑器，点击“新建项目”。
2. 确认只有一个适配模式下拉框，创建按钮初始不可用。
3. 分别选择单背景、横竖双背景，确认项目 mode 正确。
4. 打开后取消，确认原项目未变化。

### 9.2 状态列表

1. 打开“管理状态”，确认 BaseGame 可见并标记 initial。
2. 输入 FreeGame 并新建；dialog 保持打开，FreeGame 立即出现并选中。
3. 重命名为 BonusGame，确认所有可见 selector 同步。
4. 先把 BonusGame 设为 initial，再删除 BaseGame；确认列表和 workspace 仍一致。
5. 尝试非法/重复 id，确认显式失败且没有自动修名。

### 9.3 Spine 转场

1. 创建两个状态和一条配置完整的 Spine 直接有向边。
2. 选择目标后确认状态依次显示准备、ready。
3. 点击一次“切换到该状态”，确认 once、switch event、after-switch 和完成状态正确。
4. 缺反向边时尝试返回，确认明确提示缺边而不是瞬切。

### 9.4 MP4 转场

1. 导入带声音 MP4，配置 video edge 和合法 fadeOutSeconds。
2. 选择目标，确认无需手动点“预加载”，状态显示“开始准备 MP4 与目标场景”以及 ready。
3. ready 后点击一次状态切换，确认声音和画面同步开始。
4. 观察 before-switch、fadeStart 原子切场、after-switch 收尾和 ended 完成。
5. 在准备中改变目标/替换资源，确认旧结果不污染新状态。
6. 模拟 play 拒绝，确认来源画面保持、错误可见且没有静音/瞬切 fallback。
7. 在窄屏/宽屏播放中改变 preview viewport，确认同一 video timeline 继续、contain + black fill 不变。
8. iOS Safari 真机切到后台再回来：记录 video 是否 pause、回前台是否自动恢复、`play()` 是否需要新的用户手势。
   本项是 production follow-up 的证据采集；当前 runtime 没有 resume API 时不得在 editor 临时复制播放器恢复逻辑。
9. 连续播放至少两次 MP4：记录是否复用 media element。若当前 editor 仍是 per-transition element，确认每次由真实状态
   切换点击启动；不得把桌面浏览器自动允许误写成 iOS 已验证。

## 10. `agents.md` 更新判断

本任务结束时必须检查 `agents.md`，不能无条件跳过。

需要更新的条件：

- editor 最终从手动三按钮改为自动 prepare + 单一状态切换动作；或
- 新增了持久的 transition preparation/session ownership 约束；或
- production 预热边界有新的仓库级决定。

若只是 CSS 或测试命名调整，不需要新增规则。若更新，必须放在现有 gamelayouteditor/scene-layout 段落，使用一句或
少量几句稳定约束，不写实施细节、类名或临时测试信息。

## 11. 任务报告要求

报告必须使用中文，至少包含：

1. UTC 时间、branch、起止 HEAD、开始和结束工作区状态；
2. 实际修改文件和每个文件的职责；
3. 新建项目 select 的最终行为；
4. 状态列表和 transaction/selection 顺序的修复方式；
5. MP4 automatic prepare、single prepared target、trusted-click 的最终实现；
6. “资源已下载 / media ready / target scene ready”的实际状态定义；
7. 自动测试命令与结果；
8. Spine、带声音 MP4、错误路径的手工验收结果；
9. `agents.md` 是否更新及理由；
10. 已知限制和后续工作，尤其是“多目标 media-only pool 不属于本任务”。
11. iOS 真机的连续播放、切后台/回前台、`play()` rejection 与恢复入口验收结果；未执行必须明确记录。

报告不得把“测试通过”写成“所有浏览器均已验证”；未做 iOS 真机验收时必须如实注明。

## 12. 完成定义

只有同时满足以下条件才可宣告完成：

- 新建项目适配模式已统一为 strict select；
- 管理状态 dialog 中可直接看到并操作完整状态列表，新增后立即可见；
- Spine 与 MP4 通过同一个产品级状态切换动作工作；
- MP4 自动准备且有准确的中文阶段提示；
- audible video 仍由真实点击同步触发，没有 autoplay/静音/瞬切 fallback；
- 文档没有声称一次历史点击永久解锁所有视频，并明确 production 必须为 iOS 前后台恢复失败提供用户入口；
- stale prepare、project replace、error、destroy 均有确定性清理；
- 文档准确回答 production 初始化预热和浏览器缓存边界；
- 要求的测试、类型检查、lint、build、format check 和手工验收完成；
- 必要的 `agents.md` 更新已完成；
- 已生成符合命名规则的中文任务报告。
