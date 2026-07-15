# game002 cascade removal flow 任务报告

## 1. 执行信息

- 执行开始 UTC：`2026-07-15T06:31:20Z`
- 执行结束 UTC：`2026-07-15T09:44:46Z`
- 分支：`main`
- 起始 HEAD：`4bd979b`
- 结束 HEAD：`4bd979b`（本次未提交）
- Node.js：`v24.14.0`
- pnpm：`11.7.0`
- 网络代理：未使用；没有发生依赖下载失败。
- 报告格式化辅助命令第一次漏带 `CI=true`，触发 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`；未改文件，随后按仓库约定给同一命令补 `CI=true` 重试。

开始时 `git status --short` 只有用户提供的未跟踪计划文件：

```text
?? tasks/95-game002-cascade-removal-flow.md
```

本次保留该计划文件，没有 reset、checkout、stash、清理或覆盖用户内容。

## 2. 实施结果

### 2.1 完整 GMI sequence

已新增 repo-local fixture：

```text
apps/game002/tests/fixtures/game002-cascade-gmi.ts
```

fixture 和 sequence builder 保留并验证以下权威关系：

- 顶层 `bet=10`、`lines=30`、`totalwin=210`，共 2 个 step。
- step 0 真正触发 `bg-spin -> bg-gencoins -> bg-win -> bg-remove`，`usedResults=[0,1]`。
- step 1 真正触发 `bg-respin -> bg-dropdown -> bg-refill -> bg-gencoins`；`bg-win` 只存在于 `historyComponentsEx`，`step.hasComponent("bg-win")` 为 false，不会启动空中奖阶段。
- step 0 remove 输出的 scene/value hole matrix 与 step 1 dropdown source 精确串接。
- step 1 dropdown 保持每列 `(symbol code, presentation value)` occurrence 顺序，WL 保持原格，refill 的 9 个 pos 精确等于全部 `-1` 空洞。
- step 1 最终 `scene[1][0]=8 (CN)` 使用 `otherScenes[3][1][0]=1`，既有 CN value 只能随 occurrence 下落，不能被 refill gencoins 改写。
- sequence builder 消费 `logic.getSteps()` 的完整链，不再把运行时固定为 `logic.getStep(0)`；组件触发只使用 `step.hasComponent()`。

合法主链之外，sequence tests 还通过变体覆盖缺组件、多 scene/otherScene、错误 hole、错误串接、横移/上移/顺序或 value 漂移、refill pos 奇数/重复/越界/漏洞/填错格、非法 gencoins、终止后残留 step 等显式失败合同。

### 2.2 protected WL

两个中奖结果分别为：

```text
result[0] cashWin64=180，6 个位置
result[1] cashWin64=30，5 个位置
共享位置 (0,5)，scene code=0 (WL)
```

rendercore 先按坐标计算最后引用组，再应用 game002 注入的 remove predicate：

- group 0 remove 5 个独占格，不包含 `(0,5)`；
- group 1 remove 4 个格，不包含 `(0,5)`；
- WL 仍参与聚合高亮，并在所属组轮到时播放一次 win，但不消除；唯一 hole 共 9 个。

更新后的 `bg-remove.removedNum=9` 仅保留作诊断值，不参与 hole 推导；权威关系仍来自 remove scene 与 removePositions 的一致性校验。

### 2.3 manifest、activeSpine 和 CN 挂件

- 默认 symbol preset 增加 `remove=once` 和 `dropdown=stable loop`。
- manifest 顶层 texture states 仍精确为 `spinBlur/disabled`，没有生成 `remove.png` 或 `dropdown.png`。
- game002-s3 可 remove 的 Spine symbol 显式配置 exact `End`；dropdown 按真实资源显式配置 `Idle` 或 `Loop`；BN 不伪造 remove/dropdown。
- CN 的 `appear/win/remove/dropdown` 改为顶层 `activeSpine`，分别播放当前 tier player 的 exact `Start/Win/End/Loop`。
- `valuePresentation.appearPlayback` 已移除；valuePresentation 只负责 default value、tier resource、reel state texture 和 `Num` slot 数字挂件。
- CN occurrence 第一次确定 value 时只创建一个 tier Spine player、一个数字显示对象并 attach 一次；normal/appear/win/remove/dropdown 只切换同一 player 的 animation，同值不会重建，最终 release/destroy 才 detach/destroy。
- parser、resolver、state texture generator、value resource generator、game002 dist verifier 和 symbolsviewer 均已同步；generated Vite/loading closure 仍为精确 18 项且没有文件 diff。

### 2.4 rendercore 通用 cascade

新增通用能力：

- `prepareSymbolWinGroups()`：由原 carousel 与新 cascade player 共用 component/usedResults/amount/geometry 合同。
- `createSymbolCascadePlayer()`：先聚合执行 emphasis，各组金额同时显示并统一压暗全部中奖格之外的内容；恢复亮度后按组严格执行 `group win -> immediate group remove -> next group win`，没有 lingering。
- player prepare 显式拒绝空组、非法/重复坐标、remove 非本组 win 坐标、非法 amount，以及缺 win/remove capability；覆盖 clear、重复 start、invalid delta 和 destroy 生命周期。
- `createGridCellCascadeDropPlan()`：同时校验 source/settled/refill target，只接受精确 `-1` sentinel，逐列按 occurrence 顺序校验 code/value 和 fixed occurrence。
- 统一 fall 使用 app 传入的 column/row stagger、fall、overshoot、settle 参数；同一个 RenderSymbol occurrence 连同 CN player/挂件移动，新 symbol 从棋盘上方同时落入。
- `RenderGridCellReelSet` 支持 release 到 hole、fixed occurrence、既有与 refill occurrence 统一下落；refill 不再 spin、不触发 appear。

这些 API 和实现没有硬编码 `bg-spin/bg-win/bg-remove/bg-dropdown/bg-refill` 等 game002 组件名；`logiccore`、`gameframeworks` 未修改。

### 2.5 game002 adapter 时序

adapter 在初始 spin 前完整解析 sequence，并同步预检全部 win/remove capability 与所有最终 CN exact image resource。运行期 phase 为：

```text
initial-spin
-> step-win-remove
-> cascade-fall
-> 后续 step win/remove 或下一 cascade
-> finalizing
-> win-amount
```

真实 fixture 的事件顺序测试为：

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
fall.start
fall.complete
gencoins.values-ready
winAmount.start
playSpin.resolve
```

