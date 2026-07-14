# game002 bg-win symbol overlay 任务计划

## 1. 任务目标

本任务先在 `packages/rendercore` 封装一个通用的 symbol 中奖状态轮播函数，再由 `apps/game002` 用组件名 `bg-win` 接入 live GMI：主转轮停到服务器目标 scene 后，通用函数按调用方传入的一个或多个中奖组件名读取各组件 `basicComponentData.usedResults` 指向的 `clientData.results[]`；当前组的全部 `pos` symbol 同时切到 manifest 驱动的 `win` 状态，并在该组中奖坐标的几何中心附近选中一个真实格子显示该组中奖金额。

仓库根目录固定为：

```text
/Users/zerro/github.com/slotclientengine
```

本计划是完整执行合同，不能依赖聊天记录、附件、旧任务文档或口头说明。执行者只阅读本文件，即可完成协议解析、ReelSet 无关的 rendercore 通用 carousel、grid-cell 能力补齐、game002 接入、game003 等价迁移、测试、文档、协作规则和最终任务报告。

最终行为固定如下：

- `packages/rendercore` 新增一个职责收敛的通用函数，建议命名 `createSymbolWinCarousel(...)`：负责按组件名解析 result、请求 symbol `win` 状态、渲染单组金额、依次轮播、首轮完成通知、循环暂停、clear 和 destroy。后续若出现不同中奖效果，应新增并列函数，不把本函数扩展成包含所有效果的插件系统。
- `bg-win` 只是 game002 传入的组件名；rendercore 不硬编码 `bg-win`、`bg-wins`、game002/game003 或 Ways/Cluster 语义。
- 通用函数必须支持 `componentNames: readonly string[]`。组件按调用方数组顺序处理；每个组件内部严格保持自己的 `usedResults` 顺序。未触发的配置组件跳过；所有配置组件都未触发时返回“无展示”，不得回退到全部 `clientData.results`。
- 同一 result 被不同组件引用时，按组件引用分别播放，不做跨组件隐式去重；group/snapshot/error 必须保留 `componentName`，让调用方能定位来源。
- 单个 result 的所有 `pos` 同时请求 `win`；多个 result 依次播放。一轮结束后暂停 `1s`，再从第一组循环，直到下一次 spin 清理。
- `playSpin()` 必须等待主转轮停稳、`bg-win` 首轮完整展示以及现有 win-amount 主要播放完成；首轮之后的 symbol/result 金额循环作为 lingering 展示，不继续阻塞 collect。
- 下一次 spin 开始前必须清理上一轮 lingering symbol 状态和 result 金额；现有全局 win-amount 也继续按原合同清理。
- 附件所给真实 result 中 `coinWin=0`、`cashWin=0`，实际单组金额在 `coinWin64=30`、`cashWin64=300`。game002 单组现金金额按明确优先级选择：`cashWin64 !== undefined` 时使用 `cashWin64`，否则使用 `cashWin`；附件样例通过现有 `formatServerUsdAmount(300)` 显示为 `$3.00`。
- “64 有值”按字段存在性判断，不用 truthy/`||`。`cashWin64=0` 是已提供的值，必须选择它后因非正中奖金额显式失败，不能再回退到正数 `cashWin`。只有 `cashWin64 === undefined` 才允许使用 `cashWin`。
- `coinWin64` 作为通用可选 wire 字段与 `cashWin64` 一并由 logiccore 校验并保留，但本次金额 overlay 不消费 coin 字段，也不根据 game-specific component totals 推导现金金额。
- 不得用 `bg-win.basicComponentData.cashWin`、step total、`logic.getTotalWin()` 或全局 win-amount 文本替代缺失的 result `cashWin64/cashWin`。result 两个 cash 字段都缺失，或按优先级选中的值非数值、非有限数、不大于 `0`，都必须显式失败。
- 金额锚点算法是通用轮播函数的一部分：计算当前组所有中奖格中心的算术平均点，再从当前组实际中奖格中选择距离平均点最近的一格；距离相同按 `x`、再按 `y` 升序决定。不得把金额放在不存在的虚拟中心点。
- 附件样例的 `pos` 为 `(0,2),(0,3),(1,3),(1,4),(2,3),(2,2),(3,2),(3,3)`；按上述规则必须选择 `(1,3)`。金额在该 cell 中心向下偏移 `0.22 * cellHeight`。
- 通用轮播函数不能依赖、import、`instanceof` 判断或泛型绑定 `RenderReelSet` / `RenderGridCellReelSet`。rendercore 定义一个最小的 `VisibleSymbolPresentationTarget`（名称可按现有风格微调）能力接口；逐轴、逐格和未来 ReelSet 只要实现状态请求、状态快照、几何快照和动画推进即可接入。
- `RenderReelSet` 与 `RenderGridCellReelSet` 仍是两种不同 spin 模型：前者一轴一轴转，后者一格一格转。对齐能力接口不能合并、不互相替换，也不能改写各自的 spin plan、启停顺序、mask、dimming 或 timing。
- 当前 `apps/game003` 已有同类 `bg-wins` result loop。本任务要把 game003 等价迁移到同一个 rendercore carousel，删除/收口其重复状态机，以 game002 + game003 两个真实消费者证明复用；迁移不得改变 game003 的 `cashWin`、component totals、首轮/lingering、YAML style、minecart、coin overlay 或 global win-amount 合同。
- 中奖 symbol 动画必须由现有 manifest/resolver 和 `RenderSymbol.requestState("win")` 驱动；不得在 app 中直接 import Spine runtime、遍历 Pixi 私有 children、手写动画时长或用 CSS/DOM 替代 Pixi 状态。
- `WL,H1,H2,L1,L2,L3,L4` 现有 skeleton 都有真实 `Win` animation；这些实际可中奖 symbol 必须继续由 manifest 显式声明 `win`，不得依赖通用 builtin/normal fallback 掩盖资源缺失。
- 通用函数复用 logiccore 的 component/`usedResults`/`pos` 成对、重复和边界校验；金额选择由调用方传入 resolver，文字由调用方传 formatter/style。函数不默认把 `result.symbol` 与 scene cell 强制相等，也不拿 `symbolNum`/`symbolNums` 校验 `pos` 数量，避免误伤含 wild 的合法中奖组。
- 不改变服务器 scene、reel stop、renderPriority、symbol state 以外的结果顺序、全局 win-amount 点击合同、live server、`lines=30`、loading 99%/100%、本地公开轮带或服务器目标窗口临时叠加边界。
- 如果是测试导致奇怪写法，应修改测试，不削弱 production 合同；测试必须同时覆盖合法的 `cashWin64 -> cashWin` 字段优先级与 fallback，不得引入 component total/totalwin fallback、timer 强制完成、全部 results 自动播放或 app 私有 Pixi 遍历。

任务完成后必须新增中文任务报告：

```text
tasks/93-game002-bg-win-symbol-overlay-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/93-game002-bg-win-symbol-overlay-260714-181300.md
```

## 2. 已确认的当前实现和协议事实

以下事实来自制定计划时的实际 checkout；实施时仍必须重新执行第 5 节盘点，不能只引用本节快照。

### 2.1 Git 与工作区基线

制定计划时：

```text
branch: main
HEAD: ece1c64
working tree: clean
```

执行时不得使用 `git reset --hard`、`git checkout --`、自动 stash 或批量清理 untracked。若工作区已有用户改动，应先记录并绕开；与任务文件重叠时必须保留用户内容并做最小增量修改。

### 2.2 附件 GMI 的最小权威合同

本任务的真实验收样例固定为：

```json
{
  "bet": 10,
  "lines": 30,
  "totalwin": 300,
  "replyPlay": {
    "results": [
      {
        "coinWin": 30,
        "cashWin": 300,
        "clientData": {
          "scenes": [
            {
              "values": [
                { "values": [1, 1, 3, 3, 2, 2, 1, 5, 5] },
                { "values": [5, 3, 6, 3, 3, 2, 2, 1, 3] },
                { "values": [2, 2, 3, 3, 6, 4, 4, 6, 1] },
                { "values": [2, 4, 3, 3, 2, 2, 8, 8, 6] },
                { "values": [4, 4, 2, 6, 6, 1, 6, 3, 3] },
                { "values": [2, 5, 5, 2, 2, 6, 8, 8, 4] }
              ]
            }
          ],
          "results": [
            {
              "pos": [0, 2, 0, 3, 1, 3, 1, 4, 2, 3, 2, 2, 3, 2, 3, 3],
              "type": 6,
              "lineIndex": -1,
              "symbol": 3,
              "mul": 30,
              "coinWin": 0,
              "cashWin": 0,
              "otherMul": 1,
              "wilds": 0,
              "symbolNums": 8,
              "value": 0,
              "coinWin64": 30,
              "cashWin64": 300
            }
          ],
          "curGameModParam": {
            "historyComponents": ["bg-spin", "bg-win"],
            "historyComponentsEx": ["bg-spin", "bg-win"],
            "mapComponents": {
              "bg-spin": {
                "basicComponentData": {
                  "usedScenes": [0],
                  "usedOtherScenes": [],
                  "usedResults": [],
                  "coinWin": 0,
                  "cashWin": 0
                }
              },
              "bg-win": {
                "basicComponentData": {
                  "usedScenes": [],
                  "usedOtherScenes": [],
                  "usedResults": [0],
                  "coinWin": 30,
                  "cashWin": 300
                },
                "symbolNum": 8,
                "wildNum": 0,
                "wins": 30,
                "winMulti": 1
              }
            }
          }
        }
      }
    ]
  }
}
```

