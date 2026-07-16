# game002 cascade win summary and coin collect 任务报告

## 1. 执行结论

任务 96 的代码、资源 manifest、生成器、fixture、单元测试、类型检查、构建、game002 静态发布检查、文档和协作规则同步已经完成，任务范围内自动验收全部通过。

用户第一次浏览器检查暴露的三类问题也已修正：CN/WL 混合中奖被错误拒绝、spin 中 CN 偶发空白、CN 长期停留在 Win loop。用户随后明确的金额单位也已改为 result `cashWin64/cashWin` cents，并统一除以 `100` 显示。

整体状态仍为 **待用户最终浏览器复验**。按用户要求，本次不代替用户执行最终浏览器验收；在用户确认真实局视觉前，不宣告任务 96 全部完成。

## 2. 环境与工作区

- 开始 UTC：`2026-07-16T03:39:11Z`
- 最后一轮自动验收结束 UTC：`2026-07-16T05:03:57Z`
- branch：`main`
- 起止 HEAD：`a443419 -> a443419`（未提交）
- Node.js：`v24.14.0`；pnpm：`11.7.0`
- 初始工作区：用户提供的任务计划文件未跟踪；没有覆盖或清理用户改动。
- 最终工作区：仅包含任务 96 的源码、测试、manifest、文档、规则、计划和本报告；没有 `dist/`、`coverage/`、`node_modules/`、token、截图或临时日志进入 Git 状态。
- 未使用代理，未执行依赖安装。
- 非 TTY 的一次 pnpm 调用曾触发 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，随后按合同使用 `CI=true` 原命令通过，没有修改 production 行为。

## 3. 最终实现

### 3.1 通用 cascade 编排

rendercore manifest/parser 新增通用 `additionalStateDefinitions`、manifest-derived state preset 和 `cascadeWinPresentation`。普通组和 sequential collect 组均由 manifest 的 `order/mode/state` 驱动；rendercore 不硬编码 `CN`、`WL`、`bg-win`、game002 或具体 Spine animation 名。

当前 game002-s3 CN 流程为：

```text
全部 CN 同时 Win_Start once
-> 全部 CN 进入 Win loop
-> 按 y、再按 x 逐枚 Collect once
-> 对应 cash cents 计入 summary
-> End once
-> release 并消失
-> 下一枚
```

未轮到的 CN 保持 Win loop。每个 CN 继续复用自身 value tier 的同一个官方 Spine player 与真实 `Num` slot；没有 app 私有 Spine track、第二个播放器、数字 sibling overlay、超时强制完成或提前 release。

### 3.2 WL companion

服务端允许 WL 出现在 CN coin 中奖位置中。game002 现在通过 app-owned predicate 显式批准 WL 为 sequential companion：WL 与全部 CN 的 start 同时播放自身 win，等待完成后回 normal，不贡献 coin/value/cash、不进入 Win loop、Collect、End、remove 或 drop。其它不兼容 presentation 混用仍在 spin reel 启动前显式失败。

这修复了：

```text
game002 step[3] group[0] position (2,4) symbol WL has an incompatible cascade presentation
```

### 3.3 spin 压暗与特殊 symbol 偶发空白

普通 spin 的压暗值现在只从 `assets/game002-s3/reel.manifest.json` 的必填 `spin.dimmingAlpha` 读取，当前为 `0.6`。WL/CN 保持全亮；cascade 中奖强调仍独立使用 `0.82`，两套配置没有合并或重复硬编码。

截图里的绿色空格不是 grid mask/剪裁矩形造成的。根因是 CN value-presentation tier 的官方 Spine player 异步初始化：当 spin 已切到 `spinBlur` 后，较晚完成的 init 仍无条件隐藏 state texture，于是部分 CN 格表现为空白；是否发生取决于加载完成时序，因此具有偶发性。

修复后：

- 显式请求的 reel state texture（例如 `spinBlur`）优先于等价 normal active Spine；
- late init 只在 active Spine 确实是当前 presentation 时隐藏 base/state texture；
- inactive player view 保持隐藏；
- 切回 normal 后仍恢复 tier Spine 与 Num slot。

