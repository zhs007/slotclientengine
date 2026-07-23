# Task 123：Game Viewer 零代码游戏模板运行器初始化计划

## 1. 任务目标

本任务新增一个纯前端项目：

```text
apps/gameviewer
```

它不是新的 Game Layout Editor，也不是把 `game002` 复制一份后替换素材。它应当把此前已经逐步从 `game002` 抽入 `rendercore`、`logiccore` 和 `gameframeworks` 的能力收口成一个通用游戏模板。对一个新游戏，用户只需要提供和确认配置，不再创建或修改一套游戏 TypeScript/CSS：

1. 用户上传 `gamelayouteditor` 导出的完整 scene-layout ZIP。
2. 用户可导入服务器作者配置 JSON；配置器遍历其中的下注方式，再遍历所选下注方式下的组件名称、类型和配置摘要，用它们生成职责候选。
3. 用户显式配置要连接的外部 live server URL、gamecode、投注参数、组件职责和表现参数；gameviewer 不启动、托管或模拟游戏服务器。
4. 页面在启动前对 ZIP、公开本地轮带、最终组件绑定和表现能力做完整 readiness 校验；服务器作者配置只帮助填写这些字段，不属于运行依赖。
5. 用户点击“在新窗口运行”后，浏览器同步打开一个独立游戏窗口；新窗口把上述两类配置交给同一个 shared template factory，分别选择“转轮呈现方式”和“round flow”，直接得到可连接、可 spin、可播放中奖流程的游戏。
6. 通用 GMI/组件语义归 `packages/logiccore`；现有 Pixi、scene-layout、各种 reel presentation、symbol、popup 和 cascade 表现继续归 `packages/rendercore`；模板 factory、round flow/session/UI/adapter 协调归 `packages/gameframeworks`；`apps/gameviewer` 只拥有配置器 UI、会话草稿、导入/选择动作和启动窗口通信。

核心完成标准不是“Crave 能跑”这一件事，而是：

```text
为下一个游戏制作实例
  = 上传另一个 gamelayouteditor ZIP
  + 导入/手填组件配置
  + 在 UI 中确认映射
  + 点击运行
```

这条链路不得要求新增 app、复制 adapter、编写 resolver、改 Vite glob、改 shared source 或重新 build 一份游戏专属代码。Task 123 可以为整个仓库补一次通用模板装配代码；模板建成后，每个游戏实例必须是零游戏代码。

```text
轴一：reel presentation
  standard-v1
  grid-cell-v1
  future typed reel kinds

轴二：round flow
  base spin + optional win/value
  optional cascade block: remove -> dropdown -> refill
  future typed feature blocks
```

两条轴完全独立。`cascade` 不是 reel kind；它只是 round flow 中存在 remove/dropdown/refill。以下组合在模型上都合法：

```text
standard + base
standard + cascade
grid-cell + base
grid-cell + cascade
```

是否能运行由 reel runtime 公布的 capability 与 flow requirement 做严格匹配，不由 `standard/grid-cell` 名称硬编码。未来新增 reel presentation 时，只实现对应 capability，不复制 cascade 业务。

首个可验收目标是当前 Crave 输入：

```text
/Users/zerro/Downloads/crave.zip
docs/crave/crave.json
```

但 production 代码不得硬编码 `crave`、`retrosweets`、`game002`、`bg-spin`、`bg-win`、`WL`、`CN` 或当前 gamecode。上述名称只允许出现在测试 fixture、手工验收记录和用户创建的 project draft 中。

任务完成后必须新增中文任务报告：

```text
tasks/123-gameviewer-runtime-configurator-[utctime].md
```

UTC 时间戳使用：

```bash
date -u +%y%m%d-%H%M%S
```

例如：

```text
tasks/123-gameviewer-runtime-configurator-260401-181300.md
```

## 2. 制定计划时的现场与输入事实

### 2.1 仓库现场

制定本计划时现场为：

```text
repository: /Users/zerro/github.com/slotclientengine
branch:     main
HEAD:       1b6951a65df7e42eb851e2c20397285d2a0ef014
status:     docs/crave/ 为用户新增的 untracked 输入
date:       2026-07-23 (Asia/Shanghai)
```

实施开始时必须重新记录：

```bash
git status --short --branch
git rev-parse HEAD
git log -1 --oneline
```

上述现场只是计划制定记录，不是实施时覆盖用户修改的理由。`docs/crave/` 和任何其它已有修改、untracked 文件都属于用户；不得 reset、stash、clean、checkout 覆盖或顺带提交。若要把 `docs/crave/crave.json` 纳入版本控制，必须先确认这是用户希望提交的 fixture，而不能因本任务自动 `git add`。

### 2.2 `crave.zip` 已确认事实

计划制定时输入为：

```text
path:   /Users/zerro/Downloads/crave.zip
size:   9,832,922 bytes
sha256: 1ddb837827ebf0aaa68f6e61c0c4c4fdb012211429f788897e7e6d6f5ae1540b
entry:  121
uncompressed total: 13,324,795 bytes
```

它是当前 `gamelayouteditor` 导出的 filename-key、SHA-256 content-addressed scene-layout v1 ZIP，根控制文件为：

```text
layout.manifest.json
assets.map.json
```

其余文件全部位于 `assets/<完整 sha256>.<ext>`。已确认内容包括：

- `layout.manifest.json`：`2000 x 2000`、`maximized-focus`、`840 x 1200` focus、`6 x 9` main reel、`120 x 120` cell；
- `BaseGame` / `FreeGame` 两个 mode 和显式双向 Spine transition；
- `game002-s3` symbols package，绑定 layout 的 `main` reel 和 package 内 `reels-001`；
- package 内 `gameconfig.json`，与当前 `assets/gamecfg002/gameconfig.json` 逐 JSON 值一致，包含前端公开本地 `reels-001`；
- symbol state manifest、official Spine 4.3 资源、CN per-tier value presentation、image-string digits；
- strict `award-celebration` popup package `bigwin2`；
- 背景 Spine 和精确 atlas page -> filename key 映射。

ZIP 不包含当前 `game002` 的 `reel.manifest.json`、Nearwin1/Nearwin2、独立 win-amount package 或 game002 app 内的专属 cascade timing。因此 Task 123 不能伪造这些资源，也不能宣称达到 game002 全部期待动画和临时 win-amount 的像素级、时序级一致。首版必须复用 ZIP 实际拥有的 scene-layout、symbols、CN value presentation 和 popup；缺失能力在 readiness/文档中明确列出。若以后要求 game002 完整视觉一致，应先扩展上游 production package 闭包或新增显式 dependency，而不是在 gameviewer 里按文件名找仓库 assets。

### 2.3 `docs/crave/crave.json` 已确认事实

计划制定时输入为：

```text
path:   docs/crave/crave.json
size:   39,591 bytes
sha256: a6c2390caf358c9ff8233a4afa291a4695c8d711019661093bf25ae3bafddd57
```

它是服务器作者工具配置，不是 GMI spin response，也不是前端运行 package。它只用于配置器遍历下注方式和组件、生成候选映射；不启动服务器、不执行 graph，也不进入游戏运行窗口。已确认摘要：

```text
gameName: retrosweets
gamecode: 065P8NOEgwdSXFTB6uDqX
Width:    6
Height:   9
GameType: cascading
bet method: normal / bet=30 / totalBetInWins=30
```

其 `betMethod[].graph.cells[]` 中的非 edge component node 声明：

| server node type | component name | 对当前配置器的候选职责 |
| --- | --- | --- |
| `BasicReels2` | `bg-spin` | 初始停轮 scene |
| `ClusterTrigger` | `bg-win` | 中奖 results |
| `GenSymbolVals2` | `bg-gencoins` | symbol value otherScene |
| `RemoveSymbols` | `bg-remove` | remove 语义/忽略 symbol 建议 |
| `Respin` | `bg-respin` | 可选 cascade step marker |
| `DropDownSymbols2` | `bg-dropdown` | dropdown scene/hold symbol 建议 |
| `RefillSymbols2` | `bg-refill` | refill scene |

服务器配置的 `repository` 还含 paytable、`reels-001`、`reels-002` 和权重表。Task 123 不需要遍历或解析这部分内容；它不得被 live game runtime 当成本地轮带、不得打进启动 payload、不得导出成 gameviewer project。特别是 server `bg-spin.configuration.reelSet` 当前为 `reels-002`，而 ZIP symbols package 显式绑定的是前端公开 `reels-001`；组件候选 UI 可以展示前者的配置摘要，但两者不要求相等。live 滚动必须使用 ZIP 内公开轮带，再把服务器返回的目标可见 scene 覆盖进本轮临时轮带窗口，不能读取、缓存或泄露服务器真实轮带。

服务器作者配置只用于：

- 给出 gamecode、尺寸、game type 和全部 bet method 候选；
- 用户选择一个 bet method 后，建立该下注方式自己的 component catalog；
- 根据明确、已支持的 server node type 产生“待用户确认”的职责建议；
- 提供 remove ignore、dropdown hold、coin/value symbol 等候选策略；
- 帮助用户填写最终通用 profile。

