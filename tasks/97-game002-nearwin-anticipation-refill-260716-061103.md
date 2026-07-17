# 任务 97：game002 Nearwin 期待与 refill 执行报告

## 执行概况

- 开始 UTC：`2026-07-16T05:39:08Z`（首个可追溯文件写入；盘点动作早于该时间，终端未保留首条时间戳）
- 结束 UTC：`2026-07-16T08:29:26Z`（包含首次真实浏览器反馈、后续视觉调整、refill WL 触发与三循环减速）
- 分支：`main`
- 本轮视觉调整基线 HEAD：`15fde2d97173aafe46a987ffb58eaf8b9179bdf3`（当前调整未提交）
- Node.js：`v24.14.0`
- pnpm：`11.9.0`
- 初始 working tree：clean
- 最终 working tree：只包含本任务实现、测试、文档与本报告；未提交 `dist`、`coverage`、token、截图或录屏
- 代理：未使用
- 浏览器验收：按用户要求留给用户执行；本报告不把自动测试替代为真实浏览器证据，因此任务仍保留这一项人工验收

## 交付结果

### manifest 与真实 Spine 资源

`assets/game002-s3/reel.manifest.json` 现在是 Nearwin effect 资源、变换、循环次数、初始 spin 时序、期待触发时序、cascade sweep 与 selective refill 时序的唯一来源，parser 对未知字段、非法数值、非法本地路径、错误顺序及非 1 次循环全部显式失败。

官方 Spine parser 实测结果：

| 资源            | Spine    | animation | official duration | loop count |
| --------------- | -------- | --------- | ----------------: | ---------: |
| `Nearwin1.json` | `4.3.23` | `Loop`    |      `0.6666667s` |        `3` |
| `Nearwin2.json` | `4.3.23` | `Loop`    |            `0.4s` |        `1` |

普通时序公式保持：

```text
firstStopAtMs = (54 - 1) * 16 + 180 = 1028
lastStopAtMs  = 1028 + (54 - 1) * 16 = 1876
```

普通 initial spin 不再播放 Nearwin effect。期待模式在第 2 个真实落地的 `WL` 同一 update 边界激活；该格自身也不补播 effect。后续格各播放 Nearwin1 真实 3 次，第一格从 trigger landing 后预留 `2000.0001ms`，之后 stop step 为 `240ms`。每格均校验 `stopAtMs - effectStartAtMs` 足以容纳官方 duration、loop count 和 finish gap，不加速、不截断、不使用 timer completion。

### rendercore 通用能力

- 新增独立的 grid-cell effect resource resolver 与 bounded/prepared Spine player pool；effect id 由 manifest 动态声明并由各使用点显式引用。pool 容量由实际总循环时长与 schedule 推导，当前 anticipation/Nearwin1 为 `9`、refillSweep/Nearwin2 为 `5`。
- effect layer 位于 symbol 上方，但全组只复用一个完整 board rectangle mask；没有 per-player mask、DOM、canvas 或独立 renderer。
- 官方 Spine player 暴露 parser 得到的 animation duration；player 只在真实 `loopCompleted` 后释放，landing 前会断言真实 loop 已完成。
- grid-cell spin plan 支持通用 effect schedule、activation gate 和分段 stop；gate 只与真实 landed edge 绑定，rendercore 不知道 `WL`、Nearwin 文件名或 game002。
- `RenderGridCellReelSet.update()` 返回真实 started/landed edge，并保证 activation edge 只发一次；effect 启停、landing 和 gate boundary 在 timeline slice 中精确推进。
- 新增通用 effect sweep、existing-only dropdown plan，并复用既有 selective grid-cell spin；普通 unified fall 保持原路径。
- reset、error、destroy 都清理 active/pooled effect，生命周期和 pool 越界均 fail fast。

### game002 业务接入

