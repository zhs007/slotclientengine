# game002 nearwin anticipation refill 任务计划

## 1. 任务目标

本任务在当前 `game002` 的 `6 x 9` grid-cell spin 和消除级联基础上，增加逐格 Nearwin 提示、以“本轮已经实际停下 2 个 `WL`”为触发条件的期待模式，以及期待模式下独立的 dropdown / refill 表现流程。

仓库根目录固定为：

```text
/Users/zerro/github.com/slotclientengine
```

本文件是完整执行合同，不能依赖聊天记录、附件、旧任务文档或口头说明。执行者只阅读本文件，即可完成资源确认、reel manifest、rendercore 通用能力、game002 业务接入、级联状态机、资源闭包、测试、文档、协作规则、自动验收、浏览器验收和最终中文任务报告。

本任务是在当前 checkout 基础上的增量更新，不重新初始化 monorepo，不重做 task 91～96 已完成的 game002-s3、Spine background、symbol value-presentation、cascade win/remove、统一 fall 或 coin collect。

最终行为固定如下：

1. 普通初始 spin 中，每个尚未停下、即将停下的格子都在格子中心播放 `Nearwin1.json` 的大小写精确 `Loop` 动画 1 次；真实 loop boundary 到达后效果消失，随后该格停下。不能把 Nearwin 做成 symbol state，也不能写入 `symbol-state-textures.manifest.json`。
2. `Nearwin1.Loop` 的当前真实时长为约 `0.6666667s`。现有首格约 `1.028s` 就停，但当前 stop plan 没有逐格 effect 调度和明确的“效果完成后再停”边界，因此仍须调整通用 grid-cell stop plan；不能通过加速动画、截断、在落地后补播或固定 `setTimeout` 欺骗时序。
3. 当前 spin 中按真实 landing 顺序累计 `WL`。第 2 个 `WL` 实际落地的同一更新边界进入期待模式；第 2 个 `WL` 本身仍使用普通 `Nearwin1`，只有它之后尚未停下的格子使用 `Nearwin2`。
4. `WL` 的识别只属于 `apps/game002`：app 通过 paytable code -> symbol resolver 明确判断 `symbol === "WL"`。`packages/rendercore` 只接收通用 activation gate / predicate 结果，不得硬编码 `WL`、wild、game002 或任一 Nearwin 文件名。
5. 期待模式下，后续每个准备停下的格子在格子中心播放 `Nearwin2.json` 的大小写精确 `Loop` 1 次。`Nearwin2.Loop` 当前真实时长为 `0.4s`；真实 loop boundary 到达后效果消失再停格。
6. 期待模式的第一枚后续格必须给 `Nearwin2` 留足 1 次循环时间，不能在第 2 个 `WL` 落地之前提前显示 Nearwin2；后续停格间隔固定为 `120ms`，相对普通 `16ms` 明显放慢，让落地呈现为可辨识的逐格节奏。
7. 期待模式一旦在本轮初始 spin 中进入，就持续到本轮全部 win/remove/cascade/refill/global win-amount 流程结束；不能在初始 reels 全部停下时清除。只有下一次合法 spin 真正开始时才清除上一轮期待模式。
8. 期待模式只由初始 spin 已落地的 `WL` 触发。不能把初始画面已有 `WL`、仍在滚动但服务器目标已知的 `WL`、cascade dropdown 搬运的 `WL`、refill 新增的 `WL` 或 win result 中出现的 `WL` 提前计入触发数。
9. 没有达到 2 个已落地 `WL` 的普通局继续使用当前 unified fall：既有 occurrence 与 refill occurrence 同时下落，不走 selective spin/appear。不得为了统一代码而改变非期待局现有节奏。
10. 进入期待模式后，每个中奖 cascade step 的 refill 必须与 dropdown 分开：
    - 先只让当前已存在的 surviving occurrence 按现有 dropdown motion 下落到 `dropdownScene`，保持 occurrence、CN raw value、`dropdown` animation continuity、WL 固定与完整 reel-set mask 合同；
    - dropdown 完成并严格校验 `dropdownScene/dropdownValues` 后，在全部 refill hole 上做一次 Nearwin2 预扫；
    - 预扫完成后，再只对 refill hole 执行本地公开轮带驱动的 selective grid-cell spin，最终落到服务端 `refillScene/refillValues`。
11. refill 预扫顺序固定解释为屏幕行优先：`y` 从大到小（下到上），每一行内 `x` 从小到大（左到右）。每个 hole 播放 Nearwin2 `Loop` 1 次，起播间隔 `80ms`，允许相邻效果重叠；必须等待最后一个 hole 的 1 次真实 loop 完成再开始 refill spin，从而既能感受到依次刷过，又不会按 `holeCount * 0.4s` 串行拖长。
12. 期待 refill spin 顺序固定解释为屏幕行优先：`y` 从小到大（上到下），每一行内 `x` 从小到大（左到右）。只排序展示用的 refill position 副本，不能改写服务端 `bg-refill.pos` 或 sequence 的协议顺序。
13. 期待 refill spin 中每个 hole 使用 Nearwin2 1 次、结束后停格；停格间隔同样为 `120ms`。新 symbol 正常走 selective grid-cell spin 的本地轮带、spinBlur、cell clip、落地和 manifest-driven appear；既有 surviving occurrence 不重新 spin、不重新 appear、不换 player、不丢 CN value。
14. refill 新增 CN 的最终 raw value 继续来自同 step `bg-gencoins` 对应的服务端 otherScene；没有新增 CN 时仍允许缺失该组件。期待模式不得生成随机服务端值、从 symbol 名猜值或覆盖 sequence 已预解析的 `refillValues`。
15. Nearwin 是 grid-cell reel presentation effect，不是可展示 symbol、paytable symbol、symbol animation state、value-presentation tier、背景或 win-amount。`Nearwin1/2` 走独立 reel-effect 资源闭包；`Nearwin3` 和 `WM_Fx` 继续未接入。
16. Nearwin 使用现有官方 Spine `4.3.x` / `spine-pixi-v8`、`Symbol.atlas`、`Symbol.png`、manual update、真实 loop completion 和统一 destroy；不得新增 Spine runtime、adapter、DOM/canvas、独立 renderer 或 app 私有 track 操作。
17. rendercore 拥有通用的逐格 effect scheduling、effect layer/mask、Spine player pool、分段 stop timing、activation gate、effect sweep、selective refill spin 与 dropdown-only plan；game002 只配置资源、时序、顺序和 `WL` resolver。app 不得直接遍历或操作 Pixi child、Spine track/player、reel 私有 cell 或 symbol 私有 display tree。
18. 所有资源/schema/state 漂移必须在 mount 或 `playSpin()` 真正修改 reels 前显式失败。不得加入“缺 Nearwin 就不播”“时长不够就少播”“loop completion 丢失就按 timer 算完成”“期待 refill 失败就退回 unified fall”“缺值就随机”“顺序非法就自动重排协议数据”等 fallback。
19. 如果旧测试/fake 没有 effect/gate/split refill 生命周期或只期待 unified fall，应更新测试、fixture 和断言；普通 stop timing 的 `lastStopAtMs=1876` 应保持。不得为迁就旧测试在 production 增加双重 timing、测试专用分支或隐藏 fallback。