graph edge、jump、loop 和 server repository 都不属于这条配置辅助链路。服务器作者配置不得直接驱动 live round，也不得因某个 component 名称看似熟悉而自动提交 production profile。新窗口只接收用户确认后的通用 component/profile 配置，不接收原始服务器作者 JSON。

### 2.4 `game002` / `game003` 模板化假设

Task 123 以如下映射作为实施假设，并在 Phase 0 用 `game002` 和 `game003` 代码/测试逐项证实或修正：

| 当前 game002 内容 | 模板后的 owner |
| --- | --- |
| background、focus、reel geometry、game modes、transitions | `crave.zip` 的 scene-layout manifest/runtime |
| symbol gameconfig、公开轮带、state texture、Spine、value tiers、renderPriority | ZIP 内 symbols package + rendercore |
| popup tier、layer、amount format、资源 | ZIP 内 popup package + rendercore |
| server URL、gamecode、bet/lines/times、UI 选择 | gameviewer 基础配置 + gameframeworks |
| `bg-spin/bg-win/bg-remove/...` 常量 | 用户确认的 component profile |
| WL 不 remove/drop、CN 是 value symbol | profile 中的 symbol policy，不是代码分支 |
| GMI component/scene/otherScene/result 查询 | logiccore 现有 API |
| game003 普通主转轮 spin/stop、公开轮带临时落点 | rendercore `RenderReelSet` / standard reel presentation API |
| game003 `bg-wins` 一类普通中奖轮播 | rendercore symbol-win-carousel API + component profile |
| win group、remove group、dimming、summary | rendercore 现有 symbol-cascade API |
| grid-cell spin、drop、dropdown、refill、value continuity | rendercore 现有 reel/cascade API |
| framework connect/spin/present/collect/UI state | gameframeworks 现有 lifecycle |
| game002/game003 adapter 中的主转轮装配顺序 | gameframeworks flow template + rendercore 最薄 coordinator |
| Nearwin、独立 win-amount 等 ZIP 未携带能力 | 首版关闭并明确说明，不猜仓库资源 |
| game003 `bg-bar`、矿车等主转轮外业务 | 不伪装成 standard reel；后续作为显式 typed extension 加入 shared template |

game002 是当前 `grid-cell + cascade` 样例，game003 主转轮是当前 `standard + base` 样例；它们不能被误写成仅有的两个封闭游戏类型。实施者不能把“当前 game002/game003 app 仍有大量代码”理解为 gameviewer 要重写相近规模代码。Task 123 的主要新增物应当是正交的 versioned reel/flow config、职责选择 UI和一次性通用装配入口。

## 3. 产品边界与首版范围

### 3.1 必须完成

- 新建 `apps/gameviewer`，提供配置器入口和独立 runtime 窗口入口。
- 先完成 `game002 -> 已有 shared 能力 -> 配置字段` 的差异盘点，证明哪些现有 app 文件会被 ZIP、组件配置或通用模板替代；未完成这张盘点表前不得开始另写 renderer/player。
- 上传并严格校验 scene-layout ZIP，显示 manifest、mode、reel、symbol package 和 popup 摘要。
- 导入服务器作者配置 JSON，遍历 bet methods，并为当前选中下注方式列出 component name/type/configuration 摘要；不解释 graph edge，不保留/传播 server repository reel 数据。
- 配置外部 live server URL、gamecode、client type、jurisdiction/language、timeout、bet/lines/times 等基础字段；不创建任何服务器进程。
- 独立配置 strict reel presentation union：首版 `standard-v1 | grid-cell-v1`，并定义未来新增 kind 的 typed 扩展边界。
- 独立配置 round flow：main spin、一个或多个 win、可选 value update，以及可选 cascade block（必需 remove/dropdown/refill、可选 step marker 和 symbol policy）。
- 配置 reel presentation 的运动参数与 flow block 的表现参数：共同的 symbol state/金额/popup、standard 的逐轴 timing/stop/bounce、grid-cell 的逐格 timing，以及与 reel kind 无关的 win/dimming/remove/drop/refill。字段必须有明确单位和 strict 范围。
- 在启动前编译并显示 immutable readiness snapshot；任何错误都禁止启动。
- 在 `gameframeworks` 提供一个 shared scene-layout game template factory；新窗口只解析 launch payload并调用该 factory，不手写 game002-like adapter。
- 首轮 initial scene、spin、component-driven wins、remove/dropdown/refill、CN value continuity、collect、下一 spin cleanup 能完成。
- 完成四组合验收：现有 Crave `grid-cell + cascade`、standard synthetic `standard + base`、`standard + cascade`，以及 `grid-cell + base`。不改任何 production source，通过同一 factory 实例化。它用于证明两轴正交，不能只是复制 Crave fixture 改 id。
- 对当前 Crave 做真实文件导入验收；若 live 凭据可用，做受控 live smoke test；若不可用，使用忠实 GMI fixture 验证完整 round，不伪造“live 已通过”。
- 更新相关 README、公共 exports、测试和 `agents.md`，并写任务报告。

### 3.2 明确非目标

- 不修改、重新导出或替代 `gamelayouteditor`；gameviewer 只消费 production ZIP。
- 不生成一个新的静态 `apps/gameXXX` 源码目录，不动态执行用户 JavaScript，不提供脚本编辑器。
- 不在 `apps/gameviewer` 中复制 `game002`/`game003` adapter、reel runtime、cascade sequence 或 rendercore 已有算法。
- 不启动本地或远程服务器进程，不把服务器作者 JSON 转换成可执行 server graph，也不模拟服务端随机、结算或 component 执行。
- 不尝试解释任意 server node type；首版 reel presentation 只支持明确列出的 `standard-v1 | grid-cell-v1`，flow 只支持 base + optional cascade block；未知类型可进入 catalog 但不能被当成已支持职责。
- 不从 server authoring graph 自动还原完整服务器算法、分支、jump、loop 或真实 reel strip。
- `standard-v1` 只描述普通逐轴 reel presentation，不代表 flow 一定非 cascade，也不自动包含 game003 的 `bg-bar`、矿车、ways 专属校验，以及 hold-and-win、free-spin 计数器、bonus pick、购买功能。
- 新 reel kind 与主转轮外 feature 后续分别作为 versioned typed reel union / flow extension 加入，并由 shared package实现；未知 kind/extension 以明确 unsupported diagnostic 失败。
- 不为缺 component、缺 animation、缺 value、缺 popup、非法 GMI、play rejection 或资源加载失败增加 silent fallback。
- 不自动把 `BaseGame` 切到 `FreeGame`。当前 server 配置没有定义通用 mode transition resolver；首版稳定运行 initial mode。未来 mode 触发必须新增显式、typed profile，而不是猜 `curGameMod` 或 component 名。
- 不复制 game002 的 anticipation/Nearwin、CN 专属业务 resolver、win summary 样式或临时 win-amount 路径。
- 不为了“架构完整”预先创建第二套 reel、cascade、symbol state、popup、ticker 或 amount player；必须先证明现有 public API 无法由配置装配，再增加最窄的 shared seam。
- 不把 token、platform credential、完整 server authoring JSON 或 GMI 写入 URL、localStorage、导出的 project JSON或日志。
- 不在配置器中预连接 WebSocket。只有独立 runtime 窗口通过 readiness 后才能创建 live session。

## 4. 总体架构、模板入口与依赖方向

目标依赖方向：

```text
apps/gameviewer
  |-> @slotclientengine/gameframeworks
  `-> 浏览器 File / Window API

@slotclientengine/gameframeworks
  |-> @slotclientengine/logiccore
  |-> @slotclientengine/netcore
  |-> @slotclientengine/uiframeworks
  `-> @slotclientengine/rendercore（仅 scene-layout template 子入口）

@slotclientengine/rendercore
  |-> @slotclientengine/logiccore
  |-> @slotclientengine/browserartifactio
  `-> existing Pixi / Spine / VNI packages

@slotclientengine/logiccore
  `-> zero runtime dependencies
```

禁止形成：

```text
logiccore      -> DOM / Pixi / rendercore / gameframeworks / app
rendercore     -> gameframeworks / netcore / app
gameframeworks -> gameviewer / crave-specific config
shared package -> bg-spin / bg-win / WL / CN / game002
```

`apps/gameviewer` 不应自己拼装 rendercore players，也不应直接依赖 `@slotclientengine/logiccore`、`@slotclientengine/rendercore`、Pixi 或 Spine。需要的配置 parser/type 和最终 template factory 由 `gameframeworks` 的专用子入口窄导出，保持“游戏只依赖 framework facade”的仓库方向。

建议新增 public 子入口：

```text
@slotclientengine/gameframeworks/scene-layout-template
```

其核心入口应接近：

```ts
createSceneLayoutSlotGameTemplate({
  root,
  layoutZipBytes,
  config,
  credential,
}): Promise<SlotGameFramework>
```

