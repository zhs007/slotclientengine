# game002 cascade win summary and coin collect 任务计划

## 1. 任务目标

本任务在当前 `game002` 消除级联流程上增加一个临时获奖汇总显示，并为 `CN` coin 中奖增加专用的分阶段收集时序：临时汇总位于轮子区下方正中，数值为 `0` 时完全隐藏；普通 cluster 中奖组开始播放 `win` 时，汇总数字从此前累计值平滑递增到“此前累计值 + 本组 cash win”；同一个 step 中的 coin 中奖组必须排在全部普通 cluster 组之后，先让全部中奖 CN 同时播放一次 `Win_Start`，再全部进入循环 `Win`，随后按从左到右、从上到下的顺序逐枚播放 `Collect`。每枚 CN 根据自身 raw coin value 占 result coin amount 的比例，从 result cash amount 精确分配 cents 加入临时汇总，再播放 `End` 并消失；汇总统一除以 `100` 显示两位小数货币文本。

仓库根目录固定为：

```text
/Users/zerro/github.com/slotclientengine
```

本计划是完整执行合同，不能依赖聊天记录、附件、旧任务文档或口头说明。执行者只阅读本文件，即可完成当前实现复核、协议 fixture、rendercore 通用能力、game002 接入、CN manifest、symbolsviewer、测试、文档、协作规则、自动验收、浏览器验收和最终中文任务报告。

本任务是在当前 checkout 基础上的增量更新，不重新初始化 monorepo，不重做 task 91～95 已完成的 game002-s3、Spine background、symbol carousel、CN value-presentation 或 cascade fall。

最终行为固定如下：

- 临时汇总显示的是 **cash cents 累计中奖值**。每组严格读取 result 的 `cashWin64 !== undefined ? cashWin64 : cashWin` positive safe integer，并复用 `formatServerUsdAmount` 除以 `100` 显示；不得从 bet、lines、component total 或 `logic.getTotalWin()` 推导。
- 现有单组现金金额 overlay 继续使用 `cashWin64 !== undefined ? cashWin64 : cashWin` 和 `formatServerUsdAmount(...)`；现有最终 global win-amount 继续使用服务器 cash total。单组现金 overlay、临时 cascade cash 汇总、最终 cash win-amount 是三套不同用途的展示，不能合并、替代或互相兜底。
- 普通 cluster 组保持 `usedResults` 中的相对顺序；coin 组也保持自身在 `usedResults` 中的相对顺序；实际播放顺序由 symbol manifest 的通用 `cascadeWinPresentation.order` 做稳定排序，当前普通 symbol 配置 `order=0`、CN 配置 `order=1`，从而全部普通组在前、全部 coin 组在后。rendercore 不硬编码“coin 最后”，不得按金额排序或改写服务器 result 索引。
- `CN`/coin 的业务数据识别属于 `apps/game002`，但采用哪种动画编排属于 manifest：group 主 presentation 必须由 result 的 `symbol` code 决定，并与当前权威 scene、解析后的 `cascadeWinPresentation` 和当前 value matrix 一起确认。当前 CN 的 manifest mode 为 sequential collect；实际 CN primary position 必须有相同 presentation 和 positive safe integer value。服务端允许 `WL` 参与 CN coin 中奖判定，因此 app 可通过显式 companion predicate 批准实际 `WL` position：它与全部 CN start 同时播放自身 group win，完成后回 normal，但不贡献 value、不进入 loop/collect/remove/drop。除这一 app-owned 特例外，普通组不得混入 sequential-collect symbol，collect 组不得混入 group-mode symbol；非法混合、缺 value、value 非正/非整数/超出 safe integer 或 symbol/scene/config 不一致必须在启动 reel 前显式失败。
- coin group 的每枚 value 之和必须精确等于该 result 选中的 `coinWin64/coinWin`；每枚 summary cents 固定为 `itemCoin * groupCash / groupCoin`，必须为 positive safe integer 且精确整除。不相等或不能整除时不得静默修正。
- “从左到右从上到下”固定解释为屏幕行优先顺序：先按 `y` 升序（上到下），同一行再按 `x` 升序（左到右）。不能沿用当前 grid-cell spin 的 `x` 后 `y` 列优先顺序。
- 普通组真正请求并进入 `win` 的同一阶段，临时汇总从当前值递增本组 cash cents；symbol `win` 和数字递增并行，只有二者都完成后才允许进入该组 remove。第一次递增开始时文本仍遵守“显示值为 0 则隐藏”，不得闪现 `0`。
- 当前 CN manifest 实例的 coin group 时序为：全部位置同时进入 manifest `startState=winStart`（实际资源 `Win_Start once`）；全部完成后同时进入 `loopState=winLoop`（实际资源 `Win loop`）；然后逐枚进入 `collectState=collect`（实际资源 `Collect once`）。某枚实际进入 collect state 时才启动该枚 value 的数字递增；该枚 Collect 和数字递增都完成后，才请求 manifest `removeState=remove`（实际资源 `End once`）；End 完成后 release 该 occurrence，再处理下一枚。rendercore 只读取配置中的 state id，不写死这些 id 或 Spine animation name。
- `winLoop -> collect` 可以遵守现有 state machine 的 loop 边界切换，不新增强制打断 Spine 时间轴的私有旁路；数字递增必须等 snapshot 的 `resolvedState` 真正进入 `collect` 后才开始，不能在请求仍 pending 时提前加数。
- coin group 不再走普通组的 `win once -> remove` 路径，也不能先按整组 `coinWin` 加一次、随后再按每枚 value 重复累计。
- 临时汇总从本轮 spin 的 `0` 开始，贯穿全部 step、普通组、coin 组和 cascade fall 保留累计值；全部 cascade 完成后，在 global win-amount 启动前隐藏并清零。零中奖 spin 全程不创建可见文本；下一次 spin、apply initial state、clear、错误退出和 destroy 都必须清理旧值。
- 临时汇总使用 Pixi，位于现有 reels 之上、global win-amount 之下；不得增加 DOM/CSS overlay。初始位置相对 reel layer 固定为 `x = board width / 2`、`y = board height + 36`，即轮子区下方正中；位置必须从 `gridLayout.boardFrame` / runtime layer layout 派生，不复制 `720 x 1080` 魔法数。
- 当前初始样式由 game002 app 显式配置并固定为 `fontSize=48`、`fontWeight=900`、`fill=#fff7d6`、`stroke=#5a2500`、`strokeWidth=6`；格式化复用 `formatServerUsdAmount`，把服务器 cents 除以 `100` 显示货币文本。计数时长固定为 `0.35s`，只用于汇总数字 tween，绝不能代替 Spine completion 或通过 timer 强制 symbol 完成。
- rendercore 通过一个可选的 `winSummaryCollect` 配置项拥有通用 cumulative summary、整组 win/remove 与 sequential collect/remove 编排、manifest schema/parser、稳定排序、状态快照和生命周期；未配置时保持 task 95 的原行为。shared 包不硬编码 `CN`、`bg-win`、`winStart`、`winLoop`、`collect`、`Win_Start`、`Collect`、`End`、game002、coin/cash 换算或行列尺寸。game002 只传解析后的 manifest presentation map、组件数据、group/item amount resolver 和样式/布局。
- 继续保留 task 95 的 emphasis：所有组金额同时显示，非中奖格统一渐暗/恢复；恢复后才按本任务重新排列后的组顺序执行普通 win/remove 和 coin collect。已有每组 cash overlay 不因临时汇总而删除。
- 继续保留 WL 不 remove、不 drop、统一 fall、CN value 随 occurrence 搬运、refill CN 使用当前 step `bg-gencoins`、全部 step 后才播放 global win-amount、win-amount 期间持续 update reel runtime 等现有合同。
- 普通 spin 的压暗强度改由 `assets/game002-s3/reel.manifest.json` 的必填 `spin.dimmingAlpha` 唯一配置，当前为 `0.6`；`WL/CN` 仍保持全亮。该值不得与 cascade 强调阶段的 `nonWinningDimmingAlpha=0.82` 合并，也不得在 app 再硬编码第二份。
- value-presentation symbol 在普通 spin 请求 `spinBlur` 时，显式 reel state texture 必须立即可见并优先于等价 normal active Spine；tier player 的异步 init 晚到不得把它隐藏。normal 与 winLoop 复用同一 active Spine player/时间轴时必须同步 semantic playback，并由 official Spine 真实 loop boundary 推进 pending Collect，不能卡死在循环。
- 不能在 app 中直接操作 Pixi children、Spine player/track、slot attachment 或 animation duration；CN 继续使用同一个 tier player 和同一个 `Num` slot 数字对象切换动画，collect 不能重建 tier player、丢失 raw value 或 detach/reattach 数字图片。
- 如果是测试导致奇怪写法，应修改测试/fixture，不削弱 production 合同；不得为兼容旧 fake 添加 cash-to-coin 推导、缺 value 当 0、coin group 当普通组、未知动画退 normal、超时强制完成或直接 release 跳过 End 的 fallback。