全局 win-amount 只在全部 step、remove、dropdown、refill 和末次 gencoins 数据边界完成后启动。`totalwin=210` 仍按服务器整数金额格式化为 `$2.10`；进入现有 `awaiting-dismiss` 后不阻塞 `playSpin()`，点击仍只调用 `requestAdvance()`，下一 spin 仍清理残留。

## 3. 实际修改文件

用户原有文件：

```text
tasks/95-game002-cascade-removal-flow.md
```

本任务修改或新增：

```text
agents.md
assets/game002-s3/symbol-state-textures.manifest.json

apps/game002/README.md
apps/game002/scripts/verify-static-dist.mjs
apps/game002/src/cascade-config.ts
apps/game002/src/cascade-sequence.ts
apps/game002/src/cn-value-sequence.ts
apps/game002/src/game-adapter.ts
apps/game002/src/game-demo.ts
apps/game002/src/skin-config.ts
apps/game002/tests/assets.test.ts
apps/game002/tests/cascade-sequence.test.ts
apps/game002/tests/cn-value-sequence.test.ts
apps/game002/tests/fixtures/game002-cascade-gmi.ts
apps/game002/tests/game-adapter.test.ts

apps/symbolsviewer/README.md
apps/symbolsviewer/src/main.ts
apps/symbolsviewer/src/symbol-assets.ts
apps/symbolsviewer/src/symbol-set-config.ts
apps/symbolsviewer/src/viewer-sequence.ts
apps/symbolsviewer/tests/symbol-assets.test.ts
apps/symbolsviewer/tests/symbol-set-config.test.ts

packages/rendercore/README.md
packages/rendercore/scripts/generate-symbol-state-textures.mjs
packages/rendercore/scripts/generate-symbol-value-vite-resources.mjs
packages/rendercore/src/index.ts
packages/rendercore/src/reel/grid-cell-cascade-plan.ts
packages/rendercore/src/reel/grid-cell-spin-plan.ts
packages/rendercore/src/reel/index.ts
packages/rendercore/src/reel/render-grid-cell-reel-set.ts
packages/rendercore/src/reel/render-reel.ts
packages/rendercore/src/reel/symbol-registry.ts
packages/rendercore/src/reel/types.ts
packages/rendercore/src/symbol-cascade/create-symbol-cascade-player.ts
packages/rendercore/src/symbol-cascade/index.ts
packages/rendercore/src/symbol-cascade/prepare-symbol-win-groups.ts
packages/rendercore/src/symbol-cascade/types.ts
packages/rendercore/src/symbol-value-presentation/create-symbol-value-presenter.ts
packages/rendercore/src/symbol-value-presentation/index.ts
packages/rendercore/src/symbol-value-presentation/render-symbol-value-controller.ts
packages/rendercore/src/symbol-value-presentation/types.ts
packages/rendercore/src/symbol-win-carousel/create-symbol-win-carousel.ts
packages/rendercore/src/symbol/catalog.ts
packages/rendercore/src/symbol/manifest.ts
packages/rendercore/src/symbol/render-symbol.ts
packages/rendercore/src/symbol/standalone-catalog.ts
packages/rendercore/src/symbol/state-machine.ts
packages/rendercore/src/symbol/types.ts
packages/rendercore/src/symbol/vni-animation.ts
packages/rendercore/tests/reel/grid-cell-cascade-plan.test.ts
packages/rendercore/tests/reel/helpers.ts
packages/rendercore/tests/reel/render-grid-cell-reel-set.test.ts
packages/rendercore/tests/symbol-cascade/create-symbol-cascade-player.test.ts
packages/rendercore/tests/symbol-value-presentation/manifest-resources.test.ts
packages/rendercore/tests/symbol-value-presentation/render-symbol-value-controller.test.ts
packages/rendercore/tests/symbol-value-presentation/symbol-value-presenter.test.ts
packages/rendercore/tests/symbol/state-texture-generator.test.ts
packages/rendercore/tests/symbol/symbol-value-vite-resource-generator.test.ts

tasks/95-game002-cascade-removal-flow-260715-074058.md
```

