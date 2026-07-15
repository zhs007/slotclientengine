# game002 cascade removal flow 任务计划

## 1. 任务目标

本任务在当前 `game002` live spin 基础上，完整接入服务端 GMI 新增的消除级联流程，并把可复用的 symbol 特殊状态、按中奖组 remove、grid-cell dropdown 位移和空格 selective refill 能力实现到 `packages/rendercore`。`apps/game002` 只负责解释本游戏的组件名和 step 数据关系，不在 app 内复制 Pixi symbol 状态机、格子位移、回弹、单格 spin 或 Spine 播放器。

## 执行中方案变更（2026-07-15，以本节覆盖下文旧描述）

- game002 通过 `canRemoveSymbol` / `canDropSymbol` 函数向 rendercore 声明 symbol 特例；当前 `WL` 中奖但永不消除、永不改变逻辑格位。rendercore 不认识 `WL` 或 wild。
- 固定 WL 不是物理挡板；其它 symbol 可以穿过其格位下落，并依靠 manifest `renderPriority` 从 WL 后方经过。当前 WL 为 `1`，其它 display symbol 为 `0`，禁止 runtime zIndex 特判。
- dropdown 与 refill 合并为一次 fall；既有 occurrence 和新增 occurrence 同时下落，新 symbol 从棋盘上方创建，不走 grid-cell spin、公开轮带或 appear。
- fall 保留列内下方优先错峰，并增加 x 方向从左到右的列启动延迟。
- 全部中奖组的金额同时显示，并以较深 alpha 只压暗全部中奖坐标之外的格；约 `2s` 后全部中奖 symbol 聚合播放一次 win，再按组依次 remove。WL 参与高亮和 win，但不进入 removePositions。
- 服务端 fixture 以 WL 原格保留后的 remove/dropdown/refill scene 为准；旧的“共享 WL 最后一组 remove”“10 格 selective refill”描述失效。

仓库根目录固定为：

```text
/Users/zerro/github.com/slotclientengine
```

本计划是完整执行合同，不能依赖聊天记录、附件、旧任务文档或口头说明。执行者只阅读本文件，即可完成 GMI 数据接入、manifest schema、rendercore 通用级联表现、game002 生命周期改造、测试、文档、协作规则和最终中文任务报告。

服务端组件流程固定为：

```text
初始 step:
bg-spin
-> bg-gencoins
-> bg-win（若触发，按 usedResults 分组展示）
-> bg-remove（每组 win 后执行该组最后一次引用格的 remove）

后续 step:
bg-respin
-> bg-dropdown（幸存 symbol 下落）
-> bg-refill（只让空格做单格 spin 并补入新 symbol）
-> bg-gencoins（为新补入的 CN 绑定服务端值）
-> bg-win（若再次中奖，继续 win/remove）
-> 下一 step 的 bg-respin...

全部 step 结束:
-> 才启动全局 win-amount / bigwin 动画
-> win-amount 进入现有非阻塞阶段后 playSpin() resolve
```

最终行为必须同时满足：

- `apps/game002/src/game-adapter.ts` 不再硬编码只读 `logic.getStep(0)`；必须预解析并顺序执行 `logic.getSteps()` 中的全部合法级联 stage。
- `bg-spin`、`bg-gencoins`、`bg-win`、`bg-remove`、`bg-respin`、`bg-dropdown`、`bg-refill` 是 game002 app-owned 组件名；`logiccore`、`gameframeworks`、`rendercore` 不得硬编码这些字符串。
- 是否触发组件必须继续以现有 `step.hasComponent(name)` 为准，即只认 `historyComponents`。不能因为名字出现在 `historyComponentsEx` 或 `mapComponents` 就当作已触发；附件的末 step 正好在 `historyComponentsEx` 中有 `bg-win`，但实际没有中奖。
- `bg-remove` 必须在每一组 `bg-win` 的 `win` once 状态结束后立即开始；remove 对应 manifest 的 `remove` once 状态，当前 game002-s3 Spine animation 名大小写精确为 `End`。
- 同一坐标被多个中奖组引用时，只能在“最后一个仍需要它的中奖组”执行 remove。不得用 `WL` 字符串、`wildNum` 或 result.symbol 猜 wild；按坐标最后引用索引处理即可通用于 wild 和未来其它共享格。
- 当前样例两组中奖共享 `(0,5)`，该格 scene code 为 `0=WL`。第一组结束后它必须保留，第二组结束后才 remove。
- 当前 `bg-remove.removedNum=11`，但唯一被删除格只有 `10` 个，因为共享 WL 被两个 result 引用。不得断言 `removedNum === unique removed cells`，也不得据此生成空洞；权威空洞来自 `bg-remove.usedScenes` 和中奖坐标并集的一致性校验。
- 单组 result 金额 overlay 从 `win` 开始一直保留到该组 remove 完成、准备进入下一组时才隐藏；开始 remove 不能先隐藏金额。
- CN 数字是 symbol 挂件：value 第一次确定时创建一次并 attach 到当前 Spine player 的 manifest slot，后续 normal/appear/win/remove/dropdown 全生命周期都不能重新 prepare、重新创建、重新 attach、重新 setValue 或重新配置数字。状态切换只让当前 symbol/player 切 animation；数字自然继承 slot/bone 的 transform、visibility 和 color。格子最终释放/销毁时才随 symbol 一起 detach/destroy。
- remove once 完成后，该格 symbol 必须在同一 update 边界隐藏，不能先回到 normal 闪一帧；不能用固定 timer 假装 animation complete。
- 所有中奖组和 remove 全部完成后才能开始 dropdown。不能每删一组就局部下落。
- dropdown 必须保持每列幸存 symbol 的原始相对顺序，并携带同 occurrence 的 CN presentation value；不能按 symbol code 反查匹配，因为同列可有重复 symbol。
- dropdown 第一版使用“下方先动、上方略后动”的轻微错峰，并有有力度的下落和小幅回弹。位移算法属于 rendercore；game002 只传 timing/motion options。
- dropdown 完成后，只有 `bg-refill.basicComponentData.pos` 指定的空格执行与当前 grid-cell reel 一致的单格 spin。未列出的幸存格不能重新 spin、不能重新触发 appear、不能换 occurrence value。
- refill 必须继续使用 `assets/gamecfg002/gameconfig.json` 的本地公开轮带滚动，只把服务端 refill target scene 的单格目标叠加进本轮临时 endpoint；不得读取、缓存或泄露服务器真实轮带。
- 新补入 CN 的最终 raw value 来自同 step 后续 `bg-gencoins.usedOtherScenes`。不得用 manifest 随机默认值覆盖服务端结果；既有 CN 的 value 必须在 dropdown/refill 前后保持一致。
- `remove` / `dropdown` 是 rendercore 可复用的可选特殊状态：manifest 显式配置就使用，未配置时不能猜动画名、不能 try/catch 后偷偷退回 builtin。game002 当前实际可能被 remove 的 pay symbol 必须都显式配置 `remove -> End`，缺失时在动画开始前失败。
- dropdown 的“没有附加动画”是显式能力语义：symbol 没有 manifest `dropdown` animation 时保持当前 normal 美术，仅由 rendercore 执行位移；不能伪造 static/builtin 动画。当前有 Spine normal 的 game002-s3 symbol 应显式配置 `dropdown` 为真实 `Idle` 或 `Loop`。
- 全局 `winAmountPlayer.start(...)` 必须移到全部 step、remove、dropdown、refill、末次 gencoins 和终止 win 判断之后。附件样例 `totalwin=210`，必须在 step 1 refill/gencoins 完成且确认无 `bg-win` 后才播放，而不是初始 step 停轴后立刻播放。
- game003 继续使用现有 `createSymbolWinCarousel(...)` 首轮 + lingering 合同；本任务不得把 game002 的 cascade/remove 语义扩散到 game003，也不得改变 game003 的 bg-bar、minecart、bg-wins、coin overlay 或 win-amount 时序。
- 不改变 live server、`lines=30`、loading 99%/100%、背景状态、focus viewport、renderPriority、点击推进 win-amount 或 collect 边界。
- 如果是测试导致一些奇怪写法，就修改测试，不要削弱 production 合同。不得为 fake runtime 加 scene fallback、跳过动画完成、把 `-1` 当任意非法值吞掉、把缺 component 当空 stage 或把任意 scene 当最终 scene。

任务完成后必须新增中文任务报告：

```text
tasks/95-game002-cascade-removal-flow-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/95-game002-cascade-removal-flow-260715-181300.md
```

## 2. 已确认的当前实现和数据事实

以下事实来自制定计划时的实际 checkout；实施时仍必须重新执行第 5 节盘点，不能只引用本节快照。