- app 使用 paytable code -> symbol resolver 后的 exact `symbol === "WL"` 构造初始 presentation gate；initial spin 只统计真实 landed edge，不统计初始画面、未落地目标或 win result。非期待 unified refill 则在完整目标盘面原子提交后，按 refill movement 的 `start + fall + settle` 真实完成顺序统计新增 WL；只有新增 WL 使盘面跨到 manifest trigger count（当前 2）时才激活。
- anticipation state 在初始 spin 停完后继续跨 win/remove/cascade/refill/global win-amount 保留；下一次合法 initial spin 真正进入 runtime 后原子清除。非法 preflight、error、initial scene 与 destroy 不留下状态或效果。
- 非期待 cascade 继续原有 unified fall，不 spin、不 appear。
- 非期待 unified refill 新落地 WL 使当前盘面达到 2 个时，在该 fall 完成边界激活期待；不倒放当前 refill，下一 cascade 立即切到期待 split path。
- 期待 cascade 严格分为：`existing-only dropdown -> Nearwin2 sweep -> selective refill spin`。
- sweep 对 refill positions 的副本按 `y desc / x asc` 排序，start step `80ms`，允许重叠并等待最后一个 Nearwin2 真实 loop 完成。
- selective refill 对副本按 `y asc / x asc` 排序，仅 empty holes 使用本地公开轮带；stop step `240ms`，每格 Nearwin1 真实 3 次后 landing，再走既有 manifest-driven appear。
- survivor occurrence/player/value 不替换；CN refill 继续使用 sequence 预解析的服务端 raw value，既有 CN 随 occurrence 搬运；WL fixed、renderPriority、完整 board mask 合同未改。
- win-amount 阶段仍逐帧 update reel runtime。
- spin 与 cascade 非中奖格压暗均为 `0.5`。cascade 压暗开始的同一边界并行启动全部中奖 symbol opening win：普通组直接请求 win；CN 先 `Win_Start`，完成后进入 `Win` loop；强调结束后才按稳定顺序 remove/collect，opening state 不重播。

事件级测试证据覆盖了 normal unified path 与 anticipation split path，包括 `initial-spin`、`step-win-remove`、`cascade-unified-fall`、`cascade-dropdown`、`refill-sweep`、`refill-spin`、`finalizing/win-amount`，并覆盖 unified refill 新 WL 达到 2 个后的激活、zero-movement dropdown、稀疏 holes、状态跨阶段保留和 next-spin clear。

## 资源闭包与发布审计

- game002 使用精确 skeleton glob `{Nearwin1,Nearwin2}.json`，并放入独立 `reelEffectSkeletonModules/reelEffectResources`；不进入 symbol modules、symbol Spine resolver、display set、paytable、symbol manifest 或 symbolsviewer。
- loading 精确加入 Nearwin1/2 skeleton；atlas page 继续复用 `Symbol.atlas -> Symbol.png`。
- `apps/game002/dist` 实际只有一份 `Nearwin1-*.json` 与一份 `Nearwin2-*.json`。
- `Nearwin3` 与 `WM_Fx` 不在 game002 dist；symbolsviewer dist 不含任何 Nearwin/WM_Fx。
- `release:check` 同时验证 source Spine `4.3.23`、大小写精确 `Loop`、official duration、manifest contract 与 dist exact closure。
- source-boundary 测试与 `rg` 审计确认 `packages/rendercore/src` 不包含 `WL|Nearwin1|Nearwin2|bg-refill|game002`，`apps/game002/src` 不包含 Spine runtime import、children/getChildAt、track setAnimation/clearTracks 等私有操作。

## 修改与新增文件