任务完成后必须新增中文任务报告：

```text
tasks/97-game002-nearwin-anticipation-refill-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/97-game002-nearwin-anticipation-refill-260401-181300.md
```

## 2. 已确认的当前实现与资源事实

以下事实来自制定计划时的实际 checkout；实施时仍必须按第 5 节重新盘点，不能只引用本节快照。

### 2.1 Git 与工作区基线

首次制定计划时：

```text
branch: main
HEAD: ebf1773
working tree: clean
```

在计划定稿前，工作区出现了以下用户/并行任务已有修改，本任务执行者必须保留并以它们为最新基线重新审计，不能按首次 clean 快照覆盖：

```text
M agents.md
M apps/game002/README.md
M apps/game002/src/cascade-sequence.ts
M apps/game002/src/cn-value-sequence.ts
M apps/game002/tests/cascade-sequence.test.ts
M apps/game002/tests/cn-value-sequence.test.ts
M apps/game003/README.md
M apps/game003/src/coin-overlay-sequence.ts
M apps/game003/tests/coin-overlay-sequence.test.ts
M packages/rendercore/README.md
M packages/rendercore/src/reel/grid-cell-cascade-plan.ts
M packages/rendercore/tests/reel/grid-cell-cascade-plan.test.ts
```

其中 `grid-cell-cascade-plan.ts` 已新增 `deriveGridCellCascadeSettledValues(...)`，game002 sequence 已允许在 auxiliary otherScene 缺失时从 occurrence 搬运关系严格派生 value，对应 tests、game002/game003/rendercore README 和 `agents.md` 也正在同步。task 97 的 dropdown-only 抽取及文档/规则更新必须合并并保留这套新逻辑，不能恢复“所有中间 otherScene 必须恰好一个”的旧合同，不能另写一套 value 推导，也不能覆盖这些用户文档改动。

执行时不得使用 `git reset --hard`、`git checkout --`、自动 stash 或批量清理 untracked。若已有用户改动，应先记录并绕开；与任务文件重叠时必须保留用户内容并做最小增量修改。

### 2.2 Nearwin 资源事实

当前资源：

```text
assets/game002-s3/Nearwin1.json
assets/game002-s3/Nearwin2.json
assets/game002-s3/Nearwin3.json
assets/game002-s3/Symbol.atlas
assets/game002-s3/Symbol.png
```

已核对：

| 资源            | Spine 版本 | animation | raw skeleton 尺寸       | animation duration |
| --------------- | ---------- | --------- | ----------------------- | ------------------ |
| `Nearwin1.json` | `4.3.23`   | `Loop`    | `126.80604 x 127.39757` | `0.6666667s`       |
| `Nearwin2.json` | `4.3.23`   | `Loop`    | `126.80604 x 127.06303` | `0.4s`             |

动画时长按 Spine animation 全部 timeline 的最大时间核对；实施时必须再用官方 skeleton parser 返回的 animation duration 验证，不能把本节数字作为绕过资源校验的硬编码。

当前单格为 `120 x 120`。Nearwin 保持资源 `scale=1`，原点放在 cell center；效果允许在相邻格之间轻微扩出，但整个 effect layer 必须裁切在完整 `6 x 9` 轮子矩形内，不能溢出 board，也不能给每个活动 Spine 叠一层独立 mask。

当前 `Symbol.atlas` 的 page 为 `Symbol.png`，Nearwin1/2 与现有 symbol Spine 共用该 atlas/texture。不得复制或改名 atlas/texture，也不得通过 `*.json` / `*.png` 宽泛 glob 把 Nearwin3、WM_Fx 或其它附属资源带入。

### 2.3 当前普通 grid-cell spin

主要实现：

```text
apps/game002/src/game-layout.ts
apps/game002/src/game-demo.ts
apps/game002/src/game-adapter.ts
packages/rendercore/src/reel/grid-cell-order.ts
packages/rendercore/src/reel/grid-cell-spin-plan.ts
packages/rendercore/src/reel/render-grid-cell-reel-set.ts
packages/rendercore/src/reel/types.ts
```

当前合同：

- 54 格 runtime 顺序是 `x` 升序、每列内 `y` 升序，即先 `(0,0)..(0,8)`，再 `(1,0)..`；已有 mode 名为 `top-down-left-right`。
- `startStepMs=16`、`stopStepMs=16`、`settleAfterLastStartMs=180`、`minimumSpinCycles=6`、`speedSymbolsPerSecond=54`。
- `firstStopAtMs=(54-1)*16+180=1028`，`lastStopAtMs=1876`。
- `GridCellReelPlanCell` 已包含 `startAtMs/stopAtMs/durationMs/sequenceIndex`；`RenderGridCellReelSet.update()` 已在真实 landing 时返回 `landedCells`，但当前返回值是本轮累计标记而不是严格 edge list，不能直接重复计数。
- 每格落地后由 rendercore 请求 manifest-driven appear，等待 appear 和 dimming fade-out 完成后整轮才 complete。
- 当前没有 grid-cell overlay effect、effect resource、effect loop counter、activation gate 或分段 stop schedule。

Nearwin1 一次约 `666.6667ms`，小于当前每格约 `1028ms` 的实际 spin duration，因此普通 stop timing 无需额外放慢；但当前 plan/scheduler 没有 effect start、真实 loop completion 和“effect 完成同一边界再 landing”的合同，只在 adapter 收到 `landedCells` 后加 overlay 仍然太晚。

### 2.4 当前 cascade 与 refill

当前链路：

```text
apps/game002/src/cascade-sequence.ts
apps/game002/src/cascade-config.ts
apps/game002/src/game-adapter.ts
packages/rendercore/src/reel/grid-cell-cascade-plan.ts
packages/rendercore/src/reel/render-grid-cell-reel-set.ts
```

当前 `createGridCellCascadeDropPlan(...)`：

- 先验证 `removedSourceScene/Values -> dropdownScene/Values -> refillScene/Values`；
- 生成 `kind="existing"` 与 `kind="refill"` 两类 movement；
- existing occurrence 通过 `takeVisibleOccurrence()` 搬运，refill occurrence 通过 `createDetachedOccurrence()` 从 board 上方创建；
- 两类 movement 合并为一次 unified fall；
- 期间只对整个 reel set 启用完整 board mask；
- 完成后一次性断言 full `targetScene/targetValues`。

`RenderGridCellReelSet.spin()` 已保留 selective plan 能力：传入 `positions` 时要求目标 cell 为空，并只让这些 cell 使用本地公开轮带 spin。因此期待 refill 应复用并补全该通用能力，不应在 game002 复制单格 reel 算法。

非期待局继续走当前 unified fall；期待局才走：

```text
win/remove 完成
-> existing-only dropdown 到含 hole 的 dropdownScene
-> Nearwin2 refill-hole sweep
-> selective refill spin 到完整 refillScene
-> 下一 win stage / 下一 cascade step
```

### 2.5 当前资源与发布边界

当前 `Nearwin1/2` 被明确排除：