## 4. 自动验收结果

所有命令均在仓库根目录使用 Node 24 PATH 和 `CI=true` 串行执行。

### 4.1 生成物与受影响 package

| 命令                                                          | 结果                                      |
| ------------------------------------------------------------- | ----------------------------------------- |
| `pnpm --filter game002 generate:symbol-value-resources`       | 通过，精确 18 项                          |
| `pnpm --filter symbolsviewer generate:symbol-value-resources` | 通过，精确 18 项                          |
| `pnpm --filter game002 check:symbol-value-resources`          | 通过，无漂移                              |
| `pnpm --filter symbolsviewer check:symbol-value-resources`    | 通过，无漂移                              |
| `pnpm --filter @slotclientengine/rendercore format:check`     | 通过                                      |
| `pnpm --filter @slotclientengine/rendercore lint`             | 通过                                      |
| `pnpm --filter @slotclientengine/rendercore test`             | 通过，39 files / 262 tests，branch 81.09% |
| `pnpm --filter @slotclientengine/rendercore typecheck`        | 通过                                      |
| `pnpm --filter @slotclientengine/rendercore build`            | 通过                                      |
| `pnpm --filter game002 format:check`                          | 通过                                      |
| `pnpm --filter game002 lint`                                  | 通过                                      |
| `pnpm --filter game002 test`                                  | 通过，17 files / 80 tests，branch 81.08%  |
| `pnpm --filter game002 typecheck`                             | 通过                                      |
| `pnpm --filter game002 build`                                 | 通过                                      |
| `pnpm --filter game002 release:check`                         | 通过，`game002 static dist check passed`  |
| `pnpm --filter symbolsviewer format:check`                    | 通过                                      |
| `pnpm --filter symbolsviewer lint`                            | 通过                                      |
| `pnpm --filter symbolsviewer test`                            | 通过，2 files / 17 tests，branch 80.00%   |
| `pnpm --filter symbolsviewer typecheck`                       | 通过                                      |
| `pnpm --filter symbolsviewer build`                           | 通过                                      |

### 4.2 game003 和 root 汇总