字段名可调整，但调用方不应再传 Pixi Application factory、RenderGridCellReelSet、Spine player、cascade callbacks 或 game-specific resolver。factory 内部组合现有 `logiccore`、`rendercore` 和 framework API，并返回统一 framework lifecycle。

如果把 rendercore 依赖加入 `gameframeworks` 顶层会影响现有非渲染 consumer，可用独立 Vite/TypeScript entry 和 exports subpath隔离源码/打包入口；不要因此退回 app 直接装配所有 player。

## 5. 统一配置模型

### 5.1 Project draft 与 launch session 分离

配置器内存中维护一个 versioned draft，建议 schema：

```ts
interface GameViewerProjectV1 {
  readonly version: 1;
  readonly kind: "game-viewer-project";
  readonly title: string;
  readonly layout: {
    readonly fileName: string;
    readonly sha256: string;
  };
  readonly serverAuthoring?: {
    readonly fileName: string;
    readonly sha256: string;
    readonly gameName?: string;
  };
  readonly live: {
    readonly serverUrl: string;
    readonly gamecode: string;
    readonly clienttype: string;
    readonly jurisdiction?: string;
    readonly language?: string;
    readonly requestTimeoutMs: number;
  };
  readonly wager: {
    readonly betOptions: readonly {
      readonly bet: number;
      readonly lines: number;
      readonly times?: number;
      readonly label?: string;
    }[];
    readonly initialBetIndex: number;
    readonly autonums?: number;
  };
  readonly round: SlotRoundFlowProfileV1;
  readonly presentation: {
    readonly reel: SlotReelPresentationProfileV1;
    readonly flow: SlotFlowPresentationProfileV1;
  };
}
```

字段名可按现有风格微调，但必须满足：

- project 只保存可审计的配置和输入摘要，不内嵌 10MB ZIP bytes；运行会话在内存中单独持有 bytes；
- `serverUrl` 只允许 `ws://` / `wss://`，production UI 默认要求 `wss://`，localhost 开发可显式允许 `ws://`；
- URL 不接受 query/hash 注入；gamecode/clienttype 等 trim 后非空；重复 alias 不存在；
- 所有整数、金额、毫秒、秒数都 strict 校验，不用 truthy default；
- project export/import 若在本任务实现，必须是配置 JSON，不偷偷 vendor ZIP；重新导入后应明确要求用户重新选择 hash 匹配的 ZIP；
- token/businessid 等 session credential 不属于 project。它们只存在 launch form 和单次启动 payload，默认不持久化。

### 5.2 `SlotRoundFlowProfileV1`

round flow 是通用语义配置，归 `logiccore` parser/validator 所有。cascade 是可选 block，不是顶层 kind：

```ts
interface SlotRoundFlowProfileV1 {
  readonly kind: "slot-round-flow";
  readonly version: 1;
  readonly components: {
    readonly spin: string;
    readonly wins: readonly string[];
    readonly valueUpdates?: readonly string[];
  };
  readonly cascade?: SlotCascadeBlockProfileV1;
  readonly amount: AmountFieldProfileV1;
}

interface SlotCascadeBlockProfileV1 {
  readonly kind: "cascade";
  readonly version: 1;
  readonly components: {
    readonly remove: string;
    readonly dropdown: string;
    readonly refill: string;
    readonly stepMarker?: string;
  };
  readonly symbols: {
    readonly emptyCode: number;
    readonly removeExcludedSymbols: readonly string[];
    readonly dropHeldSymbols: readonly string[];
    readonly valueSymbols: readonly string[];
    readonly sequentialWinCompanionSymbols?: readonly string[];
  };
  readonly amount: AmountFieldProfileV1;
}

interface AmountFieldProfileV1 {
  readonly cashFields: readonly ("cashWin64" | "cashWin")[];
  readonly coinFields?: readonly ("coinWin64" | "coinWin")[];
  readonly cashUnit: "cents";
}
```

规则：

- main spin/win/value 对所有 reel presentation 通用。
- component name 必须非空。已导入 server config 时，UI 只允许从当前所选 bet method 的 component catalog 选择，并根据 node type 给出职责候选；未导入时允许手工填写。runtime correctness 最终仍以 GMI contract 和 profile compiler 校验为准，server catalog 不是运行时依赖。
- wins/valueUpdates 可有多个，顺序就是执行顺序；去重且不能空洞。
- `cascade` block 要么不存在，要么完整声明 remove/dropdown/refill 与 symbol policy；不允许半个 cascade。`stepMarker` 只用于确实有独立 respin/cascade marker component 的服务端协议，缺失时不伪造。
- cascade symbol name 必须在 ZIP package gameconfig/symbol catalog 中存在；empty code 允许负整数，但不能与 display symbol code 冲突。
- `cashFields` 表达“按字段存在性选择”的优先级，不是 truthy fallback；选中的值必须是 positive safe integer 或按当前 step 规则允许的 zero。
- profile 只描述语义，不包含动画名、秒数、颜色、Pixi placement。
- server config 产生建议时，`RemoveSymbols.ignoreSymbols`、`DropDownSymbols2.holdSymbols`、`GenSymbolVals2.srcSymbols` 可以预填 review 表，但用户必须点击确认，且确认后写入上述通用字段。
- server `GameType=cascading` 只能建议添加 cascade block；用户必须确认，不能改变 reel presentation kind。

### 5.3 `SlotReelPresentationProfileV1`

reel presentation 是第二条独立轴，归 rendercore parser/validator 所有：

```ts
type SlotReelPresentationProfileV1 =
  | StandardReelPresentationProfileV1
  | GridCellReelPresentationProfileV1;
```

`StandardReelPresentationProfileV1` 至少包括：

- `kind: "standard"`；
- direction、speed、minimum cycles；
- reel start/stop order、per-reel start/stop delay；
- `bounceStrength`，以 `1` 表示 rendercore 原始力度、非负缩放；
- landing appear/normal state capability。

`GridCellReelPresentationProfileV1` 至少包括：

- `kind: "grid-cell"`；
- initial grid-cell spin：direction、start order、per-cell/per-column start/landing cadence、speed、minimum cycles、settle；
- cell order/effect gate/landing appear/normal state capability。

reel presentation `kind` 必须与 scene-layout symbol binding 的 `renderMode` 相容：

```text
standard  <-> renderMode=standard
grid-cell <-> renderMode=grid-cell
```

这条兼容只决定如何显示和运动 reel，不决定是否 cascade。未来新增 reel kind 必须扩展这个 versioned union、scene-layout binding 和 rendercore factory，不能用字符串 registry 或 app callback 绕过。

### 5.4 `SlotFlowPresentationProfileV1`

flow presentation 与 reel kind 解耦，至少包括：

- symbol states：win、remove、normal；状态必须由 symbol manifest capability 校验；
- win result order、首轮 blocking、后续 lingering、金额 formatter；
- value presentation 和 current occurrence continuity；
- popup、next-spin cleanup、pointer advance；
- cascade block 存在时：emphasis/dimming、remove、dropdown/refill movement、refill spin timing。

rendercore 应定义 reel capability contract，例如：

```ts
interface SlotReelPresentationCapabilities {
  readonly spinToScene: true;
  readonly visibleSymbolStates: true;
  readonly removeOccurrences: boolean;
  readonly dropdownOccurrences: boolean;
  readonly refillOccurrences: boolean;
}
```

具体名称可调整，但 readiness 必须根据 flow requirement 匹配 capability，而不是写：

```ts
if (reel.kind === "grid-cell" && flow.cascade) ...
```

首版必须让 `standard` 与 `grid-cell` 都能声明 cascade 所需 capability，或补齐 standard 的通用 remove/dropdown/refill seam；不能在 schema 上禁止 `standard + cascade`。默认值只能是 schema 明确、产品认可的通用默认，并在 UI 中可见；不得从 game002/game003 源码偷取隐藏默认。任何默认都要有单元测试。若 ZIP manifest 没有对应能力，readiness 应失败，不允许降级到另一 reel kind 或 builtin 动画。

## 6. `logiccore` 实施计划

### 6.1 Server authoring config 摘要 parser

建议新增：

```text
packages/logiccore/src/server-authoring-config.ts
packages/logiccore/tests/server-authoring-config.test.ts
```

提供 browser-safe、纯函数 API，名称可微调：

```ts
parseServerGameAuthoringSummary(input: unknown): ServerGameAuthoringSummary
getServerBetMethodComponentCatalog(
  summary: ServerGameAuthoringSummary,
  betMethodId: string,
): ServerComponentCatalog
suggestSlotRoundFlow(catalog: ServerComponentCatalog): SlotRoundFlowSuggestions
```

parser 必须：