任务完成后必须新增中文任务报告：

```text
tasks/96-game002-cascade-win-summary-coin-collect-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/96-game002-cascade-win-summary-coin-collect-260401-181300.md
```

## 2. 已确认的当前实现与资源事实

以下事实来自制定计划时的实际 checkout；实施时仍必须重新执行第 5 节盘点，不得只引用本节快照。

### 2.1 Git 与工作区基线

制定计划时：

```text
branch: main
HEAD: a443419
working tree: clean
```

执行时不得使用 `git reset --hard`、`git checkout --`、自动 stash 或批量清理 untracked。若已有用户改动，应先记录并绕开；与任务文件重叠时必须保留用户内容并做最小增量修改。

### 2.2 当前 cascade 运行链

主要实现：

```text
apps/game002/src/game-adapter.ts
apps/game002/src/cascade-config.ts
apps/game002/src/cascade-sequence.ts
apps/game002/src/win-symbol-carousel-config.ts
apps/game002/src/game-layout.ts
apps/game002/src/win-amount-config.ts

packages/rendercore/src/symbol-cascade/create-symbol-cascade-player.ts
packages/rendercore/src/symbol-cascade/prepare-symbol-win-groups.ts
packages/rendercore/src/symbol-cascade/types.ts
packages/rendercore/src/reel/render-grid-cell-reel-set.ts
packages/rendercore/src/reel/types.ts
packages/rendercore/src/symbol/state-machine.ts
packages/rendercore/src/symbol/render-symbol.ts
packages/rendercore/src/symbol-value-presentation/render-symbol-value-controller.ts
```

当前 `createGame002CascadeSequence(...)` 已：

- 遍历完整 `logic.getSteps()`；
- 用 `prepareSymbolWinGroups(...)` 保留 `bg-win.usedResults` 顺序；
- 用 result cash amount 构造每组现金 overlay；
- 用 `createLastUseRemoveGroups(...)` 计算实际 removePositions；
- 严格携带 CN presentation value；
- 预校验完整 remove/dropdown/refill/final scene；
- 记录跨 step 的 cash cumulative validator。

当前 `createSymbolCascadePlayer(...)` 只支持：

```text
emphasis
-> group win once
-> group remove once
-> release
-> next group
-> complete
```

它会一次性创建全部组现金 overlay，但没有底部累计汇总、coin group 分类、start/loop/collect 状态、逐格 raw value 累计或逐格 release。

`apps/game002/src/game-adapter.ts` 当前 world layer 顺序为：

```text
background
-> main reels
-> symbol cascade container
-> global win-amount
```

本任务应让临时汇总继续属于 `symbol cascade container`，无需新增 DOM 或第二个 Pixi Application。

### 2.3 当前金额单位

当前 `resolveGame002WinResultAmount(...)` 只服务于单组现金 overlay：

```text
cashWin64 !== undefined ? cashWin64 : cashWin
```

`formatServerUsdAmount(300) -> $3.00`。最终 `logic.getTotalWin()` 也进入 global cash win-amount。

临时汇总必须新增独立的 cash resolver，同时保留 coin resolver 作为 CN item 比例与协议校验依据：

```text
cashWin64 !== undefined ? cashWin64 : cashWin
```

选择结果必须是 positive safe integer cents。`cashWin64=0` 是明确提供的非法中奖值，必须失败，不能回退 `cashWin`；只有 `cashWin64 === undefined` 才允许读旧字段。两个 cash 字段都缺失时必须失败。CN item 仍按同样字段存在性规则读取 group coin amount，并用 value matrix 计算精确 cash 份额。

### 2.4 当前 CN value-presentation 与真实动画

配置与资源：