### 2.1 Git 与工作区基线

制定计划时：

```text
branch: main
HEAD: 4bd979b
working tree: clean
```

执行时不得使用 `git reset --hard`、`git checkout --`、自动 stash 或批量清理 untracked。若工作区已有用户改动，应先记录并绕开；与任务文件重叠时必须保留用户内容并做最小增量修改。

### 2.2 附件样例的最小权威合同

附件完整 GMI 的顶层关键值为：

```text
bet=10
lines=30
totalwin=210
replyPlay.results.length=2
```

scene/otherScene 坐标一律为 x-first：

```text
matrix[x][y]
宽 6 列，每列高 9 格
-1 只表示级联中间态空洞，不是 symbol code
```

#### step 0：初始 spin、中奖和 remove

```text
coinWin=21
cashWin=210
scenes.length=2
otherScenes.length=2
results.length=2

historyComponents:
  [bg-spin, bg-gencoins, bg-win, bg-remove]

bg-spin:
  usedScenes=[0]

bg-gencoins:
  usedOtherScenes=[0]

bg-win:
  usedResults=[0,1]
  nextComponent=bg-remove
  basicComponentData.pos 共 11 个坐标引用

bg-remove:
  usedScenes=[1]
  usedOtherScenes=[1]
  removedNum=11

curGameModParam.nextStepFirstComponent=bg-respin
```

两个 result 的权威顺序和金额为：

```text
result[0]:
  symbol=4 (L2)
  pos=[(0,3),(0,4),(0,5),(1,3),(1,2),(2,3)]
  cashWin=0
  cashWin64=180

result[1]:
  symbol=5 (L3)
  pos=[(1,4),(1,5),(0,5),(2,5),(2,4)]
  cashWin=0
  cashWin64=30

共享坐标:
  (0,5)，scene code=0 (WL)

唯一中奖坐标数:
  6 + 5 - 1 = 10
```

step 0 scene 0 与 remove scene 1 的关键列如下；未列出的 x=3..5 在 remove 前后完全不变：

```text
scene[0][x=0] = [6,6,3,4,4,0,3,3,2]
scene[0][x=1] = [3,5,4,4,5,5,1,5,5]
scene[0][x=2] = [1,2,2,4,5,5,2,2,5]

scene[1][x=0] = [6,6,3,-1,-1,-1,3,3,2]
scene[1][x=1] = [3,5,-1,-1,-1,-1,1,5,5]
scene[1][x=2] = [1,2,2,-1,-1,-1,2,2,5]
```

`otherScenes[1]` 在相同 10 个空洞位置也是 `-1`，其它位置保留 step 0 `bg-gencoins.otherScenes[0]` 的 CN raw value。实现必须把 scene occurrence 与 value occurrence 一起删除，不能只改 symbol matrix。

#### step 1：respin、dropdown、refill、gencoins，且没有新中奖

```text
coinWin=0
cashWin=0
scenes.length=3
otherScenes.length=4
results.length=0

historyComponents:
  [bg-respin, bg-dropdown, bg-refill, bg-gencoins]

historyComponentsEx:
  [bg-respin, bg-dropdown, bg-refill, bg-gencoins, bg-win]

firstComponent=bg-respin
nextStepFirstComponent=""

bg-dropdown:
  srcScenes=[0]
  usedScenes=[1]
  usedOtherScenes=[1]

bg-refill:
  usedScenes=[2]
  usedOtherScenes=[2]
  pos=[
    (0,2),(0,1),(0,0),
    (1,3),(1,2),(1,1),(1,0),
    (2,2),(2,1),(2,0)
  ]

bg-gencoins:
  usedOtherScenes=[3]
```

step 1 scene 的关键列为：

```text
scene[0]（必须等于上一步 bg-remove 输出）:
x=0 [6,6,3,-1,-1,-1,3,3,2]
x=1 [3,5,-1,-1,-1,-1,1,5,5]
x=2 [1,2,2,-1,-1,-1,2,2,5]

scene[1]（dropdown 结果）:
x=0 [-1,-1,-1,6,6,3,3,3,2]
x=1 [-1,-1,-1,-1,3,5,1,5,5]
x=2 [-1,-1,-1,1,2,2,2,2,5]

scene[2]（refill 后完整结果）:
x=0 [3,3,4,6,6,3,3,3,2]
x=1 [8,5,5,3,3,5,1,5,5]
x=2 [4,2,2,1,2,2,2,2,5]
```

关键断言：

- `scene[0] -> scene[1]` 每列删除 `-1` 后的 symbol 序列完全相同，证明 dropdown 是稳定下落，不是重新生成。
- `bg-refill.pos` 精确等于 `scene[1]` 的 10 个 `-1` 坐标，顺序为每列从下方空格到上方空格；`scene[2]` 只在这些位置填入新 symbol。
- step 1 `otherScenes[1]` 是 dropdown 后的 value matrix，值与 symbol occurrence 一起稳定下落。
- step 1 `otherScenes[2]` 是 refill component 中间值，新增格可仍为 `0`；权威最终 CN value 来自随后 `bg-gencoins.usedOtherScenes=[3]`。
- `scene[2][1][0]=8 (CN)`，对应 `otherScenes[3][1][0]=1`，这是本次新补入 coin 的服务端值。
- step 1 未触发 `bg-win`；`historyComponentsEx` 中出现名字不能启动空的 win/remove 循环。

正式测试 fixture 必须把附件完整 GMI 作为 repo-local、可解析 fixture 保存到 `apps/game002/tests/fixtures/`，不能在测试里用一组脱离真实 step/component/scene 的手写 fake 替代主验收。可以额外构造最小非法 fixture，但合法主链必须保留上述数据关系。

### 2.3 当前 game002 缺口

当前 `apps/game002/src/game-adapter.ts`：

```text
只取 logic.getStep(0).getScene(0)
只 prepare stepIndex=0 的 bg-win carousel
只解析 stepIndex=0 的 bg-gencoins otherScene
主 grid-cell spin 完成后立即启动 bg-win 与全局 win-amount
不认识 bg-remove/bg-respin/bg-dropdown/bg-refill
```

当前 `apps/game002/src/cn-value-sequence.ts` 也硬编码 `logic.getStep(0)` 和 `{stepIndex: 0}`，并要求 otherScene 全部为非负整数；它不能直接接收 remove/dropdown 中含 `-1` 的中间 value matrix。

当前 `createSymbolWinCarousel(...)` 适合 game003 和旧 game002 的“首轮后 lingering loop”，但 cascade 需要“单组 win -> 该组 remove -> 下一组；全部组后 dropdown”，不能直接在 app 外围用 timer 强行 clear/重启 carousel。

### 2.4 当前 rendercore 缺口

当前默认 symbol state 只有：

```text
normal, spinBlur, disabled, appear, win
```

当前 manifest parser 的 animation states 来自默认 preset；`packages/rendercore/scripts/generate-symbol-state-textures.mjs` 仍把可保留 animation 硬编码为 `normal|appear|win`。新增 `remove/dropdown` 时 parser、generator、tests 和 viewer 都必须同步，否则重生成 manifest 会丢配置或显式失败。

当前 `RenderGridCellReelSet`：

- 每个 cell 内是 `visibleRows=1` 的独立 `RenderReel`；
- 支持全 6x9 grid-cell spin；
- 支持停轴后状态请求、状态/几何快照和 animation update；
- `parseScene(...)` 明确拒绝负数，不能表示 `-1` 空洞；
- 没有隐藏空格、按稳定 occurrence 下落、移动回弹或只 spin 指定格的 public API；
- 当前 spin plan 要求 `columns*rows` 全部 cell，不能直接用 `bg-refill.pos` 做 subset refill。

因此不得在 game002 里通过 `mainReelsLayer.children`、Pixi 私有树遍历、复制 RenderReel 或临时 DOM overlay 实现级联。需要在 rendercore 给 grid-cell runtime 增加正式能力，并通过中性接口供通用 cascade player 使用。

### 2.5 当前资源事实

`assets/gamecfg002/gameconfig.json` 当前 code 映射中：

```text
0=WL, 1=H1, 2=H2, 3=L1, 4=L2, 5=L3, 6=L4, 8=CN
```

`assets/game002-s3/{WL,H1,H2,L1,L2,L3,L4}.json` 都真实包含大小写精确的：

```text
Idle, Start, Win, End
```

其它当前 main display Spine 资源中：

```text
WM: Idle, Start, End
CM: Idle, Start, End
CO: Loop, Start, End
AF: Idle, Start, End
CN_1..CN_4: Loop, Start, Win, End（同 tier player）
BN: 只有 Idle，没有 Start/End
```