- strict 解析 `gameName/gamecode/parameter/betMethod[].label/bet/totalBetInWins`；
- 保持 bet method 的声明顺序，使 UI 可遍历和切换；
- 对每个 bet method，只从 `graph.cells[]` 的非 edge node 提取 stable node id、server node type、component name、configuration 的只读摘要；
- 忽略 edge、port、position、size、view、controller 和其它作者工具 UI/执行图字段；不校验、不执行这些关系；
- 同一 bet method 内 component name 或 component node id 重复时立即失败；不同 bet method 可以有同名 component，它们属于各自 catalog；
- 对未知 node type 保留为 `unsupported`，不猜行为；
- 完全忽略 `repository`，不遍历其中的 reel rows、paytable workbook 或 weight workbook，也不把它们放入返回对象；
- 不执行服务器 graph，不解析为 GMI，不依赖 X6/React graph 类型。

suggestion 只针对用户当前选中的 bet method catalog 和明确支持的类型映射，给出 base spin/win/value 以及 optional cascade block 候选，并标记 `suggested/requiresReview/unsupported`；它不选择 standard/grid-cell reel presentation。切换 bet method 后必须重新生成候选并要求 review，不能沿用上一下注方式的 component object。Crave fixture 应覆盖 `normal` 下注方式和本计划第 2.3 节的七个 component；另有 base-flow fixture 覆盖 spin + win component。

### 6.2 Profile parser 与 compatibility validator

建议新增：

```text
packages/logiccore/src/slot-round-flow.ts
packages/logiccore/tests/slot-round-flow.test.ts
```

职责：

- strict unknown-key rejection；
- base component list、optional complete cascade block、symbol list、amount field preference、empty code 校验；
- 可选校验 profile 与当前 bet method component catalog 的 node type compatibility；
- profile 与 `LogicGameConfig` 的 symbol/reel compatibility；
- 输入冻结，错误包含精确字段路径；
- 不使用 `as` 绕过 runtime validation，不提供旧字段 alias/fallback。

### 6.3 通用 base round prefix

先对照 `apps/game003` 主转轮与已有：

```text
logiccore component/result helpers
rendercore RenderReelSet / spin plan
rendercore symbol-win-carousel
gameframeworks round lifecycle
```

logiccore 把所有 `SlotRoundFlowProfileV1` 都具有的 base 部分标准化；它既用于没有 cascade block 的完整 round，也作为 cascade round 的共同前缀：

- mainSpin component 指向的唯一 authoritative target scene；
- ordered win components 和各自 usedResults；
- optional value update component/otherScene；
- step/component/index 诊断；
- final scene/value snapshot。

它不创建 stop y、reel motion、symbol state或 carousel，也不知道 standard/grid-cell。scene 缺失/多份、维度非法、result position 越界、amount field非法均 fail-fast。base prefix 必须复用现有 `GameLogic`/component helper，不能复制 game003 GMI parser；存在 cascade block 时，由 6.4 在同一个 semantic plan 中追加 cascade steps，不能重新解析或重新播放 initial spin。

### 6.4 Optional cascade block sequence

本节不是要求从零再写一个 cascade engine。实施前先对照：

```text
packages/logiccore/src/game-logic.ts
packages/logiccore/src/component.ts
packages/logiccore/src/win-results.ts
packages/rendercore/src/symbol-cascade/**
packages/rendercore/src/reel/grid-cell-cascade-plan.ts
apps/game002/src/cascade-sequence.ts
```

列出 `cascade-sequence.ts` 每一类逻辑属于：

```text
A. logiccore 已有 component/scene/result 查询
B. rendercore 已有通用 win/remove/drop/refill/value 算法
C. 仅把 A/B 按 game002 常量串起来的 orchestration
D. 真正的 game002 业务语义
```

目标是只把 C 收敛成配置驱动的通用 sequence builder；A/B 直接复用，D 转成显式 profile 字段或明确留在首版范围外。不得把 A/B 复制进新的 compiler，也不得把整个 game002 文件改名后搬进 shared。

若盘点证明缺少通用 sequence builder，再建议新增：

```text
packages/logiccore/src/slot-cascade-block.ts
packages/logiccore/tests/slot-cascade-block.test.ts
```

窄输入：

```ts
compileSlotCascadeRound({ logic, gameConfig, profile }): SlotCascadeRoundPlan
```

输出只负责把现有查询结果标准化为递归冻结、与 Pixi 无关的 semantic sequence，至少包含：

- initial step 的 authoritative spin scene 和 presentation value matrix；
- 每个 step 的 ordered win result groups/positions/amount；
- 每个 cascade step 中 remove/dropdown/refill component 指向的 source scene、target scene、positions、otherScene/value 输入；
- profile-derived remove exclusion、drop hold 和 value requirement 的纯语义 policy；
- refill positions、refill scene/new values；
- final scene/final values；
- source step/component/index 诊断信息。

logiccore 负责 component 触发、used index、result/amount、step 顺序、位置集合、authoritative scene/value 和 profile 的 fail-fast 规则。它不得输出 `grid-cell`、逐轴、逐格或其它运动语义。

rendercore coordinator 使用 `createLastUseRemoveGroups()` 等通用 helper 处理中奖与移除，再把同一个 semantic cascade step 交给所选 reel runtime 的 movement capability。现有 `createGridCellCascadeDropPlan()`、`createGridCellCascadeDropdownPlan()`、`deriveGridCellCascadeSettledValues()` 只能作为 `grid-cell` capability 的实现原语；实施者应盘点哪些 occurrence/value 搬运算法可以提升为 reel-agnostic helper，哪些 timing/path 必须留在 grid-cell adapter。standard reel 要通过自身 adapter 生成对应 dropdown/refill movement，不能调用一个改名后的 grid-cell plan 假装通用。两层、两个 adapter 都不得重复解析 GMI 或计算相互冲突的 authoritative scene。

整体必须继承当前已验证的 fail-fast 原则：

- initialSpin 恰好一份完整 scene；
- winning step 必须与后续 cascade step 关系一致；
- dropdown source 与上一阶段输出逐格相等；
- refill positions 必须精确等于 holes；
- refill scene 非 hole occurrence 必须保持；
- otherScene 缺省时，只允许从旧 occurrence 确定性搬运已有 value；新增 value symbol 无法推导时必须由配置绑定的 value component 提供；
- removeExcluded/dropHeld 由 profile 的 symbol resolver 决定，shared code 不出现具体 symbol；
- result position、scene 维度、component used index、cash/coin field、累计金额一致性严格校验；
- server randomNumbers 不用于视觉相位或 CN presentation；
- compiler 不产生 animation state、duration、Pixi object 或 DOM 文案。

现有 game002 测试 fixture 应复用来证明提炼前后语义一致，但不得为了测试保留 game002 名称分支。Task 123 完成前，`game002` 和 gameviewer 不能各自保留一份长期分叉的 cascade sequence；应让 game002 也消费新通用 sequence，或把唯一 sequence owner 放到更合适的 shared 层后让两者共同使用。

### 6.5 exports 与文档

- 从 `packages/logiccore/src/index.ts` 导出纯类型/parser/compiler。
- 由 `packages/gameframeworks/src/index.ts` 窄重导出 game app 需要的 API。
- 更新 `packages/logiccore/README.md`，明确 server authoring JSON 仅用于遍历 bet method/component 和生成配置建议；不执行 graph，live runtime 不消费原始 JSON 或 repository reels。
- 保持 logiccore CommonJS、zero runtime dependency 和 browser-safe 顶层入口。

## 7. `rendercore` 实施计划

### 7.0 先复用，后补 seam

`rendercore` 当前已经提供本任务需要的大部分原语和播放器，至少包括：

```text
createSceneLayoutPackageResource* / createSceneLayoutPackageRuntime
RenderReelSet / standard reel spin plan
createSymbolWinCarousel
RenderGridCellReelSet / createGridCellReelSpinPlan
createGridCellCascadeDropPlan / createGridCellCascadeDropdownPlan
deriveGridCellCascadeSettledValues
prepareSymbolWinGroups / createLastUseRemoveGroups
createSymbolCascadePlayer / createCumulativeWinSummary
symbol manifest-driven state/value/cascade presentation
award-celebration popup runtime
viewport / Spine / VNI / image-string resource lifecycle
```

Task 123 不重新实现这些能力。新增代码只应是把已有 API 按 normalized template config 装配起来的 coordinator，以及现有 public API 确实无法完成模板装配时的最小 seam。每增加一个新 runtime class，任务报告必须说明它复用了哪些现有 API、填补了哪个无法由配置表达的缺口，以及为什么不能扩展现有 owner。

### 7.1 production ZIP loader 收敛

当前 `apps/gamelayouteditor/src/io/imported-layout-zip.ts` 同时含 editor migration/metadata 逻辑和可复用的 strict runtime load。Task 123 不应复制它。

在 `@slotclientengine/rendercore/scene-layout` 增加窄的 production helper，或在 `browserartifactio` + rendercore 之间组合一个 shared loader：

```ts
loadSceneLayoutPackageFromZipBytes(options): Promise<SceneLayoutPackageResource>
```

要求：

