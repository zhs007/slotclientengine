# 258 minecart2 BO reel collector 状态效果执行报告

## 结果

- 执行时间：2026-08-27T09:02:31Z
- engine 分支：`codex/task-258-minecart2-bo-reel-collector-state-effects`
- engine 基线：`cff56a3e41be21bedfa962799ce20ae4285fc431`
- Minecart2 工作区：`/Users/zerro/gitee.com/piximinecart2`，基线 `9b6b4da6d6479f3de9f3f6c79e3eb3f5ae4fae89`，保留在用户现有 `rgs` 分支，未替用户提交。
- 执行期间该外部工作区 HEAD 前进到无关版本提交 `ab104d842aa8ba9557497da980c2df11dcd67e17`（`chore: bump version to 1.0.17 in package.json`）；本任务保留该提交，13 个 Minecart2 改动继续作为未提交工作区 diff 叠加其上。
- 现有 RenderCore exact Spine playback、managed clone/motion 和 particle trail API 足够承载本任务；engine shared package 无源码变化，只提交任务计划与执行证据。

## Collector 合同

- runtime config 私有版本升级到 7，新增唯一 `reel-collect` node binding、`0..100` value 范围、三个普通档位及 bonus-only state 3 的 exact 动画 binding。
- 普通累计映射固定为 `0 -> state 0`、`1..14 -> state 1`、`15..100 -> state 2`；value 不会把 collector 升到 state 3，也没有恢复旧的 30 阈值。
- adapter 根据 launch 固定的 active bet/lines 读取 persisted `bg-collector.value`。undefined、null、空 envelope、空 public JSON，以及缺少当前 lines/bet/component 条目都表示该下注档尚未玩过，按值 0 初始化且不借用其它下注档数据；当前下注档条目已存在但 malformed 或 value 越界时显式失败。
- BO round 必须携带 exact `bg-collector`；compiler 把 `val` 作为收集后值、`newCollector` 作为本轮增量，严格验证增量等于 BO 数量、old/new 范围、state 不倒退且普通回合最多跨一档，并把证据固化进 BO immutable payload。
- 初始持续动画使用 exact `0_Ilde/1_Ilde/2_Ilde`。普通同档播放收集后档位的 `Squib -> Ilde`，普通跨档播放新档位的 `Collect -> Ilde`。
- 只有 BO operation 带 exact `cg-initbn` evidence 时进入 bonus-only state 3，固定播放 `3_Collect -> Full -> Full_Loop`；collector first-loop 完成后才允许后续 BonusGame entry 执行。没有使用 `Full_Idle`、animation alias 或 manifest default `play()` fallback。

## BO 粒子与生命周期

- 从旧 CO handler 抽出单一 app-local collection particle helper；BO 与两种 CO collection 共用 exact `256-co-gold-particle-128` resource 和任务 257 的全部参数。
- 每个 BO owned clone mount 后创建一条跟随 self anchor 的 trail，全部 BO 继续按原 0.32 秒曲线并行飞向转轮顶部中心上方 117 像素。
- BO 到达后立即 stop emission 并移除 clone；collector 状态序列与残余粒子自然 drain 并行开始，operation 在 collector first-loop 和所有 trail settle 后才批量提交 `-1/-1` holes。
- playback、drain 或 mutation 失败会恢复未提交 BO 的可见性；collector 已成功切到新状态但 hole mutation 未提交时恢复旧档 exact Idle。presentation scope 负责 hard cleanup 未正常 drain 的 clone/trail，全部并发 Promise 都会收敛。
- landing、CO collection、wins、award、BO collection、BonusGame/BaseGame transition 的相对顺序、BO motion/output 和 server 请求未改变。

## 文件

- Minecart2 config/runtime：`config/game-runtime.manifest.json`、`src/config.ts`、`src/main.ts`、`src/round-compiler.ts`、`src/round-adapter.ts`、`src/coin-collection.ts`。
- 新增 app-local helper：`src/collector-presentation.ts`、`src/collection-particle-trail.ts`。
- Tests：`tests/collector-presentation.test.ts`、`tests/round-compiler.test.ts`、`tests/round-adapter.test.ts`、`tests/source-boundary.test.ts`；既有 `tests/coin-collection.test.ts` 无需修改且继续通过，证明 CO 参数与生命周期未回归。
- 文档：`apps/minecart2/README.md`。

## 自动验收

通过：

- `pnpm --filter minecart2 test`：初次 10 files、110 tests passed；按浏览器反馈补充“当前下注档缺少条目按 0”回归后，10 files、111 tests passed。
- Collector/round compiler/round adapter/CO collection/source-boundary 定向 Vitest：5 files，71 tests passed；随后新增 drain 并发 barrier 用例单独通过。
- 修改文件定向 ESLint。
- `pnpm --filter minecart2 build`，包括既有 prepare dependency chain 与 Minecart2 production Vite build。
- 修改文件 Prettier check、Minecart2 `git diff --check` 和旧命名搜索。

已最小化的基线阻断：

- `pnpm --filter minecart2 typecheck` 中，本任务文件没有诊断；命令仍被既有 `packages/bridgecore` 与 `packages/device-detector` 的 NodeNext 相对 import extension 诊断阻断，另有 `bridgecore/src/services/bridge/session.ts` 两个既有隐式 `any`。
- build 仍输出既有 `post.svg` runtime resolution 和大 chunk warning，不影响成功退出。

## 待用户浏览器验收

- 浏览器人工验收按用户要求由用户接管，当前标记为待完成。
- 重点确认 persisted value 0/1/14/15/100 分别持续在正确 exact Ilde；用户样例 old 6 -> val 7 无 bonus 为 `1_Squib -> 1_Ilde`；14 -> 15 为 `2_Collect -> 2_Ilde`；15 以上增长为 `2_Squib -> 2_Ilde`。
- bonus 样例必须完整显示 `3_Collect -> Full -> Full_Loop`，`Full_Loop` 持续后才进入 BonusGame；确认不会播放 `3_Ilde` 或不存在的 `Full_Idle`。
- 多 BO 时确认每个 clone 都有与 CO 一致的金色 trail，collector 每 round 只响应一次；横竖屏、低帧率、连续 spin 与失败退出时无硬切、残影、粒子或对象增长。