不得猜 `Feature`、`Change`、`Collect`、`Mult_End` 等动画为本任务状态。`BN` 没有 `End`，不得伪造 remove；如果 live 数据未来要求删除 BN，game002 prepare 必须明确失败并报告坐标/symbol。

### 2.6 manifest 的两类 state 必须区分

当前 manifest 顶层：

```json
"states": ["spinBlur", "disabled"]
```

这组 `states` 是“每个 symbol 必须有对应 PNG 的 state texture 集”，不是所有 animation state。`remove/dropdown` 不需要新 PNG，因此不能加入这个数组，否则 generator/asset loader 会错误要求 `WL.remove.png`、`WL.dropdown.png` 等文件。

本任务应：

- 在 rendercore 默认 animation state preset 增加 `remove` 和 `dropdown`；
- 在各 symbol 的 `animations` 下配置 `remove/dropdown`；
- 保持 manifest 顶层 `states` 精确为 `spinBlur/disabled`；
- `CN` 的数字挂件配置与 symbol animation state 配置必须解耦：`valuePresentation` 只负责 value、tier resource 和 slot 挂件初始化；`appear/win/remove/dropdown` 作为 symbol animation 配置作用于当前已选中的 tier player，不能写进挂件配置，也不能固定引用某一个 `CN_1..CN_4`。

## 3. 工具链和执行原则

- Node.js：`>=24.0.0`
- pnpm：`>=10.0.0`
- workspace：pnpm + turbo
- 构建：TypeScript + Vite
- 测试：Vitest
- lint：ESLint
- format：Prettier

本任务原则上不新增 npm 依赖。若依赖未安装，先运行：

```bash
pnpm install
```

只有在依赖下载真实失败后，才设置代理并重试原命令：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

不得在没有下载失败时修改 npm/pnpm 全局配置。非 TTY 环境出现 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` 时，用同一命令加 `CI=true` 重试，例如：

```bash
CI=true pnpm --filter game002 test
```

验收命令应串行执行，避免多个 package 同时重建 shared `dist/`。如果测试 fake 难以表达 animation completion、空洞或 selective refill，应扩充 fake/fixture，不得给 production 增加固定延时完成、非法 scene 宽松解析或缺数据 fallback。

## 4. 范围与非目标

### 4.1 必须检查或修改的实现面

```text
assets/game002-s3/symbol-state-textures.manifest.json