```text
assets/game002-s3/symbol-state-textures.manifest.json
assets/game002-s3/CN_1.json
assets/game002-s3/CN_2.json
assets/game002-s3/CN_3.json
assets/game002-s3/CN_4.json
assets/game002-s3/Symbol.atlas
assets/game002-s3/Symbol.png
```

四档 skeleton 都是 Spine `4.3.23`，且都真实存在大小写精确的：

```text
Win_Start
Win
Collect
End
Loop
Start
```

当前 manifest 对 CN 只配置：

```text
appear   -> Start once
win      -> Win once
remove   -> End once
dropdown -> Loop loop
```

本任务不得新增、重命名或伪造 skeleton animation；应把 coin choreography 映射为通用 state：

```text
winStart -> Win_Start once
winLoop  -> Win loop
collect  -> Collect once
remove   -> End once（保留）
dropdown -> Loop loop（保留）
```

CN 原来的 `win -> Win once` 应从 manifest 移除，防止 CN 被误送入普通组路径；普通 symbol 的 `win -> Win once` 保持不变。`winStart/winLoop/collect` 只要求 CN 提供 capability，不能强迫其它 symbol 配置不存在的动画。

当前 `RenderSymbolValueController` 已保证同一 value/tier 下复用一个 Spine player，数字图片挂在真实 `Num` slot。新增 state 必须继续走 `activeSpine`，不能创建第二个 player 或 sibling Pixi overlay。

### 2.5 当前通用 state/manifest 缺口

`createDefaultSymbolStatePreset()` 当前只有：

```text
normal, spinBlur, disabled, appear, win, remove, dropdown
```

不能把本次 CN 的三个 state 名直接加入 rendercore default preset，否则 shared 包会永久写死单个美术实例的编排。manifest 需要新增通用、自描述的扩展状态定义，例如当前 game002-s3 实例声明：

```json
{
  "settings": {
    "additionalStateDefinitions": [
      { "id": "winStart", "phase": "once", "playback": "once" },
      { "id": "winLoop", "phase": "stable", "playback": "loop" },
      { "id": "collect", "phase": "once", "playback": "once" }
    ]
  }
}
```

字段名可按现有 manifest 风格微调，但必须表达相同的 generic state id/phase/playback 合同。rendercore 新增通用的 manifest-derived state preset builder，把显式扩展合并到既有 base preset，并拒绝重复 id、覆盖 base state、非法 phase/playback、非 stable loop 或非 once once 等矛盾配置。没有扩展定义的 manifest/调用方继续使用原 default preset。

manifest 还缺少 per-symbol 的通用 cascade 编排配置。当前 generator 只保留 `normal|appear|win|remove|dropdown` animation；若不改为“按解析后的 state preset 保留”，重生成会丢失新增 state。manifest parser、presentation map、capability map、resolver、generator、state-machine tests、symbolsviewer state list 和 preview sequence 必须同步，且不能新增一份 `winStart|winLoop|collect` 硬编码白名单。

### 2.6 当前 fixture 缺口与本任务权威样例

当前：

```text
apps/game002/tests/fixtures/game002-cascade-gmi.ts
```

已经包含两个普通组，cash 分别为 `180`、`30`，step coinWin 为 `21`，但 result 没有逐组 coin 字段，也没有 CN win group，不能证明本任务。

实施时必须把 repo-local 主 fixture 扩成一个可由 `createSlotGameLogicResult(...)` 解析、并能跑完整 remove/dropdown/refill 的真实样例。至少固定以下证据：

```text
普通 result[0]: coinWin64=18, cashWin64=180
普通 result[1]: coinWin64=3,  cashWin64=30
coin result[2]: symbol=8(CN), coinWin64=8, cashWin64=80
coin result positions: (4,0), (5,0), (4,1)
对应 sourceValues: 1, 2, 5
bg-win.usedResults: [2,0,1]
实际播放 group result indexes: [0,1,2]
coin collect 坐标顺序: (4,0) -> (5,0) -> (4,1)
临时汇总内部 cents 目标序列: 0 -> 180 -> 210 -> 220 -> 240 -> 290
临时汇总显示序列: hidden -> $1.80 -> $2.10 -> $2.20 -> $2.40 -> $2.90
```

为使三处坐标成为 CN，fixture 必须同步修改 initial scene code、`bg-gencoins` otherScene、`bg-remove` scene/value hole、下一 step dropdown source/settled、refill pos/scene/value、`removedNum`、step/top cash/coin total 和 `totalwin`；不能只在测试 fake group 上伪造 CN。CN result 的 `cashWin64=80` 既用于现有单组现金 overlay，也作为临时汇总的 `80 cents`；逐格 `1+2+5` 相对 `coinWin64=8` 分配为 `10+20+50 cents`。

可以额外保留更小的 rendercore unit fixture，但不能用它替代上述完整 game002 GMI 主链。

## 3. 设计与边界合同

### 3.1 rendercore 通用数据模型

在以下位置增加通用 manifest schema 和 player option，字段名可按现有风格微调，但不能改变配置驱动边界：

```text
packages/rendercore/src/symbol/manifest.ts
packages/rendercore/src/symbol-cascade/types.ts
```

per-symbol manifest 配置建议命名为 `cascadeWinPresentation`。当前普通 symbol 实例：

```json
{
  "cascadeWinPresentation": {
    "order": 0,
    "playback": {
      "mode": "group",
      "winState": "win",
      "removeState": "remove"
    },
    "summary": { "mode": "groupAmount" }
  }
}
```

当前 CN 实例：

```json
{
  "cascadeWinPresentation": {
    "order": 1,
    "playback": {
      "mode": "sequentialCollect",
      "startState": "winStart",
      "loopState": "winLoop",
      "collectState": "collect",
      "removeState": "remove"
    },
    "summary": { "mode": "itemAmount" }
  }
}
```

rendercore 解析并导出中性的 presentation map；不认识哪一项是 CN/coin。parser 必须校验：

- `order` 是非负 safe integer；排序是按 order 升序的 stable sort；
- `group` mode 引用的 win/remove state 已在合并后的 state preset 中声明，且都是 once；
- `sequentialCollect` 的 start/collect/remove 是 once，loop 是 stable loop，state id 非空且不能错误复用为互相冲突的阶段；
- `groupAmount` 只能配 group playback，`itemAmount` 只能配 sequentialCollect；未知 mode/key 显式失败；
- symbol manifest 的 animations 必须提供其 presentation 引用的 state capability；缺 animation 或 playback 不匹配显式失败；
- 未配置 `cascadeWinPresentation` 的 symbol 不会被默认推断为 group mode。它出现在中奖组时，由启用了本功能的 player 在 prepare 阶段显式失败。