回归测试覆盖了 init 完成前后 `spinBlur` 均持续可见，以及回 normal 后 active Spine 恢复。

### 3.4 Win loop 卡死

卡死由两个连续状态问题共同造成：官方 Spine 封装原本只上报 once completion，不上报 loop 边界；同时 normal/Win loop 复用同一 active Spine timeline 时保留了旧的 semantic playback，导致 pending Collect 永远无法在真实 loop 边界落地。

现在官方 player 会脉冲上报 `loopCompleted`，`RenderSymbol` 在复用相同 player/时间轴时会同步新的 state/playback 语义。这样 Win loop 不被 reset/replay，pending Collect 又能在下一个真实 loop boundary 进入 Collect。

### 3.5 cash summary 与金额单位

临时 summary 严格读取每个 result：

```text
cashWin64 !== undefined ? cashWin64 : cashWin
```

选中值必须是 positive safe integer cents，并复用 `formatServerUsdAmount` 除以 `100` 显示两位小数。没有 truthy fallback、bet/lines 换算、component total 或 totalwin 兜底。

普通组在请求 win 的同一边界计入整组 cash cents。CN 仍用每格 raw coin value 校验服务端 coin 结果，再按：

```text
itemCash = itemCoin * groupCash / groupCoin
```

精确分配 result cash cents；必须为 positive safe integer 且整除，否则在 spin 前失败。CN 的 raw coin 不再直接作为 summary 显示金额。

主 fixture 的内部 cents 与显示序列为：

```text
0 -> 180 -> 210 -> 220 -> 240 -> 290
hidden -> $1.80 -> $2.10 -> $2.20 -> $2.40 -> $2.90
```

其中 CN result 的 raw coin `1+2+5=8`，result cash 为 `80 cents`，逐枚精确分配为 `10+20+50 cents`。

## 4. 主要修改面

### rendercore

- `packages/rendercore/src/symbol/manifest.ts`
- `packages/rendercore/src/symbol/types.ts`
- `packages/rendercore/src/symbol/render-symbol.ts`
- `packages/rendercore/src/symbol/spine-animation.ts`
- `packages/rendercore/src/spine/runtime-player.ts`
- `packages/rendercore/src/symbol-value-presentation/render-symbol-value-controller.ts`
- `packages/rendercore/src/reel/manifest.ts`
- `packages/rendercore/src/symbol-cascade/create-symbol-cascade-player.ts`
- `packages/rendercore/src/symbol-cascade/cumulative-win-summary.ts`
- `packages/rendercore/src/symbol-cascade/types.ts`
- 对应 parser、player、value controller、Spine、summary、generator 回归测试

### game002 与资源

- `assets/game002-s3/reel.manifest.json`
- `assets/game002-s3/symbol-state-textures.manifest.json`
- `apps/game002/src/cascade-win-summary-config.ts`
- `apps/game002/src/cascade-config.ts`
- `apps/game002/src/cascade-sequence.ts`
- `apps/game002/src/game-adapter.ts`
- `apps/game002/src/game-demo.ts`
- `apps/game002/src/game-layout.ts`
- `apps/game002/src/skin-config.ts`
- `apps/game002/scripts/verify-static-dist.mjs`
- fixture 与相应 game002 测试

### 相邻消费面与文档

- symbolsviewer 的 manifest state/resource/sequence 消费与测试
- `packages/rendercore/README.md`
- `apps/game002/README.md`
- `apps/symbolsviewer/README.md`
- `agents.md`
- 任务计划与本报告

game002 和 symbolsviewer 的 symbol-value resource closure 已重新生成并检查，无内容漂移。

## 5. 自动验收