| 命令                              | 结果                                                                                                                                                       |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter game003 test`      | 未通过：12 files failed / 15 passed，4 tests failed / 73 passed；全部失败入口均为现有 4.2.43 skeleton 被当前 4.3-only runtime/parser 显式拒绝              |
| `pnpm --filter game003 typecheck` | 通过                                                                                                                                                       |
| `pnpm --filter game003 build`     | 通过                                                                                                                                                       |
| `pnpm format:check`               | 未通过：首先报告 `packages/pixiani`、`apps/gengameconfig` 等任务外既有 Prettier 问题；三个受影响 package 的独立 format check 均通过                        |
| `pnpm lint`                       | 通过，23/23 packages                                                                                                                                       |
| `pnpm test`                       | 未通过，22/23 packages 通过；唯一失败为上述 game003 4.2.43 资源入口；首次 root 汇总中的 game002 78 tests 通过；浏览器反馈修复后 game002 独立 79 tests 通过 |
| `pnpm typecheck`                  | 通过，23/23 packages                                                                                                                                       |
| `pnpm build`                      | 通过，23/23 packages                                                                                                                                       |
| `git diff --check`                | 通过                                                                                                                                                       |

game003 的 4.3-only 校验、4.3 runtime 依赖以及 4.2.43 资源均存在于起始 HEAD，本任务未修改 `packages/rendercore/src/spine/version.ts`、game003 源码或 game003 资源。用户已确认 game003 资源会在后续更新至 4.3；因此本任务没有放宽 production 版本合同、加入 4.2 fallback 或改动 game003 测试。root format 的任务外文件也未批量格式化，避免扩散无关 diff。

## 5. 浏览器验收

按用户要求，本次没有执行浏览器验收，也没有启动 dev server、生成截图或录像。待用户执行：

```bash
CI=true pnpm --filter game002 dev -- --host 127.0.0.1 --port 5206
```

脱敏 URL：

```text
http://127.0.0.1:5206/?skin=1&gamecode=<GAME_CODE>&token=<TOKEN>&businessid=guest&clienttype=web&jurisdiction=MT&language=en&bet=5&lines=30&times=1&autonums=-1&requestTimeoutMs=30000
```

必须由真实 cascade 局验证：单 live session；普通 spin 不再出现明暗棋盘格或固定黑色矩形断层，实际滚动中的 WL/CN 图标与格底全亮，其余 occurrence 的格底由随 slot 滚动的 `0.82` 黑层压暗、symbol 由同步灰阶 tint 压暗，图标 alpha 保持 `1` 且暗区仍能看清轮廓，落地后两者同步恢复；普通 spin 全程没有额外上下回弹；全部中奖格之外的格子与 symbol 本体用 `0.1s` 统一渐暗；各组金额同时出现；保持 `1s` 后用 `0.1s` 渐亮，完整强调段 `1.2s`；恢复后按组执行 Win 完成即 End/remove，再进入下一组 Win；WL 不 End、不消失、不改变格位；其它 symbol 从 WL 后层穿过；9 个新增格与幸存 symbol 同批有力 fall 且不出现 spin/appear；fall 期间只有整个轮子区的单一总 mask，下落 symbol 本体无额外 mask，棋盘外部分不可见但棋盘内下落内容正常显示；列从左到右错峰并保留明显回弹；normal/dropdown 实际动画相同时 Loop 时间轴连续且落地只恢复 normal 语义；CN server value carry；无新增 CN 的 step 缺失 `bg-gencoins` 时正常继续；末 step 无空 win；最后才播放 `$2.10` global win-amount，金额播放期间 CN 与其它 normal Loop 持续运动；点击/下一 spin、resize/focus 以及 console/WebSocket 无错误。

### 5.1 用户浏览器反馈修复

用户在真实页面验收中先后发现两个预检错误，修复 UTC 为 `2026-07-15T07:52:08Z`：

1. `step[1] existing occurrence/value changed at (4,6)`：remove/dropdown 中间 otherScene 的普通 symbol 格可保留非零辅助数据，该 raw 数字不是 CN presentation value。修复后中间矩阵仍严格校验维度、hole 的精确 `-1` 和 occupied raw 非负整数，但只有 code=CN 的值进入 occurrence carry；最终 `bg-gencoins` 仍严格要求 CN 正数、非 CN 为 0，既有 CN 真实漂移仍失败。fixture 在普通 symbol `(4,6)` 加入非零中间值回归。
2. `bg-win.basicComponentData.cashWin 750 does not match expected 150`：后续 cascade component 的 `cashWin` 是累计口径。修复后初始 step 校验 component cashWin 等于当前 usedResults 合计，后续 step 严格校验 `前序累计 + 当前 usedResults 合计`；每组金额展示仍只来自 result 的 `cashWin64/cashWin`，没有 component total fallback。新增 `600 + 150 = 750` 回归。

修复后重新通过 game002 `format:check`、lint、79 tests、typecheck、build、release:check；浏览器需由用户继续验证完整动画流程。

### 5.2 用户方案调整

调整实现 UTC 为 `2026-07-15T08:35:12Z`：

- rendercore 新增通用可注入 remove/drop predicate；game002 传入 WL 不 remove、不 drop 的规则。fixture 已切换到服务器新语义，WL 保持原格，唯一 remove/refill 格均为 9。
- dropdown/refill 合并为一次 fall，既有与新增 occurrence 同时下落，不再执行 selective spin/appear；新增 symbol 从棋盘上方进入。
- motion 新增 x 列延迟，形成从左到右启动偏差；列内继续下方优先错峰、下落与回弹。
- 全部中奖组先同时显示各自金额，并以 `0.82` 同时压暗中奖坐标以外的格子黑层与 symbol 本体；强调段为 `0.1s` 渐暗、`1s` 保持、`0.1s` 渐亮，恢复后按组严格执行“本组 win 完成 -> 立即 remove -> 下一组 win”；全为保护 symbol 的组允许空 removePositions，win 完成后直接进入下一组。
- fall motion 调整为更短的 base/per-row/max fall、更大的 `0.16` cell overshoot 和更短 settle，增强落下冲击与回弹力度；fall 期间只给整个 grid-cell reel set 启用一个完整轮子矩形 mask，活动 symbol 自身不再绑定 mask，棋盘上方不可见，进入轮子区才逐步露出，落地后解除 reel-set mask。
- WL 在 game002-s3 manifest 中声明 `renderPriority: 1`，其它 symbol 为 `0`。falling symbol 直接参与 grid root 的统一 zIndex 排序，可以穿过 WL 格位但显示在 WL 后方；没有 WL 专属 runtime zIndex 分支。
- 复核确认压暗只修改 alpha，CN 的 active Spine `Win -> Loop` 也会在同一 player 上重新调用 `play(Loop, true)`；实际冻结点是 adapter 的 global win-amount 分支此前只更新金额 player、漏掉 reel runtime update。现已在金额播放每帧继续推进 runtime，并以“win-amount update 前 runtime update 计数必须增加”锁定回归。
- 服务器新合同下，refill 只有新增 CN 时才必须触发 `bg-gencoins`；没有新增 CN 时允许组件完全缺失，新增普通 symbol value 为 null，既有 CN value 从 dropdown occurrence 严格携带。缺组件但实际新增 CN 仍显式失败。
- spin dimming 从奇偶棋盘格改为实际 symbol occurrence resolver：game002 把 code 映射回 paytable symbol，仅 `WL/CN` 返回 `0`，其它返回 `0.82`；rendercore 每帧按当前临时 strip slot 修改 symbol 根节点 alpha，并在落地 fade-out 完成时恢复为 `1`。spin 固定 cell 黑层不可渲染，中奖 emphasis 时才重新启用；shared production code 没有 `WL/CN` 名称分支。
- rendercore 新增固定 symbol 穿越与层级、统一 fall、列延迟、emphasis/dimming 和空 remove 组测试；浏览器验收仍由用户负责。

spin 回弹配置 UTC 为 `2026-07-15T09:40:05Z`：新增独立 `assets/game002-s3/reel.manifest.json`，`spin.bounceStrength=1` 等于 rendercore 原固定力度、正数按比例缩放、`0` 完全关闭。game002 配置为 `0`，manifest 经通用 fail-fast parser 注入每个 grid-cell `RenderReel`，并进入 gameloading 与 release dist 精确闭包；app/runtime 没有第二份 `0`。测试同时覆盖 parser 非法值、默认力度、两倍力度、零回弹，以及 game002 spin 中所有活动 cell 的 `reelY=0`。

最终 spin 暗度与 dropdown 连续性修正 UTC 为 `2026-07-15T10:11:23Z`，覆盖前述两版临时结论：

- spin 不再修改 symbol alpha，也不使用固定 cell overlay。rendercore 在微型 reel 内为当前实际 slot 生成同速滚动的半透明黑色格层，用于压暗格底；同时按同一 fade progress 与 symbol resolver 对 RenderSymbol 根节点应用灰阶 tint，用于压暗图标。普通 symbol 在目标暗度 `0.82` 时有效亮度约 `0.18`、alpha 仍为 `1`；WL/CN 的暗层为 `0`、tint 为白色。落地 fade-out 与 clear 同步恢复格层和 tint。
- 修复了暗度同步发生在 `reel.update()` 之前、slot recycle 后被重置的问题；当前顺序固定为先更新/recycle reel slot，再把暗层和 tint 应用到本帧实际 occurrence。
- `SymbolAni` 新增通用 continuity key。manifest Spine、active value Spine 与 VNI 使用真实资源、playback、transform（active value 额外包含 tier generation）构造 key；normal 与 dropdown key 相同时，状态切换不 reset/replay player，CN 不会第二次 `play(Loop)`。落地调用 `returnToDefaultState()`：等价动画只恢复 normal 语义并继续时间轴，不同动画才真正切回 normal，避免 dropdown stable loop 卡住后续 win。
- 回归覆盖“黑格层随 slot 滚动、symbol tint 而非 alpha、特殊 symbol 保持亮、完成后恢复”、“普通等价 ani 不 reset”和“CN active Spine normal Loop -> dropdown Loop -> normal 全程不增加 play 次数”。

本次调整后的严格自动验收：

- rendercore：format、lint、typecheck、`40 files / 269 tests` 全通过，最终 branch coverage `80.34%` 达标。
- game002：format、lint、typecheck、`17 files / 80 tests`、build、release:check 全通过，branch coverage `81.05%`，static dist closure 通过。
- symbolsviewer：同步 WL manifest priority 后，format、lint、typecheck、`2 files / 17 tests`、build 全通过。
- `git diff --check` 通过；production source 无 `spinSelectiveToScene`、WL 专属 zIndex 或 rendercore 游戏名硬编码残留。

浏览器结果：`进行中（用户负责；数据预检问题已修复，最新逐组 win/remove 与单一 reel-set mask 等待真实画面确认）`。

## 6. 二次遗漏审计

- `apps/game002/src` 无 `logic.getStep(0)` 隐藏硬编码；唯一 `stepIndex: 0` 是 sequence 类型和初始 step 常量。
- shared production source 未出现 game002 cascade 组件名。
- app production source 未出现 `End/Idle/Loop`、Spine runtime import、`RenderSymbol` 私有操作、Pixi children 遍历、server reel/stop 或 easing 公式。
- 未发现 `appearPlayback`、`remove.png`、`dropdown.png` 残留。
- `removedNum` 只读取并记录，不推导坐标；没有使用 wildNum/symbolNums。
- full scene 仍拒绝负数，只有 cascade hole validator 接受精确 `-1`。
- generated game002/symbolsviewer resource files和 game003 generated static files均无 diff。
- `logiccore`、`gameframeworks`、live URL、`lines=30`、loading 99%/100%、背景/focus、renderPriority 和 win-amount 点击边界未修改。
- `git diff --check` 通过。

## 7. 未完成项与阻塞

1. 浏览器验收未执行，按用户要求由用户完成并记录结果。
2. game003 test/root test 受起始 HEAD 中 game003 4.2.43 资源与 4.3-only runtime 合同冲突阻塞；等待后续 game003 资源升级至 4.3。
3. root `format:check` 受任务外既有格式问题阻塞；task95 的 rendercore、game002、symbolsviewer 独立格式检查均通过。

除以上明确项目外，任务 95 实现面、受影响 package 自动验收、release closure 和二次边界审计无未完成项。

## 8. 结束工作区状态

结束时仍在 `main` / `4bd979b`，未提交。任务改动保留在现有工作区中，没有执行 stage、commit、stash、reset 或 checkout，也没有触碰 game003 资源。