`CreateSymbolCascadePlayerOptions` 只增加一个顶层可选配置，建议命名：

```ts
interface WinSummaryCollectOptions {
  readonly presentations: SymbolCascadeWinPresentationMap;
  readonly resolveSymbol: (context: GroupPositionContext) => string;
  readonly resolveGroupAmount: (context: GroupContext) => number;
  readonly resolveItemAmount: (context: GroupPositionContext) => number;
  readonly sortItems: (
    items: readonly GroupPositionContext[],
  ) => readonly GroupPositionContext[];
  readonly formatter: (value: number) => string;
  readonly countDurationSeconds: number;
  readonly position: Readonly<{ x: number; y: number }>;
  readonly textStyle: SymbolWinSummaryTextStyle;
}
```

实际名称可以调整，但必须是 **一个配置项同时开启普通组累计与 sequential collect**。未配置 `winSummaryCollect` 时，player 继续执行 task 95 的原 `win/remove`，不创建 summary，也不读取 cascade presentation；不得散落 `enableSummary`、`enableCoinCollect` 等多个可能互相矛盾的布尔开关。

player 的 `prepare(groups)` 使用 presentation map 和 callbacks 生成内部冻结的 discriminated execution plan。调用方不能直接向 player 填 `mode/state` 来绕过 manifest。通用层必须校验：

- 同一 group 以 result symbol 的 presentation 为主；全部 primary position 必须与它等价。sequential group 只允许调用方 predicate 显式批准 group-mode companion，companion 只并行 win 并在后续阶段退出；其它不等价 presentation 一律失败；
- group/item amount 都是 positive safe integer；
- sequential item 坐标无重复且集合精确等于 `positions`；item sum 精确等于 group amount；
- sequential group 的 `removePositions` 覆盖全部 item；本任务不允许 collect 后留下 occurrence；
- target 每个位置具备 manifest 引用的 state capability；
- `sortItems` 返回相同 item 集合且无重复/遗漏；
- prepare 返回冻结快照，start 只接受当前 player 自己 prepare 的对象；非法输入在任何 reel mutation 前失败。

shared 包只通过 callback 取 amount/symbol，不解析 GMI coin 字段、CN value matrix 或 game002 component；但稳定排序、group increment、item increment、动画阶段推进和 release 全部属于 rendercore。

### 3.2 通用临时汇总

在 `packages/rendercore/src/symbol-cascade/` 内新增职责收敛的 cumulative summary（可作为 player 私有 helper，也可导出最小公共类型），至少支持：

```text
currentValue
targetValue
visible
counting/idle
incrementBy(positive safe integer)
update(deltaSeconds)
clear()
destroy()
```

summary renderer 是上一节单一 `winSummaryCollect` 配置项的一部分，不再增加第二个 `summary` 开关。未配置该顶层 option 的通用消费者保持原行为；一旦配置，缺字段、非法时长、formatter 空字符串、非整数增量必须失败，不提供默认样式或默认时长。

计数规则固定为：

- 只允许单调增加；
- tween 从精确 current 到精确 target，结束帧必须等于 target，不能累计浮点误差；
- 显示整数，`displayValue <= 0` 时 `Text.visible=false`；
- 同一时刻只能有一个 increment；重入或前一个 increment 未完成又请求下一个必须显式失败；
- player 的普通组/单 coin 阶段必须等待对应 increment 完成；
- `clear()` 重置为 0 并隐藏，`destroy()` 幂等释放 Pixi Text。

不要复用 final `createWinAmountAnimationPlayer(...)`：它拥有 big/super/mega、点击和 awaiting-dismiss，不适合 step 内临时 cascade cash 汇总。可以复用 cash formatter 与小型纯函数思想，但不能让临时汇总进入 global win-amount 生命周期。

### 3.3 通用 sequential collect 状态机

扩展：

```text
packages/rendercore/src/symbol-cascade/create-symbol-cascade-player.ts
```

普通组流程：

```text
request all positions manifest playback.winState
-> start summary increment
-> wait all winState once return normal AND summary idle at target
-> request removePositions manifest playback.removeState
-> wait remove once return normal
-> release removePositions
-> next group
```

sequential collect 流程：

```text
request all positions manifest playback.startState
-> wait all start once return normal
-> request all positions manifest playback.loopState
-> confirm all resolvedState=loop
-> request item[0] manifest playback.collectState
-> wait item[0] resolvedState=collect
-> start item[0] summary increment
-> wait Collect returns normal AND summary reaches target
-> request item[0] manifest playback.removeState
-> wait End returns normal
-> release item[0]
-> item[1] ...
-> next group
```

未轮到的 item 保持 loop；已经 release 的 item 不再参加后续 snapshot。不得一次 request 全部 Collect，不得只隐藏 sprite、不播 End，也不得在 Collect 开始前把数字加入汇总。

扩展 `SymbolCascadePhase/Snapshot`，至少能在测试和诊断中区分：

```text
win
remove
collect-start
collect-loop
collect-item
collect-remove
complete
```

snapshot 同时提供：当前 group index/result、当前 item index/position、summary current/target/visible。不要把测试依赖建立在 Pixi 私有 child 遍历上。

`clear()` 必须根据 prepared plan 把仍处在任意 manifest choreography state 的可见 symbol 请求回 normal、清 dimming/现金 overlay/summary；`destroy()` 必须安全释放。若底层状态正处在 manifest 声明的 loop state，保持现有 loop-boundary 切换语义即可，不新增直接操控 Spine track 的 escape hatch。rendercore 源码只能出现中性字段名 `startState/loopState/collectState/removeState`，不能出现本实例的 state id 或 Spine animation name。

### 3.4 game002 配置接入与金额/value 来源

在 `apps/game002/src/win-symbol-carousel-config.ts` 或新增职责清晰的 `cascade-win-summary-config.ts` 中增加：

```text
resolveGame002WinResultCoinAmount(...)
formatGame002CashSummary(...)
GAME002_CASCADE_WIN_SUMMARY_OPTIONS
```

`apps/game002/src/cascade-sequence.ts` 继续用现有 `prepareSymbolWinGroups(...)` 取得 component/usedResults/positions/cash overlay 数据，但不再自行稳定分区或编排 start/loop/collect/remove。它只为单一 `winSummaryCollect` option 提供：