- 使用 `browserartifactio.extractBoundedZip()`；
- limits 显式、可测试，默认至少覆盖当前 9.8MB/121-entry Crave，但不能无上限；
- production loader 只接受 canonical new ZIP；Finder wrapper/legacy migration 仍只属于 editor import boundary，runtime 不做迁移 fallback；
- 调用 `resolveSceneLayoutPackageFiles()`、`collectSceneLayoutPackagePaths()`、assets map hash/media/size/orphan validation；
- 图片、Spine、VNI、image-string、symbols、popup、video 使用现有 exact closure；
- 失败时销毁已创建 Object URL/resource；成功 resource 由 runtime/destroy owner 统一释放。

如将 helper 放入 rendercore，它不能依赖 app；如需 `fflate`，应继续通过现有 `browserartifactio` 间接使用，避免 app 新写 unzip。

### 7.2 Scene-layout 模板 coordinator

当前 `SceneLayoutPackageRuntime` 已拥有 layout、mode、reel、symbol package、popup 和 ticker update；`RenderReelSet`/`RenderGridCellReelSet` 分别拥有两种 reel presentation；symbol-win/symbol-cascade packages 已拥有 win、remove 和 value player。缺口是建立与具体 reel kind 无关的 capability seam，再按 declarative flow 串起已有能力，而不是缺少另一套 presentation engine。

优先扩展现有 scene-layout package runtime 或增加一个很薄的 coordinator：

```ts
createConfiguredSceneLayoutRoundRuntime({
  packageResource,
  reelPresentation,
  roundFlow,
  flowPresentation,
}): ConfiguredSceneLayoutRoundRuntime
```

它只承担：

- 初始化和持有现有 `SceneLayoutPackageRuntime`；
- reel factory 只根据 `reelPresentation.kind` 选择 `RenderReelSet`、`RenderGridCellReelSet` 或未来 typed implementation；
- flow coordinator 独立读取 `roundFlow.cascade`：不存在时使用 base win flow，存在时装配 symbol-cascade/remove/dropdown/refill；
- 将 template config 转成对应现有 reel/win/cascade/popup API 的 options；
- `applyInitialScene()`、`playRound()`、`applyViewport()`、`update()`、`requestAdvance()`、`destroy()`；
- 使用本地公开完整 strip + server visible target 临时窗口，不因目标 scene 无法在公开 strip 反查 exact stop 而失败；
- 每次 initial/refill spin 只使用注入的 Web Crypto phase random，不用 `Math.random`/server RNG；
- symbol playback capability、value tier、renderPriority、popup binding 全部继续从 package manifest/resource 读取；
- 把 semantic sequence 委托给对应的现有 standard win carousel 或 cascade win/remove/drop/refill players；
- 运行期间调用现有 player 的真实 update/completion，不另造 timer 状态机；
- next spin 调用现有 cleanup，不销毁稳定背景/symbol shared resource；
- fatal/destroy 统一释放现有 runtime owners。

禁止：

- app 直接操作 Pixi children、Spine tracks、CN tiers 或 scene-layout 私有 reel；
- shared code判断 `WL`/`CN`；
- 缺状态时使用 builtin/default animation；
- 用 `setTimeout` 假装 once 完成；
- 把配置器 preview runtime 和新窗口 live runtime 共享同一个 mutable resource owner。
- 为 coordinator 再创建一套与 `RenderGridCellReelSet`、`SymbolCascadePlayer` 或 `AwardCelebrationPlayer` 重叠的状态机。
- 通过 `reel.kind` 判断是否 cascade，或通过 `flow.cascade` 反向猜 standard/grid-cell。

为支持 `standard + cascade` 和未来 reel kind，rendercore 应把 cascade 对 reel 的要求收敛为通用 capability/target contract：

```ts
interface ConfiguredSlotReelTarget extends VisibleSymbolPresentationTarget {
  spinToScene(...): void;
  update(...): void;
  getSceneSnapshot(...): unknown;
}

interface ConfiguredSlotCascadeTarget extends ConfiguredSlotReelTarget {
  removeOccurrences(...): void;
  planDropdown(...): unknown;
  startDropdown(...): void;
  planRefill(...): unknown;
  startRefill(...): void;
}
```

实际名称/签名应复用现有 interfaces。`RenderGridCellReelSet` 和 `RenderReelSet` 通过 adapter 或窄扩展实现同一 cascade target；共享 cascade coordinator 只依赖 target contract，不使用 `instanceof` 决定业务 flow。未来 reel kind 只需实现所需 target capability。

### 7.3 Presentation profile validation

rendercore 应提供：

```ts
parseSlotTemplatePresentationProfile(input)
validateSlotTemplateCompatibility({
  roundFlow,
  reelPresentation,
  flowPresentation,
  packageResource,
})
```

readiness 要验证：

- layout `reels.main` 存在；
- `standard` 对应 `renderMode=standard`、`grid-cell` 对应 `renderMode=grid-cell`；这里只校验 reel factory，不推断 flow；
- logic dimensions 与 layout columns/rows 相等；
- standard/grid-cell 各自的 motion 字段严格校验；
- flow 无 cascade block 时不要求 cascade capability；有 cascade block 时，无论 reel kind，都必须满足 remove/dropdown/refill capability；
- selected states 在对应 flow 可能请求的所有 symbol capability 中存在，或 profile 明确声明某类 symbol 不请求该 state；
- valueSymbols 的 value presentation binding、tier、glyph/slot 闭包完整；
- popup enabled 时当前 initial mode 有显式 popup binding；
- timing finite、非负且阶段关系可满足；
- dimming alpha 在合法范围；
- amount formatter unit 与 raw field policy一致。

### 7.4 现有 runtime 回归

新增 API 不能破坏：

- gamelayouteditor preview；
- scene mode transitions、trusted-click video play、popup lifecycle；
- game002/game003 现有 app；
- symbolsviewer；
- rendercore exports 和 package build。

## 8. `gameframeworks` 实施计划

### 8.1 Scene-layout game template factory

`gameframeworks` 继续拥有 session、spin、presentation、collect 和 UI 状态，并增加整个零代码模板的唯一 app-facing factory。建议放在：

```text
packages/gameframeworks/src/scene-layout-template/
```

通过 subpath 导出：

```ts
createSceneLayoutSlotGameTemplate(options): Promise<SlotGameFramework>
```

要求：

- 这是唯一把 layout ZIP、normalized template config、live config和可选 credential 组合起来的 public 入口；
- 内部复用 `createSlotGameFramework()`，不复制 session/state/UI/collect；
- 内部根据 reel presentation union 创建 reel runtime，再独立根据 round flow 装配 base/cascade blocks；
- reel factory dispatch 只基于 normalized reel `kind`；flow dispatch 只基于 typed block presence/kind，不基于 component 名、gamecode、gameName 或 symbol；
- adapter 的 mount/applyInitial/play/destroy 时序与现有 framework 一致；
- 同一 runtime 不允许重入 round；
- logic sequence reject 时 render runtime 不 mutation；
- render runtime reject 时 framework 不 collect，并进入显式 error；
- destroy 后任何迟到 Promise 不得 apply/collect；
- initial scene 来源沿用 session userInfo/defaultScene 公共 contract，缺失时显式失败；
- UI muted/fast/auto snapshot 只通过已有 framework state 投影，不让 render runtime 反向拥有 framework；
- factory 完成后，`apps/gameviewer/runtime/create-game.ts` 只允许做 payload validation、查找 root、调用 factory 和显示 boot error；不得包含 component switch、reel plan、cascade loop 或 Pixi imports。

内部仍可保留窄的 planner/presenter interface 便于测试，但这些是 template factory 的实现 seam，不要求 gameviewer 逐项注入，也不应把一组低层 callbacks 暴露成新的“配置 API”。

### 8.2 Live/session 配置

继续复用现有：

```text
createSlotGameFramework()
prepareSlotGameLiveSession()
SlotGameLiveConfig
SlotGameUiFactory
```

Task 123 不新增第二套 WebSocket client，不直接调用 collect，不在 app 解包协议。若配置器未来使用 platform bootstrap，应作为显式 provider 注入；首版不要为了当前 viewer 强制迁移所有 platform 参数。

### 8.3 Frame policy

gameviewer 从 layout manifest adaptation 派生 framework frame policy：

- `maximized-focus` 使用 rendercore 现有 viewport size resolver，并传入 `gameframeworks` 的 `maximized-focus` policy；
- `orientation-focus` 使用 manifest 两个 variant 显式派生；
- app 不复制 focus/viewport 算法；
- frame design size 与 rendercore `applyViewport()` 输入必须来自同一 snapshot。

### 8.4 零代码实例合同

factory 的输入必须是完全 serializable、versioned、strict 配置。除 credential 和 ZIP bytes 外，同一 normalized config 重复创建得到相同的 component binding 和 presentation policy。

新增同类游戏时禁止要求调用方提供：

```text
custom TypeScript callback
symbol-specific resolver function
Pixi factory
Spine/VNI player factory
Vite import glob
game-specific adapter class
game-specific CSS selector
```

如果确有业务无法表达，应该新增 versioned typed config union 和 shared 实现，再由 editor/viewer 暴露对应 UI；不能在 gameviewer 中临时加入函数分支。

## 9. `apps/gameviewer` 项目初始化