```text
agents.md（与 AGENTS.md 为同一 inode）
apps/game002/README.md
apps/game002/scripts/verify-static-dist.mjs
apps/game002/src/game-adapter.ts
apps/game002/src/game-demo.ts
apps/game002/src/game-layout.ts
apps/game002/src/loading-resources.ts
apps/game002/src/skin-config.ts
apps/game002/tests/assets.test.ts
apps/game002/tests/game-adapter.test.ts
apps/game002/tests/game-demo.test.ts
apps/game002/tests/game-layout.test.ts
apps/game002/tests/loading-resources.test.ts
apps/game002/tests/source-boundary.test.ts
assets/game002-s3/reel.manifest.json
packages/rendercore/README.md
packages/rendercore/src/reel/grid-cell-cascade-plan.ts
packages/rendercore/src/reel/grid-cell-effect-player.ts（新增）
packages/rendercore/src/reel/grid-cell-effect-resource.ts（新增）
packages/rendercore/src/reel/grid-cell-spin-plan.ts
packages/rendercore/src/reel/index.ts
packages/rendercore/src/reel/manifest.ts
packages/rendercore/src/reel/render-grid-cell-reel-set.ts
packages/rendercore/src/reel/types.ts
packages/rendercore/src/spine/runtime-player.ts
packages/rendercore/src/symbol-cascade/create-symbol-cascade-player.ts
packages/rendercore/src/symbol-cascade/types.ts
packages/rendercore/tests/background/runtime-player.test.ts
packages/rendercore/tests/reel/grid-cell-cascade-plan.test.ts
packages/rendercore/tests/reel/grid-cell-effect.test.ts（新增）
packages/rendercore/tests/reel/grid-cell-spin-plan.test.ts
packages/rendercore/tests/reel/manifest.test.ts
packages/rendercore/tests/reel/render-grid-cell-reel-set.test.ts
packages/rendercore/tests/symbol-cascade/create-symbol-cascade-summary-player.test.ts
tasks/97-game002-nearwin-anticipation-refill-260716-061103.md（新增）
```

`AGENTS.md` 与 `agents.md` 的 inode 均为 `30967274`，协作规则已同步覆盖普通 spin 无 Nearwin、期待 Nearwin1 三循环与 `240ms` stop cadence、refill sweep Nearwin2/selective spin Nearwin1、refill WL 触发、0.5 压暗及压暗同边界启动 win/CN opening 的合同。game002 README 和 rendercore README 同步完成。

## 自动验收结果

以下命令均实际执行。

### 任务相关包

| 命令                                                       | 结果                                                                       |
| ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| `pnpm --filter @slotclientengine/rendercore format:check`  | 通过                                                                       |
| `pnpm --filter @slotclientengine/rendercore lint`          | 通过                                                                       |
| `pnpm --filter @slotclientengine/rendercore typecheck`     | 通过                                                                       |
| `pnpm --filter @slotclientengine/rendercore build`         | 通过                                                                       |
| `pnpm --filter @slotclientengine/rendercore test`          | 44 files / 284 tests 通过；coverage statements `88.19%`、branches `80.05%` |
| `pnpm --filter game002 generate:symbol-value-resources`    | 通过，18 resources                                                         |
| `pnpm --filter game002 check:symbol-value-resources`       | 通过                                                                       |
| `pnpm --filter game002 format:check`                       | 通过                                                                       |
| `pnpm --filter game002 lint`                               | 通过                                                                       |
| `pnpm --filter game002 typecheck`                          | 通过                                                                       |
| `pnpm --filter game002 build`                              | 通过                                                                       |
| `pnpm --filter game002 test`                               | 18 files / 90 tests 通过；coverage statements `86.34%`、branches `81.07%`  |
| `pnpm --filter game002 release:check`                      | 通过，static dist exact closure 通过                                       |
| `pnpm --filter symbolsviewer check:symbol-value-resources` | 通过                                                                       |
| `pnpm --filter symbolsviewer test`                         | 2 files / 17 tests 通过                                                    |
| `pnpm --filter symbolsviewer typecheck`                    | 通过                                                                       |
| `pnpm --filter symbolsviewer build`                        | 通过                                                                       |
| `pnpm --filter game003 test`                               | 27 files / 135 tests 通过                                                  |
| `pnpm --filter game003 typecheck`                          | 通过                                                                       |
| `pnpm --filter game003 build`                              | 通过                                                                       |

### 全仓门禁

| 命令                | 结果                                         |
| ------------------- | -------------------------------------------- |
| `pnpm lint`         | 23/23 packages 通过                          |
| `pnpm test`         | 23/23 packages 通过                          |
| `pnpm typecheck`    | 23/23 packages 通过                          |
| `pnpm build`        | 23/23 packages 通过                          |
| `pnpm format:check` | **失败：提交基线中多个任务外包已有格式问题** |
| `git diff --check`  | 通过                                         |