1. `presentations`：由 `skin-config.ts` 从 symbol manifest 解析出的 map；
2. `resolveSymbol`：把 result/position scene code 映射为 paytable symbol，并做 result symbol/scene 一致性校验；
3. `resolveGroupAmount`：严格读取 `cashWin64 -> cashWin` positive safe integer cents；
4. `resolveItemAmount`：从当前 step 权威 value matrix 读取 occurrence raw coin value，再按 result coin/cash 比例计算可精确整除的 positive safe integer cents；普通 group 不会调用此 resolver；
5. `sortItems`：返回按 `y`、再 `x` 排序的同一坐标集合；
6. summary formatter/style/layout/count duration。

rendercore 根据每组 symbol 的 manifest presentation 做 stable order、选择 groupAmount/itemAmount、生成内部 execution plan，并在排序后计算 last-use remove group。为此可把现有 `createLastUseRemoveGroups(...)` 收口进 player prepare，或扩展为接收已排序 presentation groups；不能让 app 先按 CN 分支复制通用排序/编排。

CN 字符串、code=8、`bg-gencoins` 和 value matrix 读取仍不得写进 rendercore；但 app 也不得出现 `if (symbol === "CN")` 来决定 playback mode/state/order。mode/order/state 全部来自 manifest。rendercore 只提供通用 `resolveGroupSymbol`、`resolveSymbol` 和可选 `allowCompanionPosition`；game002 显式声明 `WL` 可作为 sequential companion。companion 使用自身 manifest group win state，与 primary start 同一边界请求，完成后不再进入后续流程；其它 presentation 不一致仍显式失败。

序列预解析完成后，额外校验每个 winning step 的 selected group amounts 总和与可用的 step/component coin 证据一致。只有字段确实存在时才验证 component cumulative；字段缺失不能成为改用 cash 推导 coin 的理由。主展示权威始终是 result coin field，itemAmount mode 的独立证据是逐格 raw value sum。

### 3.5 CN manifest、state preset 与 viewer

修改：

```text
packages/rendercore/src/symbol/state-machine.ts
packages/rendercore/src/symbol/manifest.ts
packages/rendercore/scripts/generate-symbol-state-textures.mjs
assets/game002-s3/symbol-state-textures.manifest.json
apps/game002/src/skin-config.ts
apps/game002/src/game-demo.ts
apps/game002/tests/game-demo.test.ts
apps/symbolsviewer/src/symbol-assets.ts
apps/symbolsviewer/src/viewer-sequence.ts
apps/symbolsviewer/src/main.ts
apps/symbolsviewer/src/symbol-set-config.ts
```

要求：

- rendercore default preset **不新增** `winStart/winLoop/collect`；新增 generic `additionalStateDefinitions` parser/builder，把 manifest 明确声明的 state 合并进本 skin/catalog 的 state preset。
- `Game002SkinConfig` 和 reel runtime 增加 manifest-derived `statePreset`，catalog、animation resolver、capability map 和 symbolsviewer 必须消费同一份解析结果，不得一处用 default、一处私下追加。
- parser 严格校验 additional state definition 与 `activeSpine.playback.loop` 一致，并验证四档 skeleton 都存在 exact animation。
- generator 不新增三个名字的白名单；改为从 base preset + manifest additional definitions 得到允许保留的 animation states。重生成不能丢字段，也不能为 phase animation 生成 PNG state texture。
- 普通可中奖 symbol 与 WL 在 manifest 显式配置 `cascadeWinPresentation={order:0, group, groupAmount}`，引用各自现有 `win/remove`；CN 显式配置 `{order:1, sequentialCollect, itemAmount}`，并用 `activeSpine` 映射 `Win_Start/Win/Collect`，保留 `End/Loop`。删除旧 CN `win`，非中奖 feature symbol 不伪造 presentation。
- capability/presentation map 自动进入 runtime；`assertCascadeResources(...)` 不写普通/CN 分支，而是遍历解析后的 mode/state 引用做 preflight。
- symbolsviewer 的 state select 从 manifest-derived preset 生成，不硬编码新增 state；默认 CN 验收 sequence 从 `cascadeWinPresentation` 生成或通过同一 generic helper 构造，覆盖当前实例 `normal -> winStart -> winLoop hold -> collect -> remove -> normal`。viewer 只调用 RenderSymbol public state API，不直接操作 active player。
- generated game002/symbolsviewer symbol value resource closure 理论上不新增文件，但必须重新 generate 和 `--check`，确认 manifest 派生输入无漂移。

### 3.6 game002 adapter、布局与生命周期

在 mount 创建 cascade player 时传入唯一的 `winSummaryCollect` config；其中 presentation map 来自当前 skin manifest，renderer 部分为：

```text
position.x = runtime.layerLayout.rawReelsContentWidth / 2
position.y = runtime.layerLayout.rawReelsContentHeight + 36
countDurationSeconds = 0.35
formatter = raw positive integer -> decimal string
```

summary Text 与现有组现金 overlay 同属 cascade container。`symbolCascadePlayer.container.position` 继续对齐 `runtime.layerLayout.x/y`，viewport 改变仍由 art world mapping 统一处理；不要在 resize 回调增加第二套 CSS/DOM 坐标换算。

adapter 时序调整为：

```text
initial spin
-> emphasis
-> ordinary group win + summary count
-> ordinary remove
-> ...全部普通组
-> all CN Win_Start
-> all CN Win loop
-> row-major single CN Collect + summary count + End + release
-> cascade fall / next step
-> 后续 step 持续从前值累计
-> all steps complete
-> hide/reset temporary summary
-> global cash win-amount
```

`playSpin()` 必须等待 summary 所属阶段完成，不能在数字仍 counting 时 remove 或 fall。global win-amount 仍在全部 cascade 后开始；临时 summary 必须在其 start 之前已隐藏，避免两个金额重叠。win-amount 期间仍继续 `runtime.update(deltaSeconds)`。

preflight 必须在 `runtime.spinToScene(...)` 之前完成：完整 manifest presentation resolution/order、coin resolver、item value sum、manifest state capability、CN exact image resource、remove/dropdown/refill chain 任一失败时 reels 尚未 mutation。

### 3.7 文档、发布检查与协作规则

同步：