### 9.0 App 必须保持薄

`apps/gameviewer` 的 runtime production dependency 原则上只有：

```text
@slotclientengine/gameframeworks
```

若 File/ZIP 的导入审查需要 shared browser helper，应优先由 framework template 子入口提供 `inspectSceneLayoutTemplateInputs()` 一类 facade；只有证明这会错误扩大 framework 职责时，app 才直接依赖 `browserartifactio`。app 不直接依赖 rendercore、logiccore、Pixi、Spine、VNI。

可以用 source-boundary test 强制：

```text
apps/gameviewer/src/runtime/** 不得 import @slotclientengine/rendercore
apps/gameviewer/src/runtime/** 不得 import pixi.js / spine / vnicore
apps/gameviewer/src/runtime/create-game.ts 不得出现具体 component/symbol 名
```

### 9.1 目录建议

```text
apps/gameviewer/
  README.md
  package.json
  index.html
  vite.config.ts
  tsconfig.json
  tsconfig.eslint.json
  eslint.config.cjs
  src/
    main.ts
    styles.css
    model/
      project.ts
      store.ts
      readiness.ts
    io/
      layout-import.ts
      server-config-import.ts
      project-json.ts
    ui/
      app-shell.ts
      layout-summary.ts
      live-config.ts
      logic-config.ts
      presentation-config.ts
      readiness-panel.ts
    runtime/
      entry.ts
      launch-channel.ts
      launch-payload.ts
      create-game.ts  # validation + 一次 factory 调用
    vite-env.d.ts
  tests/
    fixtures/
```

可按现有 editor 风格调整文件名，但 model、IO、UI、runtime launch 不得继续堆入单个 `main.ts`。

### 9.2 package scripts

至少提供：

```text
prepare:deps
dev
build
lint
test
typecheck
format
format:check
```

`prepare:deps` 只构建真实依赖的 workspace packages。项目使用 Vite + Vitest + ESLint + Prettier，根版本保持一致。原则上不新增 UI framework；沿用 editor 的原生 DOM/CSS，避免为表单引入 React。

### 9.3 配置器 UI 流程

UI 固定为分阶段 workspace：

```text
1. 运行包
   - 上传 layout ZIP
   - strict validation / 摘要 / hash

2. 服务器配置
   - 导入 authoring JSON（可选但 Crave 验收使用）
   - gamecode / dimensions / bet method 列表
   - 选择当前 bet method
   - 当前下注方式的 component catalog / unsupported nodes

3. 基础配置
   - server URL / gamecode / clienttype / jurisdiction / language / timeout
   - bet options / lines / times / initial bet

4. 逻辑配置
   - base component roles: spin / wins / value
   - cascade block: disabled | enabled
   - enabled 时配置 remove / dropdown / refill / symbol policy

5. 表现配置
   - reel presentation = standard-v1 | grid-cell-v1
   - 当前 reel kind 的 motion/timing
   - shared states / amount / popup
   - cascade block enabled 时配置 dimming/remove/drop/refill presentation

6. 启动检查
   - errors / warnings / normalized snapshot
   - 在新窗口运行
```

行为要求：

- 文件导入是 replace transaction；失败保留上一个有效 workspace，不留下半包 Object URL。
- server suggestion 只进入 review state，不自动覆盖用户已经修改的 profile；切换 bet method 时必须提示旧映射失效并重新 review。
- 切换 reel presentation 必须清除另一 reel union 分支的专属 motion 字段并重新 compatibility review，但不得删除 round flow/cascade block。
- 启用/关闭 cascade block 只改变 flow 配置，不得自动改变 standard/grid-cell 选择。
- 改变 ZIP、server config、logic/presentation field 都使旧 readiness snapshot 失效。
- error 展示保留来源层级和字段路径；不只显示“导入失败”。
- readiness warnings 不能代替 errors。只有明确列入非阻塞条件的项目才能 warning。
- 不在配置器里遍历或显示 server repository reel 内容；可显示“repository 不参与前端配置与运行”。
- 配置器如提供 preview，只允许静态 initial scene preview，不能连接 live 或启动第二个 framework；首版可不做 preview。

### 9.4 输入文件规则

- layout input 只接受一个 `.zip`，读取 bytes 后计算 SHA-256；不信任 MIME。
- server config 只接受一个 `.json`，UTF-8 fatal decode + JSON parse + logiccore parser。
- 重新选择同名不同 hash 文件必须进入明确 replace review。
- ZIP hash/JSON hash 用 Web Crypto；不可用时显式失败。
- 当前 Crave ZIP 的 121 entries/13.3MB 解压总量必须在 limits 内；测试同时覆盖 entry bomb、oversize、path traversal、case/NFC collision、bad map/hash、orphan、missing nested manifest。

## 10. 新窗口启动协议

### 10.1 同步打开，异步传输

点击 handler 必须先同步执行：

```ts
const child = window.open(runtimeUrlWithNonce, "_blank");
```

不能先 `await` ZIP decode/readiness，否则浏览器可能拦截 popup。readiness 必须在按钮启用前已经完成。`window.open()` 返回 null 时显示明确的“浏览器阻止新窗口”错误。

### 10.2 一次性 launch handshake

建议同源 `postMessage` + `MessageChannel`：

1. parent 生成 Web Crypto nonce，只把 nonce 放在 runtime URL fragment；不放 server/token/profile/ZIP。
2. child load 后向 `window.opener` 发 `ready(nonce)`。
3. parent 严格校验 `event.origin`、`event.source`、nonce 后转交一个 `MessagePort`。
4. parent 通过 port 发送 normalized config、ZIP bytes、单次 credential；使用 structured clone/transferable，发送后 parent 不再修改 payload。
5. child 回 `accepted` 后关闭 handshake，清除 URL fragment，并断开不必要的 opener 关系。
6. 超时、重复 nonce、错误 origin、第二次 payload、parent 关闭或 child reload 都显式进入 runtime error screen；不从 localStorage 猜上次配置。

launch payload 必须有 version/kind/hash，child 重新计算/核对 ZIP hash，并重新做关键 parser/compatibility validation；不能盲信 parent 的 UI readiness。

### 10.3 Runtime boot 顺序

```text
receive + validate launch payload
  -> call createSceneLayoutSlotGameTemplate()
       -> strict load scene-layout package
       -> normalize component/presentation config
       -> compose existing logic/render runtime
       -> create prepared live session（可选 loading 99%）
       -> create framework + UI + Pixi mount
  -> framework.connect() / apply initial state
  -> idle
```

要求：

- 使用 `packages/gameloading` 时，live prepare 在 99%，framework/Pixi 创建在 100%，复用同一 session；若首版暂不接 loading，也必须保证只创建一个 session/socket。
- child 页面刷新后没有 payload就显示“启动会话已失效，请从配置器重新打开”，不能连默认服务器。
- fatal error 页面显示阶段和安全诊断，不输出 token、完整 GMI 或 ZIP bytes。
- child unload/destroy 时关闭 session、ticker、Pixi、resource/object URLs。

## 11. 正交组合首版行为合同

### 11.1 Crave：`grid-cell + cascade`

导入本计划输入后，建议表应得到：

```text
initialSpin: bg-spin
wins:       [bg-win]
value:      [bg-gencoins]
remove:     bg-remove
stepMarker: bg-respin
dropdown:   bg-dropdown
refill:     bg-refill

removeExcludedSymbols: [WL]
dropHeldSymbols:        [WL]
valueSymbols:           [CN]
emptyCode:              -1
```

这些只是 Crave acceptance draft，用户仍需确认。readiness 必须额外验证：

- server Width/Height = layout main reel `6 x 9`；
- ZIP package `gameconfig.json` 可被 logiccore 解析；
- layout binding 的 `reels-001` 存在；
- server `bg-spin.reelSet=reels-002` 只显示为 server-side 信息，不覆盖 `reels-001`；
- H1/H2/L1-L4/WL 等 win/remove states 与 manifest capability匹配；
- CN value presentation、four tiers、image-string digits 和 slot binding 完整；
- popup `bigwin2` 对 initial mode 显式绑定；
- FreeGame transition存在但因没有 mode resolver 不自动使用。

一轮 presentation 顺序至少为：

```text
initial grid-cell spin to authoritative scene
  -> optional value application
  -> ordered win group emphasis / actual win animation
  -> remove eligible occurrences
  -> dropdown existing occurrences with values
  -> refill new occurrences with required new values
  -> repeat next server step
  -> optional total-win award celebration
  -> configured render runtime resolves
  -> framework collect if required
  -> idle
```

WL 是否 remove/drop、CN value 如何搬运都来自 normalized profile，不来自 shared symbol name分支。金额字段按“字段存在性优先级”取值，cash cents 使用统一 formatter；不使用 totalwin/component total 做隐藏 fallback。

### 11.2 最小普通转轮：`standard + base`

首版必须准备一份最小 standard scene-layout package、server component catalog 和 GMI fixture。它不能依赖 game003 app source，且 cascade block 保持关闭，至少包含：