- `apps/game002/src/skin-config.ts` 的 symbol Spine glob 不包含 Nearwin；
- `apps/game002/src/loading-resources.ts` 不加载 Nearwin skeleton；
- `apps/game002/tests/assets.test.ts` 断言 Nearwin 不在 symbol modules / symbol Spine modules；
- `apps/game002/scripts/verify-static-dist.mjs` 的 `EXCLUDED_RESOURCE_PREFIXES` 包含 Nearwin1/2/3；
- `apps/game002/README.md` 和 `agents.md` 仍写着 `Nearwin1..3` 未接入。

本任务只改变 Nearwin1/2 的 **reel-effect** 资源闭包。它们仍必须不出现在：

```text
assets/game002-s3/symbol-state-textures.manifest.json
Game002SkinConfig.displaySymbols
symbolModules
spineSkeletonModules（symbol animation resolver 那一组）
symbolsviewer display set / symbol resolver
paytable / gameconfig
```

应新增独立、精确命名的 `reelEffectResources` / `reelEffectSkeletonModules` 消费面。Nearwin3 与 WM_Fx 继续被 source/dist 检查排除。

### 2.6 当前 reel manifest

`assets/game002-s3/reel.manifest.json` 当前为：

```json
{
  "version": 1,
  "spin": {
    "bounceStrength": 0,
    "dimmingAlpha": 0.6
  }
}
```

`packages/rendercore/src/reel/manifest.ts` 采用 unknown-field fail-fast parser，当前只允许上述两个 spin 字段。本任务应扩展该 reel manifest，而不是把 Nearwin 写进 symbol manifest 或在 `game-adapter.ts` 建第二份 timing/resource 表。

### 2.7 协作规则

仓库根 `AGENTS.md` 与 `agents.md` 当前是同一 inode。现有规则仍写着：

- unified fall 不走 spin/appear；
- `Nearwin1..Nearwin3` 未接入。

本任务会改变长期 game002/rendercore 边界，完成时必须更新 `agents.md`，并验证 `AGENTS.md` 同步反映相同内容；不要把同一 hard link 当成两个独立文件重复改写。

## 3. 固定视觉与时序合同

### 3.1 reel manifest 目标结构

实现时允许按现有 TypeScript 命名风格微调类型名，但 `assets/game002-s3/reel.manifest.json` 必须表达且唯一表达以下数值与资源关系：

```jsonc
{
  "version": 1,
  "spin": {
    "bounceStrength": 0,
    "dimmingAlpha": 0.6,
    "timing": {
      "startStepMs": 16,
      "stopStepMs": 16,
      "settleAfterLastStartMs": 180,
      "minimumSpinCycles": 6,
      "speedSymbolsPerSecond": 54,
    },
    "cellEffects": {
      "normal": {
        "skeleton": "./Nearwin1.json",
        "atlas": "./Symbol.atlas",
        "texture": "./Symbol.png",
        "animation": "Loop",
        "loopCount": 1,
        "finishBeforeStopMs": 0,
        "transform": { "x": 0, "y": 0, "scale": 1 },
      },
      "anticipation": {
        "skeleton": "./Nearwin2.json",
        "atlas": "./Symbol.atlas",
        "texture": "./Symbol.png",
        "animation": "Loop",
        "loopCount": 1,
        "finishBeforeStopMs": 0,
        "transform": { "x": 0, "y": 0, "scale": 1 },
      },
    },
    "anticipation": {
      "triggerLandedCount": 2,
      "firstFollowingStopDelayMs": 400,
      "stopStepMs": 120,
    },
  },
  "cascade": {
    "anticipationRefill": {
      "sweep": {
        "effect": "anticipation",
        "loopCount": 1,
        "startStepMs": 80,
        "order": "left-right-bottom-up",
      },
      "spin": {
        "order": "left-right-top-down",
        "startStepMs": 16,
        "stopStepMs": 120,
        "settleAfterLastStartMs": 400,
        "minimumSpinCycles": 6,
        "speedSymbolsPerSecond": 54,
      },
    },
  },
}
```

数值推导：

```text
Nearwin1 lead = 0.6666667s * 1 + 0ms ≈ 666.6667ms
Nearwin2 lead = 0.4s * 1 + 0ms = 400ms
normal first stop = (54 - 1) * 16 + 180 = 1028ms
normal last stop without anticipation = 1028 + (54 - 1) * 16 = 1876ms
```

普通 spin 保留现有 `settleAfterLastStartMs=180`；每格实际 spin duration 仍为 `1028ms`，足以容纳一次 Nearwin1。`firstFollowingStopDelayMs/refill settle=400` 用于让期待模式第一枚后续格从 trigger landing 开始完整播放一次 Nearwin2。它们都不是另一份动画 duration。资源解析后必须逐格交叉验证：

```text
planCell.stopAtMs - effect.startAtMs >= parsed animation duration * loopCount + finishBeforeStopMs
```

若未来美术时长变化导致公式不成立，必须显式失败并要求更新 reel manifest timing，不能自动加速、截断、少播或扩大为不可追踪的隐式值。

### 3.2 初始 spin 的分段 stop schedule

app 在创建 plan 前，按当前 grid-cell landing order 扫描服务端目标 scene，通过 paytable resolver 找到第 2 个目标 `WL` 的 coordinate/sequence index；这只用于构造 presentation gate 和预留后续 stop 时长，不代表期待模式已提前激活。

- 不存在第 2 个 `WL`：全部 cell 使用 normal stop schedule 与 Nearwin1。
- 存在第 2 个 `WL`：从第 0 格到第 2 个 `WL` 所在格仍使用 normal stop schedule 与 Nearwin1。
- 第 2 个 `WL` 后的第一格 stop time 固定为 `triggerCell.stopAtMs + 400`。
- 再后面的格子每格增加 `120ms`。
- 每个 anticipation effect 的 start time 为 `stopAtMs - 400`；因此第一枚 Nearwin2 最早在第 2 个 `WL` 落地边界启动，绝不能提前。
- reel 轴的 `durationMs/travelSymbols` 必须按调整后的 stop time 重新计算；不能只是延迟“完成通知”而让画面早已停住。

rendercore 必须把 plan 中的 activation gate 与真实 landing 绑定。只有 gate cell 完成真实 reel landing 时才：

1. 发出一次通用 activation edge；
2. 允许 gated/anticipation cell effect 启动；
3. 让 game002 runtime 把 `anticipationActive` 置为 `true`。

如果 target 预扫描、plan gate 与实际 landing coordinate/code 不一致，立即失败。不能依赖当前 `landedCells` 累计数组反复加数；应提供真正的 landed edge，或在 runtime 内用 Set 去重并严格校验。

### 3.3 Nearwin effect layer

rendercore 的通用 grid-cell effect layer 必须：

- 位于 main reel symbol 之上，不改变 symbol `renderPriority`、scene、state、value 或点击层；
- 以 cell center 为定位基准，resource transform 为相对偏移；
- 整层使用一个完整 board 矩形 mask，允许 126px 效果跨 120px cell 边缘，但不允许溢出 board；
- 不挂到 symbol container，不跟随滚动 strip，不被 spin dimming 当成 symbol 压暗；
- effect 完成/取消后立即 `renderable=false` 并归还 player pool，不留 setup pose 闪帧；
- 初始 spin、refill sweep、refill spin、reset、error、destroy、下一 spin 都有明确 cleanup；
- 每个 loop 只认官方 Spine completion，不能用 wall-clock timer 代替。

