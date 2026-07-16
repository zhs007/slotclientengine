# 任务 97：game002 Nearwin 期待与 refill 执行报告

## 执行概况

- 开始 UTC：`2026-07-16T05:39:08Z`（首个可追溯文件写入；盘点动作早于该时间，终端未保留首条时间戳）
- 结束 UTC：`2026-07-16T06:22:26Z`（包含首次真实浏览器反馈后的修复）
- 分支：`main`
- 起止 HEAD：`338ce50ba0ef45cb6fa077b4f04b21d6437b5732`（未提交，因此起止相同）
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
| `Nearwin1.json` | `4.3.23` | `Loop`    |      `0.6666667s` |        `1` |
| `Nearwin2.json` | `4.3.23` | `Loop`    |            `0.4s` |        `1` |

普通时序公式保持：

```text
firstStopAtMs = (54 - 1) * 16 + 180 = 1028
lastStopAtMs  = 1028 + (54 - 1) * 16 = 1876
```

期待模式在第 2 个真实落地的 `WL` 同一 update 边界激活；该格仍是 Nearwin1。下一格从 trigger landing 后预留 `400ms` 播完 Nearwin2，之后 stop step 为 `120ms`。每格均校验 `stopAtMs - effectStartAtMs` 足以容纳官方 duration、loop count 和 finish gap，不加速、不截断、不使用 timer completion。

### rendercore 通用能力

- 新增独立的 grid-cell effect resource resolver 与 bounded/prepared Spine player pool；pool 容量由实际 schedule 推导，当前 normal 为 `42`、anticipation 为 `5`。
- effect layer 位于 symbol 上方，但全组只复用一个完整 board rectangle mask；没有 per-player mask、DOM、canvas 或独立 renderer。
- 官方 Spine player 暴露 parser 得到的 animation duration；player 只在真实 `loopCompleted` 后释放，landing 前会断言真实 loop 已完成。
- grid-cell spin plan 支持通用 effect schedule、activation gate 和分段 stop；gate 只与真实 landed edge 绑定，rendercore 不知道 `WL`、Nearwin 文件名或 game002。
- `RenderGridCellReelSet.update()` 返回真实 started/landed edge，并保证 activation edge 只发一次；effect 启停、landing 和 gate boundary 在 timeline slice 中精确推进。
- 新增通用 effect sweep、existing-only dropdown plan，并复用既有 selective grid-cell spin；普通 unified fall 保持原路径。
- reset、error、destroy 都清理 active/pooled effect，生命周期和 pool 越界均 fail fast。

### game002 业务接入

- app 使用 paytable code -> symbol resolver 后的 exact `symbol === "WL"` 构造初始 presentation gate；只统计初始 spin 的真实 landed edge，不统计初始画面、未落地目标、cascade、refill 或 win result。
- anticipation state 在初始 spin 停完后继续跨 win/remove/cascade/refill/global win-amount 保留；下一次合法 initial spin 真正进入 runtime 后原子清除。非法 preflight、error、initial scene 与 destroy 不留下状态或效果。
- 非期待 cascade 继续原有 unified fall，不 spin、不 appear。
- 期待 cascade 严格分为：`existing-only dropdown -> Nearwin2 sweep -> selective refill spin`。
- sweep 对 refill positions 的副本按 `y desc / x asc` 排序，start step `80ms`，允许重叠并等待最后一个真实 loop 完成。
- selective refill 对副本按 `y asc / x asc` 排序，仅 empty holes 使用本地公开轮带；stop step `120ms`，每格 Nearwin2 后 landing，再走既有 manifest-driven appear。
- survivor occurrence/player/value 不替换；CN refill 继续使用 sequence 预解析的服务端 raw value，既有 CN 随 occurrence 搬运；WL fixed、renderPriority、完整 board mask 合同未改。
- win-amount 阶段仍逐帧 update reel runtime。