正式 fixture 仍要补齐当前 parser 所需的 `defaultScene`、空数组字段和顶层 spin-result wrapper，但不得改变上述 scene、result、`usedResults`、金额和 component 关系。

关键断言：

```text
usedResults = [0]
result.pos 格数 = 8
result.symbol = 3 (L1)
result.cashWin = 0
result.cashWin64 = 300 -> $3.00
bg-win.basicComponentData.cashWin = 300
bg-win.basicComponentData.coinWin = 30
bg-win.wins = 30
```

### 2.3 logiccore / gameframeworks 当前能力

当前已有：

```text
packages/logiccore/src/win-results.ts
  parseWinResultPositions(...)
  getComponentWinResultGroups(...)

packages/gameframeworks/src/component-helpers.ts
  getComponentWinResultGroupsByName(...)
```

这些通用 helper 已保留 `usedResultIndexes` 的原始顺序，并校验：

- `pos` 必须是 x/y 成对数组；
- 坐标必须是非负整数；
- 同一 result 不能有重复坐标；
- 传入 scene 时坐标必须在边界内；
- `usedResults` 索引越界由现有 component/result 路径显式失败。

当前 `WinResult` 类型和 parser 只显式认识 `coinWin` / `cashWin`，虽然 clone 后的 raw record 会保留 `coinWin64` / `cashWin64`，但没有类型和字段级校验。本任务需要把 64 位金额字段作为通用可选 wire 字段补齐；shared 层只校验其数值类型，不理解 game002 的“64 字段存在时优先，否则使用旧字段”选择规则。

### 2.4 game002 当前运行链路

主要文件：

```text
apps/game002/src/game-demo.ts
apps/game002/src/game-adapter.ts
apps/game002/src/money.ts
apps/game002/src/win-amount-config.ts
apps/game002/tests/fixtures/game002-gmi.ts
apps/game002/tests/game-demo.test.ts
apps/game002/tests/game-adapter.test.ts
apps/game002/tests/source-boundary.test.ts
apps/game002/README.md

apps/game003/src/game-adapter.ts
apps/game003/src/game-demo.ts                      # 现有能力 target 保持/对齐
apps/game003/src/win-sequence.ts                   # 收口为 app 参数/金额/totals validator
apps/game003/src/win-symbol-loop.ts                # 删除或移除重复状态机
apps/game003/src/win-symbol-loop-config.ts         # 保留 YAML app 配置解析，可按通用 options 改名
apps/game003/tests/win-sequence.test.ts
apps/game003/tests/win-symbol-loop.test.ts         # 迁移为 adapter/config 回归，通用状态机测试归 rendercore
apps/game003/tests/game-adapter.test.ts
apps/game003/tests/source-boundary.test.ts
apps/game003/README.md
```

当前 `playSpin()` 只做：

```text
解析 step[0].scene[0]
-> grid-cell reels spin
-> 校验可见 scene
-> 如 totalwin > 0，播放全局 win-amount
-> win-amount 进入非阻塞阶段后 resolve
```

当前未读取 `bg-win`，未请求中奖 symbol 状态，也没有单 result 金额 overlay。`apps/game002/tests/fixtures/game002-gmi.ts` 已包含一个旧的 `bg-win` 合成 fixture，但其中 result 直接使用正数 `cashWin`，与本任务真实样例的 `cashWin=0/cashWin64>0` 不一致，不能继续作为本功能的金额合同。

### 2.5 rendercore grid-cell 缺口

`RenderReelSet` 是一轴一轴转的 reel set；其内部 `RenderReel` 和 set 已提供：

```text
requestVisibleSymbolState(s)
getVisibleSymbolStateSnapshot(s)
getVisibleSymbolGeometrySnapshot(s)
```

`RenderGridCellReelSet` 是一格一格转的 reel set，当前只有 `getVisibleScene()` 和调试 snapshot，没有等价 public API。每个 grid cell 内部是一条 `visibleRows=1` 的 `RenderReel`，且 cell root 自己承担 `x * cellWidth / y * cellHeight` 位移，因此不能直接把内部 reel 的 `y=0` 或局部几何原样返回。新增公共 API 只是统一停轴后的可见格访问表面，不得把 grid-cell spin 改造成按轴 spin，也不得让 `RenderReelSet` 改成按格 spin。

另一个关键缺口是：当前 `RenderGridCellReelSet.update()` 只在存在 spin plan 时推进内部 reels；spin 完成后不会继续调用 `RenderReel.update(deltaSeconds)`。即使 app 请求了 `win`，once animation 也不会自然走完并回到 normal。必须在 shared grid-cell runtime 修正这个通用生命周期，不能在 game002 遍历内部 cell 兜底。

### 2.6 symbol 资源事实

`assets/gamecfg002/gameconfig.json` 当前实际可中奖 pay symbol 为：

```text
0=WL, 1=H1, 2=H2, 3=L1, 4=L2, 5=L3, 6=L4
```

`assets/game002-s3/symbol-state-textures.manifest.json` 已为上述七个 symbol 显式配置 Spine `win -> Win once`；各 skeleton 中真实存在大小写精确的 `Win` animation。`WM,CN,CM,CO,AF,BN` 当前没有同等的 `Win` animation，不得在本任务中猜测 `Change/Feature/Loop/End` 为 win，也不得修改这些 feature symbol 的 manifest 语义。

### 2.7 game003 当前可复用实现

当前相关文件：

```text
apps/game003/src/win-sequence.ts
apps/game003/src/win-symbol-loop.ts
apps/game003/src/win-symbol-loop-config.ts
apps/game003/src/game-adapter.ts
apps/game003/tests/win-sequence.test.ts
apps/game003/tests/win-symbol-loop.test.ts
```

现有 `Game003WinSymbolLoopRuntime` 已实现本任务要抽取的大部分通用行为：按 `bg-wins.usedResults` 顺序请求 symbol win、Pixi Text 金额、平均点附近真实格 anchor、首轮完成、pause 后 lingering loop、clear 和 destroy。其 ReelSet 交互只需要状态请求、状态快照、几何快照和 update，因此适合抽成能力接口。

game003 仍有必须留在 app 参数/validator 的语义：

- 组件名是 `bg-wins`；
- 每个 result 金额直接取自身 finite positive `cashWin`；
- `wins` / `basicComponentData.coinWin/cashWin` 与 groups 汇总一致；
- `game003WinSymbolLoop` style/pause 来自 YAML generated `appExtensions`；
- adapter 还要协调 global win-amount、bg-bar、minecart 和 coin overlay。

抽取时必须保留这些边界，不能为了共用而把 game003 改成 game002 的 64 字段规则，也不能把 game003 专属 validator 写进 rendercore。

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