```text
packages/rendercore/README.md
apps/game002/README.md
apps/symbolsviewer/README.md
apps/game002/scripts/verify-static-dist.mjs
apps/game002/tests/source-boundary.test.ts
apps/symbolsviewer/tests/symbol-set-config.test.ts
agents.md
```

`agents.md` 需要更新，因为本任务新增长期协作边界：临时 summary 的 cash cents/formatter、manifest order/mode/state 驱动的普通/collect 编排、当前 CN start-loop-collect-end 实例、row-major collect、WL companion、Spine loop boundary、0 隐藏、全部 cascade 后才清理/global cash amount，以及 rendercore/app ownership。当前仓库实际规则文件名是小写 `agents.md`；不要另建只因大小写不同的重复文件。若实施时仓库已经新增权威 `AGENTS.md`，应先确认二者关系，再同步真正的权威文件。

`release:check` 至少验证：

- CN manifest exact `Win_Start/Win(loop)/Collect/End`；
- CN 不再配置旧普通 `win once`；
- 四档 skeleton 都真实包含 exact animations；
- generated resource closure 和 dist 仍精确包含既有 CN tiers/textures；
- bundle 不出现 cash-to-coin fallback、DOM summary 或 game002 专属字符串进入 rendercore 的回归证据。

## 4. 明确非目标

- 不修改服务端 GMI、gamecode、live server、URL query、lines=30、collect API 或本地公开轮带边界。
- 不修改 game003 的 `bg-wins` carousel、minecart、coin overlay 或 win-amount 语义；但必须跑 game003 非回归，因为 manifest parser、catalog/state preset 接入和 cascade player 属于 shared。
- 不删除现有每组 cash overlay，不把临时 summary 改成美元，不修改 final big/super/mega 阈值、资源或点击合同。
- 不新增 CN Spine/PNG/数字图片，不改 tier 数、阈值、资源命名、Num slot 或 defaultValues。
- 不实现 coin 飞向汇总区的轨迹、粒子、音效或新的美术；本任务只使用已存在的 `Win_Start/Win/Collect/End`。
- 不在 app 复制 rendercore state machine、counter tween、Pixi Text 生命周期、Spine update 或逐格 release 算法。
- 不把 CN/coin/component 名、cash/coin 换算或 game002 行列尺寸写入 rendercore。
- 不加入 silent timeout、normal fallback、builtin fallback、缺字段默认 0、cash 推 coin、自动跳过非法组或测试专用 production 分支。

## 5. 实施步骤

### 步骤 0：重新盘点与记录基线

执行：

```bash
cd /Users/zerro/github.com/slotclientengine
git status --short
git branch --show-current
git rev-parse --short HEAD
node --version
pnpm --version
```

然后重新读取第 2 节列出的源码、manifest、四档 CN animation keys、package scripts 和当前 tests。若实际实现已变化，先在报告记录差异，再按本计划行为合同做最小增量，不用旧快照覆盖新代码。

### 步骤 1：建立完整 GMI 与纯数据分类测试

先修改/新增：

```text
apps/game002/tests/fixtures/game002-cascade-gmi.ts
apps/game002/tests/cascade-sequence.test.ts
apps/game002/tests/win-symbol-carousel-config.test.ts
```

落地第 2.6 节权威数据。先让测试明确失败于缺少 coin resolver、manifest presentation stable order 和 item amount，再实现 production。覆盖：

- `cashWin64` 字段存在性优先，0 不 fallback，缺字段/小数/Infinity/unsafe integer 失败；coin 字段仍覆盖 CN item 比例校验；
- 禁止 cash-to-coin 推导；
- `[order=1, order=0, order=0] -> stable [order=0, order=0, order=1]`；
- coin positions 按 `y,x` 排序；
- raw values `1+2+5=8`；
- symbol/result/scene/value 任一不一致失败；
- sequential group 中显式批准的 WL companion 与 CN start 同播，且不参与 value/loop/collect/remove/release；其它 mixed presentation 失败；
- 完整 remove/dropdown/refill/value chain 仍成立。

### 步骤 2：实现 manifest-derived state/presentation 与 generator

先改 shared state preset/parser/generator tests，再改真实 manifest：

```text
packages/rendercore/tests/symbol/state-machine.test.ts
packages/rendercore/tests/symbol/manifest*.test.ts（按现有文件归位）
packages/rendercore/tests/symbol/state-texture-generator.test.ts
packages/rendercore/tests/symbol-value-presentation/manifest-resources.test.ts
apps/game002/tests/assets.test.ts
```

确保 additional state definition、presentation mode/order/state 引用、once/loop 契约、activeSpine exact animation、capability map 和 generator preserve 全部先有负例。rendercore default preset 和 generator 源码不得新增 `winStart/winLoop/collect` 名字。不要为通过旧测试保留 CN `win once`；应更新测试表达新 production 语义。

### 步骤 3：实现 rendercore cumulative summary

在 symbol-cascade 模块内实现独立、可测的 integer counter。测试使用 public snapshot，不遍历 Text children；覆盖 0 hidden、单调 count、精确终值、重入失败、formatter 失败、clear/destroy、invalid delta 和大 safe integer 边界。

### 步骤 4：用单一配置扩展 rendercore cascade preparation/player

修改 types/player/exports 并新增或扩展：

```text
packages/rendercore/tests/symbol-cascade/create-symbol-cascade-player.test.ts
```

用 fake manifest presentation + fake target 记录 public state request/snapshot/release，断言未配置 option 时旧行为不变、配置一个 `winSummaryCollect` option 后普通累计与 sequential collect 同时启用。至少覆盖：

```text
ordinary win.start + summary 0->180
ordinary win.complete + summary.complete
ordinary remove/release
ordinary win.start + summary 180->210
all coin winStart
all coin winLoop
coin[0] collect + summary 210->220 + remove/release
coin[1] collect + summary 220->240 + remove/release
coin[2] collect + summary 240->290 + remove/release
complete
```

还要覆盖 manifest order stable sort、任意合法 state id、pending loop transition 不提前计数、未轮到 item 持续 loop、缺 presentation/capability、item sum/集合错误、clear 中断和 destroy。测试必须使用不叫 `winStart/winLoop/collect` 的第二组 state id，证明 rendercore 没有写死本实例名称。

### 步骤 5：接入 game002 adapter 与完整 preflight

将 manifest-derived presentation map、amount/value callbacks 和 summary renderer 作为一个 `winSummaryCollect` config 接到真实 adapter；app 不构造 mode/state execution plan。更新 fake player/runtime，断言：