事件级测试证据覆盖了 normal unified path 与 anticipation split path，包括 `initial-spin`、`step-win-remove`、`cascade-unified-fall`、`cascade-dropdown`、`refill-sweep`、`refill-spin`、`finalizing/win-amount`，并覆盖 zero-movement dropdown、稀疏 holes、状态跨阶段保留和 next-spin clear。

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
packages/rendercore/tests/background/runtime-player.test.ts
packages/rendercore/tests/reel/grid-cell-cascade-plan.test.ts
packages/rendercore/tests/reel/grid-cell-effect.test.ts（新增）
packages/rendercore/tests/reel/grid-cell-spin-plan.test.ts
packages/rendercore/tests/reel/manifest.test.ts
packages/rendercore/tests/reel/render-grid-cell-reel-set.test.ts
tasks/97-game002-nearwin-anticipation-refill-260716-061103.md（新增）
```

`AGENTS.md` 与 `agents.md` 的 inode 均为 `30967274`，协作规则已同步覆盖普通 unified fall、期待 split refill、Nearwin1/2 独立 reel-effect 边界、真实第 2 个 WL trigger、持久化与清理合同。game002 README 和 rendercore README 同步完成。

## 自动验收结果

以下命令均实际执行。

### 任务相关包

| 命令                                                       | 结果                                                                       |
| ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| `pnpm --filter @slotclientengine/rendercore format:check`  | 通过                                                                       |
| `pnpm --filter @slotclientengine/rendercore lint`          | 通过                                                                       |
| `pnpm --filter @slotclientengine/rendercore typecheck`     | 通过                                                                       |
| `pnpm --filter @slotclientengine/rendercore build`         | 通过                                                                       |
| `pnpm --filter @slotclientengine/rendercore test`          | 44 files / 283 tests 通过；coverage statements `88.13%`、branches `80.02%` |
| `pnpm --filter game002 generate:symbol-value-resources`    | 通过，18 resources                                                         |
| `pnpm --filter game002 check:symbol-value-resources`       | 通过                                                                       |
| `pnpm --filter game002 format:check`                       | 通过                                                                       |
| `pnpm --filter game002 lint`                               | 通过                                                                       |
| `pnpm --filter game002 typecheck`                          | 通过                                                                       |
| `pnpm --filter game002 build`                              | 通过                                                                       |
| `pnpm --filter game002 test`                               | 18 files / 89 tests 通过；coverage statements `86.32%`、branches `81.36%`  |
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

根格式失败边界：Turbo 首个失败包为 `apps/gengameconfig`，同时输出还列出 `packages/pixiani`、`apps/reelsviewer`、`apps/spine2pixiani-demo` 等任务外文件。初始 working tree 为 clean，说明这些是当前提交基线中的格式债务，不是 task 97 改动；本任务涉及的 game002 与 rendercore 各自 `format:check` 都通过，因此未越权批量重写无关包。

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

1. 普通局：initial spin 少于 2 个实际落地 WL；每格 Nearwin1 一次，effect 消失后 landing，无 Nearwin2；中奖时仍为 unified fall。
2. 期待局：至少 2 个实际落地 WL 且第 2 个不是最后一格；第 2 个 WL 仍用 Nearwin1，落地后才出现 Nearwin2，后续 120ms 逐格停轴。
3. 期待 cascade：严格观察 `dropdown -> y desc/x asc Nearwin2 sweep -> y asc/x asc selective refill spin`，包括 sparse holes、CN 数字、survivor continuity 与落地 appear。
4. 检查 effect 居中、scale 1、board 边缘裁切、横竖屏 resize、WL 层级、spinBlur、win/remove/summary/global amount。
5. 下一合法 spin 开始后不得残留上一轮 anticipation/effect；console 与 WebSocket 无错误，loading 无二次请求或双连接。

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

修复保持 `400ms` 视觉/manifest 合同不变，并同时保存稳定调度时长与官方精确时长。effect controller 到达稳定调度边界时，只补入“官方精确值与稳定值之差 + 1ns margin”，仍必须收到 Spine 真实 `loopCompleted` 才释放 player 和允许 landing；没有改为 timer、伪造 completion、删除断言或提前 landing。

新增真实资源回归以精确断言两个官方 Float32 duration，并用只有推进到 `0.4000000059604645s` 才 completion 的 player 验证 `controller.update(0.4)` 能收到真实 loop edge。修复后重新通过：

- rendercore targeted grid-cell-effect：3/3；
- rendercore 全量：44 files / 283 tests；
- game002 全量：18 files / 89 tests；
- rendercore、game002 的 format、lint、typecheck、build；
- game002 `release:check` 与 static dist exact closure。