根格式失败边界：最终复验的 Turbo 首个失败包为 `packages/pixiani`，同时已输出 `apps/gengameconfig`、`apps/victoryani-demo`、`apps/spine2victoryani-demo` 等任务外包的既有格式问题，并取消其它并行检查。task 97 涉及的 game002 与 rendercore 各自 `format:check` 都通过，`agents.md` 与本报告也单独通过 Prettier，因此未越权批量重写无关包。

报告格式检查首次使用 `pnpm exec prettier --check ...` 时，pnpm 因非 TTY 下尝试清理依赖目录而中止；没有产生文件变化。随后直接使用工作区现有 `node_modules/.bin/prettier` 格式化并复检通过。

构建只有既有的大 chunk warning；没有构建错误。game003 的 ts-node experimental/deprecation warning 也不影响通过结果。

## 用户浏览器验收（待执行）

启动命令：

```bash
CI=true pnpm --filter game002 dev -- --host 127.0.0.1 --port 5206
```

脱敏入口：

```text
http://127.0.0.1:5206/?skin=1&gamecode=<GAME_CODE>&token=<TOKEN>&businessid=guest&clienttype=web&jurisdiction=MT&language=en&bet=5&lines=30&times=1&autonums=-1&requestTimeoutMs=30000
```

请至少覆盖：

1. 普通局：initial spin 少于 2 个实际落地 WL；全程无 Nearwin effect，中奖时仍为 unified fall。
2. 期待局：至少 2 个实际落地 WL 且第 2 个不是最后一格；第 2 个 WL 落地时激活但自身无 effect，只有后续格播放 Nearwin1 真实 3 次，之后按 `240ms` stop step 逐格停轴。
3. 期待 cascade：严格观察 `dropdown -> y desc/x asc Nearwin2 sweep once -> y asc/x asc Nearwin1 x3 selective refill spin`，selective stop step 为 `240ms`；同时检查 sparse holes、CN 数字、survivor continuity 与落地 appear。
4. refill 触发期待：initial spin 只有 1 个 WL，普通 unified refill 新落下 WL 后盘面达到 2 个；当前 refill 不倒放 effect，若仍有下一 cascade，必须立即改走期待 cascade 路径。
5. 检查 spin 与 win 压暗均为 `0.5`；压暗开始时全部中奖 symbol 同时开始 win，CN 为 `Win_Start -> Win`，随后才依次 remove/collect；同时检查 effect 居中、scale 1、board 边缘裁切、横竖屏 resize、WL 层级、spinBlur、summary/global amount。
6. 下一合法 spin 开始后不得残留上一轮 anticipation/effect；console 与 WebSocket 无错误，loading 无二次请求或双连接。

不要提交 token、完整 live URL、截图或录屏。完成后可把普通局/期待局是否覆盖、console/WebSocket 与 resize 结果补写到本报告。

## 未完成项、blocker 与风险

- 未完成项：用户指定的真实浏览器验收尚未执行，因此当前不宣告任务 97 全部完成。
- 自动验收 blocker：根 `pnpm format:check` 被任务外、当前提交基线已有格式问题阻塞；task 97 范围内格式门禁通过。
- 风险：真实服务端出局具有随机性，可能需要多次 spin 才能同时覆盖“第 2 个 WL 不是最后格”与“期待局发生 cascade/refill”。不得用 production debug query、mock page 或伪造截图替代。
- 其余代码、资源、测试、发布闭包与文档项：无已知未完成项。

## 首次浏览器反馈修复

用户在期待模式真实运行中观察到：

```text
ReelError: grid cell (5,0) cannot land before its effect completes a real loop.
```

根因确认不是 gate 或 stop order 错误，而是 Spine timeline 使用 Float32：Nearwin2 的 manifest-facing 稳定时长是 `0.4s`，官方 parser 的精确值为 `0.4000000059604645s`。在特定分帧累计下，controller 精确推进 `0.4s` 时还差约 `5.96ns` 才触发官方 completion，landing 的严格断言因此先报错。Nearwin1 同样核对为 `0.6666666865348816s`，其稳定调度值 `0.6666667s` 已覆盖真实边界。