```text
renderMode: standard
mainSpin component: 可配置名称
win components: 一个或多个可配置名称
公开本地 reels
manifest-driven normal / spinBlur / appear / win
至少一个 no-win round
至少一个 win round
```

一轮 presentation 顺序至少为：

```text
start every configured main reel
  -> use public local strip during motion
  -> apply server authoritative visible target to temporary round strip
  -> stop reels by configured order/timing/bounce
  -> landing appear where manifest supports it
  -> play ordered component result win carousel
  -> optional amount/popup
  -> framework collect if required
  -> idle / lingering cleanup on next spin
```

必须验证同一 factory、同一 launch protocol 和同一 app UI 能运行这份 standard fixture；只允许 reel presentation、round flow、presentation profile 和 ZIP 不同。此 fixture 不经过 remove/dropdown/refill，是因为它的 round flow 没有 cascade block，而不是因为 standard reel 禁止 cascade；它也不得创建 grid-cell runtime。

game003 可作为 `standard + base` 的 characterization 参考，但本任务不把 `bg-bar`、minecart interaction 或 Ways 专属业务硬塞进 standard reel 或 base flow。未来这些功能应以：

```ts
extensions: readonly SlotRoundExtensionProfileV1[]
```

一类 versioned strict union 扩展；只有 shared package 已实现对应 extension handler 时才能启用。首版可以保留空 extensions 数组或暂不导出该字段，不能接受任意字符串/脚本 callback。

### 11.3 普通转轮级联：`standard + cascade`

首版必须再准备一份能在 standard reel 上执行 cascade 的 fixture。它可以复用 11.2 的最小资源和 component catalog，但必须独立声明完整 cascade block，并至少覆盖：

```text
standard initial spin
  -> ordered win presentation
  -> remove winning occurrences
  -> dropdown surviving occurrences
  -> refill holes
  -> next cascade step or finish
```

该验收必须证明：

- reel factory 仍创建 standard reel runtime；
- round flow 因 cascade block 存在而编排 remove/dropdown/refill；
- shared cascade coordinator 只调用 capability contract，不判断 reel kind；
- standard reel 的 surviving occurrence、value 和 visible position 在 dropdown/refill 后保持正确；
- 切换 `standard + base` 与 `standard + cascade` 只修改 flow 配置，不修改 reel 配置、ZIP 或 production source；
- 若 standard runtime 尚未具备某项 cascade capability，实施阶段应在 rendercore 补通用 seam，并以 capability test 固化；不得把 fixture 偷换成 grid-cell，也不得静默跳过该阶段。

同时增加一个最小 `grid-cell + base` 验收，用于证明关闭 cascade block 后 grid-cell 只执行 initial spin/win，不会因 reel kind 自动进入 remove/dropdown/refill。至此首版四种组合都要通过 readiness；前三种至少有完整 round 测试，`grid-cell + base` 至少有 factory/integration 测试。

## 12. 测试计划

### 12.1 logiccore

- server authoring summary：Crave minimal fixture、多个 bet method 的稳定遍历、per-bet component catalog、切换 bet method、unknown node、同下注方式重复 component/node、非法 parameter/bet；
- graph edge/port/controller 和 repository 的任意内容不会影响 summary/suggestion；
- repository reel rows 不进入 summary/serialization；
- suggestion 结果全部标记 requiresReview；
- round flow strict schema、cross-block unknown field、component compatibility；logiccore 不接收或校验 reel kind；
- base round prefix：no-win、win、multiple ordered win components、optional value update、bad/missing mainSpin scene；同一 prefix 可独立结束或继续接 cascade steps；
- cascade block compiler：no-win、single win、multi-step cascade、remove exclusion、held drop、value carry、new value required、多个 win component order；同一 compiler 不依赖 reel kind；
- 同一 GMI/profile 编译结果不因调用方选择 standard/grid-cell 而变化；
- field presence `cashWin64=0` 与 absent 的区别；
- bad scene dimensions、bad holes、bad srcScenes/pos、bad cumulative amount、missing component 全部 fail-fast；
- recursive immutability 和 zero DOM/Pixi dependency。

### 12.2 rendercore

- bounded production ZIP load、assets map/hash/orphan/nested closure；
- current Crave-sized synthetic package within limits；
- standard RenderReelSet spin/stop/order/bounce/appear/win carousel；
- grid-cell RenderGridCellReelSet initial scene、temporary local strip target、Web Crypto phase injection；
- 同一个 cascade coordinator 分别驱动 standard 与 grid-cell target 的 remove/dropdown/refill；
- standard adapter 与 grid-cell adapter 各自产生自己的 movement plan；共享的是 semantic step、occurrence/value continuity 与 capability contract，不强行共享不同的运动路径/timing；
- `standard + base`、`standard + cascade`、`grid-cell + base`、`grid-cell + cascade` 四种组合均通过 reel/flow compatibility validation；缺 capability 的组合显式失败；
- reel kind/renderMode mismatch、flow/capability mismatch 均在 runtime mutation 前失败；
- `grid-cell + base` 不触发 remove/dropdown/refill，`standard + cascade` 不创建 grid-cell runtime；
- win/dimming/once/remove/drop/refill/value continuity；
- missing state/value/popup compatibility errors；
- ticker continues normal loops while awaiting win/popup；
- next-spin cleanup、mid-round failure、destroy during async、object URL release；
- scene-layout mode/video/popup existing regression suites全过。

### 12.3 gameframeworks

- template factory 使用同一 config + ZIP 创建完整 framework，不要求 app 提供 callback；
- configured adapter mount/apply/compile/play/collect order；
- sequence reject means render runtime untouched；
- render runtime reject means no collect；
- concurrent spin rejected；
- destroy cancels late completion；
- initial default scene missing/invalid fails；
- UI state and viewport projection unaffected。
- standard synthetic package/profile 在不改 source 的情况下通过同一 factory 运行；
- 同一个 reel profile 分别搭配 base/cascade flow，同一个 cascade flow 分别搭配 standard/grid-cell reel；
- 用测试 double 注册未来 reel capability 时，flow coordinator 不需要新增 kind 分支。

### 12.4 gameviewer

- staged form and readiness invalidation；
- import failure transaction rollback；
- suggestion requires explicit confirmation；
- token not serialized/exported/logged；
- launch button disabled until ready；
- `window.open()` called synchronously in click stack；
- popup blocked diagnostic；
- origin/source/nonce/version/hash handshake checks；
- child missing/duplicate/expired payload error；
- child boot/destroy ownership；
- source-boundary test禁止 Crave/game002/component/symbol hardcode进入 shared/app production files；fixture 目录例外；
- runtime source 只调用 framework template facade，不 import rendercore/Pixi/Spine/VNI，不包含 cascade loop。

测试不要通过修改 production 逻辑制造奇怪分支。若 mock 强迫代码增加 silent fallback、fake timer completion、自动静音、假动画或默认 component，应修改 test fixture、mock contract 或依赖注入边界。

## 13. 手工验收

### 13.1 无 live 凭据验收

1. 启动 `apps/gameviewer`。
2. 上传 `/Users/zerro/Downloads/crave.zip`。
3. 导入 `docs/crave/crave.json`。
4. 确认页面列出 `normal` 下注方式；选择它后显示本计划第 2.3 节七个 component，不遍历或显示 repository reel rows。
5. 接受/调整当前下注方式的 component suggestions，填写外部 live URL/basic/presentation 字段。
6. readiness 显示 exact normalized profile、layout hash、server config hash 和非阻塞能力说明。
7. 使用忠实 GameLogic fixture 和 fake live session 打开新窗口，完整播放至少：无 win round、普通 cascade、含 CN value round。
8. 确认新窗口关闭后资源/session清理，配置器仍可再次启动新的独立实例。
9. 不修改/重建 app，换成 standard synthetic ZIP/config，在同一 UI 选择 reel presentation `standard-v1`、关闭 cascade block，播放 no-win 和 win round。
10. 保持同一个 standard reel presentation，启用并配置 cascade block，播放至少一次 remove -> dropdown -> refill；确认没有创建 grid-cell runtime。
11. 选择 grid-cell reel presentation 并关闭 cascade block，确认 readiness 和最小 round 不会自动要求 remove/dropdown/refill。

### 13.2 有 live 凭据时验收

只在用户提供合法测试 credential 时执行：

- server 默认候选可使用仓库当前 live 测试地址，但必须由用户在表单明确确认；
- gamecode 使用 server config 提供的 `065P8NOEgwdSXFTB6uDqX` 候选；
- 不把 credential 记录到 screenshot、报告或 git；
- 观察单 WebSocket connect/enter、spin、presentation、collect；
- 至少完成一次 no-win 和一次 win/cascade；若自然无法命中特定场景，报告未覆盖，不通过重放 production spin 或伪造 live 结论。

### 13.3 浏览器覆盖

至少在 Chromium 验收新窗口、Web Crypto、Blob/Object URL、Pixi 和 live。若使用 audible video transition/popup，再在 Safari/iOS 做 trusted gesture验收；没有相关资源时不要伪报 iOS video 已通过。