packages/rendercore/src/symbol/state-machine.ts
packages/rendercore/src/symbol/manifest.ts
packages/rendercore/src/symbol-value-presentation/*
packages/rendercore/src/reel/types.ts
packages/rendercore/src/reel/render-grid-cell-reel-set.ts
packages/rendercore/src/reel/grid-cell-cascade-plan.ts          # 建议新增
packages/rendercore/src/symbol-cascade/*                         # 建议新增
packages/rendercore/src/index.ts
packages/rendercore/src/reel/index.ts
packages/rendercore/src/symbol/index.ts
packages/rendercore/scripts/generate-symbol-state-textures.mjs
packages/rendercore/scripts/generate-symbol-value-vite-resources.mjs
packages/rendercore/tests/symbol/*
packages/rendercore/tests/symbol-value-presentation/*
packages/rendercore/tests/reel/*
packages/rendercore/tests/symbol-cascade/*
packages/rendercore/README.md

apps/game002/src/game-adapter.ts
apps/game002/src/game-demo.ts
apps/game002/src/cn-value-sequence.ts
apps/game002/src/cascade-sequence.ts                            # 建议新增
apps/game002/src/cascade-config.ts                              # 建议新增
apps/game002/src/skin-config.ts
apps/game002/src/loading-resources.ts                           # 资源闭包回归盘点
apps/game002/tests/fixtures/game002-cascade-gmi.ts              # 建议新增真实 fixture
apps/game002/tests/cascade-sequence.test.ts
apps/game002/tests/game-adapter.test.ts
apps/game002/tests/game-demo.test.ts
apps/game002/tests/cn-value-sequence.test.ts
apps/game002/tests/symbol-animation-config.test.ts
apps/game002/tests/loading-resources.test.ts
apps/game002/tests/source-boundary.test.ts
apps/game002/scripts/verify-static-dist.mjs
apps/game002/README.md

apps/symbolsviewer/src/viewer-sequence.ts
apps/symbolsviewer/src/symbol-set-config.ts
apps/symbolsviewer/src/main.ts
apps/symbolsviewer/tests/symbol-set-config.test.ts
apps/symbolsviewer/tests/symbol-assets.test.ts
apps/symbolsviewer/README.md

agents.md
tasks/95-game002-cascade-removal-flow-[utctime].md
```

文件名可按现有模块风格微调，但职责边界不能改变。若实施证明无需修改 `logiccore` / `gameframeworks`，应保留不改；现有 API 已能按 step 获取 component scenes、otherScenes 和 results。只有发现当前 public API 无法在不读 raw GMI 的情况下表达通用数据时，才做最小通用扩展，并同步对应 tests/README/exports，禁止写 game002 组件名。

### 4.2 明确非目标

- 不改服务端 GMI/protobuf，不实现服务器 gameplay 逻辑。
- 不为普通 `RenderReelSet` 增加 cascade；第一版落在 grid-cell reel 通用能力，但 API 不得硬编码 6x9 或 game002。
- 不改变 game003 的现有中奖轮播和游戏流程。
- 不新增新的 Spine runtime、adapter、独立 renderer 或 canvas。
- 不接入 `Nearwin1..3`、`WM_Fx`、未被 manifest 引用的附属资源。
- 不修改 game002 背景、skin、focus、board layout、live URL、lines、bet、loading 或本地轮带边界。
- 不用 `removedNum`、`wildNum`、`symbolNums` 替代真实坐标/scene 校验。
- 不把所有负数 scene 都合法化；只有 cascade 中间矩阵允许精确 sentinel `-1`。
- 不加入“缺 remove 动画就猜 End”“缺 dropdown 就猜 Idle”“缺 gencoins 就随机值”“缺 refill pos 就从 scene diff 静默修复”等兜底。

## 5. 实施前重新盘点

执行者先在仓库根目录运行并记录：

```bash
git status --short
git branch --show-current
git rev-parse --short HEAD

rg -n "logic\.getStep\(0\)|stepIndex: 0|bg-win|bg-gencoins|winAmountPlayer" \
  apps/game002/src apps/game002/tests

rg -n "createDefaultSymbolStatePreset|normal\|appear\|win|requestedState" \
  packages/rendercore/src packages/rendercore/scripts apps/symbolsviewer/src

rg -n "RenderGridCellReelSet|GridCellReelSpinPlan|parseScene|targetPresentationValues" \
  packages/rendercore/src/reel packages/rendercore/tests/reel apps/game002/src/game-demo.ts

rg -n '"animations"|"valuePresentation"|"End"|"Loop"|"Idle"' \
  assets/game002-s3/symbol-state-textures.manifest.json \
  assets/game002-s3/{WL,H1,H2,L1,L2,L3,L4,WM,CM,CO,AF,CN_1,CN_2,CN_3,CN_4,BN}.json
```

必须先确认：

1. 工作区用户改动及其归属；
2. 当前 `game-adapter.ts` 的 pending phase 和 ticker 调度没有在本计划后再次变化；
3. manifest/generator 是否已经有人加入 `remove/dropdown`；
4. 当前 Spine 文件中 exact animation name 仍与第 2.5 节一致；
5. `game002` / `symbolsviewer` generated resource closure 是否 clean；
6. 当前任务报告最大编号仍是 94，本计划文件名没有冲突。

## 6. game002 级联数据计划器

### 6.1 新增纯数据 sequence builder

建议新增：

```text
apps/game002/src/cascade-sequence.ts
apps/game002/tests/cascade-sequence.test.ts
```

建议公开：

```ts
createGame002CascadeSequence(logic: GameLogic): Game002CascadeSequence
```

返回深冻结的纯数据结构，至少包含：

```ts
interface Game002CascadeSequence {
  readonly initial: {
    readonly stepIndex: 0;
    readonly spinScene: Game002FullScene;
    readonly spinValues: Game002FullValueMatrix;
    readonly winStage?: Game002WinRemoveStage;
  };
  readonly cascades: readonly Game002CascadeStage[];
  readonly finalScene: Game002FullScene;
  readonly finalValues: Game002FullValueMatrix;
}

interface Game002CascadeStage {
  readonly stepIndex: number;
  readonly removedSourceScene: Game002HoleScene;
  readonly removedSourceValues: Game002HoleValueMatrix;
  readonly dropdownScene: Game002HoleScene;
  readonly dropdownValues: Game002HoleValueMatrix;
  readonly refillPositions: readonly WinResultPosition[];
  readonly refillScene: Game002FullScene;
  readonly refillValues: Game002FullValueMatrix;
  readonly winStage?: Game002WinRemoveStage;
}
```

具体命名可微调，但 full matrix 与 hole matrix 必须是不同的校验入口，避免把现有 `validateGame002Scene(...)` 弱化为接受 `-1`。

### 6.2 组件读取边界

sequence builder 使用 `GameLogicStep` / `LogicComponent` public API：

- `step.hasComponent(name)` 判断真实触发；
- `step.getComponentScenes(name)` 读取 `usedScenes`；
- `step.getComponentOtherScenes(name)` 读取 `usedOtherScenes`；
- `step.getComponentResults(name)` 或 rendercore 共用的 win-group preparer 读取 `usedResults`；
- `component.basicComponentData` 中的 `srcScenes` / `pos` 由 game002 strict helper 读取并校验。

不得重新从 `logic.getRawGmi()` 按 JSON path 取 scene/result。若确实要为 `srcScenes/pos` 增加 shared helper，只能在 logiccore 做中性字段校验和 facade 导出，不能理解 dropdown/refill。

### 6.3 初始 step 合同

对 step 0：

- 必须触发 `bg-spin`，且刚好使用一个 6x9、无 `-1` scene；
- `bg-gencoins` 若触发，必须刚好使用一个与 scene 同尺寸的 otherScene，并沿用当前 CN 正整数/非 CN 零校验；
- 若 scene 含 CN 但 `bg-gencoins` 未触发，仍维持现有本地候选值语义，仅限没有服务器业务值的合法路径；附件 live 路径有 component，必须使用服务器值；
- `bg-win` 若触发，必须有至少一个 group，并同 step 触发 `bg-remove`；
- `bg-remove` 必须刚好使用一个 hole scene 和一个 hole value matrix；
- `bg-win` 未触发时不得因为 `totalwin>0` 或 `historyComponentsEx` 自动播放全部 results。

### 6.4 win/remove 数据一致性

对每个 win/remove stage：

1. 按调用方组件数组顺序和 `usedResults` 原顺序生成 groups；当前数组只有 `bg-win`。
2. 继续使用 `cashWin64 !== undefined ? cashWin64 : cashWin` 和现有 formatter/validator；不新增 component total/step total/totalwin fallback。
3. 对全部 group position 建立 `lastUseByPosition`：同坐标最后出现在哪个 group。
4. 每组的 `removePositions` 只包含 `lastUseByPosition[key] === currentGroupIndex` 的坐标。
5. 全部 `removePositions` 的并集必须等于全部 group position 去重并集。
6. remove output scene 在该并集必须精确为 `-1`，其它格必须与 win source scene 相同。
7. remove output value matrix 在相同坐标必须精确为 `-1`，其它 occurrence value 必须不变。
8. 不校验 `removedNum` 等于唯一格数；可以记录 raw 值用于诊断，但不能决定动画。
9. 当前 game002 实际 remove target symbol 必须有 manifest `remove` 能力；错误信息包含 step、group、result、坐标和 symbol。

### 6.5 后续 cascade step 合同

每个 `stepIndex >= 1`：

- 必须触发 `bg-respin`；它是控制边界，不启动一次新的全盘 spin。
- 必须触发 `bg-dropdown`、`bg-refill`、`bg-gencoins`，顺序由 game002 sequence 固定；不能按 `mapComponents` 对象枚举顺序执行。
- `bg-dropdown.srcScenes` 必须刚好一个索引，且索引到当前 step scene；该 source scene 必须与上一 win/remove stage 的 remove output 完全相等。
- `bg-dropdown.usedScenes` / `usedOtherScenes` 各刚好一个。
- dropdown scene 每列去掉 `-1` 后的 `(symbolCode,presentationValue)` occurrence 序列必须与 source 完全相同；通过“按列稳定序列次序”生成移动映射，不能通过查找相同 symbol code 匹配。
- 每个幸存 occurrence 只能向同列更大的 y 或保持原位移动；禁止横向移动、向上移动、重复消费或丢失。
- `bg-refill.basicComponentData.pos` 必须是成对非负安全整数、无重复、均在 6x9 内；它必须精确等于 dropdown scene 的所有 `-1` 坐标。
- `bg-refill.usedScenes` 刚好一个完整无洞 target scene；未列出的格必须与 dropdown scene 相同，列出的格必须是合法、可渲染 symbol code。
- `bg-refill.usedOtherScenes` 可作为 component 中间 value 证据，但不能覆盖随后 `bg-gencoins` 的权威最终值。
- `bg-gencoins.usedOtherScenes` 刚好一个最终 value matrix。最终 scene 中 CN 必须 positive safe integer，非 CN 必须为 `0`。
- 未 refill 的既有 CN value 必须等于 dropdown 后携带值；只允许 refill position 中新出现/替换的 CN 获得新值。
- step 若真实触发 `bg-win`，继续生成 win/remove stage，并要求下一 step 存在；若没有 `bg-win`，该 step 是终止 stage，后面不得再有未解释 step。

### 6.6 完整预检

`playSpin(logic)` 必须在启动初始 reel 前同步/异步完成整条 sequence 的结构与资源预检：

- 所有 scene/value/position/component 引用合法；
- 所有 win/remove/dropdown state 资源可解析；
- 所有最终 CN exact image value 资源已 prepare；
- 所有 step 串接一致。

任一后续 step 数据错误必须在初始 spin 前失败，避免画面跑到一半才发现无法继续。资源 async prepare 期间沿用现有 `#preparingSpin` / lifecycleVersion 防重入与 destroy 保护。

## 7. manifest 和 symbol state 扩展

### 7.1 默认 state 定义

修改 `createDefaultSymbolStatePreset()`，增加：

```text
remove:
  phase=once
  playback=once

dropdown:
  phase=stable
  playback=loop
```

`remove` once 完成后的默认 state 仍是 normal，但 grid cascade runtime 必须在同一帧捕获 completion 并隐藏被删 cell，不能依靠下一帧 snapshot 猜完成。

`dropdown` 是移动期间的可选附加美术状态。移动结束后显式恢复 normal；未配置 dropdown animation 的 symbol 不请求该状态，只移动 normal 视觉。

### 7.2 game002-s3 普通 symbol manifest

更新 `assets/game002-s3/symbol-state-textures.manifest.json`：

- `WL,H1,H2,L1,L2,L3,L4`：
  - `remove -> End, loop=false`
  - `dropdown -> Idle, loop=true`
- `WM,CM,AF`：按真实资源配置 `remove -> End`、`dropdown -> Idle`。
- `CO`：按真实资源配置 `remove -> End`、`dropdown -> Loop`。
- `BN`：不配置伪 remove/dropdown；静态 normal 允许只参加位移，不允许被 game002 win/remove target 使用。
- 顶层 `states` 仍为 `spinBlur,disabled`，不新增 remove/dropdown PNG。

每个 Spine spec 继续精确引用该 symbol 已有 skeleton、`./Symbol.atlas`、`./Symbol.png`。同 skeleton/atlas/texture 的 normal/win/remove/dropdown 必须复用现有 cached player，只切 animation；不得为每个 state 创建长期并存的独立 Spine view。

### 7.3 CN 挂件与 animation state 解耦

当前 `CN` 的实际美术由命中 tier 的 `CN_1..CN_4` player 拥有。数字图片只是 attach 到该 player `Num` slot 的挂件；它不是 animation state，也不拥有 appear/win/remove/dropdown 生命周期。`appear` 不是例外：播放同一 player 的 `Start` 时，数字挂件只需自然继承 `Num` slot/bone 的 transform、visibility 和 color，不需要挂件控制器执行任何“出现”逻辑。

本任务必须把当前 `valuePresentation.appearPlayback` 的特殊耦合收口掉，改成通用的“当前 active Spine player 播放 state”能力。建议为 manifest animation spec 增加一个不重复声明资源的中性 kind，名称可按实现风格确定，例如：

```json
"animations": {
  "appear": {
    "kind": "activeSpine",
    "playback": {
      "mode": "animation",
      "animationName": "Start",
      "loop": false
    }
  },
  "win": {
    "kind": "activeSpine",
    "playback": {
      "mode": "animation",
      "animationName": "Win",
      "loop": false
    }
  },
  "remove": {
    "kind": "activeSpine",
    "playback": {
      "mode": "animation",
      "animationName": "End",
      "loop": false
    }
  },
  "dropdown": {
    "kind": "activeSpine",
    "playback": {
      "mode": "animation",
      "animationName": "Loop",
      "loop": true
    }
  }
}
```

`activeSpine` 的语义固定为“在该 RenderSymbol 当前已由 tier/value 选中的 official Spine player 上切换 animation”，不是 fallback，也不能创建第二个 player。它只允许用于 manifest 已声明动态 active Spine provider 的 symbol；普通 symbol 继续使用现有含 skeleton/atlas/texture 的 `kind=spine` spec。

要求：

- `valuePresentation` 只保留 `defaultValues/reelStates/tiers/text` 等 value、tier resource 和 slot 挂件配置；移除 `appearPlayback`，appear 与其它 state 一样放到 `symbols.CN.animations`。
- 删除 value controller 的 `requestLandingAppear()` 状态分支；逐格落地仍由 `RenderGridCellReelSet` 向 `RenderSymbol` 请求通用 `appear` state，`RenderSymbol` 再在当前 active player 上播放 `Start`。value controller 不再接收、保存或完成 appear 请求。
- CN value 第一次绑定到一个 occurrence 时，选择 tier、创建 player、创建数字图片并 `attachSlotObject()` 一次；直到该 occurrence 被 remove/release 或 symbol code/value 真正变化前，不能再次执行这些操作。
- normal 使用当前 tier `animation.playback`（当前为 `Loop`）；appear/win/remove/dropdown 使用顶层 `animations[state].playback`，但始终是同一个 player、同一个数字对象和同一次 slot attachment。
- state 切换不能调用 `setPresentationValue()`、`clearActive()`、`createSymbolValueDisplay()`、`attachSlotObject()` 或 `removeSlotObject()`。
- dropdown 搬运必须移动同一个 occurrence/RenderSymbol 实例及其 active player/挂件，不能在 target cell 重建一个同值 CN。
- selective refill 新创建的 CN 在开始/落地前已经知道随后 `bg-gencoins` 的权威 value，按该 value 初始化一次；不能先随机初始化、落地后再 setValue 成服务端值。
- 每个 tier skeleton 都必须真实包含 CN 顶层 `activeSpine` 配置引用的 `Start/Win/End/Loop`；任一 tier 缺失都在资源解析/prepare 时失败。
- 若 value-managed symbol 未配置某特殊 state，capability query 返回 false，不能猜 animation。
- 只有 occurrence 的 value 真实改变、symbol 被 pool release 或 destroy 时才能 detach/destroy 数字挂件；普通 animation complete 不触碰挂件。

### 7.4 parser、resolver 和 generator

修改并测试：

```text
packages/rendercore/src/symbol/manifest.ts
packages/rendercore/src/symbol-value-presentation/types.ts
packages/rendercore/src/symbol-value-presentation/render-symbol-value-controller.ts
packages/rendercore/src/symbol/render-symbol.ts
packages/rendercore/src/symbol/spine-animation.ts
packages/rendercore/scripts/generate-symbol-state-textures.mjs
packages/rendercore/scripts/generate-symbol-value-vite-resources.mjs
```

具体要求：

- manifest parser 默认允许 `remove/dropdown` animation，并按 preset playback 校验；
- generator 不再硬编码只允许 `normal|appear|win`，但也不能接受任意字符串；允许集必须与 repo 当前合法 animation state 明确同步；
- generator 深校验并保留 `animations.activeSpine`，并把当前 CN `appearPlayback` 迁移到顶层 `animations.appear`；重生成不能把 animation 塞回 valuePresentation；
- value Vite resource generator 接受/保留新字段，但资源闭包仍只由实际 skeleton/atlas/texture/image path 派生；特殊 playback 复用 tier 资源，不增加宽泛 glob；
- state texture 生成仍只生成 manifest 顶层 `states` 的 PNG，不为 remove/dropdown 生成贴图；
- official Spine parser 校验每个 configured exact animation；缺 End/Loop/Idle 显式失败；
- 更新 `apps/game002/scripts/verify-static-dist.mjs` 对 activeSpine 和各 tier exact animations 做 source/dist 检查，不把 `CN_1..CN_4` 变成 production runtime 命名合同。

### 7.5 symbolsviewer

symbolsviewer 是 manifest 动画状态的真实旁路消费者，必须同步：

- `VIEWER_STATE_ORDER` 增加 `remove,dropdown`；建议顺序 `normal,appear,win,remove,dropdown,spinBlur,disabled`。
- 默认 sequence 可加入 remove/dropdown，或至少 state selector 可单独预览；once/stable hold 规则来自 preset。
- `resolveViewerStateForSymbol(...)` 不能只特殊处理 `appear|win`；对所有可选 animation state，manifest 有配置就返回该 state，没有配置则明确显示 normal。这里的 normal 是 viewer 预览策略，不得被 game runtime 用作 remove fallback。
- value-managed CN 通过 public value controller/player API 预览同 tier 的 remove/dropdown，不能在 viewer 里直接操作 Spine 私有 display tree。
- BN remove 预览显示“该 state 未配置/normal preview”，不能伪造 End。

## 8. rendercore 通用 cascade 能力

### 8.1 职责拆分

建议新增两个层次：

```text
packages/rendercore/src/symbol-cascade/
  prepare-symbol-win-groups.ts
  create-symbol-cascade-player.ts
  types.ts
  index.ts

packages/rendercore/src/reel/grid-cell-cascade-plan.ts
packages/rendercore/src/reel/render-grid-cell-reel-set.ts
```

职责：

- win group preparer：复用现有 component/usedResults/amount/geometry 数据合同；现有 carousel 与新 cascade player 共用，不复制 result parser 和 amount anchor 算法。
- symbol cascade player：驱动 `win -> remove` 分组时序、共享坐标最后引用、金额 overlay、完成/clear/destroy。
- grid-cell cascade target：执行 hide、stable drop motion、subset refill 和 occurrence value 搬运。
- app sequence builder：只把 game002 组件数据翻译成上述中性输入。

不要把全部行为塞进现有 `createSymbolWinCarousel(...)` 的大量 mode 分支。现有 carousel public API/行为保持兼容；可抽内部纯函数，但 game003 测试必须证明无回归。

### 8.2 中性 target 接口

新 cascade player 不得 import/`instanceof` `RenderGridCellReelSet`。定义最小中性能力接口，名称可按现有风格调整，至少表达：

```text
update(deltaSeconds)
request/get visible symbol state
query state capability
get visible geometry
start/remove positions and report exact completion
start dropdown plan and report completion
start selective refill plan and report completion
get visible scene/value snapshot
clear/destroy-safe reset
```

`RenderGridCellReelSet` 实现接口；未来其它 grid renderer 可实现同一能力。普通 `RenderReelSet` 不要求在本任务实现。

### 8.3 win/remove player 生命周期

建议 phase：

```text
idle
win
remove
complete
destroyed
```

对每组：

1. 请求组内全部位置 `win`。
2. 显示该组 amount overlay，锚点算法继续使用“中奖格几何平均点附近最近真实格”。
3. 通过真实 once completion 等全部 win state 回 normal。
4. 只对本组 `removePositions` 请求 `remove`；共享且仍被后续组引用的位置不 remove。
5. amount overlay 继续显示。
6. update target，等待全部 remove animation exact completion。
7. 同一 completion frame 隐藏 removePositions，overlay 再隐藏。
8. 进入下一组。
9. 最后一组 remove 完成后 phase=complete，不进入 cycle-pause/lingering。

额外规则：

- 同组 positions/removePositions 都必须非空、无重复、在 target 范围内；
- target 当前 code/scene 必须与 prepared source scene 一致；
- remove state capability 在 start 前完成校验；
- clear 可在下一 spin/destroy 时幂等终止并恢复可见/normal 基线；
- destroy 完整释放 Text/container/引用；
- update delta 非有限或负数失败；
- 不用 wall-clock timer 判断 Spine completion；
- amount formatter/style 仍由 app options 注入，rendercore 不懂美元/game002。

### 8.4 hole scene 类型与空格生命周期

新增 rendercore 中性 hole matrix validator：

```text
合法值 = 非负 symbol code 或精确 -1
```

要求：

- 只供 cascade API 使用；现有 full scene / reel spin parser 继续拒绝负数；
- empty sentinel 定义在 rendercore cascade/reel 类型中，不写 game002 常量；
- 每个 cell 有明确 `occupied/empty` 状态；empty cell 不渲染旧 symbol、不参与 state/geometry query；
- remove 完成时 release/hide 旧 RenderSymbol 的策略必须与 pool 生命周期一致，不泄露 Spine/value controller；
- dropdown/refill 后 snapshot 精确反映 empty/occupied、code、value、phase；
- renderPriority 在移动期间仍有效，不因 transient layer 改变同优先级稳定顺序。

### 8.5 stable dropdown plan

`createGridCellCascadeDropPlan(...)` 输入至少包含：

```text
source hole scene/value matrix
target hole scene/value matrix
cellWidth/cellHeight
motion options
```

按每列执行：

1. 读取 source 非空 occurrence 序列；occurrence identity 为稳定序号及 `(code,value)`，不是 code 查找。
2. 读取 target 非空序列。
3. 两序列必须逐项完全相同，否则失败。
4. 第 i 个 source occurrence 映射到第 i 个 target occurrence。
5. targetY 必须 `>= sourceY`。
6. 不移动 occurrence 可留在原 cell；移动 occurrence 创建轨迹。

第一版 motion options 固定由 `apps/game002/src/cascade-config.ts` 传入下列初值，rendercore 只实现通用算法和严格校验：

```text
startStaggerSeconds=0.025
baseFallSeconds=0.18
perRowFallSeconds=0.055
maxFallSeconds=0.48
overshootCellRatio=0.08
settleSeconds=0.12
```

轨迹要求：

- 同列按 targetY 从大到小开始，下面先动、上面稍后；跨列相同层可同时。
- fall 段使用加速曲线到 `targetY + 0.08*cellHeight`。
- settle 段回到精确 targetY，结束位置误差为 0。
- 总时长按移动行数计算并封顶；0 行不创建动画。
- 移动期间若 symbol manifest 支持 dropdown，播放其 stable loop；否则保持 normal 视觉。
- 完成时恢复 normal，并把 occurrence 的 code/value 落到 target cell；不得重抽 CN 默认值。
- clip 范围应允许同一 column 内下落和小幅 overshoot，但不能泄露到 board 外；实现位置在 rendercore，不在 app 叠第二套 mask。

这些初值是本任务首版可验收配置，不是 rendercore 硬编码常量。后续视觉微调只改 app options 或将来明确的 game static config，不改算法。

### 8.6 selective refill

扩展 grid-cell spin plan 支持明确 subset：

- positions 使用 `bg-refill.pos` 原始顺序；当前样例每列从较下空格到较上空格，必须保持。
- subset 外 cell 处于 occupied/stable，不启动 reel、不 dim、不 appear、不换值。
- subset cell 从本地公开 reel strip 启动单格 spin，使用与当前 grid-cell spin 相同 speed/dimming/clip/landing appear 生命周期。
- 每个 target cell 的最终 symbol 来自 refill full scene；最终 value 来自本 step 权威 `bg-gencoins` final value matrix。
- refill CN 必须在 landing 前用随后 `bg-gencoins` 的权威 value 完成一次 exact image/tier/player/slot 挂件初始化，落地只在同一 player 上从 `Start` 切回 `Loop`；不能先随机显示、落地后再 setValue 或二次 attach。
- 全部 subset cell landing、dimming fade-out 和 appear once 完成后，refill 才 complete。
- 完成 snapshot 必须精确等于 refill full scene/value matrix，并且不再含 `-1`。
- 空 subset、重复 position、非空 position、越界、target 仍 `-1`、target value 不合法都显式失败。

### 8.7 rendercore 测试矩阵

至少覆盖：

- 默认 preset 中 remove=once、dropdown=stable loop，非法 loop 配置失败；
- manifest 普通 symbol remove/dropdown 解析、exact Spine animation 校验、深冻结；
- activeSpine animation spec 合法/非法、只允许有 active provider 的 symbol 使用、各 tier 缺 Start/Win/End/Loop 失败；
- generator 重生成保留 remove/dropdown/activeSpine，把 appear 从挂件配置解耦，且不生成新 state PNG；
- CN 数字在 occurrence 初始化时只 create/attach 一次；normal/appear/win/remove/dropdown 切换过程中 create/attach/remove/destroy 计数均不变化；
- symbols with/without optional dropdown capability；game002 require remove capability 预检；
- 两个 win groups 共享一个坐标：第一组 remove 不含共享格，第二组包含；amount 保持到 remove 完成；
- `removedNum=11`、unique positions=10 不导致错误推导；
- remove completion 同帧 hide，无 normal flash；
- source/target 多重复 code 仍按 stable occurrence mapping；
- CN occurrence 连同原 RenderSymbol/player/数字挂件一起下落，value 不重抽、挂件不重建；
- 下面先动、stagger、overshoot、settle exact end；
- 横移、上移、顺序变化、value 漂移失败；
- selective refill 只启动列出的 10 格，保持原始 pos 顺序；
- subset 外不 spin、不 appear、code/value 不变；
- refill 使用本地 reel strip + target endpoint，不能要求服务器 stop y；
- 新 CN 以服务器 value landing，缺 exact image 失败；
- update/clear/destroy、重复 start、destroy during prepare、invalid delta；
- fake neutral target 证明 symbol cascade player 不依赖具体 ReelSet；
- 现有 carousel、full grid-cell spin、appear、renderPriority tests 全部保持通过。

## 9. game002 adapter 接入

### 9.1 mount 和对象所有权

`Game002PixiAdapter` mount 时创建：

- 现有 background player；
- 现有 grid-cell reel runtime；
- 现有 global win-amount player；
- 新 rendercore symbol cascade player；
- 现有 value-presentation resource/controller 所需对象。

game002 cascade player 的 amount container 层级继续位于 main reels 之上、global win-amount 之下。不要同时保留一个会 lingering 的 game002 carousel；如果复用其 amount container/准备器，应保证 game002 runtime 只有一个中奖 Text owner，不重复显示。

mount 失败、destroy 和下一 spin clear 必须释放/清理新对象；不能影响 game003 carousel。

### 9.2 PendingAnimation phase

将当前二态：

```text
spinning | win-sequence
```

改为能明确表达完整流程的有限状态机，例如：

```text
initial-spin
step-win-remove
dropdown
refill
finalizing
win-amount
```

可以把细分 phase 封装进 rendercore player/sequence cursor，但 `game-adapter.ts` 必须能通过 snapshot 诊断当前 `stepIndex/stageIndex/phase`。

每次 ticker 只允许一个 owner 推进 `runtime.update(delta)`，避免当前 carousel 与 adapter 双 update。0 delta 只能用于同帧状态切换，不能跳过真实动画时间。

### 9.3 playSpin 顺序

`playSpin(logic)`：

1. 拒绝 pending/preparing 重入。
2. 构建并严格校验完整 `Game002CascadeSequence`。
3. 预加载/校验所有 server CN value 所需 resources 和所有 symbol special state resources；这里只做资源 readiness，不创建或绑定运行中 occurrence 的数字挂件。
4. clear 上一轮 cascade/value/win-amount lingering。
5. 对 initial.spinScene 执行现有全 grid-cell spin。
6. 停稳后校验 scene/value snapshot。
7. 若 initial 有 winStage，执行所有 group win/remove；否则进入下一 stage/最终阶段。
8. 对每个 cascade stage 依次执行 dropdown -> selective refill -> scene/value 校验 -> 可选 win/remove。
9. 所有 step 完成后，使用 `logic.getBet()*logic.getLines()` 和 `logic.getTotalWin()` 启动 global win-amount。
10. 沿用现有 `isWinAmountBlockingSpin(...)`：进入 `awaiting-dismiss` 后不阻塞 resolve；下一 spin 仍立即清残留。

附件样例必须产生：

```text
initial 54-cell spin
-> result0 win
-> result0 独占 5 格 remove（共享 WL 留下）
-> result1 win
-> result1 5 格 remove（含共享 WL）
-> 共 10 格 empty
-> step1 stable dropdown
-> 精确 10 格 selective refill
-> step1 bg-gencoins final value apply
-> step1 无 bg-win，结束 cascade
-> totalwin=210 的 global win-amount
```

### 9.4 CN value 生命周期

重构 `createGame002CnValueItems(...)`，去掉内部 step 0 硬编码，改为显式输入：

```text
stepIndex
targetScene
componentName
cnSymbolCode
```

或由 sequence builder 返回已校验 value matrix。必须保留：

- full final scene 的 CN positive / non-CN zero；
- server raw integer，不做美元格式化；
- exact image 无 fallback；
- target endpoint 在 spin/refill 开始前绑定；
- dropdown 使用 occurrence carried value，不重新查默认候选。

同时必须落实以下挂件合同：

- `setPresentationValue(value)` 只在一个 CN occurrence 初始化或其业务 value 真正变化时调用；同值重复调用不得重建。
- 初始 spin target CN 和 refill target CN 在创建 occurrence 时已经使用对应 step 的最终 `bg-gencoins` value，一次性选择 tier、创建 player/数字并 attach slot。
- normal/appear/win/remove/dropdown 只通过 RenderSymbol state machine 驱动同一个 active player 切 animation，不得经过 CN sequence 再配置 value。
- dropdown 必须搬运原 occurrence，而不是在 target cell `resetToVisibleSymbols()` 后重建同值 CN；这样 tier player 和数字挂件自然连续。
- `bg-gencoins` 在 sequence builder 中负责提供“新 occurrence 初始化值”，不是画面落地后再执行一次数字设置动作。adapter event 可以记录 `gencoins.values-ready` 数据边界，但不能触发第二次 attach。
- remove 前后不主动 detach 数字；只有格子正式 release/pool reset/destroy 时统一清理。
- 测试必须注入 player/label factory 计数，证明一个 occurrence 的整个状态与 dropdown 生命周期只有一次 create/attach，且最终 release 只有一次 detach/destroy。

remove/dropdown hole value matrix 使用独立 validator：空洞 `-1`，occupied CN positive，occupied non-CN zero。不得把旧 `validateOtherScene()` 直接放宽到所有负数。

### 9.5 game-demo runtime public API

`Game002ReelRuntime` 增加中性 wrapper 所需的最小能力，仍只代理 rendercore public API：

```text
prepare/start/update cascade remove
prepare/start/update dropdown
prepare/start/update selective refill
get occupied/hole scene/value snapshot
query symbol special-state capability
```

不要在 `game-demo.ts` 自己计算 easing、last-use、stable occurrence、pool 迁移或单格 spin plan。source-boundary test 必须禁止 app 出现：

```text
End / Idle / Loop animation 硬编码
RenderSymbol / Spine runtime import
mainReelsLayer.children 私有遍历
drop easing 公式
服务器 reel/stop 数据
```

app 中允许的只有组件名、game002 sequence 校验、金额 resolver/formatter 和首版 motion options。

## 10. 资源、loading 和 release 边界

本任务复用现有 skeleton/atlas/texture，不应新增美术文件，也不应扩大 loading closure。

必须验证：

- manifest 新增 remove/dropdown 只引用已经精确打包的 main skeleton 或 tier skeleton；
- `apps/game002/src/skin-config.ts` 精确 skeleton glob 不新增 Nearwin/WM_Fx；
- game002/symbolsviewer generated value resources 重生成后只因 schema 内容必要变化而变化，不出现新路径；
- `loading-resources.ts` Pixi prewarm 仍覆盖第一帧和 refill 前需要的 CN tier/image；
- production identical URL dedupe 合同不回归；
- `verify-static-dist.mjs` 确认 manifest configured End/Idle/Loop 所属 skeleton 在 dist，且未引用资源仍不进入 dist；
- 不把 animation name 当文件名，不创建 `remove.png/dropdown.png`。

## 11. 测试计划

### 11.1 真实 fixture 与 parser

新增完整附件 fixture，并至少断言：

- parser 得到 2 steps；
- scene/otherScene 中 `-1` 被保留为整数；
- step0 真正触发 bg-win，step1 `hasComponent("bg-win")===false`；
- step0 usedResults 顺序 `[0,1]`；
- step0 remove usedScenes/usedOtherScenes；
- step1 dropdown srcScenes/usedScenes/usedOtherScenes；
- step1 refill pos 10 格和原始顺序；
- step1 gencoins otherScene[3]；
- totalwin=210。

如果 logiccore 现有行为已经满足，不为“有测试文件”而改 production；可以在 game002 fixture/parser test 证明。

### 11.2 sequence builder

合法样例断言完整 stage 数、scene/value 串接、group removePositions 和 final scene/value。

非法矩阵至少包括：

- step0 无 bg-spin / 多个 usedScene；
- component 出现在 map/historyEx 但未真实触发；
- win 无 remove、remove 无 scene/value、win 后无下一 respin step；
- remove hole 与 unique win position 不一致；
- 用 removedNum=11 错当 11 个唯一 hole 的回归；
- 下一 step source 不等于上一步 remove output；
- dropdown 改变 occurrence 顺序、横移、上移、漏 value；
- refill pos 奇数、重复、越界、漏空洞、多列非空格；
- refill target 在非 pos 格发生变化或仍有 `-1`；
- gencoins 缺失、0/2 个 otherScene、CN 非正、非 CN 非零；
- 既有 CN value 被新 gencoins 错改；
- 终止 step 后还有未消费 step。

### 11.3 adapter ticker 和时序

fake runtime/player 必须记录结构化事件，断言严格顺序：

```text
spin.start
spin.complete
group0.win.start
group0.win.complete
group0.remove.start
group0.remove.complete
group1.win.start
group1.win.complete
group1.remove.start
group1.remove.complete
dropdown.start
dropdown.complete
refill.start
refill.complete
gencoins.values-ready（只确认新 occurrence 已用权威值初始化，不二次 set/attach）
winAmount.start
playSpin.resolve
```

并断言：

- group0 remove 不含 `(0,5)`；group1 remove 含 `(0,5)`；
- amount 在 remove start/playing 时 visible，remove complete 后才隐藏；
- winAmount 在 refill complete 前从未 start；
- gencoins 数据边界不会对已初始化 CN 再次 setValue/attach；
- step1 historyComponentsEx 的 bg-win 不启动 win player；
- dropdown/refill 未完成时 promise 不 resolve；
- winAmount awaiting-dismiss 后 promise resolve，点击仍只 requestAdvance；
- 下一 spin 清理遗留 display；
- prepare 失败不启动初始 spin；
- destroy during prepare/update 正确 reject 且不报告双 fatal；
- ticker 每帧 runtime 只 update 一次。

### 11.4 viewer、generator、release 和边界

覆盖：

- viewer 可选择 remove/dropdown；
- WL/H1..L4/CO/CN 的 exact state preview；
- BN 无 remove 不伪造；
- generator round-trip；
- generated closure `--check`；
- source-boundary 不出现 app 私有 cascade 算法；
- dist 包含实际 manifest 资源、不包含 Nearwin/WM_Fx；
- game003 carousel tests 原样通过。

## 12. 文档和协作规则同步

### 12.1 README

更新 `packages/rendercore/README.md`，说明：

- animation state 与 texture state 的区别；
- remove once / dropdown stable optional capability；
- CN 数字是一次 attach 的 symbol 挂件，valuePresentation 与 activeSpine animation state 解耦；
- win group last-use remove；
- hole scene、stable drop、subset refill API；
- completion/clear/destroy 和 no-fallback 边界。

更新 `apps/game002/README.md`，说明：

- 组件顺序和多 step 执行；
- `historyComponents` 才是触发源；
- shared WL last-use；
- dropdown/refill/gencoins 值流；
- bigwin 最后播放；
- 本地公开轮带和 server target endpoint 边界。

更新 `apps/symbolsviewer/README.md`，说明 remove/dropdown preview 和未配置 state 的展示语义。

### 12.2 agents.md

本任务改变长期协作边界，必须同步 `agents.md`，至少新增一条完整规则：

```text
game002 的消除级联组件名和 step 映射属于 apps/game002；packages/rendercore 拥有通用 manifest-driven remove/dropdown、按中奖组最后引用 remove、grid-cell stable dropdown 和 selective refill。共享 wild 坐标在最后引用组才 remove，全部 step 结束后才播放 global win-amount。refill 继续使用本地公开轮带，server scene 只作为临时目标窗口；CN 数字是初始化时一次 attach 到 slot 的 symbol 挂件，状态切换与 dropdown 不得二次 setValue/create/attach，原 occurrence 连同挂件下落；新 CN 从创建时就使用当前 step bg-gencoins 服务端值。不得在 app 复制 Pixi/Spine/cascade 算法或增加缺组件、缺 state、缺 value fallback。
```

当前仓库只有小写 `agents.md`，不要凭空新增另一份 `AGENTS.md`。

## 13. 自动验收命令

以下命令在仓库根目录串行执行。先做受影响 package，再做 root 汇总；任何失败都记录原始错误并修复根因。

### 13.1 环境与生成物

```bash
node --version
pnpm --version
git status --short

CI=true pnpm --filter game002 generate:symbol-value-resources
CI=true pnpm --filter symbolsviewer generate:symbol-value-resources
CI=true pnpm --filter game002 check:symbol-value-resources
CI=true pnpm --filter symbolsviewer check:symbol-value-resources
```

### 13.2 rendercore

```bash
CI=true pnpm --filter @slotclientengine/rendercore format:check
CI=true pnpm --filter @slotclientengine/rendercore lint
CI=true pnpm --filter @slotclientengine/rendercore test
CI=true pnpm --filter @slotclientengine/rendercore typecheck
CI=true pnpm --filter @slotclientengine/rendercore build
```

### 13.3 game002 与 symbolsviewer

```bash
CI=true pnpm --filter game002 format:check
CI=true pnpm --filter game002 lint
CI=true pnpm --filter game002 test
CI=true pnpm --filter game002 typecheck
CI=true pnpm --filter game002 build
CI=true pnpm --filter game002 release:check

CI=true pnpm --filter symbolsviewer format:check
CI=true pnpm --filter symbolsviewer lint
CI=true pnpm --filter symbolsviewer test
CI=true pnpm --filter symbolsviewer typecheck
CI=true pnpm --filter symbolsviewer build
```

### 13.4 shared 回归

如果实现修改了 logiccore/gameframeworks，先执行：

```bash
CI=true pnpm --filter @slotclientengine/logiccore format:check
CI=true pnpm --filter @slotclientengine/logiccore lint
CI=true pnpm --filter @slotclientengine/logiccore test
CI=true pnpm --filter @slotclientengine/logiccore typecheck
CI=true pnpm --filter @slotclientengine/logiccore build

CI=true pnpm --filter @slotclientengine/gameframeworks format:check
CI=true pnpm --filter @slotclientengine/gameframeworks lint
CI=true pnpm --filter @slotclientengine/gameframeworks test
CI=true pnpm --filter @slotclientengine/gameframeworks typecheck
CI=true pnpm --filter @slotclientengine/gameframeworks build
```

无论是否修改，都要确认 game003 不回归：

```bash
CI=true pnpm --filter game003 test
CI=true pnpm --filter game003 typecheck
CI=true pnpm --filter game003 build
```

最后执行 root 汇总：

```bash
CI=true pnpm format:check
CI=true pnpm lint
CI=true pnpm test
CI=true pnpm typecheck
CI=true pnpm build
git diff --check
git status --short
```

若只有 dependency download 真实失败，按第 3 节设置代理后重试同一命令；不得借环境失败修改 production 语义。

## 14. 浏览器验收

自动验收通过后，使用内置浏览器启动 game002，不能用 Playwright 替代真实页面：

```bash
CI=true pnpm --filter game002 dev -- --host 127.0.0.1 --port 5206
```

使用当前 README 规定的 live URL query（必须含 `lines=30`，不得含 `serverUrl`），获得一局真实包含 cascade 的结果，至少验证：

1. loading 99% 前不挂游戏，100% 后只有一个 live session；
2. 初始 54 格 spin 正常，CN 第一帧值/档位没有迟到；
3. 第一中奖组播放 Win 后立即 End；共享 WL 不在第一组消失；
4. 第二中奖组结束后共享 WL 才 End；
5. result 金额在 End 期间仍显示，End 完成后无 normal 闪帧；
6. 10 个中奖格全部消失后才 dropdown；
7. 下方 symbol 略先动，上方随后，落地有轻微回弹，无横移/重叠/越界；
8. 只有顶部 10 个空格做单格 refill spin，其它 44 格不重转；
9. 新 CN 使用服务器 raw value，既有 CN 值跟随下落且不随机变化；
10. 末 step 没 win 时不播放空 win，全部流程结束后才出现 `$2.10` 对应的 global win-amount；
11. win-amount 点击和 awaiting-dismiss 非阻塞合同不变；
12. 下一 spin 清理残留并可再次完整级联；
13. resize/横竖尺寸变化不破坏 board/focus/amount overlay 对齐；
14. console 无 error、unhandled rejection、duplicate resource、missing animation 或 double WebSocket。

浏览器截图/录像用于本地验收，不纳入 git，除非用户另行明确要求提交。

## 15. 完成标准

只有同时满足以下条件才能宣告完成：

- [ ] 完整附件 GMI 已成为 repo-local fixture，不依赖附件。
- [ ] game002 顺序执行全部 step，不再硬编码只消费 step 0。
- [ ] `historyComponentsEx` 不会误触发 bg-win。
- [ ] 两组共享 WL 在最后引用组才 remove。
- [ ] remove 使用 manifest exact `End` once，完成同帧隐藏且金额不提前消失。
- [ ] 全部 remove 完成后才 dropdown。
- [ ] dropdown stable occurrence/value、错峰、力度和回弹符合合同。
- [ ] refill 只 spin `bg-refill.pos`，继续使用本地公开轮带。
- [ ] 新 CN 使用当前 step bg-gencoins 服务端值，无随机覆盖。
- [ ] 全部 step 结束后才启动 global win-amount。
- [ ] manifest/parser/generator/activeSpine/viewer 同步支持 remove/dropdown，valuePresentation 只保留挂件职责。
- [ ] 没有生成 remove/dropdown PNG，没有扩大附属资源 glob。
- [ ] rendercore 拥有通用算法，app 只配置组件/sequence/motion。
- [ ] game003 carousel 和其它 shared consumer 无回归。
- [ ] 所有第 13 节命令通过，`git diff --check` 通过。
- [ ] 第 14 节真实浏览器验收完成并记录结果。
- [ ] `packages/rendercore/README.md`、`apps/game002/README.md`、`apps/symbolsviewer/README.md`、`agents.md` 已同步。
- [ ] 中文报告已按 UTC 秒级命名，并包含基线、改动文件、协议断言、自动命令结果、浏览器结果、未完成项和最终 git status。

## 16. 任务报告要求

报告路径：

```text
tasks/95-game002-cascade-removal-flow-[utctime].md
```

报告必须使用中文并包含：

1. 执行开始/结束 UTC 时间、branch、起始/结束 HEAD；
2. 开始与结束 `git status --short`；
3. 实际修改文件清单，区分用户原有改动与本任务改动；
4. 完整 GMI sequence 解析结果：step 数、component mapping、scene/value/refill pos；
5. shared WL last-use 证明与 `removedNum=11/unique=10` 说明；
6. manifest remove/dropdown/activeSpine 配置，以及 valuePresentation 挂件解耦；
7. rendercore win/remove/dropdown/refill 生命周期实现说明；
8. CN value carry/refill server value 证明；
9. bigwin 最终时序证明；
10. 每条自动验收命令和结果；
11. 浏览器验收 URL（token/cookie 必须脱敏）、操作和结果；
12. 失败、修复和代理是否使用；
13. 明确未完成项/阻塞；无则写“无”。

不能只写“测试通过”，必须记录命令和关键断言。

## 17. 二次遗漏审计

实施完成、写报告前再逐项审计：

### 17.1 协议/数据

- 是否仍有任何 `logic.getStep(0)` 隐藏硬编码？
- 是否把 `historyComponentsEx` 或 mapComponents presence 当触发？
- 是否误用 removedNum/wildNum/symbolNums 推导坐标？
- 是否严格串接上一 remove output 与下一 dropdown src scene？
- 是否同时验证 scene 和 otherScene/value matrix？
- 是否处理多个 cascade step，而不只让附件两步通过？

### 17.2 symbol/manifest

- remove/dropdown 是否是 animation state，而不是 top-level texture state？
- generator round-trip 是否保留配置？
- CN state 是否只切当前 tier player animation，数字挂件是否完全不参与状态配置？
- CN normal/appear/win/remove/dropdown/dropdown move 是否没有二次 setValue/create/attach？
- BN/缺状态是否没有伪动画和 try/catch fallback？
- Spine animation name/version/atlas page 是否 exact 校验？

### 17.3 rendercore 运行时

- 共享坐标是否最后引用才 remove？
- amount 是否贯穿 remove？
- once completion 是否同帧 hide、无闪帧？
- dropdown 是否 stable occurrence 而非 code search？
- CN occurrence/player/数字挂件是否作为整体下落而没有重建？
- selective refill 是否只动空格？
- ticker 是否没有双 update？
- clear/destroy/pool 是否无泄漏？

### 17.4 边界消费者

- game003 carousel 是否未改语义？
- symbolsviewer 是否能预览新 state？
- loading/generated/static dist 是否保持精确闭包？
- app source-boundary 是否禁止私有 Pixi/Spine/cascade 算法？
- README/agents 是否同步 durable contract？

### 17.5 验收和交付

- 自动命令是否全部真实执行并记录？
- 浏览器是否使用真实 cascade GMI，而不是只看无中奖 spin？
- console/network/session 是否检查？
- 截图/录像是否保持 local-only？
- 报告 UTC 文件名是否正确？
- `git diff --check` 和最终 status 是否记录？

任一项未满足都必须在报告中保持可见，不得用“基本完成”掩盖。