当时的修复保持 `400ms` 视觉/manifest 合同不变，并同时保存稳定调度时长与官方精确时长。effect controller 到达稳定调度边界时，只补入“官方精确值与稳定值之差 + 1ns margin”，仍必须收到 Spine 真实 `loopCompleted` 才释放 player 和允许 landing；没有改为 timer、伪造 completion、删除断言或提前 landing。后续视觉调整把 initial anticipation 改为 Nearwin1，再按最新反馈提升为 3 次真实 loop，因此当前第一枚后续格使用 `2000.0001ms`；Float32 completion 修复继续逐 loop 保护 Nearwin1 与 Nearwin2。

新增真实资源回归以精确断言两个官方 Float32 duration，并用只有推进到 `0.4000000059604645s` 才 completion 的 player 验证 `controller.update(0.4)` 能收到真实 loop edge。修复后重新通过：

- rendercore targeted grid-cell-effect：3/3；
- rendercore 全量：44 files / 284 tests；
- game002 全量：18 files / 90 tests；
- rendercore、game002 的 format、lint、typecheck、build；
- game002 `release:check` 与 static dist exact closure。

## 后续视觉反馈调整

用户确认 symbol JSON 已在本轮基线提交，本轮没有重写或回退这些美术 JSON。按最新反馈完成：

- spin 与 win/cascade 压暗统一为 `0.5`；
- CN 四档官方动画均为 `Collect=0.3333333s`、`End=0.5s`；逐格 collect 按 `y/x` 稳定顺序以 `0.5s` 起播 cadence 推进，不等待前一枚 End/release，全部 active item 与 summary 完成后才结束 coin group；
- 普通 spin 移除 Nearwin；期待 activation 后续格由 Nearwin2 改为 Nearwin1；
- 期待 refill 的空洞 sweep 继续 Nearwin2，selective refill spin 改为 Nearwin1；
- reel manifest 改为动态 effect id 与显式使用点引用，避免再把 `normal/anticipation` 名称当资源语义；
- generic cascade player 新增可选的 emphasis-boundary opening：压暗开始即并行启动所有普通 win、CN `Win_Start` 与 companion win；CN start 完成后可在强调期间进入 Win loop，强调结束后仍稳定 remove/collect 且不重播；
- 同一强调边界的普通组 cash 合并为一次 safe-integer summary increment，避免并行 opening 创建重叠计数器。

最新自动验收：rendercore 44 files / 284 tests、game002 18 files / 90 tests、symbolsviewer 2 files / 17 tests、game003 27 files / 135 tests 全部通过；各自 typecheck/build 通过，game002 release:check 通过；全仓 23/23 lint、test、typecheck、build 通过。根 format:check 仍被多个任务外包的既有格式债务阻塞，最终复验首个失败包为 pixiani。最终浏览器视觉验收继续由用户执行。

## refill 新增 WL 触发期待补充

按用户追加反馈，期待触发不再只限 initial spin。非期待 unified refill 完成时，runtime 使用该 drop plan 的 settled scene 作为既有 occurrence 基线，并按每个 refill movement 的 `startSeconds + fallSeconds + settleSeconds` 排序新增 occurrence；若新增的 paytable exact `WL` 使计数首次达到 manifest `triggerLandedCount=2`，就在目标盘面原子提交的同一边界记录 activation coordinate 并保持期待状态。当前 unified refill 已经完成，因此不倒放 Nearwin/appear；adapter 启动下一 cascade 时读取到 active 状态后，立即选择 `dropdown -> Nearwin2 sweep -> Nearwin1 selective refill spin`。

新增 runtime 回归覆盖“initial spin 只有 1 个 WL -> unified refill 新落 1 个 WL -> 完成前 inactive、完成后 active/count=2/coordinate 为新增格”。最终自动验收数据以本报告后续最新复验结果为准。