## 14. 命令与环境约束

仓库要求 Node.js `>=24.0.0`、pnpm。实施开始先检查：

```bash
command -v node
command -v pnpm
```

若当前 shell 没有 `node`，先执行：

```bash
nvm use 24
```

然后记录并在整个任务统一使用这一套自带环境：

```bash
node --version
pnpm --version
command -v node
command -v pnpm
```

不得：

- 因 shell 缺 node 执行 `nvm install`；
- 强制调整 Node/pnpm 版本；
- 修改 `.nvmrc`、根 `engines` 或 `packageManager` 绕过环境；
- 混用系统 Node、另一套 pnpm、npm/yarn；
- 因环境问题重建或无关改写 lockfile。

如果依赖下载失败，使用用户指定代理后重试原命令：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

不要删除 lockfile、放宽依赖版本、手工复制 node_modules 或引入 fallback dependency。

分阶段至少执行：

```bash
pnpm --filter @slotclientengine/logiccore lint
pnpm --filter @slotclientengine/logiccore test
pnpm --filter @slotclientengine/logiccore typecheck
pnpm --filter @slotclientengine/logiccore build
pnpm --filter @slotclientengine/logiccore test:exports

pnpm --filter @slotclientengine/rendercore lint
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore build

pnpm --filter @slotclientengine/gameframeworks lint
pnpm --filter @slotclientengine/gameframeworks test
pnpm --filter @slotclientengine/gameframeworks typecheck
pnpm --filter @slotclientengine/gameframeworks build

pnpm --filter gameviewer lint
pnpm --filter gameviewer test
pnpm --filter gameviewer typecheck
pnpm --filter gameviewer build
pnpm --filter gameviewer format:check
```

最终再执行受影响范围的根级：

```bash
pnpm lint
pnpm test
pnpm typecheck
pnpm build
pnpm format:check
```

若根级任务被仓库中与本任务无关的既有失败阻断，先证明对应 package 任务通过，并在报告记录精确命令、失败文件和为什么与本任务无关；不得顺带改无关代码。

## 15. 实施阶段与提交顺序

建议按以下顺序实施，每阶段保持可测试：

### Phase 0：基线与 characterization

- 记录 git/Node/pnpm；
- 重新验证两个输入的 hash、ZIP summary 和 component summary；
- 为 game002 cascade 现有语义补必要 characterization tests；
- 为 game003 普通主转轮/中奖轮播补必要 characterization tests，明确排除 bg-bar/minecart 等 extension；
- 产出 `game002/game003 source -> ZIP/config/shared owner` 差异矩阵；
- 对每个拟新增 shared 类/API 标记“现有能力为何不足”；没有证据的新增项从实施清单移除；
- 写出首版范围/非目标，不先创建大而空的 app或第二套 runtime。

### Phase 1：logiccore authoring summary/round flow/sequence

- parser + suggestion；
- 独立的 strict round flow schema：base components + optional cascade block；
- 与 reel kind 无关的 base round sequence；
- gap-driven cascade block sequence；
- exports、README、tests；
- 验证 shared code 无业务名称。

### Phase 2：rendercore ZIP loader、reel capability 与 flow coordinator

- 收敛 bounded ZIP load；
- strict reel presentation union 与 scene-layout `renderMode` compatibility；
- 为 RenderReelSet、RenderGridCellReelSet 建立统一 base target 和可选 cascade capability adapter；
- 用已有 symbol-win-carousel 建立与 reel kind 无关的 base flow；
- 用已有 grid-cell cascade plan/symbol-cascade/popup API收敛通用 cascade flow，并补齐 standard cascade seam；
- 四种 reel/flow 组合测试，禁止按组合复制 coordinator；
- 资源/ticker/destroy tests；
- 全量 rendercore regression。

### Phase 3：gameframeworks template factory

- `scene-layout-template` subpath 和 one-call factory；
- reel factory dispatch、capability-driven flow composition、configured adapter 和 lifecycle tests；
- facade exports/README；
- game002 尽量切换到同一 shared sequence/coordinator，避免分叉；
- game003 的主转轮/base flow 尽量复用同一 shared sequence；bg-bar/minecart 保持显式 extension。

### Phase 4：gameviewer configurator

- scaffold app；
- store/import/form/readiness；
- Crave suggestions review；
- source-boundary tests；
- 不连接 live。

### Phase 5：runtime window 与真实游戏实例

- synchronous window open + handshake；
- child boot 只调用 template factory；
- fake session round；
- `standard + base`、`standard + cascade`、`grid-cell + base`、`grid-cell + cascade` 配置零源码变更验收；
- controlled live smoke（有凭据时）。

### Phase 6：回归、文档与报告

- package + root checks；
- README；
- 更新 `agents.md`；
- 手工验收记录；
- 生成 UTC 报告。

提交可按上述 phase 拆分，禁止把输入 ZIP、credential、coverage、dist、临时解压目录或 `/tmp` 文件加入提交。

## 16. `agents.md` 更新要求

本任务新增长期存在的 app 和共享职责边界，因此实现完成时必须更新根 `agents.md`，至少写清：

- `apps/gameviewer` 是纯前端配置器 + 独立 runtime window，不生成游戏源码；
- layout ZIP 是唯一美术/runtime resource owner，server authoring JSON 只用于遍历 bet method/component 和生成配置候选；不执行 graph、不启动服务器、不向 runtime 传播原始 JSON 或 server repository reels；
- 新游戏实例是 ZIP + versioned component/presentation config，禁止新增游戏专属 adapter/resolver/source；
- reel presentation 与 round flow 是两套独立、versioned、strict 配置：reel 首版为 `standard | grid-cell` 并与 layout `renderMode` 匹配；flow 为 base components + optional cascade block；
- cascade 的语义是 remove -> dropdown -> refill，不属于任何 reel kind；standard、grid-cell 和未来 reel kind 都通过 capability contract 与 flow requirement 匹配；
- component semantic interpretation 在 logiccore，现有 Pixi/reel/cascade players 与最薄 coordinator 在 rendercore，one-call scene-layout template factory 在 gameframeworks；
- gameviewer runtime 只能调用 framework template facade，不直接装配 rendercore/Pixi；
- app production code不得硬编码 Crave/game002/component/symbol；
- launch credential session-only，不进入 URL/project/storage；
- 首版支持 explicit `standard-v1 | grid-cell-v1` reel presentation，以及 base + optional cascade flow；未知 reel kind/flow block/extension 显式失败；
- 缺资源/状态/component 不 fallback。
- game003 的 bg-bar/minecart 等主转轮外玩法不是 standard reel 隐式能力，只能通过后续 typed extension 接入。

不要把本计划全部复制到 `agents.md`；只增加未来开发必须持续遵守的稳定约束。

## 17. 完成定义

只有同时满足以下条件才能将 Task 123 标记完成：

1. `apps/gameviewer` 可构建、可测试、可在浏览器运行。
2. 当前 `crave.zip` 严格导入，未复制 editor 私有 ZIP 算法。
3. `docs/crave/crave.json` 能稳定遍历下注方式；选择 `normal` 后能生成需要用户确认的 component suggestions，原始 JSON 和 server repository reel 都未进入 runtime payload。
4. 配置器可编辑基础、逻辑、表现配置，并生成稳定 normalized readiness snapshot。
5. 新窗口同步打开、一次性安全接收 payload，独立创建并销毁 framework/session/render runtime。
6. fake session 下完整播放 Crave-compatible `grid-cell + cascade` no-win、win/cascade、CN value round；live 结果按真实可用条件如实报告。
7. standard synthetic 游戏只替换 ZIP/profile 即通过同一 factory，完成 `standard + base` 的普通逐轴 spin 和 win carousel；过程中没有修改 production source 或增加 game-specific callback。
8. 同一个 standard reel profile 启用 cascade block 后，完成 remove/dropdown/refill 且不创建 grid-cell runtime；`grid-cell + base` 也能运行且不会自动进入 cascade。
9. gameviewer runtime 只有 payload validation + template factory 调用，不含 Pixi、reel、cascade、symbol resolver 实现。
10. game002 与 gameviewer 不保留两份长期分叉的通用 cascade sequence/orchestration。
11. game003 与 template base flow 不保留两份长期分叉的普通主转轮/中奖轮播 orchestration；bg-bar/minecart 等明确保留为 extension 范围。
12. logiccore/rendercore/gameframeworks 职责边界和 dependency direction符合本计划。
13. shared/app production source 无 Crave/game002/game003/component/symbol hardcode，fixture 除外。
14. 不增加 Nearwin、win-amount、mode transition 或其它输入未拥有能力的伪 fallback。
15. 受影响 package 的 lint/test/typecheck/build/format check 全过，根级结果已记录。
16. `agents.md` 和相关 README 已更新。
17. 中文 UTC 任务报告已生成，列出 reel/flow 四组合复用矩阵、新增 seam 理由、测试、手工验收、未覆盖 live 条件、已知限制和后续建议。