普通 54 格的 Nearwin1 可能高度重叠。不得在 spin 每帧创建/destroy Spine、纹理或 container。应在 mount 阶段按配置 schedule 计算最大并发量并准备有上限的 player pool；Nearwin2 的初始期待、预扫与 refill spin 也按区间重叠数计算池上限。纹理由 Pixi Assets cache 复用，pool 在 runtime destroy 时统一销毁。

现有 `RendercoreSpinePlayer.update()` 已返回 official `loopCompleted` edge。用户已明确每格只播放 1 次，因此本任务第一版 `loopCount` 必须精确为 `1`，effect runner 收到第一次真实 `loopCompleted=true` 就结束效果；不要为本任务扩展多 loop 计数器，也不能用 elapsed timer 代替该 edge。一次 delta 跨过 loop/stop 边界时，scheduler 仍必须按 plan 时间片顺序先处理真实 completion，再 landing。

### 3.4 期待状态生命周期

game002 runtime 至少提供可测试的中性/业务封装 API，职责等价于：

```ts
isAnticipationActive(): boolean;
getAnticipationSnapshot(): {
  readonly active: boolean;
  readonly landedTriggerCount: number;
  readonly activationCoordinate: { x: number; y: number } | null;
};
```

状态规则：

- runtime mount/applyInitialState 后为 false；
- 一次合法 initial spin plan 构造成功并真正开始时，先清理上一轮状态，再开始本轮计数；
- 第 2 个实际 landing `WL` 时由 false -> true，只能发生一次；
- initial spin 完成、win/remove、dropdown、refill、win-amount、`playSpin()` resolve 都不清除；
- 下一次合法 spin 真正开始时清除；
- invalid GMI / resource preflight 在 reels 变更前失败时，不得半清状态、半启动 effect；
- applyInitialState、fatal cleanup、destroy 必须清除 active effects 和状态；
- 不把该状态写进 framework balance/state、URL、localStorage、server request 或静态 YAML。

### 3.5 期待 cascade 三段流程

期待模式下每个 cascade stage 固定为：

```text
step win/remove complete
-> dropdown-only plan start
-> dropdown-only plan complete and assert dropdownScene/dropdownValues
-> refill Nearwin2 sweep start
-> sweep complete after last true loop boundary
-> selective refill spin start
-> selective refill spin complete and assert refillScene/refillValues
-> next win stage or next cascade stage
```

dropdown-only plan 必须由 rendercore 从现有 `createGridCellCascadeDropPlan(...)` 的验证/occurrence pairing 逻辑中抽出或复用：

- 只生成 `kind="existing"` movement；
- source 是 `removedSourceScene/Values`，target 是含 hole 的 `dropdownScene/Values`；
- fixed WL、droppable occurrence 相对顺序、CN value、dropdown state continuity、column stagger、overshoot/settle、board mask 与现有 unified fall 完全一致；
- 完成后 hole 仍为空，不能提前创建 refill occurrence；
- normal unified plan 仍同时包含 existing/refill，行为不回归。

refill sweep：

- 只接受 sequence 已验证且与 `dropdownScene` holes 精确相等的 `refillPositions`；
- 排序为 `y desc, x asc`；
- 每个 position 使用 Nearwin2 1 loop，start time 为 `displayIndex * 80ms`；
- 旧 symbol 继续 update normal animation，hole 保持 empty；
- 最后一个 effect 完成后 layer 清空，再进入 refill spin。

selective refill spin：

- 排序为 `y asc, x asc`；
- 复用公开 local `reels-001`，只把 server refill target 叠加到本轮临时 endpoint；
- 只允许 empty refill positions 启动，未列出的 cell 必须保持原 occurrence；
- target presentation value 从 `stage.refillValues` 精确传入；
- 每格用 Nearwin2 1 loop、0ms finish gap、120ms stop step；
- new symbol 落地后按现有 landing appear 合同执行；
- complete 时同时断言 full scene、full value matrix、全部 hole 已填、非 refill occurrence code/value 未变。

adapter 的 pending phase 应从当前单一 `cascade-fall` 扩展为明确状态，命名可微调但职责必须可区分：

```text
initial-spin
step-win-remove
cascade-unified-fall       # 非期待
cascade-dropdown           # 期待 existing-only
refill-sweep               # 期待 Nearwin2 预扫
refill-spin                # 期待 selective spin
finalizing
win-amount
```

不能把全部逻辑塞进 ticker 的一个大 if 或用递归立即推进造成零时长 stage 无限递归；为 `totalSeconds=0` 的合法 dropdown 明确推进到 sweep，但仍执行 scene/value 断言。

## 4. 修改范围

### 4.1 预计修改/新增文件

```text
assets/game002-s3/reel.manifest.json

packages/rendercore/src/spine/runtime-player.ts
packages/rendercore/src/reel/manifest.ts
packages/rendercore/src/reel/types.ts
packages/rendercore/src/reel/grid-cell-spin-plan.ts
packages/rendercore/src/reel/grid-cell-cascade-plan.ts
packages/rendercore/src/reel/render-grid-cell-reel-set.ts
packages/rendercore/src/reel/index.ts
packages/rendercore/src/reel/grid-cell-effect-player.ts              # 建议新增
packages/rendercore/src/reel/grid-cell-effect-resource.ts            # 如职责拆分需要可新增
packages/rendercore/tests/background/runtime-player.test.ts
packages/rendercore/tests/reel/manifest.test.ts
packages/rendercore/tests/reel/grid-cell-spin-plan.test.ts           # 如当前无文件则新增
packages/rendercore/tests/reel/grid-cell-cascade-plan.test.ts        # 如当前无文件则新增
packages/rendercore/tests/reel/render-grid-cell-reel-set.test.ts
packages/rendercore/README.md

apps/game002/src/skin-config.ts
apps/game002/src/loading-resources.ts
apps/game002/src/game-layout.ts
apps/game002/src/game-demo.ts
apps/game002/src/game-adapter.ts
apps/game002/src/reel-effect-config.ts                               # 建议新增
apps/game002/tests/assets.test.ts
apps/game002/tests/loading-resources.test.ts
apps/game002/tests/game-demo.test.ts
apps/game002/tests/game-adapter.test.ts
apps/game002/tests/source-boundary.test.ts
apps/game002/scripts/verify-static-dist.mjs
apps/game002/README.md

agents.md
tasks/97-game002-nearwin-anticipation-refill-[utctime].md
```

文件名可按现有模块职责微调，但以下边界不能改变：

- effect resource/schema/player/scheduler 属于 rendercore；
- `WL` resolver、game002 timing 实例、资源 module maps、adapter phase 属于 game002；
- Nearwin 不进入 symbol manifest、symbol generator 或 symbolsviewer；
- 不需要修改 logiccore/gameframeworks 协议 API；若实施发现 public `GameLogic` 无法表达当前 sequence，先记录证据再做最小通用扩展，shared 包仍不得出现 game002 组件名。

### 4.2 明确非目标