| 范围                                                        | 结果                                     |
| ----------------------------------------------------------- | ---------------------------------------- |
| rendercore `format:check/lint/test/typecheck/build`         | 全部通过；43 files、277 tests            |
| game002 `format:check/lint/test/typecheck/build`            | 全部通过；18 files、84 tests             |
| game002 `release:check`                                     | 通过，`game002 static dist check passed` |
| symbolsviewer `format:check/lint/test/typecheck/build`      | 全部通过；2 files、17 tests              |
| game002 / symbolsviewer resource generation + closure check | 通过；各 18 个资源，无漂移               |
| root `lint/typecheck/build`                                 | 全部通过；23/23 packages                 |
| `git diff --check`                                          | 通过                                     |

### 独立基线阻塞

1. `pnpm --filter game003 test`：15 files passed / 12 failed、73 tests passed / 4 failed。失败均是当前 game003 Spine `4.2.43` 与 rendercore `4.3.x` 唯一 runtime 合同不匹配。用户已确认 game003 最终会更换为 Spine 4.3，本任务没有恢复 4.2 runtime 或增加 fallback；game003 typecheck/build 通过。
2. root `pnpm test`：22/23 package tasks 通过，仅复现同一个 game003 4.2.43 阻塞。
3. root `format:check`：被未修改的 `apps/reelsviewer`、`apps/victoryani-demo`、`apps/buildgamestatic` 既有格式债务阻塞；任务涉及包的 package-local format checks 全部通过。

上述失败没有通过修改任务外代码、降低 production 合同或增加 fallback 掩盖。

## 6. 第二遍遗漏审计

- protocol：cash/coin 字段存在性优先、safe integer、CN item coin sum、cash 精确分配与累计总和均有正反测试。
- preflight：WL companion、其它 mixed presentation、缺 capability/value、cash 不整除等错误均在 reel mutation 前失败。
- runtime：summary 跨 group、fall、step 保留；全部 cascade 后、global win-amount 前清理；win-amount 期间 reel runtime 继续逐帧更新。
- cleanup：initial、next spin、complete、error、destroy 都清理 summary、state 和遗留 presentation。
- generated/release：manifest additional states、CN 四档真实 animation、loop flag、resource closure 与静态发布均已检查。
- shared/app：rendercore 没有 game002 symbol/component/金额语义硬编码；app 没有直接操作 Pixi children 或 Spine track。
- worktree：`git diff --check` 通过；没有生成目录、敏感信息、浏览器截图或临时日志进入 Git 状态。

## 7. 用户最终浏览器复验

本轮不代用户执行。启动命令：

```bash
CI=true pnpm --filter game002 dev -- --host 127.0.0.1 --port 5206
```

使用脱敏参数模板：

```text
http://127.0.0.1:5206/?skin=1&gamecode=<GAME_CODE>&token=<TOKEN>&businessid=guest&clienttype=web&jurisdiction=MT&language=en&bet=5&lines=30&times=1&autonums=-1&requestTimeoutMs=30000
```

请重点复验：

1. 连续多次 spin：非 WL/CN 的滚动 occurrence 压暗为 `0.6`；WL/CN 始终全亮且任何时刻都不出现绿色空格，尤其观察不同 CN 分档和数字。
2. 含 CN 的中奖组：全部 CN 同时 Win_Start，然后共同 Win loop；之后严格逐枚 Collect -> End -> 消失，未轮到的 CN 继续 loop，不再无限卡住。
3. CN 中奖位置含 WL：WL 与 CN start 同时播放自身 win，随后回 normal，不 collect、不消失、不参与 summary。
4. summary：使用 result `cashWin64/cashWin`，除以 `100` 显示两位小数；每枚 Collect 时增加该枚分配到的 cash cents，而不是直接增加 coin 面值。
5. fall/后续 step 保留累计；global win-amount 前 summary 清除；下一 spin 无残影或重复累计。
6. resize 后 summary 仍位于轮子下方正中，Num 图片跟随 Spine slot；console 和 WebSocket 无新错误。

## 8. 未完成项与风险

- 未完成：用户负责的 game002 live 浏览器最终复验。
- 已知独立事项：game003 等待 Spine 4.3 资源替换；根 format 仍有任务外既有债务。
- 真实 Spine 视觉、Num slot 跟随和 live WebSocket 只能由浏览器真实局最终确认。用户复验通过后，任务 96 才能标记为全部完成。
