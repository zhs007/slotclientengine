# 257 minecart2 bg-bar coin 无 CL 收集执行报告

## 结果

- 执行时间：2026-08-27T07:10:27Z
- engine 分支：`codex/task-257-minecart2-bg-bar-coin-feature-collection`
- engine 基线：`d44b2c547902490f106349a790854e402e4db3f5`
- Minecart2 工作区：`/Users/zerro/gitee.com/piximinecart2`，基线 `1be21c57830894421ef35d2ee909d840a965bbd4`，保留在用户现有 `rgs` 分支，未替用户提交。
- 本任务不需要扩展 `logiccore` 或 `rendercore`：任务 256 已提供的 managed symbol clone、字体数字、移动与粒子 trail typed API 能完整承载新流程，因此 engine 只记录任务计划和执行证据，没有同步 shared package 源码。

## 行为实现

- `bg-bar` 的 `curFeature=coin` 且存在 exact `bg-coinwins2` 时，compiler 在 landing 后、普通 symbol wins 前生成独立 `game003:coin-feature-collect` state mutation。
- 从落地 snapshot 按列优先收集全部 exact `CO`；每枚 CO value 必须是正安全整数，数量和合计必须分别与 `symbolNum`、component `wins`、basic `coinWin` 严格一致。
- 服务器偶发返回的 `CL` 不参与本流程，也不会被清除或改变状态；若 `bg-coinwins2` 与旧的 `bg-coinwins` 同时出现，则在画面 mutation 前显式失败，避免重复消费 CO。
- 转轮下方创建单一字体计数器，初始 0 使用空字符串不显示。每枚 CO 串行执行 `win -> normal clone 飞行 -> end + 数字递增`；到达后立即把原盘面位置提交为 `-1/-1` hole。
- 所有 CO 到达后移除计数器，等待残余粒子自然消散，再开始普通 symbols 获奖；后续 award、BO、mode transition 和下一次 spin 均消费去除 CO 后的 snapshot。
- 浏览器真实 `coin + bg-addbo` 响应确认 BO collection 会继承前序 CO holes；BO handler 现在只检查本轮 payload 指定的 BO positions 是 canonical `-1/-1`，不再扫描或限制其它坐标。
- 异常时 presentation scope 清理 clone、计数器和 trail；尚未提交为 hole 的原 CO 恢复可见，已经提交的 mutation 不回滚。

## 粒子调整

- 新流程与任务 256 的 CL/CO 流程共用同一 exact 粒子资源和 trail 配置，不复制第二套效果。
- 首轮 48 粒子、72 粒子/秒、16–36 px 经浏览器确认仍不明显；当前强效果校准值提高为单 emitter 最多 96 粒子、180 粒子/秒、28–64 px。寿命仍为 0.32–0.55 秒，视觉通过后再从 versioned config 往回调。
- 不再限制同时 emitting/draining 的 trail 数量；任意前序 trail 的自然消散都不会阻塞下一枚 CO，全部 CO 完成后统一等待所有 trail drain。正常完成只停止发射并自然 drain，abort/失败才 hard cleanup。

## 文件

- Minecart2 runtime：`src/round-compiler.ts`、`src/round-adapter.ts`、`src/coin-collection.ts`、`src/config.ts`。
- Minecart2 versioned config：`config/game-runtime.manifest.json`。
- Minecart2 tests/fixtures：`tests/round-compiler.test.ts`、`tests/coin-collection.test.ts`、`tests/source-boundary.test.ts`、`tests/fixtures/game003-gmi.ts`。
- 文档：`apps/minecart2/README.md`。

## 自动验收

通过：

- 定向 Vitest：5 files，69 tests passed。
- Minecart2 全量 Vitest：9 files，99 tests passed（含 `bg-spin -> bg-addbo -> bg-addjk` latest initial，以及 coin collection 与 BO collection 同轮串行和 inherited holes 回归）。
- `pnpm --filter minecart2 build`。
- Minecart2 `git diff --check`。
- 构建后工作区仅保留预期的 10 个 Minecart2 源码、配置、测试和 README 修改，没有生成额外 tracked 文件。

已最小化的基线阻断：

- `pnpm --filter minecart2 typecheck` 中，本任务文件没有诊断；命令仍被既有 `packages/bridgecore` 和 `packages/device-detector` 的 NodeNext 相对 import extension 诊断阻断，另有 `bridgecore/src/services/bridge/session.ts` 两个既有隐式 `any`。

## 待用户浏览器验收

- 浏览器人工验收由用户接管，当前标记为待完成。
- 重点确认：计数器位于转轮区下方且初始 0 不显示；CO 依次播放 win、normal 飞行、end 和平滑增数；偶发 CL 完全被忽略；最后 CO 位置为空；普通 symbol wins 必须等计数器消失和 trail drain 后才开始。
- 同时确认任务 256 的旧 CL/CO 流程也使用放大、增密后的粒子，横竖屏、低帧率和连续 spin 下无明显掉帧、粒子硬切或残留对象。