- 不改服务端 GMI/protobuf、gamecode、live server、URL query、`lines=30`、bet/collect API 或本地公开轮带边界。
- 不改变 game002 背景、focus、board layout、symbol display set、paytable、CN tier/value image、cascade win summary、coin collect 或 global win-amount 规则。
- 不接入 `Nearwin3.json`、`WM_Fx.json`，不猜它们的业务用途。
- 不把 Nearwin 加进 `symbol-state-textures.manifest.json`，不新增 `nearwin` symbol state，不为普通 symbol 生成 Nearwin PNG。
- 不在 symbolsviewer 增加 Nearwin pseudo-symbol；本任务的预览/验收面是 grid-cell reel runtime。
- 不让期待模式影响 non-game002 `RenderReelSet`；通用能力只作为可选配置，未配置调用方行为不变。
- 不把期待 trigger、状态或 timing 写入 game003。
- 不用 CSS/DOM overlay、第二个 Pixi Application、隐藏 canvas、canvas-to-texture 或独立 renderer。
- 不通过读取/缓存服务器真实轮带定位 refill stop。
- 不以固定 timer、wall-clock timeout、animation duration 常量代替 official Spine completion。
- 不加入缺资源/缺动画/非法值/非法顺序时的静默 fallback。

## 5. 实施前重新盘点

从仓库根目录运行并记录：

```bash
cd /Users/zerro/github.com/slotclientengine

git status --short
git branch --show-current
git rev-parse --short HEAD
node --version
pnpm --version

for f in assets/game002-s3/Nearwin1.json assets/game002-s3/Nearwin2.json; do
  jq -r '.skeleton.spine, (.animations | keys[])' "$f"
  jq -r '[.animations.Loop | .. | objects | .time? // empty] | max // 0' "$f"
done

rg -n "Nearwin1|Nearwin2|Nearwin3|WM_Fx" \
  apps/game002 packages/rendercore assets/game002-s3/reel.manifest.json \
  apps/symbolsviewer tasks/9[1-6]-*.md agents.md

rg -n "GAME002_GRID_CELL_REEL_TIMING|createGridCellReelSpinPlan|landedCells|startCascadeDrop|activeDrop|cascade-fall" \
  apps/game002/src packages/rendercore/src/reel \
  apps/game002/tests packages/rendercore/tests/reel

rg -n "createOfficialSpinePlayer|loopCompleted|animationNames|duration" \
  packages/rendercore/src/spine packages/rendercore/src/symbol \
  packages/rendercore/tests/background packages/rendercore/tests/symbol

ls -li AGENTS.md agents.md
```

必须先确认：

1. 用户工作区改动及归属；
2. Nearwin1/2 仍为 Spine 4.3.x、只有 exact `Loop`，duration 仍为约 `0.6666667/0.4s`；
3. `Symbol.atlas` page/texture 闭包未变；
4. grid-cell spin/cascade/ticker phase 是否在本计划后再次变化；
5. 当前 reel manifest parser 仍为 strict unknown-field；
6. Nearwin1/2 仍未被其它任务接入；若已接入，应以当前实现为基线做差量，不重写用户代码；
7. `AGENTS.md` / `agents.md` 仍为 hard link；
8. task 97 计划/报告名没有冲突。

若 Nearwin 资源版本、animation name、atlas page 或 duration 与本计划不同，立即停止实现并在报告/用户沟通中列出实际值；不得偷偷按旧数值继续。

## 6. 分步实施计划

### 步骤 1：扩展 reel manifest 与精确资源闭包

1. 按第 3.1 节扩展 `reel.manifest.json`。
2. 扩展 `parseReelManifest(...)`：
   - 保持 `version=1` 与 unknown-field fail-fast；
   - 每个 timing 为 finite non-negative/positive safe 范围；
   - 第一版 loopCount 必须精确为 `1`，其它值显式失败；
   - scale 为 finite positive，offset finite；
   - resource path 必须是 `./` 相对本地路径，不能 URL、绝对路径或 `..`；
   - order 只接受 exact enum；
   - normal/anticipation effect key 完整且引用关系合法；
   - cascade refill 配置缺字段、重复、非法值立即失败。
3. 新增通用 resource resolver，把 manifest path 精确映射到 Vite module maps，并调用 official Spine validation：版本、atlas pages、texture closure、exact animation、duration 都必须存在。
4. `Game002SkinConfig` 增加独立 `reelEffectResources`；Nearwin skeleton modules 使用精确 `{Nearwin1,Nearwin2}.json` glob/import。不得合并到 `spineSkeletonModules`。
5. `loading-resources.ts` 精确加入 Nearwin1/2 skeleton URL；共享 Symbol.atlas/Symbol.png 不重复建立逻辑冲突。确保 0%～99% loading 完成且 mount 等待 effect players 初始化后才允许 spin。
6. `Nearwin3/WM_Fx` 继续不进入 loading/runtime/dist。

### 步骤 2：补全 official Spine duration 校验并复用 loop completion

1. `ValidatedSpineResource` 增加不可变 animation duration map，值来自 official parsed `SkeletonData.animations[].duration`。
2. effect runner 复用现有 `loopCompleted`，第一次真实 completion 后 reset/hide/release，禁止 app 直接读取 track time。
3. `play/reset/destroy` 继续正确重置 completion edge，不改变既有 player API 语义。
4. 对既有 active Spine loop completion、CN pending Collect 做回归测试，不能破坏 task 96 的真实 loop boundary 合同。

### 步骤 3：实现通用 grid-cell effect controller

建议新增 `grid-cell-effect-player.ts`，对外提供中性接口，职责等价于：

```ts
interface GridCellEffectController {
  readonly container: Container;
  prepare(): Promise<void>;
  startScheduledEffect(options: {
    effectId: string;
    position: { x: number; y: number };
    loopCount: number;
  }): void;
  update(deltaSeconds: number): GridCellEffectUpdateResult;
  cancelAll(): void;
  getSnapshot(): GridCellEffectSnapshot;
  destroy(): void;
}
```

要求：

- effectId/resource/timing 全部由 parsed config 提供；
- player pool 有明确 capacity，耗尽时显式失败，不临时 fallback；
- prepare 在 mount 阶段完成，spin 时不等待网络/异步 init；
- container 由 rendercore 挂入 reel set 的专用 overlay layer，app 不操作 children/zIndex；
- snapshot 暴露 active effectId、position、completedLoops、pool active/idle count，便于 unit test，不暴露私有 Spine/Pixi tree；
- board mask、position、scale、reset、destroy 符合第 3.3 节；
- `cancelAll()` 幂等，但非法 double-start / destroyed use 显式失败。

### 步骤 4：扩展 grid-cell spin plan 与 activation gate

1. 把普通 timing 从 `GAME002_GRID_CELL_REEL_TIMING` 第二份常量迁到 parsed reel manifest；`game-layout.ts` 只保留 layout/order/dimming resolver 等 app 逻辑。
2. 扩展 `GridCellReelPlanCell`，加入可冻结、可断言的 effect schedule，例如：

```ts
readonly effect: {
  readonly effectId: string;
  readonly startAtMs: number;
  readonly loopCount: number;
  readonly finishBeforeStopMs: number;
  readonly activationGate?: { x: number; y: number };
} | null;
```