不得在没有下载失败时修改 npm/pnpm 全局配置。非 TTY 环境出现 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` 时，使用相同命令加 `CI=true` 重试，例如：

```bash
CI=true pnpm --filter game002 test
```

验收命令应串行执行，避免多个 package 同时重建 shared `dist/`。如果是测试导致一些奇怪写法，就修改测试，不要改不该改的 production 行为；尤其不得为了 fake runtime 简单而删除首轮等待、把字段存在性选择写成 truthy/`||`、加入 component total/totalwin fallback、跳过 geometry 或把 animation completion 改成固定 timer。

## 4. 范围和非目标

### 4.1 必须检查或修改的实现面

```text
packages/logiccore/src/types.ts
packages/logiccore/src/parser.ts
packages/logiccore/tests/*                       # 64 位金额字段 parser/type 回归

packages/rendercore/src/reel/types.ts
packages/rendercore/src/reel/render-grid-cell-reel-set.ts
packages/rendercore/tests/reel/render-grid-cell-reel-set.test.ts
packages/rendercore/src/symbol-win-carousel/*   # 建议新增通用函数、类型、金额 renderer
packages/rendercore/src/index.ts
packages/rendercore/tests/symbol-win-carousel/*
packages/rendercore/README.md                    # 能力端口与通用轮播 public API

apps/game002/src/game-demo.ts
apps/game002/src/game-adapter.ts
apps/game002/src/win-symbol-carousel-config.ts   # 建议新增 app 参数与金额 resolver
apps/game002/tests/fixtures/game002-gmi.ts
apps/game002/tests/game-demo.test.ts
apps/game002/tests/game-adapter.test.ts
apps/game002/tests/win-symbol-carousel-config.test.ts
apps/game002/tests/source-boundary.test.ts
apps/game002/tests/assets.test.ts                 # 可中奖 symbol 的显式 Win 资源合同
apps/game002/README.md

agents.md
tasks/93-game002-bg-win-symbol-overlay-[utctime].md
```

按实际组织可微调新增文件名，但职责和验收面不能缩减。rendercore 已依赖 logiccore，通用轮播应直接复用 logiccore 的 `GameLogic` / `getComponentWinResultGroups(...)`，不能反向依赖 gameframeworks。`packages/gameframeworks` 原则上只需编译/测试，不增加 `bg-win` 或轮播专属 facade。`apps/game002/scripts/verify-static-dist.mjs` 不需要新增资源闭包；仍必须通过 `release:check`，若 build 输出合同确实受影响再做最小更新。

### 4.2 明确非目标

- 不改变 `apps/game003` 的外部行为或 YAML/generated 数据；但必须把现有 `bg-wins` 状态/金额轮播实现迁移到通用 carousel，避免仓库保留两套同类状态机。coin overlay、minecart、bg-bar 和其它 game003 逻辑不在重构范围。
- 不把 game002 的 `bg-win` 或 `cashWin64 !== undefined ? cashWin64 : cashWin` 规则硬编码进 shared 包；game002 将这些作为 `componentNames` 和 amount resolver 传给通用函数。循环、金额 renderer 和确定性 anchor 属于本次明确要求的通用表现能力，可以放在 rendercore。
- 不让通用函数接受 `RenderReelSet | RenderGridCellReelSet` union，不用 `instanceof`/类名分支，也不复制两套 ReelSet adapter。未来 ReelSet 通过同一能力接口接入。
- 不引入 game002 YAML/buildgamestatic 流程。game002 当前没有该生成链路，本任务使用冻结的 app-owned typed config，避免为一个固定样式扩展无关生成器。
- 不新增或修改 symbol/Spine 美术资源，不为 `WM,CN,CM,CO,AF,BN` 猜测 win animation。
- 不改变 `symbol-state-textures.manifest.json` 的 scale/renderPriority，除非资源盘点发现七个实际可中奖 symbol 的既有 `win` 合同被破坏；当前快照不需要改 manifest。
- 不新增 DOM overlay、CSS 绝对定位或第二个 canvas；通用函数拥有的金额 renderer 必须是可挂入调用方 Pixi world 的 `Container/Text`。
- 不把 `result.symbolNums`、component `symbolNum` 当作 `pos.length / 2` 的通用等式；附件中相等不代表协议永远如此。
- 不默认校验每个 `pos` 的 scene code 必须等于 `result.symbol`；wild 替代属于游戏语义，缺少真实反例前不猜测。
- 不用总中奖金额代替单 result 金额，不让全局 win-amount 的点击关闭行为控制 result symbol loop。
- 不改变 loading、query、server、lines、background、focus、grid-cell spin timing、public reel 或 collect 协议。
- 不手改 `dist/`、`coverage/`、`.turbo/`；这些是生成物。

## 5. 实施前盘点

### 5.1 环境、基线和用户改动保护

```bash
cd /Users/zerro/github.com/slotclientengine
node --version
pnpm --version
git branch --show-current
git log -3 --oneline
git status --short --untracked-files=all
git diff --stat
```

必须确认：

- Node/pnpm 满足版本要求；
- 当前工作区改动已记录，不会被覆盖；
- `tasks/93-game002-bg-win-symbol-overlay.md` 是本任务计划，报告使用不同的带 UTC 后缀文件名；
- 不存在另一个并行任务正在改同一批 runtime/test 文件。

### 5.2 协议与调用链复核

```bash
rg -n '"bg-win"|cashWin64|coinWin64|usedResults' apps/game002 packages/logiccore packages/gameframeworks
rg -n 'requestVisibleSymbolStates|getVisibleSymbolState|getVisibleSymbolGeometry' packages/rendercore/src apps/game003/src/game-demo.ts
rg -n 'winSymbolLoop|firstCycleComplete|formatServerUsdAmount' apps/game003/src apps/game003/tests
```

重新确认：

- game002 仍使用 `RenderGridCellReelSet`；
- gameframeworks facade 仍公开通用 win-result group helper；
- 64 位金额字段尚未被别的实现赋予冲突语义；
- game003 仍按首轮阻塞、后续 lingering、下一 spin 清理的合同运行。

### 5.3 资源只读检查

```bash
jq -r '.paytable | to_entries[] | [.key, .value.symbol, ((.value.pays // []) | max)] | @tsv' assets/gamecfg002/gameconfig.json
for f in assets/game002-s3/{WL,H1,H2,L1,L2,L3,L4}.json; do jq -r '[input_filename, ((.animations // {}) | keys | join(","))] | @tsv' "$f"; done
rg -n '"WL"|"H1"|"H2"|"L1"|"L2"|"L3"|"L4"|"win"|"animationName": "Win"' assets/game002-s3/symbol-state-textures.manifest.json
```

若附件对应的 result symbol 或 pos 实际可能落到没有 `Win` 的 feature symbol，应停止并要求补充真实资源/协议，不得把其它 animation 名自动当 win。

## 6. 通用协议字段与中奖组解析

### 6.1 logiccore 只补齐通用 wire 字段

在 `packages/logiccore/src/types.ts` 的 `WinResult` 增加：

```ts
readonly coinWin64?: number;
readonly cashWin64?: number;
```

在 `parseWinResult()` 中与现有 `coinWin/cashWin` 一样：字段存在时必须是 finite number；缺失时仍允许，因为其它游戏/旧协议可能不发送。这里不要求正数、不决定显示字段，也不出现 `bg-win` 或 game002。

新增/更新 logiccore parser 测试：

- 合法 `coinWin64/cashWin64` 被保留且冻结；
- `NaN`、`Infinity`、字符串、`null` 显式失败；
- 字段缺失不影响现有通用结果；
- `coinWin/cashWin` 与 64 字段可同时存在且值不同，parser 不自行选择或覆盖。

`packages/gameframeworks` re-export 的 `WinResult` 应自然获得类型更新；只做 build/typecheck 回归，不增加专属 facade。

### 6.2 rendercore 通用组件解析输入

通用轮播函数直接接收 logiccore 的 `GameLogic`，不能要求 app 先复制一套 `win-sequence.ts`。建议 start input：

```ts
export interface SymbolWinCarouselStartInput {
  readonly logic: GameLogic;
  readonly stepIndex: number;
  readonly scene: SceneMatrix;
  readonly componentNames: readonly string[];
}
```

rendercore 内部通用 group 至少包含：

```ts
export interface SymbolWinCarouselGroup {
  readonly componentName: string;
  readonly stepIndex: number;
  readonly resultIndex: number;
  readonly result: WinResult;
  readonly positions: readonly WinResultPosition[];
  readonly amount: number;
}
```

实现要求：

1. `stepIndex` 必须是 logic 内合法 step；`scene` 由游戏先用自己的 shape validator 校验，再由 shared helper用于 pos 边界校验。
2. `componentNames` 必须是非空、非空白、无重复的冻结列表；函数不提供默认组件名。
3. 按 `componentNames` 输入顺序遍历。某个组件未触发时跳过；已触发但缺 `basicComponentData` 时显式失败。
4. 每个组件调用 logiccore 的 `getComponentWinResultGroups(logic.getStep(stepIndex), componentName, { scene })`，严格保留该组件的 `usedResultIndexes` 顺序。
5. 同一 result 被两个组件引用时生成两个带各自 `componentName` 的 group，不隐式去重或重排。
6. 通用函数不理解 `cashWin64/cashWin`、币种或 component totals。构造函数要求调用方提供 `resolveAmount(context)`；context 至少含 `componentName/resultIndex/result`。返回值必须由通用函数再次校验为 finite positive number。
7. 为保留不同游戏已有的 component 汇总/语义校验，允许调用方提供可选 `validateComponent(context)`：每个已触发组件的 groups 和解析后 amount 全部准备好后调用一次。context 至少包含 logic、step、componentName、raw component 和该组件 groups；rendercore 只调用 callback，不解释字段。
8. 通用函数不读取 `symbolNum/symbolNums`，也不默认校验 `result.symbol` 与 scene symbol；如游戏需要，继续通过 logiccore 已有可选 position validator 或 `validateComponent` 扩展，不能写死 Ways/Cluster/wild。
9. 所有配置组件都未触发时，`prepare()` 返回 `groupCount=0` 的冻结 prepared 对象；后续 `start(prepared)` 返回 `started=false` 并保持 idle，不得读取全部 results 兜底。
10. 返回 group/snapshot/error 必须保留 `componentName` 和原始 `resultIndex`，方便多个中奖组件并存时诊断。

### 6.3 game002 只提供参数与金额 resolver

`apps/game002/src/win-symbol-carousel-config.ts` 只定义：

```ts
export const GAME002_WIN_COMPONENT_NAMES = Object.freeze(["bg-win"]);

export function resolveGame002WinResultAmount(context): number {
  const result = context.result;
  return result.cashWin64 !== undefined ? result.cashWin64 : result.cashWin;
}

export function validateGame002WinComponent(context): void {
  // 若 basicComponentData.cashWin 存在，必须等于该组件 groups 的 resolved amount 汇总。
}
```

实际实现必须在返回前或由 rendercore 统一校验：

- `cashWin64 !== undefined` 时选择 `cashWin64`；只有 `undefined` 才选择 `cashWin`；
- 不用 truthy/`||`；64 字段存在但为 `0` 时不回退；
- 两个字段都缺失，或选中值不是 finite positive number，显式失败；
- 不使用 component cash、step total 或 `logic.getTotalWin()` 兜底。

`validateGame002WinComponent` 只做 app 协议一致性校验，不能把 component cash 当 result 缺失时的金额来源；多个组件分别校验自己的 groups，不跨组件求一个总数。若 component basic cash 字段缺失可按当前 wire optional 合同跳过，存在则必须 finite 且精确相等。

game002 不再自行解析 `usedResults`、pos、组件顺序或创建 app-owned group type。未来若 game002 增加第二个中奖组件，只需把组件名按希望的播放顺序加入 `GAME002_WIN_COMPONENT_NAMES`，不复制轮播状态机。

## 7. ReelSet 无关的可见 symbol 能力端口

### 7.1 通用能力接口

在 rendercore 公共类型中定义最小能力接口，建议为：

```ts
export interface VisibleSymbolPresentationTarget {
  requestVisibleSymbolStates(
    positions: readonly WinResultPosition[],
    state: SymbolStateId,
  ): void;
  getVisibleSymbolStateSnapshots(
    positions: readonly WinResultPosition[],
  ): readonly RenderVisibleSymbolStateSnapshot[];
  getVisibleSymbolGeometrySnapshots(
    positions: readonly WinResultPosition[],
  ): readonly RenderVisibleSymbolGeometrySnapshot[];
  update(deltaSeconds: number): unknown;
}
```

通用轮播函数的构造参数类型只能引用这个接口，不能引用具体 ReelSet。`update()` 只在 reels 已停稳、轮播 active/lingering 时调用；调用方不能在同一 tick 再独立推进同一个 target，避免 double update。

接口的语义要求：

- positions 使用当前可见 scene 的逻辑 `(x,y)` 坐标；
- request 同一批 positions 的 manifest 状态；本函数固定请求 `win`，实际 VNI/Spine/builtin resolver 仍由已加载的 symbol manifest 和 `RenderSymbol` 拥有；
- state snapshot 用于判断 once 状态何时自然回 normal；
- geometry snapshot 使用 target 本地坐标，用于金额 anchor；
- update 推进 target 当前可见 symbol animation；
- 不暴露 Container、RenderSymbol、slot、reel axis、grid cell 或私有 children。

未来新增 ReelSet 只需实现此接口即可使用 `createSymbolWinCarousel(...)`，无需修改轮播函数。

### 7.2 现有 ReelSet 对齐

“一轴一轴转”的 `RenderReelSet` 已基本具备所需方法；“一格一格转”的 `RenderGridCellReelSet` 增加对齐的通用可见格 API：

```ts
requestVisibleSymbolState(x: number, y: number, state: SymbolStateId): void;
requestVisibleSymbolStates(
  positions: readonly { readonly x: number; readonly y: number }[],
  state: SymbolStateId,
): void;

getVisibleSymbolStateSnapshot(
  x: number,
  y: number,
): RenderVisibleSymbolStateSnapshot;
getVisibleSymbolStateSnapshots(
  positions: readonly { readonly x: number; readonly y: number }[],
): readonly RenderVisibleSymbolStateSnapshot[];

getVisibleSymbolGeometrySnapshot(
  x: number,
  y: number,
): RenderVisibleSymbolGeometrySnapshot;
getVisibleSymbolGeometrySnapshots(
  positions: readonly { readonly x: number; readonly y: number }[],
): readonly RenderVisibleSymbolGeometrySnapshot[];
```

要求：

- 只对齐停轴后的能力接口，不抽取共同 spin 基类，不共享 spin plan，不改变 `RenderReelSet` 的逐轴启停，也不改变 `RenderGridCellReelSet` 的逐格 order/timing/dimming。
- `x/y` 使用整个 grid 的可见窗口坐标，不暴露 cell 内部 `visibleRows=1` 的 `windowY=0`。
- 复用现有 `getCell(x,y)` 做整数/边界定位；缺失格显式失败。
- grid-cell reel set 正在逐格 spin 时，state request 和 geometry read 必须显式失败，不能操作移动中的 slot；state snapshot 是否允许读取应与逐轴 `RenderReelSet` 一致，但不得返回错误逻辑坐标。
- 批量方法保持输入顺序，不排序、不去重；重复坐标应由上游 win-result parser 拒绝。
- `RenderVisibleSymbolStateSnapshot.x/y` 必须重写为 grid coordinate `(x,y)`，不能返回内部 reel 的 `(x,0)`。
- geometry 必须转换到 `RenderGridCellReelSet` 本地坐标：

```text
centerX = cell.root.x + inner.centerX
centerY = cell.root.y + inner.centerY
cellWidth/cellHeight 保持真实格尺寸
x/y = grid coordinate
```

- geometry 不包含 `RenderSymbol`、Container 或其它可变私有引用。
- 这些 API 不认识 result、金额、`bg-win` 或 game002。

### 7.3 停轴后的 symbol update

修正 `RenderGridCellReelSet.update(deltaSeconds)`：

- 有 active spin plan 时继续使用现有 `updateCell()` 路径，不能重复推进正在 spin 的内部 reel。
- 没有 active spin plan 时，每个 cell 的内部 `RenderReel.update(deltaSeconds)` 都要推进一次，使 normal loop 和 `win once -> normal` 生命周期继续运行。
- idle update 不得伪造新的 `completed=true` 或 landed event；现有 `completed` 仍只表示本次 spin 刚完成。
- 非法 delta 继续由统一 `assertValidDeltaSeconds()` 显式失败。
- 不为 win 动画加固定 duration、timeout 或强制 reset。
- 更新后继续保证 cell render priority/zIndex 合同不被 win state 改写。

### 7.4 ReelSet 能力测试

`packages/rendercore/tests/reel/render-grid-cell-reel-set.test.ts` 至少覆盖：

- stopped grid 中按 `(x,y)` 请求 `win`，snapshot 返回正确 grid 坐标、code、requested/resolved state；
- 批量请求保持位置顺序；
- stopped 状态连续 `update()` 后 once win 自然回 normal；
- geometry 的中心包含 cell root 位移，`(1,3)` 不会误报为内部 `(1,0)`；
- geometry batch 保持顺序；
- spin 中 state request / geometry read 失败；
- x/y 越界失败；
- empty/missing visible symbol 失败；
- idle symbol update 不改变 visible scene、spin completed event、dimming、mask 或 renderPriority。

再增加接口级类型/行为测试：

- `RenderReelSet` 可直接作为 `VisibleSymbolPresentationTarget` 使用；
- `RenderGridCellReelSet` 可直接作为同一接口使用；
- 一个不继承任何现有 ReelSet 的 fake/future target 也能接入通用轮播，证明实现没有类名、union 或 `instanceof` 依赖；
- 通用轮播测试中不 import 两个具体 ReelSet，只使用接口 fake。

同步 `packages/rendercore/README.md`，明确 `RenderReelSet` 逐轴转、`RenderGridCellReelSet` 逐格转；两者只是在停轴后实现同一 `VisibleSymbolPresentationTarget`，且 grid-cell 在停轴后仍推进 symbol animation。文档必须给出一个不提具体 ReelSet 类型的 `createSymbolWinCarousel(...)` 调用示例。

## 8. game002 提供能力 target

由于 `createGame002ReelRuntime()` 当前把实际 reel set 保存在闭包里，扩展 `Game002ReelRuntime` 使其结构上满足 `VisibleSymbolPresentationTarget`：

```ts
requestVisibleSymbolStates(
  positions: readonly WinResultPosition[],
  state: SymbolStateId,
): void;

getVisibleSymbolStateSnapshots(
  positions: readonly WinResultPosition[],
): readonly RenderVisibleSymbolStateSnapshot[];

getVisibleSymbolGeometrySnapshots(
  positions: readonly WinResultPosition[],
): readonly RenderVisibleSymbolGeometrySnapshot[];
```

实现只委托当前内部 ReelSet 的 public API。通用 carousel 接收的是 `VisibleSymbolPresentationTarget`，不知道当前 target 背后是 grid-cell；未来 game002 更换 ReelSet 时，只需保持这个能力合同。禁止：

- 在 `apps/game002` 遍历 grid cell、slot snapshots、children 或 `RenderSymbol`；
- 直接调用 Spine player；
- 在 runtime 中识别 `bg-win`、解析 component/result、读取金额或选择 anchor；
- 为测试暴露 private cell/container。

`getVisualSnapshot()` 可继续保留现有调试矩阵；新增正式能力后，中奖播放不得依赖该调试 snapshot 的 `requestedStates`。不要为 carousel 增加 `kind: "grid-cell"`、`reelSetType` 等类型判别字段。

更新 `apps/game002/tests/game-demo.test.ts`，使用真实 runtime 验证：停轴后指定 `(x,y)` 可请求 win、update 会推进并回 normal、几何中心与 `layerLayout` 约定一致、可见 scene 不改变。

## 9. rendercore 通用 symbol 中奖轮播

### 9.1 单一、小型 public function

建议新增 `packages/rendercore/src/symbol-win-carousel/` 并从 `@slotclientengine/rendercore` 导出：

```ts
export function createSymbolWinCarousel(options: {
  readonly target: VisibleSymbolPresentationTarget;
  readonly resolveAmount: SymbolWinAmountResolver;
  readonly validateComponent?: SymbolWinComponentValidator;
  readonly formatAmount: (amount: number) => string;
  readonly cyclePauseSeconds: number;
  readonly amountText: SymbolWinAmountTextOptions;
}): SymbolWinCarousel;
```

返回对象至少提供：

```ts
interface SymbolWinCarousel {
  readonly container: Container;
  readonly firstCycleComplete: boolean;
  prepare(input: SymbolWinCarouselStartInput): PreparedSymbolWinCarousel;
  start(prepared: PreparedSymbolWinCarousel): SymbolWinCarouselStartResult;
  clear(): void;
  update(deltaSeconds: number): SymbolWinCarouselUpdateResult;
  getSnapshot(): SymbolWinCarouselSnapshot;
  destroy(): void;
}
```

`prepare()` 是不触碰 target 的纯数据阶段：解析组件、usedResults、pos 和 amount resolver，返回冻结 groups，使游戏可在启动 reels 前 fail-fast。`start(prepared)` 只能在 reels 停稳后调用，负责状态请求、geometry 和显示。prepared 对象必须由同一 public API 产生，不能由 app 手工拼装；不得在 `start()` 重复解析 logic 或再次调用 amount resolver。

本函数是一个具体、简单的“manifest symbol 切 `win` + result 金额 + 顺序轮播”效果，不建立 effect registry、插件协议、继承层次或万能配置 DSL。后续需要不同表现时新增 `createXxxSymbolWinEffect()` 等并列函数，共享最小内部 helper 即可。

### 9.2 调用方参数

game002 在 `apps/game002/src/win-symbol-carousel-config.ts` 提供：

```ts
export const GAME002_WIN_COMPONENT_NAMES = Object.freeze(["bg-win"]);

export const GAME002_SYMBOL_WIN_CAROUSEL_OPTIONS = Object.freeze({
  cyclePauseSeconds: 1,
  amountText: Object.freeze({
    yOffsetRatioFromCellCenter: 0.22,
    fontSize: 38,
    fill: "#fff7d6",
    stroke: "#5a2500",
    strokeWidth: 5,
  }),
});
```

并把 `resolveGame002WinResultAmount`、`validateGame002WinComponent`、现有 `formatServerUsdAmount` 和 runtime target 传给构造函数。不得从 game003 generated file 跨 app import。未来增加第二个中奖组件，只修改 component name 数组；若另一游戏金额字段/formatter/style/validator 不同，传自己的 callback/config，不修改通用函数。

### 9.3 通用状态机

状态机固定为：

```text
idle
  -> prepare({ logic, stepIndex, scene, componentNames })
  -> reels spin/stop
  -> start(prepared)
  -> playing group[0]
  -> group[0] once win 全部回 normal，隐藏金额
  -> playing group[1] ...
  -> 最后一组完成，firstCycleComplete=true
  -> cycle-pause 1s
  -> playing group[0]，持续循环
  -> clear() / next spin 回 idle
```

每组开始时：

1. `requestVisibleSymbolStates(group.positions, "win")`，所有格同一调用阶段启动。
2. 读取 `getVisibleSymbolGeometrySnapshots(group.positions)`；数量必须与 positions 相等。
3. 用本计划第 1 节的平均点/最近真实格/tie-break 算法选择 anchor。
4. 调用 `resolveAmount({ componentName, stepIndex, resultIndex, result })`；返回值必须 finite positive。
5. 调用 `formatAmount(amount)` 设置 Pixi `Text`；返回值必须是非空字符串。
6. 金额位置：

```text
x = anchor.centerX
y = anchor.centerY + anchor.cellHeight * amountText.yOffsetRatioFromCellCenter
```

7. snapshot/error 持续暴露当前 `componentName/resultIndex`。

每 tick：

- 通过抽象 target 的 `update(deltaSeconds)` 推进 symbol；通用函数不知道 target 的 ReelSet 类型；
- 只有当前组所有 snapshot 都满足 `requestedState === "normal" && resolvedState === "normal"`，才认定该组完成；
- 完成时先隐藏/清空金额，再进入下一组；
- 不用固定动画时长判断完成。

`clear()`：

- 若当前正在 playing，显式请求当前组回 `normal`；
- 隐藏并清空金额文字；
- 清空 group/index/pause/first-cycle 状态；
- 可以从 lingering 状态安全调用，但不能在 destroyed 后静默工作。

`destroy()` 清理 Pixi `Text` / container 和引用；重复 destroy 可幂等，但 destroy 后 start/update/clear 必须失败。非法 delta、组件名配置、amount resolver 输出、geometry 数量或 formatter 输出都显式失败。

### 9.4 坐标空间和 z-order

通用函数只认 `VisibleSymbolPresentationTarget` 返回的本地 geometry，不认 reel/grid 坐标实现。game002 把 carousel container 与 `runtime.mainReelsLayer` 放到相同 art-space 原点：

```text
overlay.container.position = runtime.layerLayout.{x,y}
```

world child 顺序固定为：

```text
background
main reels
symbol win carousel amount overlay
global win-amount
```

viewport resize 仍移动整个 `worldLayer`；`#applyViewport()` 需重新确认 overlay 与 reel layer 的坐标一致，不做 CSS/DOM 二次换算。附件样例 `(1,3)` 的 anchor 相对 reel set 为 `(180,420)`；加当前 board origin 后为 art `(817.5,750)`，金额 baseline y 再向下 `26.4`，即约 `776.4`。测试应优先断言相对坐标和算法，不把这些派生 art 数值复制成 production 常量。

### 9.5 game003 等价迁移

game003 必须成为第二个真实消费者：

```ts
componentNames = Object.freeze(["bg-wins"]);
resolveAmount = ({ result }) => result.cashWin;
formatAmount = formatServerUsdAmount;
amountText/cyclePauseSeconds = 继续来自 game003 YAML appExtensions；
validateComponent = 保留现有 wins/coinWin/cashWin 汇总校验；
target = Game003ReelRuntime 的通用能力接口；
```

迁移要求：

- `apps/game003/src/win-symbol-loop.ts` 的通用状态机、Text、anchor、pause、clear/destroy 逻辑移入 rendercore 后删除，不保留转发式重复实现。
- `apps/game003/src/win-sequence.ts` 不再复制 component/usedResults/pos 解析；可收口为 `GAME003_WIN_COMPONENT_NAMES`、amount resolver 和 `validateGame003WinComponent(...)`，保留现有 positive `cashWin` 与 component totals fail-fast。
- `game003WinSymbolLoop` YAML schema、generated config 和视觉数值保持不变，只映射为通用 carousel options；不要改 generated file 字段名制造无关迁移。
- adapter 的首轮完成、lingering、下一 spin clear、viewport container position、global win-amount、bg-bar/minecart 等待关系保持现状。
- game003 现有测试中的通用状态机断言迁到 rendercore；game003 侧保留配置映射、金额/totals validator、adapter 集成和 source-boundary 回归。
- `bg-wins` 字面量仍只在 game003 app/config/test/README；rendercore 中性测试不能出现该名字。

## 10. game002 adapter 集成

### 10.1 mount / destroy

`Game002AdapterOptions` 增加 typed `createSymbolWinCarousel` factory 注入点，便于测试，不暴露 Pixi/Spine 私有对象，也不定义 game002 自有轮播接口。

mount：

- 创建 reels 后调用 rendercore `createSymbolWinCarousel({ target: runtime, resolveAmount, formatAmount, ...options })`；
- 把其 container 放到 reels 与 global win-amount 之间；
- 设置与 reel layer 相同的位置；
- 任一初始化失败时沿用现有 mount rollback，不能留下 canvas/ticker/container。

destroy：

- reject pending spin；
- 移除 listener/ticker；
- destroy symbol win carousel、win-amount、background、Pixi app；
- 清空引用；
- destroy 后不得继续响应 viewport 或 pointer。

### 10.2 playSpin 数据准备与清理

`playSpin(logic)` 的同步准备顺序：

1. 确认已 mount 且无 pending animation。
2. 解析/校验 target scene。
3. 调用通用 carousel 的只读 prepare/start-input validation（或等价 public helper），传 `logic`、`stepIndex: 0`、校验后的 target scene、`GAME002_WIN_COMPONENT_NAMES`；任何组件名、usedResults、pos 或金额错误必须在启动 reels 前失败。若实现把正式 `start()` 留到停轴后，应提供 `prepare(input)` 返回不可变 prepared groups，不能为了时序而延迟协议错误。
4. 校验现有 bet/total win 输入。
5. `symbolWinCarousel.clear()`，清理上一轮 lingering 展示。
6. `winAmountPlayer.dismissImmediately()`，保留现有全局金额清理。
7. 启动 grid-cell spin。

不能先启动视觉再发现组件配置、`cashWin64/cashWin` 选择结果或 `pos` 错误，也不能在解析失败后继续 spin。建议 public API 为 `prepare(input)` + `startPrepared(prepared)`；若采用单一 `start(input)`，必须另有纯解析 helper供 spin 前校验，且两处不能复制解析逻辑。

### 10.3 pending phase 与完成条件

将现有只有 reels/win-amount 布尔值的 pending 状态扩展为清晰 phase：

```text
spinning
win-sequence
```

至少记录：

```text
targetScene
preparedWinCarousel
winSequenceComplete = preparedWinCarousel.groupCount === 0
winAmountExpected
winAmountPlaybackComplete
betAmountRaw / winAmountRaw
resolve / reject
```

主转轮完成后：

- 校验 visual scene 与 target scene；
- prepared groups 非空时启动通用 carousel；配置的所有中奖组件都未触发时保持 sequence complete；
- `totalwin > 0` 时启动现有 global win-amount；
- 两者同一阶段并行推进，不要求先后串行。

win-sequence tick：

- 推进通用 carousel；首轮完成后置 `winSequenceComplete=true`，但 carousel 继续留在 lingering loop；
- 推进 global win-amount，维持现有 `awaiting-dismiss` 不再阻塞的判断；
- 只有 `winSequenceComplete && winAmountPlaybackComplete` 才 resolve `playSpin()`。

无 pending animation 时：

- background 继续 update；
- global win-amount 若仍 playing 继续 update；
- symbol win carousel 若非 idle 继续 update。

下一次 spin 会在解析成功后、启动 reels 前 clear lingering loop。若 idle lingering update 失败，停止 ticker 并通过现有 `reportFatalError` 路径报告；若 pending 阶段失败，reject 本次 `playSpin()`，framework 不 collect。

### 10.4 与现有全局 win-amount 的关系

- result overlay 显示调用方 amount resolver 为当前 group 返回的金额；game002 resolver 使用 64 优先规则。global win-amount 显示 `logic.getTotalWin()`，两者不能共用数据源。
- pointerdown 仍只调用 global win-amount 的 `requestAdvance()`；不得用点击跳过/关闭 result symbol loop。
- global win-amount 进入 `awaiting-dismiss` 后仍不阻塞；result loop 首轮未完成时仍要等待。
- 下一 spin 同时清理两类遗留展示。

## 11. 测试与 fixture 计划

### 11.1 真实 GMI fixture

更新或新增 `apps/game002/tests/fixtures/game002-gmi.ts` fixture，完整保留第 2.2 节真实数据。若保留旧的两 result fixture用于其它测试，必须明确命名为旧/多组测试 fixture，不能让新功能测试继续误认为 `result.cashWin` 是权威字段。

至少提供：

- 单 result 真实 fixture：`cashWin=0/cashWin64=300`、目标 scene 和八个 pos 与附件一致；
- legacy fallback fixture：删除 `cashWin64` 并提供正数 `cashWin`，验证只在 64 字段缺失时使用旧字段；coin 字段提供对应的 64 缺失 fallback 情况；
- 多 result / 多 component fixture：用于验证组件数组顺序、各自 `usedResults` 顺序、逐组 overlay 和循环；fixture 自身金额应保持协议一致，但通用 carousel 不硬编码 component totals 语义；
- 无 `bg-win` fixture；
- malformed variants 通过 clone helper 构造，不能为每个错误复制整份大 JSON。

### 11.2 rendercore 组件解析与多组件测试

`packages/rendercore/tests/symbol-win-carousel/` 至少覆盖：

- `componentNames=["line-win","scatter-win"]` 时先播放 `line-win.usedResults`，再播放 `scatter-win.usedResults`，每个组件内部索引顺序不变；
- 只触发第二个配置组件时跳过第一个；全部未触发时 `groupCount=0`，不读取全部 results；
- component name 空白、重复、空数组、step 越界失败；
- triggered component 缺 `basicComponentData` 失败；
- 同一 result 被两个组件引用时保留两个 group 和各自 componentName，不静默去重；
- `usedResults` 越界、空 pos、奇数 pos、负数/小数坐标、重复坐标、scene 越界失败；
- amount resolver 收到准确 `componentName/stepIndex/resultIndex/result`；resolver 输出 0、负数、NaN/Infinity 失败；
- `symbolNum/symbolNums` 与 pos 数量不一致不会被通用函数误判；result.symbol 不做默认语义校验；
- 测试使用中性组件名，rendercore source/test 都不出现 `bg-win`、`bg-wins` 或 game002/game003 条件分支。

`apps/game002/tests/win-symbol-carousel-config.test.ts` 单独覆盖：

- 真实 fixture resolver 选择 `cashWin64=300`，formatter 输出 `$3.00`；
- `cashWin64` 缺失时选择 `cashWin`；两个字段都存在时选择 64 字段；
- `cashWin64=0` 且 `cashWin>0` 时选择 0，随后由通用 carousel 正数校验失败，不 fallback；
- 两个字段都缺失或选中值类型非法时显式失败；
- app 配置传入 `componentNames=["bg-win"]`，不把名字写入 rendercore。
- `validateGame002WinComponent` 对每个组件单独校验 basic cash 与 resolved amounts 汇总；不一致失败，字段缺失不被拿来兜底。

### 11.3 rendercore carousel 单测

通用 carousel 使用只实现 `VisibleSymbolPresentationTarget` 的 fake 测试，不能 import 具体 ReelSet：

- 一组 positions 同时请求 win；
- 多组依次播放，首轮最后一组完成才报告 `firstCycleComplete`；
- 首轮后 pause `1s` 再从第一组循环；
- 真实八格样例 anchor 选择 `(1,3)`，显示 `$3.00`，位置含 `0.22 * cellHeight` 偏移；
- 平均点等距时按 x/y 稳定 tie-break；输入顺序改变不改变 anchor；
- 当前组回 normal 时金额立即隐藏；
- clear 请求当前组 normal、隐藏金额并回 idle；
- 空组、非法 delta、非法 formatter、geometry 数量漂移、destroy 后调用失败；
- target 可以是一个全新 fake/future ReelSet 实现，证明无具体类依赖；
- carousel 不读取 totalwin/coinWin/component cashWin，只使用 amount resolver 输出。

### 11.4 adapter 单测

扩展 fake runtime 与 fake generic carousel，不通过删减 production API 绕过测试。至少覆盖：

- mount child z-order 和 overlay/reel position 一致；
- playSpin 在启动 reels 前 prepare 通用 carousel groups 并清理旧 carousel；
- reels 完成前不启动 carousel；
- reels 完成后 generic carousel 与 global win-amount 同时启动；
- 首轮 win 未完成时，即使 global amount 已 awaiting-dismiss 也不 resolve；
- 首轮完成且 global amount 不阻塞后 resolve；
- resolve 后 ticker 继续推进 lingering loop；
- 下一 spin 清理 lingering loop 和金额；
- 无 `bg-win` 不创建隐藏 fallback，仍保持现有 zero/nonzero global amount 行为；
- 多个 componentNames 原样、按顺序传入 generic carousel；
- prepare/组件解析失败时 reels 未启动；
- pending/idle carousel update 错误分别 reject 或 report fatal，且不会 collect；
- resize 后 overlay 与 reel layer 坐标一致；
- destroy 清理 carousel/container/listener。

### 11.5 source boundary 与资源测试

扩展 `apps/game002/tests/source-boundary.test.ts`：

- `apps/game002` 仍不直接 import logiccore/uiframeworks/netcore；
- app 不复制 `getComponentWinResultGroups` / pos parser；rendercore 通过其既有 logiccore 依赖实现中性组件解析；
- shared packages 不出现字面量 `"bg-win"`、`"bg-wins"`、game002/game003 分支或游戏专属金额选择；
- game002 不 import `apps/game003` 源码/generated config；
- app 不遍历任何 ReelSet 私有 children/slot/container 来请求 win；
- carousel source 不 import `render-reel-set.ts` / `render-grid-cell-reel-set.ts`，不出现 `instanceof Render*ReelSet`。

扩展 `assets.test.ts` 或等价测试，确认 `WL,H1,H2,L1,L2,L3,L4` manifest 都显式声明 exact `Win` once，并与真实 skeleton animation 对上。不要要求没有 Win 资源的 feature symbol 伪造 `win`。

### 11.6 game003 等价迁移测试

- 现有 `bg-wins` fixture 通过 generic prepare 产生与迁移前相同顺序、positions 和 amount。
- `resolveAmount` 仍要求每个 result 自身 finite positive `cashWin`；不能变成 game002 的 64 优先规则。
- `validateComponent` 继续覆盖 `wins`、`basicComponentData.coinWin/cashWin` 汇总错误。
- adapter 仍等待首轮 carousel、global win-amount、bg-bar、minecart 等现有条件；lingering 和下一 spin clear 不变。
- YAML `game003WinSymbolLoop` 解析值原样传给 generic options；`check:static-config` 通过且 generated 文件无无意义重写。
- 删除 app-owned loop 后，source-boundary 确认 game003 不复制 Text/anchor/轮播状态机，也不直接访问 ReelSet 私有结构。

## 12. 文档与协作规则同步

### 12.1 `apps/game002/README.md`

新增独立“bg-win 中奖展示”说明：

- `bg-win.basicComponentData.usedResults` 与 `clientData.results[]` 的关系；
- 单 result 按 `cashWin64 !== undefined ? cashWin64 : cashWin` 显示；附件中 64 字段存在，所以未选中的 `cashWin=0` 不作为 overlay 数据；
- `formatServerUsdAmount` 的 `300 -> $3.00`；
- pos 同组同时 win、多组顺序、首轮阻塞、后续 lingering、下一 spin 清理；
- 中间实际格的确定性选择算法和 y 偏移；
- result overlay 与 global win-amount 是两套显示，点击只影响后者；
- malformed component/pos/金额显式失败；
- game002 只传 `componentNames`、amount resolver、formatter/style 和 target；轮播/金额 renderer/anchor 在 rendercore；
- 新增第二个中奖组件只需扩展组件名数组及相应 fixture，不复制状态机。

同时更新现有“主转轮完成后直接进入金额阶段”的旧描述，避免文档自相矛盾。

`apps/game003/README.md` 同步说明其 `bg-wins` 组件名、positive `cashWin` resolver、YAML style/timing 和 component totals validator 现在作为参数接入 rendercore 通用 carousel；外部播放合同不变，不再宣称状态机由 app 私有 runtime 实现。

### 12.2 `packages/rendercore/README.md`

新增通用 `createSymbolWinCarousel(...)` 文档：

- public options、prepare/start/update/clear/destroy 生命周期；
- 多 component name 的顺序规则与未触发跳过行为；
- `VisibleSymbolPresentationTarget` 能力合同和未来 ReelSet 接入示例；
- amount resolver/formatter/style/anchor 的职责；
- manifest 仍是 symbol state animation 的唯一资源来源；
- 后续不同中奖效果新增并列函数，不往本函数堆游戏分支；
- 示例使用中性 `line-win/scatter-win`，不写 game002/game003 名字。

### 12.3 `agents.md`

该需求建立了长期跨模块边界，必须同步更新根 `agents.md`，至少写明：

- game002 中奖组件名是 app-owned `bg-win`；
- rendercore 的通用 carousel 可接收一个或多个组件名，按组件数组顺序及各自 `usedResults` 顺序驱动 symbol win；
- 单组金额优先取存在的 `cashWin64`，64 缺失时取 `cashWin`；不得用 component total/totalwin 兜底，也不得用 truthy 判断把 `0` 当缺失；
- 金额选择中间真实格，首轮阻塞、后续 lingering、下一 spin 清理；
- rendercore 通用函数拥有组件 result 解析、symbol 状态、金额 renderer 与轮播，但组件名/amount resolver/formatter/style 由上层传入，不硬编码游戏语义；
- 通用函数只依赖 `VisibleSymbolPresentationTarget`，不得依赖任何具体 ReelSet 类；
- `RenderReelSet` 保持一轴一轴转，`RenderGridCellReelSet` 保持一格一格转；对齐 public visible-symbol API 不能改变两种 spin 模型；
- grid-cell reel 的停轴后 symbol update 属于 rendercore。

仓库 tracked 文件名是小写 `agents.md`；不要新增另一份大小写不同的重复文件。

## 13. 实施顺序

1. 执行第 5 节盘点，记录基线与用户改动。
2. 在 logiccore 补齐 `coinWin64/cashWin64` 类型、parser 和测试；先跑 logiccore test/typecheck。
3. 在 rendercore 定义 ReelSet 无关的 `VisibleSymbolPresentationTarget`，为 grid-cell 补齐能力和停轴后 update；证明现有两种及 fake future target 都可实现。
4. 在 rendercore 实现 `createSymbolWinCarousel(...)`、多组件 prepare、金额 renderer、anchor、轮播和严格单测。
5. 在 game002 runtime 增加能力委托，用真实 runtime 测试坐标和 win once 生命周期。
6. 新增 game002 component names、amount resolver 和样式配置，用真实附件 fixture 完成优先级测试。
7. 接入 game002 adapter 的 mount、phase、ticker、clear、viewport、destroy 与错误路径。
8. 更新 fake runtime/fake player、framework flow、source boundary、资源测试。
9. 更新 rendercore README、game002/game003 README 和根 `agents.md`。
10. 执行第 14 节全量验收；失败先修根因，不删除合同或放宽测试。
11. 做第 16 节遗漏审计。
12. 生成 UTC 时间并写中文任务报告。

## 14. 自动化验收

### 14.1 格式和差异检查

只格式化本任务修改文件，不能对美术 JSON、全仓生成物或无关用户文件做批量 rewrite。然后执行：

```bash
git diff --check
CI=true pnpm --filter @slotclientengine/logiccore format:check
CI=true pnpm --filter @slotclientengine/rendercore format:check
CI=true pnpm --filter game002 format:check
CI=true pnpm --filter game003 format:check
```

### 14.2 包级严格验收（串行）

```bash
CI=true pnpm --filter @slotclientengine/logiccore lint
CI=true pnpm --filter @slotclientengine/logiccore test
CI=true pnpm --filter @slotclientengine/logiccore typecheck
CI=true pnpm --filter @slotclientengine/logiccore build

CI=true pnpm --filter @slotclientengine/rendercore lint
CI=true pnpm --filter @slotclientengine/rendercore test
CI=true pnpm --filter @slotclientengine/rendercore typecheck
CI=true pnpm --filter @slotclientengine/rendercore build

CI=true pnpm --filter @slotclientengine/gameframeworks lint
CI=true pnpm --filter @slotclientengine/gameframeworks test
CI=true pnpm --filter @slotclientengine/gameframeworks typecheck
CI=true pnpm --filter @slotclientengine/gameframeworks build

CI=true pnpm --filter game002 lint
CI=true pnpm --filter game002 test
CI=true pnpm --filter game002 typecheck
CI=true pnpm --filter game002 build
CI=true pnpm --filter game002 release:check

CI=true pnpm --filter game003 check:static-config
CI=true pnpm --filter game003 lint
CI=true pnpm --filter game003 test
CI=true pnpm --filter game003 typecheck
CI=true pnpm --filter game003 build
CI=true pnpm --filter game003 release:check
```

### 14.3 根级回归

包级通过后执行：

```bash
CI=true pnpm format:check
CI=true pnpm lint
CI=true pnpm typecheck
CI=true pnpm test
CI=true pnpm build
```

若根级命令因仓库中与本任务无关的既有问题失败，报告必须记录准确命令、首个错误、受影响 package 和为何确认无关；不得把失败写成“已通过”，也不得顺手改无关生产代码。

### 14.4 边界与合同 grep

```bash
rg -n '"bg-win"|"bg-wins"|GAME002_|GAME003_' packages/logiccore packages/gameframeworks packages/rendercore/src/symbol-win-carousel
rg -n 'RenderReelSet|RenderGridCellReelSet|instanceof.*ReelSet' packages/rendercore/src/symbol-win-carousel
rg -n 'componentNames|componentName|usedResultIndexes|VisibleSymbolPresentationTarget|resolveAmount' packages/rendercore/src packages/rendercore/tests
rg -n 'cashWin64|coinWin64' packages/logiccore apps/game002
rg -n 'cashWin|cashWin64|formatServerUsdAmount|GAME002_WIN_COMPONENT_NAMES' apps/game002/src/win-symbol-carousel-config.ts apps/game002/src/game-adapter.ts
rg -n 'bg-wins|cashWin|validateComponent|createSymbolWinCarousel' apps/game003/src apps/game003/tests
rg -n 'requestVisibleSymbolStates|getVisibleSymbolStateSnapshots|getVisibleSymbolGeometrySnapshots' packages/rendercore/src/reel apps/game002/src
rg -n 'bg-win|componentNames|cashWin64|cashWin|首轮|lingering|中间|下一次 spin|一轴一轴|一格一格|未来 ReelSet' apps/game002/README.md packages/rendercore/README.md agents.md
git diff --stat -- apps/game003 packages/rendercore apps/game002 packages/logiccore agents.md
git status --short --untracked-files=all
```

期望：

- 前两条在通用 carousel source 无匹配；`rg` exit code `1` 在此表示成功，不是命令故障。
- 通用 carousel 只依赖能力接口、中性组件名输入和 logiccore group helper；测试证明多个组件和 fake future target 可用。
- 64 字段在 logiccore 只作为通用 wire type/parser/test，在 game002 才决定正数与显示来源。
- game002 amount resolver 不读取 `logic.getTotalWin()` 或 component total；rendercore 只消费 resolver 输出。
- `apps/game003` 只有通用 carousel 等价迁移、测试和 README 的任务内 diff；YAML/generated config、minecart/bg-bar/coin overlay 等无关行为无漂移。
- 最终 status 只包含本任务文件和执行前已记录的用户改动；不包含 `dist/coverage/.turbo` 意外提交项。

## 15. 浏览器 / live 验收

自动化测试不能替代 Pixi/Spine 的真实视觉验收。启动：

```bash
CI=true pnpm --filter game002 dev -- --host 127.0.0.1 --port 5206
```

使用符合 README 的 live URL，必须显式 `skin=1&lines=30`，不要添加 `serverUrl`。用能返回第 2.2 节同形 `bg-win` 数据的账号/局面验收：

1. loading 99%/100%、live 单连接、背景、6x9 转轮和 spin 均正常。
2. 主转轮完全停稳前不播放 `bg-win` symbol，不显示 result 金额。
3. 停稳后附件八个 pos 的 L1 同时进入真实 Spine `Win`，不改变 scene 或 renderPriority。
4. 金额文本为 `$3.00`，锚在逻辑格 `(1,3)` 的中间偏下位置，不是虚拟平均点，也不是 `$0.00`/`$300.00`。
5. 当前 result win 完成时金额隐藏；多 result 时按 `usedResults` 顺序逐组显示各自金额。
6. 首轮全部完成后 framework 才允许 collect；之后 symbol/result 金额循环继续展示，不要求玩家点击。
7. global win-amount 仍按 totalwin 播放；点击只加速/跳档/关闭 global win-amount，不关闭 result loop。
8. 下一次 spin 开始时旧的 win symbol/result 金额立即清理，不叠在滚动 symbol 上。
9. portrait、square、wide resize 后金额仍贴在对应中奖格，不漂到 board 外。
10. 无 `bg-win` 的正常 spin 不播放全部 results；malformed 64 金额或 pos 在启动视觉前明确报错且不 collect。

再启动 game003 做等价迁移回归：

```bash
CI=true pnpm --filter game003 dev -- --host 127.0.0.1 --port 5208
```

至少确认：

1. `bg-wins` 仍按 `usedResults` 顺序首轮播放并继续 lingering；每组仍取自身 positive `cashWin`，格式、anchor、pause 和下一 spin clear 与迁移前一致。
2. 多组 symbol 状态、result 金额 overlay、global win-amount、coin overlay、bg-bar、minecart 的等待与 z-order 无回归。
3. portrait/landscape 切换后 result 金额仍对齐主 reels。
4. malformed `cashWin` 和 component totals 仍显式失败，证明 app validator 没有在通用化时丢失。
5. 浏览器行为来自 rendercore carousel；app 不再保留第二套轮播状态机。

验收截图或录屏若产生，只保留本地，不纳入提交，除非用户另行明确要求。

## 16. 二次遗漏审计

完成实现和测试后，逐项复核：

### 16.1 数据与协议

- [ ] `usedResults` 原始索引和顺序保留。
- [ ] 附件 `cashWin=0/cashWin64=300` 选择 64 字段并显示 `$3.00`。
- [ ] `cashWin64` 缺失时合法使用 result `cashWin`；64 存在时不受旧字段影响。
- [ ] `cashWin64=0` 不被当作缺失，也不回退到正数 `cashWin`。
- [ ] 单组金额无 component cash、step total、totalwin fallback。
- [ ] 两个 result cash 字段都缺失、选中字段非法/非正数显式失败。
- [ ] 支持多个组件名；组件数组顺序和各自 usedResults 顺序均保留，未触发组件跳过。
- [ ] 同一 result 被多个组件引用时保留 componentName，不做隐藏去重。
- [ ] pos 成对、唯一、非负、6x9 边界均校验。
- [ ] 未把 `symbolNum/symbolNums` 等同 pos 数量。
- [ ] 未偷偷启用 result.symbol scene 语义校验。

### 16.2 rendercore 和资源边界

- [ ] grid-cell API 返回 grid 坐标和 reel-set 本地 geometry，不泄露内部 y=0。
- [ ] 通用 carousel 只依赖 `VisibleSymbolPresentationTarget`，不 import/判断任何具体 ReelSet。
- [ ] `RenderReelSet`、`RenderGridCellReelSet` 和不继承两者的 fake future target 都通过接口测试。
- [ ] `RenderReelSet` 仍逐轴转，`RenderGridCellReelSet` 仍逐格转；没有为复用 API 合并 spin 算法。
- [ ] spin 中 request/geometry 失败，stopped 后可用。
- [ ] stopped grid 每 tick 推进 symbol once 并自然回 normal。
- [ ] visible scene、mask、dimming、renderPriority、spin timing 无回归。
- [ ] 七个可中奖 symbol 使用 manifest 中真实 `Win`；没有为 feature symbol 猜动画。
- [ ] shared 包无 `bg-win/bg-wins`、game002/game003 分支或专属金额规则；component names/amount/style 均由调用方传入。
- [ ] game003 已删除/收口重复 win loop，继续通过 app callback 保留 cashWin 与 component totals 校验。

### 16.3 adapter 生命周期

- [ ] 数据在 reels 启动前解析并失败。
- [ ] 数据在 reels 启动前由通用 prepare 路径解析一次，不在 app 复制 group parser。
- [ ] reels 完成后才启动 generic carousel/global amount。
- [ ] 首轮和 global amount 主要阶段均纳入 resolve 条件。
- [ ] resolve 后 lingering loop 仍 tick。
- [ ] 下一 spin 清理 symbol/result/global amount 遗留。
- [ ] pending 与 idle error 都停止 ticker并走正确 reject/report 路径。
- [ ] viewport、mount rollback、destroy、pointer listener 无泄漏。

### 16.4 测试、文档和交付

- [ ] 真实附件 fixture 不依赖本计划外的文件。
- [ ] logiccore/rendercore/gameframeworks/game002/game003 包级命令通过，game003 static config check 无漂移。
- [ ] root format/lint/typecheck/test/build 已执行并如实记录。
- [ ] `release:check` 通过且没有新增资源下载/打包遗漏。
- [ ] README 与 `agents.md` 已同步，无旧描述冲突。
- [ ] rendercore README 记录多组件、能力 target 和未来 ReelSet 接入，不把函数描述成某个具体 ReelSet 的 helper。
- [ ] `apps/game003` 只有等价迁移范围的 diff，bg-bar/minecart/coin overlay/YAML/generated config 无意外变化。
- [ ] `git diff --check` 通过，生成物未手改/误提交。
- [ ] 浏览器验收结果明确区分“已完成”与“待用户确认”。
- [ ] 中文报告文件名使用真实 UTC，不覆盖本计划。

## 17. 完成定义与任务报告

只有同时满足以下条件，任务才可标记完成：

1. 真实 `bg-win` GMI 可解析，附件 result 显示 `$3.00`。
2. rendercore 已提供 ReelSet 无关的通用 symbol win carousel，支持一个或多个组件名、金额 renderer、轮播和首轮完成；测试证明未来 ReelSet 可通过能力接口接入。
3. game002 grid-cell 中奖 symbol 通过该通用函数切到真实 win 状态并自然结束，逐格 spin 模型保持不变。
4. 金额锚点确定性选择中间真实格 `(1,3)`，resize 不漂移。
5. 首轮/lingering/下一 spin 清理/全局 win-amount 并行合同全部落实。
6. malformed 数据显式失败，无隐藏 fallback。
7. 包级和根级自动化验收完成，所有失败如实记录并处理。
8. README、rendercore README、`agents.md` 与实现一致。
9. 二次遗漏审计完成。
10. 中文任务报告已写入正确路径。

报告至少包含：

- UTC 完成时间、branch、最终 HEAD、工作区基线；
- 实际修改文件和职责；
- 真实 GMI / `cashWin64 -> cashWin` 优先级 / `$3.00` / anchor `(1,3)` 验证结果；
- rendercore `VisibleSymbolPresentationTarget`、多组件通用 carousel、grid-cell 能力和停轴后 update 说明；
- game003 从 app-owned loop 迁移到通用 carousel 的等价回归、保留 validator 和 static config check 结果；
- adapter 首轮、lingering、clear、global amount 关系；
- fail-fast 与 source-boundary 结论；
- 所有执行命令及 pass/fail；
- 浏览器/live 验收结果或明确待验收项；
- 未完成项、外部阻塞和残余风险；
- `git status --short` 摘要，区分任务改动与执行前用户改动。