- summary container 顺序在 reels 上、global win-amount 下；
- zero-win 不显示；
- 全部普通组先于 coin；
- 跨 fall/step 累计不清零；
- coin 逐枚完成后才 release；
- complete 后 summary 在 global win-amount start 前隐藏；
- final cash amount 和现有点击/awaiting-dismiss 不变；
- preflight 失败时 `spinTargets=[]`；
- runtime 在全部 symbol/summary/win-amount 阶段继续 update。

### 步骤 6：同步 symbolsviewer、README、release check、agents.md

viewer 使用真实 game002-s3 CN tier 资源验证新 state sequence。同步三份 README、静态发布检查和协作规则；不得通过宽泛 glob 把额外 CN/feature skeleton 接入。

### 步骤 7：生成、格式化、自动验收与浏览器验收

先运行第 6 节全部命令。只有依赖下载真实失败时才按第 7 节代理规则重试。自动验收通过后使用真实 live cascade 局进行浏览器检查；不要加入 Playwright、mock query 或 production debug fixture 来绕过 token/GMI。

### 步骤 8：二次遗漏审计与任务报告

按第 8 节逐项复核 target tree、protocol、unit、state/manifest、generated closure、viewer、release、docs、agents、浏览器证据和 git diff，再生成 UTC 报告。

## 6. 自动验收命令

所有命令从仓库根目录执行。当前环境若遇到 pnpm 无 TTY 清理错误，使用 `CI=true`，不要修改 production 规避：

```bash
cd /Users/zerro/github.com/slotclientengine

CI=true pnpm --filter game002 generate:symbol-value-resources
CI=true pnpm --filter symbolsviewer generate:symbol-value-resources
CI=true pnpm --filter game002 check:symbol-value-resources
CI=true pnpm --filter symbolsviewer check:symbol-value-resources

CI=true pnpm --filter @slotclientengine/rendercore format:check
CI=true pnpm --filter @slotclientengine/rendercore lint
CI=true pnpm --filter @slotclientengine/rendercore test
CI=true pnpm --filter @slotclientengine/rendercore typecheck
CI=true pnpm --filter @slotclientengine/rendercore build

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

CI=true pnpm --filter game003 test
CI=true pnpm --filter game003 typecheck
CI=true pnpm --filter game003 build

CI=true pnpm format:check
CI=true pnpm lint
CI=true pnpm test
CI=true pnpm typecheck
CI=true pnpm build

git diff --check
git status --short
```

执行 source-boundary 审计：

```bash
rg -n 'CN|bg-win|Win_Start|Collect|coinWin64|cashWin64|GAME002_' packages/rendercore/src/symbol-cascade packages/rendercore/src/reel packages/rendercore/src/symbol
rg -n 'cashWin64.*coin|cashWin.*coin|coin.*cashWin|querySelector|document\.|children\[' apps/game002/src
rg -n '"winStart"|"winLoop"|"collect"|Win_Start|Collect' packages/rendercore/src packages/rendercore/scripts
rg -n 'additionalStateDefinitions|cascadeWinPresentation|winStart|winLoop|collect|activeSpine' assets/game002-s3/symbol-state-textures.manifest.json apps/symbolsviewer/src
```

第一、三条在 rendercore production source 中应无匹配：不应出现 `CN`、`bg-win`、实例 state id、Spine animation name、`GAME002_` 或 game002 专属 component/单位判断；只允许中性 schema 字段 `startState/loopState/collectState/removeState`。第四条应只在 manifest 实例和由 manifest 驱动的 viewer 消费面出现。若测试已有 source-boundary 文件，应把这些规则固化为自动断言，而不只依赖手工 grep。

若 root 汇总失败：

1. 先重跑对应受影响 package 命令；
2. 判断是否为起始 HEAD 已存在的任务外失败；
3. 在报告中记录完整命令、错误、与本任务的边界证据；
4. 不放宽 Spine/version/manifest/state production 合同，不批量格式化或修改无关 package 只为让 root 变绿。

## 7. 依赖与网络失败处理

本任务预计不需要新增第三方依赖。若 `node_modules` 不完整，先执行：

```bash
cd /Users/zerro/github.com/slotclientengine
CI=true pnpm install
```

只有该命令因依赖下载/网络失败时，才设置用户指定代理并重试同一命令：

```bash
export http_proxy=http://127.0.0.1:1087
export https_proxy=http://127.0.0.1:1087
CI=true pnpm install
```

不得预先修改 registry、lockfile、依赖版本或代码以绕过网络问题。报告必须注明是否使用代理及失败/重试结果。

## 8. 验收标准与第二遍遗漏审计

### 8.1 协议与顺序

- [ ] result cash amount 严格按字段存在性选择 `cashWin64 -> cashWin`，且为 positive safe integer cents；CN result coin amount 仍严格校验。
- [ ] 不存在 cash-to-coin、bet/lines 换算或 component/total fallback。
- [ ] group 按 manifest `order` 稳定排序；当前 `order=0` 普通组先于 `order=1` CN 组，各 order 内保持 `usedResults` 相对顺序。
- [ ] CN group 由 result/scene/value 三方验证；WL companion 与 CN start 同播但无 value 和后续流程，其它 mixed group 显式失败。
- [ ] coin item raw sum 精确等于 result coin amount。
- [ ] collect 使用 `y` 再 `x` 的行优先顺序。
- [ ] 完整 GMI fixture 的内部 cents 累计目标为 `0->180->210->220->240->290`，显示目标为 `hidden->$1.80->$2.10->$2.20->$2.40->$2.90`。

### 8.2 临时汇总

- [ ] 位于轮子区下方正中，坐标从 layout/runtime 派生。
- [ ] `0` 全程不可见，第一次 tween 也不闪现 0。
- [ ] 普通 group win 开始时同步递增，win 和 count 都完成后才 remove。
- [ ] coin 在实际进入 Collect 后逐枚递增，不整组重复加数。
- [ ] 跨 fall/step 保持累计；全部 cascade 后、global amount 前隐藏清零。
- [ ] clear/error/destroy/next spin 不残留旧文本或 counting。
- [ ] summary 使用 cash cents 和 `formatServerUsdAmount`，统一除以 `100` 显示；raw coin 只作为 CN cash 份额的比例证据，现有 cash overlay/global amount 格式不变。