3. 扩展 plan 级 gated timing，按第 3.2 节生成 normal/gated stop time。所有 duration/travelSymbols/lastStopAtMs 必须由最终 stop time 派生。
4. 未配置 effects/gate 的现有 rendercore caller 输出与行为保持不变；不能让 game003 或普通 `RenderReelSet` 获得默认 Nearwin/延时。
5. `RenderGridCellReelSet.update()` 用时间区间切片启动/update effects，不能因一次 delta 跨越 start/finish/stop 多个边界而漏事件。
6. gate cell landing 发生后才开放 gated effect；同一 update 内顺序固定为：先完成 gate landing/校验/activation edge，再更新从该边界开始的 gated effect 时间片。
7. 格子 landing 前若配置的 loopCount 尚未真实完成，立即抛错；landing 后不补播。
8. update result 提供真正的 `started/landed/activation` edge 或等价去重机制；同步更新 tests 与 consumers，避免当前累计标记被误当 edge。

### 步骤 5：接入 game002 Wild resolver 与期待生命周期

1. `game-demo.ts` 用 `gameConfig.getPaytableEntry(code)?.symbol` 解析 trigger；只有 exact `WL` 返回 true，未知 code 显式失败。
2. initial target scene 预扫描只找到第 `triggerLandedCount=2` 个匹配 coordinate，传给通用 plan；无第二个时不配置 gate。
3. runtime 在 gate 的真实 landing edge 校验该 cell 当前目标/可见 code 仍解析为 WL，然后把期待状态置 true。
4. runtime snapshot 增加第 3.4 节状态和 effect 快照，tests 不通过私有 children 断言。
5. `spinToScene()` 或新的 initial-spin API 在所有 plan/resource/target value 校验成功后原子清旧期待并开始新 spin。
6. apply initial state、fatal error、destroy 清理；本轮正常 complete 不清理。

### 步骤 6：拆出 existing-only dropdown

1. 以当前用户改动中的 `deriveGridCellCascadeSettledValues(...)` 为 value 搬运权威入口，并从 `createGridCellCascadeDropPlan(...)` 抽出或复用共享 occurrence pairing/固定 occurrence/运动生成逻辑，避免复制两套 dropdown/value 算法；不得回滚 auxiliary otherScene 可省略时的严格派生合同。
2. 增加明确的 dropdown-only plan/API，target 允许精确 hole sentinel `-1`；只包含 existing movement。
3. unified fall 继续在同一核心上追加 refill movement，非期待路径结果不变。
4. `RenderGridCellReelSet` 完成 dropdown-only 后允许 cell 保持 empty；snapshot/getVisibleScene/getCascadeValues 必须返回对应 `-1`，随后允许 effect sweep/selective spin。
5. board mask、CN presentation value、WL canDrop predicate、renderPriority 和 normal/dropdown continuity 做回归。

### 步骤 7：实现 refill sweep 与 selective refill spin

1. 增加通用 `startGridCellEffectSweep(...)` 或等价能力，输入 positions、order、effectId、loopCount、startStepMs；rendercore 排序 helper 必须明确实现 `y desc/x asc` 与 `y asc/x asc`，不要复用含糊的现有列优先 mode 名。
2. sweep 期间 update occupied cell animations 与 effect controller；activity/snapshot 能区分 sweep。
3. 增加 runtime `startSelectiveRefillSpin(...)`：
   - 当前 scene 必须与 dropdownScene/hole positions 精确一致；
   - positions 使用 `y asc/x asc` 展示顺序，但每个 cell 继续保留 runtime 原始 orderIndex/zIndex；
   - target full scene/value 已预校验；
   - 调用现有 selective `RenderGridCellReelSet.spin()`；
   - 使用 manifest anticipation effect/timing；
   - 完成后严格断言 full target。
4. selective refill 的新 occurrence 从本地公开轮带产生；服务器只提供目标可见窗口。找不到公开轮带 stop candidate 时继续使用现有临时 endpoint 合同，不失败、不泄露服务器轮带。
5. landing appear、spinBlur/disabled、CN value-presentation async init、WL/CN dimming 等既有 spin 合同全部回归。

### 步骤 8：重构 game002 adapter phase

1. `playSpin()` 仍先完整创建 `Game002CascadeSequence` 并执行所有资源/value/win/cascade preflight，再修改画面。
2. initial spin 完成后依据 runtime 的 persisted anticipation state 决定本轮后续 cascade 路径；不能重新从 final scene 直接猜状态。
3. 非期待：保留当前 `createCascadeDropPlan + startCascadeDrop` unified fall。
4. 期待：按第 3.5 节逐段启动、update、断言和推进。
5. 每个 cascade stage 都重新使用同一个 persisted state；进入期待后，后续所有 refill 都走拆分流程。
6. step win/remove、summary、CN collect、global amount 顺序不变。win-amount 阶段仍持续 update main reel runtime/effects。
7. 下一 `playSpin()` 在 sequence/resource 校验通过、initial spin 真正开始时清旧期待和残留 effects；`dismissImmediately()` 等现有清理仍保留。
8. pending reject/destroy 时 aggregate cleanup error 规则延续，effect cleanup 失败不得吞掉原始错误。

### 步骤 9：资源、release、文档和规则同步

1. `assets.test.ts` 改为：Nearwin1/2 不属于 symbol modules，但属于 exact reelEffectResources；Nearwin3/WM_Fx 仍完全排除。
2. `loading-resources.test.ts` 断言 Nearwin1/2 skeleton 各出现一次、URL/ID 非空唯一、共享 atlas/texture 没有错误重复；Nearwin3 不出现。
3. `verify-static-dist.mjs`：
   - source 验证 reel manifest 新 schema/数值/path；
   - official/raw 验证 Nearwin1/2 Spine 4.3.x、exact Loop、duration；
   - dist 要求 Nearwin1/2 skeleton 各恰好一个且字节对应 source；
   - 从 excluded list 移除 1/2，但继续禁止 Nearwin3/WM_Fx；
   - bundle 必须引用 reel-effect config，不允许 Nearwin 进入 symbol manifest/display set。
4. 更新 `apps/game002/README.md`：普通 Nearwin1、2-WL trigger、期待 Nearwin2、下一 spin 清理、期待 refill 三段、顺序/时序、资源边界。
5. 更新 `packages/rendercore/README.md`：可选 grid-cell effect/gate/sweep/selective refill/dropdown-only 通用 API，不出现 game002 实例名。
6. 更新 `agents.md`：覆盖旧的“Nearwin1..3 未接入”和“全部 refill 永远 unified fall”描述，明确普通非期待仍 unified、期待 refill 才拆分；Nearwin1/2 是 reel effect，不是 symbol manifest。验证 `AGENTS.md` 同步。

### 步骤 10：测试、格式化、验收与报告

1. 按第 7 节补齐测试矩阵。
2. 按第 8 节执行全部自动命令。
3. 使用真实 live game002 做第 10.6 节浏览器验收；不得增加 production debug query、mock live fallback 或 Playwright。
4. 按第 10.7 节做第二遍遗漏审计。
5. 生成 UTC 中文报告，内容满足第 11 节。

## 7. 测试计划

### 7.1 rendercore manifest/resource/player