## 期待停轴减速与 Nearwin1 三循环补充

按用户最新视觉反馈，期待 initial spin activation 后与期待 selective refill 的逐格 stop step 均从 `120ms` 调整为 `240ms`，只改变期待阶段逐格停轴节奏；普通 initial spin 的 `16ms` stop step、Nearwin2 refill-hole sweep 的 `80ms` stagger 和 reel 内部 `54 symbols/s` 滚动速度保持不变。Nearwin1 manifest `loopCount` 从 `1` 改为 `3`，首个后续格 lead 与 selective refill `settleAfterLastStartMs` 同步改为 `2000.0001ms = 666.6667ms x 3`。

rendercore 的 cell effect loop contract 已由“只能 1 次”扩为“正安全整数”。controller 会把大 delta 切到每个官方 Spine loop boundary，逐次收到真实 `loopCompleted` 后计数，达到请求次数才释放 player 和允许 landing；pool capacity 也按总循环时长推导。Nearwin2 sweep 仍由独立合同固定为 1 次。新增 parser、spin plan、controller 与 game002 runtime 回归覆盖三循环总 lead、`240ms` cadence、跨多 loop update 的真实计数以及非法 0/小数 loopCount 显式失败。

## Coin cadence 与 spin 全亮名单补充

用户浏览器反馈 coin collect 呈现为“两枚一组”。根因是全部 CN 同步进入 `Win` loop 后，原有状态请求虽然每 `0.5s` 发出一次 `Collect`，但 loop 状态会把请求挂到下一真实 loop boundary；同一周期内排队的两枚因此在同一 boundary 一起切换。rendercore 现为 cadence collect 增加通用 immediate transition：每枚在自己的 `0.5s` cadence 边界立即从当前 `Win` loop 切入 `Collect`，未配置 cadence 的普通状态请求仍保持 boundary 语义。`Collect=0.3333333s -> End=0.5s -> release` 的单枚生命周期、尾段重叠、summary drain 与 `y/x` 稳定顺序均未改变。

spin 全亮名单同步从 `WL/CN` 收紧为仅 `WL`；`CN` 与其它实际滚动 occurrence 一样使用 manifest `spin.dimmingAlpha=0.5`，rendercore 仍只消费通用 code resolver，不含 game002 symbol 分支。

本次补充验收：rendercore targeted 20/20、全量 44 files / 286 tests；game002 targeted 13/13、全量 18 files / 90 tests；两包 typecheck、lint、format 均通过，game002 `release:check` 与 static dist exact closure 通过。最终浏览器节奏和观感验收继续由用户执行。

## 期待 spin 临时轮带相位洗牌补充

用户浏览器反馈：期待阶段持续时间增长且只有 WL 保持全亮后，同列格子里的 WL 会形成稳定的空间传播轨迹，看起来像轮子在停轴前反向滚动。核对确认六列本地公开轮带长度均为 `77` 且每列只有一个 WL；此前固定 `rowOffsetStep=16` 与 cell 自身 `y` 合成固定有效相位 `17*y mod 77`，不是逐格随机起点，因此长时间高亮观察会暴露等差关系。

本次保持本地公开轮带、正向运动、速度、timing 与服务端目标窗口覆盖不变，只把固定相位改成 rendercore 通用的 `createShuffledGridCellReelOffsetMatrix()`：每列使用 partial Fisher-Yates，从完整 reel phase 中为同列 9 格无重复抽取相位；只洗 phase，不洗 symbol 顺序。game002 在 initial spin 和期待 selective refill spin 每次重新生成，并使用独立 `spinPhaseRandom`；production 默认来自 Web Crypto，不消费服务器 randomNumbers、全局 `Math.random` 或 CN presentation random。最终浏览器是否消除反向错觉继续由用户验收。

本次补充验收：rendercore 全量 `45 files / 288 tests`、game002 全量 `18 files / 93 tests`；两包 lint、format、typecheck 均通过，game002 `release:check` 与 static dist exact closure 通过；根级 typecheck `23/23` 通过，`git diff --check` 通过。最终浏览器观感验收继续由用户执行。