### 8.3 CN 动画与 occurrence 生命周期

- [ ] 四档 CN 都走同一个 tier player：`Win_Start once -> Win loop -> Collect once -> End once -> release`。
- [ ] 全部 coin 同时 Win_Start、同时进入 Win loop；Collect/End 严格逐枚。
- [ ] 未轮到 coin 持续 Win loop，已收集 coin 完成 End 后才消失。
- [ ] `Num` slot 数字随同一 player 动画，不重建、不丢 value。
- [ ] CN 不再走普通 `win once` 路径；其它 symbol 的 win/remove 不回归。
- [ ] state request 遵守 loop completion 边界，没有 app 私有 Spine track 操作。

### 8.4 shared/app 边界与生成物

- [ ] rendercore 无 `CN/bg-win/game002/Win_Start/Collect` 硬编码。
- [ ] game002 不遍历 Pixi children、不 import Spine runtime、不复制 counter/cascade player。
- [ ] manifest additional state definition、presentation parser、derived preset、resolver/capability/generator/tests 全部同步；rendercore default preset 不写死三种实例 state。
- [ ] generator 按 manifest-derived state 集合保留新 animation，但不生成 phase animation PNG；源码没有新增实例 state 白名单。
- [ ] game002 与 symbolsviewer generated symbol-value closure 无漂移。
- [ ] symbolsviewer 能用 public API 预览 CN 完整 sequence。
- [ ] game003 shared 非回归已验证或如实记录独立基线阻塞。

### 8.5 既有合同非回归

- [ ] emphasis 仍为 `0.1s + 1s + 0.1s`，组现金 overlays 仍同时显示。
- [ ] WL 在普通组和 CN companion 场景都播放自身 win；作为 companion 时不进入 loop/collect/remove，且始终不 remove/drop；fall/mask/renderPriority 不变。
- [ ] reel manifest 必填 `spin.dimmingAlpha=0.6`，普通 spin 中 `WL/CN=0`、其它实际 occurrence=`0.6`；cascade 强调值仍为 `0.82`。
- [ ] CN `spinBlur` 在 tier player init 前后都不变空；切回 normal 后 active Spine/Num 正常显示。
- [ ] official active Spine loop completion 可把 pending Collect 推进，且等价 normal/loop 切换不 replay 时间轴。
- [ ] CN refill/carry/value image/Num slot 合同不变。
- [ ] 全部 step 完成后才 global cash win-amount，且 runtime 持续 update。
- [ ] live server、query、lines、loading 99%/100%、公开轮带边界不变。
- [ ] 没有 hidden fallback、timeout 强制完成或测试专用 production 分支。

### 8.6 浏览器验收

启动：

```bash
CI=true pnpm --filter game002 dev -- --host 127.0.0.1 --port 5206
```

使用 URL encode 后的真实参数：

```text
http://127.0.0.1:5206/?skin=1&gamecode=<GAME_CODE>&token=<TOKEN>&businessid=guest&clienttype=web&jurisdiction=MT&language=en&bet=5&lines=30&times=1&autonums=-1&requestTimeoutMs=30000
```

必须在真实同时包含普通 cluster 与 CN coin win 的 cascade 局中确认：

- 初始没有 `0`；第一个普通组 Win 开始时底部正中数字平滑增加；
- 普通组顺序、现金 overlay、dim/remove 与 task 95 一致；
- 即便服务器 `usedResults` 把 coin 放前面，视觉仍先完成全部普通组；
- 全部中奖 CN 同时 Win_Start，再共同循环 Win；
- Collect 明确按屏幕上方行从左到右，再下一行从左到右；
- 每枚 Collect 时汇总按该枚 raw coin 占 result coin 的比例增加对应 result cash cents，End 后该枚才消失；
- 未轮到 CN 保持 Win loop，Num 图片跟随动画且不闪烁/脱槽；
- fall/后续 step 期间累计值保留；最终 global cash amount 前临时值消失；
- resize/横竖比变化后临时值仍在轮子下方正中；
- 下一 spin 无残影、无重复累计，console/WebSocket 无错误。
- 普通 spin 中非 `WL/CN` 压暗强度为 `0.6`，`WL/CN` 仍全亮，且不影响 cascade 中奖强调阶段。

如果没有可用 token 或服务端未返回含 CN win 的真实局，浏览器项必须作为未完成 blocker 写进报告，不能以 unit test 或 mock 页面冒充完成，也不能为了验收向 production 增加 query/debug fallback。若生成截图，保存为本地验收证据，不提交仓库，除非用户另行要求。

### 8.7 最终 diff 审计

- [ ] `git diff --check` 通过。
- [ ] `git status --short` 中没有误提交的 `dist/coverage/node_modules`、token、截图或临时日志。
- [ ] 检查 target tree、protocol schema、state/logic、tests、commands、report、cleanup 七类内容无遗漏。
- [ ] 复查 `game-adapter.ts`、`cascade-sequence.ts`、manifest generator、symbolsviewer、release checker、README、`agents.md` 等相邻调用面。
- [ ] 用户原有改动完整保留，任务外基线失败独立记录。

## 9. 最终任务报告要求

创建：

```bash
UTC_TIME="$(date -u +%y%m%d-%H%M%S)"
REPORT="tasks/96-game002-cascade-win-summary-coin-collect-${UTC_TIME}.md"
```

报告必须使用中文，并包含：

1. 开始/结束 UTC、branch、起止 HEAD、Node/pnpm 版本、初始/最终 working tree；
2. 实际修改/新增文件完整清单；
3. 普通/coin 分类、coin amount、row-major collect、summary lifecycle 的最终实现说明；
4. CN manifest/state/player/Num slot 复用说明；
5. 完整 GMI fixture 与内部 cents `0->180->210->220->240->290`、显示值 `hidden->$1.80->$2.10->$2.20->$2.40->$2.90` 事件/数值证据；
6. 每条自动验收命令及结果，root/task 外失败的边界证据；
7. 浏览器 URL 需脱敏，记录实际局、视觉顺序、console/WebSocket、resize/next-spin 结果；
8. 是否使用代理；
9. README、release check、`agents.md` 同步情况；
10. 未完成项、blocker、风险和后续建议；无则明确写“无”。

报告不得包含 token、cookie、完整 live URL、服务器真实轮带或其它敏感信息。只有代码、测试、生成物检查、文档/规则同步以及可执行的浏览器验收均完成后，才能宣告任务完成。