- parse 完整目标 manifest，深冻结结果。
- 缺字段、unknown key、非法 path、0/负/NaN/Infinity timing、`loopCount !== 1`、非法 order 全失败。
- official parser 返回 Nearwin fixture duration；资源时长与可用 lead 不匹配时失败。
- exact `Loop` 缁失、Spine 非 4.3、atlas page/texture closure 漂移失败。
- official `loopCompleted` 的 play/reset/destroy edge 回归，effect 在第一次 completion 后结束。
- player pool capacity、复用、无 per-frame allocation、cancel/destroy 覆盖。

### 7.2 grid-cell spin/effect/gate

- 无 gate 的 54 格：每格 Nearwin1 exactly 1 loop，effect finish 与 stop 为同一时序边界，first/last stop 保持约 `1028/1876ms`。
- 0 个或 1 个 WL：不激活期待，全部 Nearwin1。
- 2 个 WL：第 2 个 landing 前 inactive；第 2 个本格 Nearwin1；下一格 Nearwin2；activation edge 只一次。
- 3 个以上 WL：仍只在第 2 个 landing 激活一次，后续不重复 reset/count。
- 第 2 个 WL 为最后一格：spin 结束时期待仍 active，供后续 cascade refill 使用。
- first following stop 与 trigger stop 差 `400ms`，后续 stop step `120ms`，轴真实持续滚动而非画面已停。
- 大 delta 跨 effect start/loop finish/landing 时不漏边界、不重复计数。
- effect layer z-order/board mask/position/scale 正确；symbol scene/state/value/renderPriority 不变。
- reset/next spin/error/destroy 无 effect 残影或 pool 泄漏。

### 7.3 dropdown/unified fall/refill

- 既有 unified fall snapshot/event/value/mask 全部保持。
- dropdown-only 只包含 existing movement，完成 scene/value 含精确 holes，没有 detached refill occurrence。
- fixed WL 与普通 symbol 穿越、column stagger、overshoot/settle 不变。
- CN occurrence/value/player timeline 随 dropdown 搬运不重建。
- sweep positions 按 `y desc/x asc`，每格 Nearwin2 exactly 1 loop、start step `80ms`，等待最后一个完成。
- refill positions 按 `y asc/x asc`，只空格 spin；survivor 不 spin、不 appear、不换 value。
- refill 每格 Nearwin2 exactly 1 loop、stop step `120ms`；完成 full scene/value 精确一致。
- sparse holes、跨多列 holes、单 hole、第一/最后 cell、zero-movement dropdown 都覆盖。
- refillPositions 与 holes 不一致、重复、越界、target 改 carried occurrence、CN value 缺失都在 mutation 前失败。

### 7.4 game002 runtime/adapter

- fake runtime 不得因新测试接口迫使 production 暴露 Pixi/Spine 私有对象。
- 普通局 event 保持 `spin -> win/remove -> unified fall -> final`。
- 期待局 event 严格为 `spin activation -> win/remove -> dropdown -> sweep -> refill spin -> next stage/final`。
- 两个 cascade step 时，两次 refill 都走期待拆分流程。
- next spin 开始清期待；当前 spin resolve/collect 不提前清。
- invalid next GMI 在 preflight 失败时不半清/半启动；合法重试仍可开始。
- applyInitialState/destroy/pending rejection 清理完整。
- win summary/coin collect/CN loop boundary/global amount/runtime continuous update 非回归。

### 7.5 资源与边界

- Nearwin1/2 只存在于 reel-effect resource/loading/dist；Nearwin3/WM_Fx 不存在。
- symbol manifest/display symbols/symbol modules/symbolsviewer 不含 Nearwin。
- rendercore production source 不含 `WL`、`Nearwin1`、`Nearwin2`、`bg-refill`、`game002`。
- game002 不 import `@esotericsoftware/spine-pixi-v8`，不操作 track/children/private reel cell。
- reel manifest 是 timing/resource/loop count 唯一来源，app 无第二份 `400/120/80/1` 常量。
- game003/rendercore 既有调用方在未配置 effect 时无行为变化。

## 8. 自动验收命令

所有命令从仓库根目录执行。当前环境若遇到 pnpm 无 TTY 清理错误，使用 `CI=true`，不要修改 production 规避：

```bash
cd /Users/zerro/github.com/slotclientengine

CI=true pnpm --filter game002 generate:symbol-value-resources
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

source-boundary 审计：

```bash
rg -n 'WL|Nearwin1|Nearwin2|bg-refill|game002' packages/rendercore/src
rg -n '@esotericsoftware/spine-pixi-v8|\.children\[|getChildAt|state\.setAnimation|clearTracks' apps/game002/src
rg -n 'Nearwin1|Nearwin2|Nearwin3|WM_Fx' \
  assets/game002-s3/symbol-state-textures.manifest.json \
  apps/game002/src apps/game002/tests apps/game002/scripts \
  apps/symbolsviewer/src apps/symbolsviewer/tests
rg -n '400|120|80|loopCount' apps/game002/src packages/rendercore/src \
  assets/game002-s3/reel.manifest.json
```

预期：

- 第一条 rendercore production source 无 game-specific 匹配；若中性 API 使用单词 `anticipation` 可保留，但不得出现实例 symbol/component/resource 名。
- 第二条 game002 production source 无私有 Pixi/Spine 操作。
- 第三条 Nearwin1/2 只出现在 reel-effect 配置/资源/加载/测试/release 检查，不出现在 symbol manifest 或 symbolsviewer；Nearwin3/WM_Fx 只允许出现在排除断言。
- 第四条具体 timing 只在 reel manifest、manifest 测试 expected value、文档/报告出现；production app 不建第二份常量。

若 root 汇总失败：

1. 先重跑对应受影响 package 命令；
2. 判断是否为起始 HEAD 已存在的任务外失败；
3. 在报告中记录完整命令、错误、与本任务的边界证据；
4. 不放宽 Spine/version/manifest/state/scene/value production 合同，不批量修改无关 package 只为让 root 变绿。

## 9. 依赖与网络失败处理

本任务预计不需要新增第三方依赖，必须复用现有 Pixi、官方 Spine 和 rendercore。若 `node_modules` 不完整，先执行：

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

## 10. 验收标准与第二遍遗漏审计

### 10.1 普通 spin

- [ ] Nearwin1 official Loop duration 实测约 `0.6666667s`，每个 cell exactly 1 loop。
- [ ] effect 的真实 loop boundary 到达后消失并在同一边界 cell landing；不在落地后补播。
- [ ] 54 格仍按既有列优先 landing order，normal stop step `16ms`。
- [ ] plan first/last stop 与 manifest/真实时长公式一致，reel 画面实际持续滚动。
- [ ] effect 在 cell center、scale 1、board mask 内、symbol 上方，无 setup pose/残影。
- [ ] spin dimming、bounce=0、WL/CN 全亮、其它 dimming=0.6、landing appear 不回归。

### 10.2 期待模式

- [ ] 当前 initial spin 实际落地第 2 个 WL 前 inactive，落地边界只激活一次。
- [ ] 第 2 个 WL 使用 Nearwin1；之后 cell 使用 Nearwin2。
- [ ] 第一个 Nearwin2 不早于 trigger landing；exactly 1 x 0.4s，结束后停格。
- [ ] first following delay `400ms`、后续 stop step `120ms`，视觉能逐格辨认。
- [ ] 期待状态跨 win/remove/cascade/refill/win-amount/playSpin resolve 保留。
- [ ] 下一合法 spin 开始清除；initial scene/error/destroy 无残留。
- [ ] rendercore 不知道 WL/wild，game002 resolver 以 paytable exact symbol 校验。

### 10.3 期待 refill

- [ ] 非期待局仍 unified fall，事件、mask、occurrence/value 完全不变。
- [ ] 期待局先 existing-only dropdown，完成时 scene/value 含 holes 且准确。
- [ ] 预扫只覆盖 refill holes，顺序 `y desc/x asc`，Nearwin2 一次、80ms stagger，最后一次完成后再 spin。
- [ ] refill spin 顺序 `y asc/x asc`，只 empty hole 使用本地轮带。
- [ ] 每个 refill hole 用 Nearwin2 1 次、120ms stop step，落地后 normal appear 合同生效。
- [ ] survivor 不 spin/appear/change，CN value/player continuity、WL fixed/renderPriority、mask 不回归。
- [ ] completion full scene/value 精确等于 sequence `refillScene/refillValues`。
- [ ] 所有后续 cascade step 都遵守同一期待路径。

### 10.4 manifest/resource/release

- [ ] reel manifest 是资源、loop count、timing、order、transform 唯一来源，strict parser 完整覆盖。
- [ ] Nearwin1/2 Spine 4.3.x、Loop、duration、atlas/texture 在 mount 前验证。
- [ ] loading 与 dist 各含 Nearwin1/2 skeleton 一份，共享 Symbol atlas/texture；无宽泛 glob。
- [ ] Nearwin1/2 不在 symbol manifest/display set/symbol resolver/symbolsviewer。
- [ ] Nearwin3/WM_Fx 继续未接入且 dist 排除。
- [ ] 无新增依赖、renderer、canvas 或 fallback。

### 10.5 既有 game002 合同非回归

- [ ] cascade emphasis/win/remove、CN collect、cash summary、global amount 顺序不变。
- [ ] WL 仍不 remove、不 drop，普通 symbol 可从后方穿过，只服从 renderPriority。
- [ ] normal unified fall 仍不 spin/appear；只有期待 refill 明确走 selective spin/appear。
- [ ] CN refill 使用服务端值，existing CN value 随 occurrence 搬运，无随机覆盖。
- [ ] win-amount 期间 runtime 持续 update，CN/其它 Loop 不冻结。
- [ ] loading 99%/100%、live URL、lines=30、query、公开轮带边界不变。
- [ ] game003/shared caller 未配置 effect 时无行为变化。

### 10.6 浏览器验收

启动：

```bash
CI=true pnpm --filter game002 dev -- --host 127.0.0.1 --port 5206
```

使用 URL encode 后的真实参数：

```text
http://127.0.0.1:5206/?skin=1&gamecode=<GAME_CODE>&token=<TOKEN>&businessid=guest&clienttype=web&jurisdiction=MT&language=en&bet=5&lines=30&times=1&autonums=-1&requestTimeoutMs=30000
```

至少观察并记录两类真实局：

1. 未在 initial spin 落地 2 个 WL 的普通局：每格 Nearwin1 播放 1 次、消失后停格；无 Nearwin2；若 cascade，仍 unified fall。
2. initial spin 落地至少 2 个 WL 且第二个不是最后一格的期待局：第 2 个 WL 落地才切模式；后续 Nearwin2；停格明显变为逐格；若中奖 cascade，严格看到 dropdown -> 下到上/左到右预扫 -> 上到下/左到右 refill spin。

同时检查：

- effect 居中、scale、board 边缘裁切、横竖屏 resize；
- normal/anticipation loop 次数与消失/landing 边界；
- refill sparse holes 的顺序；
- CN 数字、WL 层级、symbol spinBlur/appear、win/remove/summary/global amount；
- 下一 spin 开始不保留上一轮期待/效果；
- console/WebSocket 无错误，loading 不二次请求/双连接。

不得加入 Playwright。若没有可用 token、真实服务端长期无法返回覆盖局或网络不可用，浏览器项必须作为 blocker 写进报告，不能用 unit test、mock page、production debug query 或伪造截图冒充完成。截图/录屏只作为本地验收证据，不提交仓库，除非用户另行要求。

### 10.7 最终遗漏审计

- [ ] target tree：asset、manifest、parser/resource、Spine player、grid plan/runtime、adapter、tests、release、README、agents、report 全覆盖。
- [ ] protocol/data：initial target WL resolver、scene/value、refillPositions、CN values、local reel 边界无遗漏。
- [ ] state/logic：normal、activation、persist、next-spin clear、unified/dropdown/sweep/refill phases、zero movement、error/destroy 全覆盖。
- [ ] performance：player pool bounded/prepared，texture cache 复用，无 per-frame player/container allocation。
- [ ] visual：z-order、board mask、scale 1、edge clipping、resize、no residue。
- [ ] tests：rendercore unit、game002 unit、resource/loading/source-boundary、release、game003/root regression 完整。
- [ ] commands：全部实际运行并记录；失败有基线/范围证据，不用 production fallback 修测试。
- [ ] docs/rules：README、rendercore README、agents 旧描述已覆盖；AGENTS/agents hard link 同步。
- [ ] report/cleanup：UTC 报告、代理情况、浏览器证据/blocker、无 token/dist/coverage/screenshot 临时物误入。
- [ ] `git diff --check` 通过，`git status --short` 只含任务预期文件和用户原有改动。

## 11. 最终任务报告要求

创建：

```bash
UTC_TIME="$(date -u +%y%m%d-%H%M%S)"
REPORT="tasks/97-game002-nearwin-anticipation-refill-${UTC_TIME}.md"
```

报告必须使用中文，并包含：

1. 开始/结束 UTC、branch、起止 HEAD、Node/pnpm 版本、初始/最终 working tree；
2. 实际修改/新增文件完整清单；
3. Nearwin1/2 official duration、loop count、manifest timing 公式和最终实测值；
4. rendercore effect layer/player pool/loop completion/activation gate/stop schedule 实现说明；
5. game002 第 2 个已落地 WL resolver、期待持久化与下一 spin 清理说明；
6. 普通 unified fall 与期待 dropdown -> sweep -> refill spin 两条路径的事件证据；
7. sweep/refill position 顺序、CN value/occurrence、WL、appear、mask 非回归证据；
8. loading/dist exact resource closure，Nearwin3/WM_Fx/symbol manifest/symbolsviewer 排除证据；
9. 每条自动验收命令及结果，root/task 外失败的边界证据；
10. 浏览器 URL 脱敏，记录普通局/期待局、视觉时序、console/WebSocket、resize、next-spin 结果；
11. 是否使用代理；
12. README、rendercore README、`agents.md` / `AGENTS.md` 同步情况；
13. 未完成项、blocker、风险和后续建议；无则明确写“无”。

报告不得包含 token、cookie、完整 live URL、服务器真实轮带、截图二进制或其它敏感信息。只有代码、测试、资源闭包、文档/规则同步和可执行浏览器验收均完成后，才能宣告任务完成；若真实浏览器覆盖被外部条件阻塞，必须明确保留 blocker，不能弱化为“单测已覆盖所以完成”。
