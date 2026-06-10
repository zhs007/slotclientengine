# gameclientcli 接入 logiccore 玩法统计任务报告

## 任务背景

本任务按 `tasks/17-add-logiccore-stats-to-gameclientcli.md` 执行，在 `apps/gameclientcli` 现有 RTP 抽样 CLI 中接入 `@slotclientengine/logiccore`，让每次成功计入样本的 spin 同时输出通用玩法统计。

实现保持 fail-fast：`logiccore` 解析失败、组件映射异常、统计分母异常、`bet` / `lines` / `totalwin` / step 数与当前 spin 上下文不一致都会中断 CLI，不跳过异常 spin。

## 实际修改文件

- `apps/gameclientcli/package.json`
- `apps/gameclientcli/README.md`
- `apps/gameclientcli/src/gameplay-stats.ts`
- `apps/gameclientcli/src/rtp-runner.ts`
- `apps/gameclientcli/src/types.ts`
- `apps/gameclientcli/src/config.ts`
- `apps/gameclientcli/src/cli.ts`
- `apps/gameclientcli/vitest.config.ts`
- `apps/gameclientcli/tests/gameplay-stats.test.ts`
- `apps/gameclientcli/tests/fixtures/logic-gmi.ts`
- `apps/gameclientcli/tests/rtp-runner.test.ts`
- `apps/gameclientcli/tests/cli.test.ts`
- `pnpm-lock.yaml`
- `tasks/17-add-logiccore-stats-to-gameclientcli-260610-035925.md`

## CLI 参数变化

新增可选参数：

```text
--progress-interval <positive-integer>
```

- 默认值为 `1`，保持原行为：每次 spin 输出进度。
- 设置为 `100` 时，每 100 次输出一次进度，最后一次 spin 一定输出。
- 缺值、`0`、负数、小数、非数字都会报错中断。

## logiccore 接入方式

- `apps/gameclientcli` 增加 workspace 依赖：`@slotclientengine/logiccore`。
- `prepare:deps` 会先构建 `@slotclientengine/netcore` 和 `@slotclientengine/logiccore`，`build` / `dev` / `test` / `typecheck` 都使用该前置脚本。
- 新增 `GameplayStatsAccumulator`，每次 spin 在 `validateSpinOutcome()`、必要 collect、状态回到 `IN_GAME` 后，先用 `createGameLogicFromGmi(outcome.gmi, meta)` 解析并统计玩法，再提交 RTP accumulator。
- `meta` 显式使用当前请求的 `bet`、`lines` 和 `outcome.totalwin`，不依赖 `gmi.bet` / `gmi.lines` 必然存在。
- 组件判断来自 `step.getCurGameModParam().historyComponents`，组件数据、used scenes、used results 通过 `step.getComponent(name)`、`step.getComponentScenes(name)`、`step.getComponentResults(name)` 读取。
- 本任务没有扩展 `packages/logiccore` API。

## 玩法统计字段与分母

spin 级分母：`completedSpins`。

- `winningSpins` / `winningSpinProbability`
- `zeroWinSpins` / `zeroWinSpinProbability`
- `multiStepSpins` / `multiStepSpinProbability`
- `spinWithAnyResult` / `spinWithAnyResultProbability`
- `spinWithAnyComponent` / `spinWithAnyComponentProbability`
- `winMultiplierDistribution`

中奖倍数分母沿用 RTP 口径：

```text
stakePerSpin = bet * lines * times
winMultiplier = totalwin / stakePerSpin
```

默认区间：`0`、`(0,1)`、`[1,5)`、`[5,10)`、`[10,50)`、`[50,+∞)`。

step 级分母：`totalSteps`。

- `avgStepsPerSpin`
- `stepWinCount` / `stepWinProbability`
- `stepWithResultCount` / `stepWithResultProbability`
- `stepWithComponentCount` / `stepWithComponentProbability`
- `stepCountDistribution`

component 统计分母：

- spin 触发概率：`triggeredSpins / completedSpins`
- step 触发概率：`triggeredSteps / totalSteps`
- 触发后中奖概率：`winsWhenTriggered / triggeredSteps`

同一 step 内同名组件重复出现时，`triggeredSteps` 和 `winsWhenTriggered` 按 step 去重，`totalTriggers` 按出现次数累计，并输出 `duplicateTriggerSteps` / `duplicateTriggers`。

result 统计分母：

- result 级概率：`totalResults`
- spin 级概率：`completedSpins`

覆盖字段：`result.type`、`result.symbol`、`result.lineIndex`、`result.symbolNums`。缺失字段进入 `missingCount`，对象、数组、非有限数字等不可稳定展示值进入 `invalidCount`，不补默认值。

`curGameMod` 分布分母：`totalSteps`，缺失值输出为 `<missing>`。

当 `totalSteps` 或 `totalResults` 为 `0` 时，相关概率输出 `0`，并在输出中显示 `stepProbabilityDenominator: 0` 或 `resultDenominator: 0`。

## 通用性与硬编码审计

- 没有硬编码任何具体组件名、游戏名、symbol 语义或玩法名称。
- 动态分组表按计数降序、计数相同时按展示值升序排序，保证输出稳定。
- 组件名称只来自协议 `historyComponents`。
- used scene/result 没有在 CLI 中手写索引映射，全部走 `logiccore` API。

## README 更新

`apps/gameclientcli/README.md` 已补充：

- CLI 同时输出 RTP 和 logiccore 玩法统计。
- 内部依赖包含 `@slotclientengine/netcore` 与 `@slotclientengine/logiccore`。
- `--progress-interval` 示例和参数说明。
- 玩法统计分母口径、missing/invalid 字段策略、通用性约束。
- `logiccore` 解析失败和组件读取失败会中断 CLI。

## 验收命令

依赖和 lockfile：

```bash
pnpm install
```

结果：通过。

局部验收：

```bash
pnpm --filter @slotclientengine/logiccore build
pnpm --filter gameclientcli lint
pnpm --filter gameclientcli test
pnpm --filter gameclientcli typecheck
pnpm --filter gameclientcli build
```

结果：全部通过。其中 `gameclientcli test` 为 5 个 test files、64 个 tests 通过。

根级验收：

```bash
pnpm lint
pnpm test
pnpm typecheck
pnpm build
git diff --check
```

结果：全部通过。`pnpm build` 中存在既有 Vite chunk size warning，但命令退出码为 0。

## 真实服务器 smoke test

任务计划原建议：

```bash
pnpm --filter gameclientcli start -- --spins 1000 --progress-interval 100
```

沙箱内首次执行失败，错误原文：

```text
gameclientcli 执行失败：netcore logger.error: WebSocket error observed: {}
```

提权后真实服务器可连接。后续按用户最新指示“测试时可以不用 1k 这么多，100 即可”，最终 smoke test 使用：

说明：提权后的 1000-spin 验证曾正常运行到 `spin 200/1000`；收到用户最新指示后已停止该进程，最终验收记录以 100-spin smoke 为准。

```bash
pnpm --filter gameclientcli start -- --spins 100 --progress-interval 100
```

结果：通过，退出码 0。关键输出：

```text
spin 100/100: totalwin=100, totalStake=10000, totalWin=512650, rtp=5126.5000%
最终统计
completedSpins: 100
totalStake: 10000
totalWin: 512650
rtp: 51.265
rtpPercent: 5126.5
玩法统计
completedSpins: 100
winningSpins: 75
totalSteps: 108
totalResults: 133
组件触发统计
result.type 分布
curGameMod 分布
step 数量分布
```

该 smoke 输出验证了最终统计后追加玩法统计，且区间展示为 `winMultiplier[1,5)`、`winMultiplier[5,10)` 等单层括号格式。

## agents.md

未更新 `agents.md`。

原因：本任务只修改 `apps/gameclientcli` 能力、测试、README 和 package 依赖，不改变仓库级协作规则、目录规范或根级基础脚本。

## 二次审计结论

- `apps/gameclientcli` 已依赖 `@slotclientengine/logiccore`。
- `build` / `dev` / `test` / `typecheck` 会先构建 netcore 与 logiccore。
- 每次成功计入 RTP 的 spin 都先通过玩法统计解析，避免 `logiccore` 失败时先污染 RTP accumulator。
- 玩法统计没有硬编码特定 component 名称。
- component 触发判断来自 `historyComponents`。
- 组件 used scene/result 通过 `logiccore` 读取。
- `logiccore` 解析失败会中断 CLI，不跳过异常 spin。
- gameplay accumulator 采用 clone 后提交，单次 spin 解析或统计中途失败不会污染内部累计状态。
- result 字段缺失和非法值会暴露为 missing/invalid，不补默认值。
- `totalSteps = 0`、`totalResults = 0` 已有测试覆盖，不输出 `NaN` 或 `Infinity`。
- 中奖倍数分布使用 `bet * lines * times`，与 RTP 分母一致。
- README、代码、测试中的概率分母一致。
- fake client 1000 spin 自动测试存在并通过。
- 未新增空目录。
- 未更新 `agents.md` 的原因已记录。

## 追加复查 260610-041152

收到“仔细检查一遍，确保没有遗漏”后，追加执行以下复查：

- `git diff --check`：通过。
- `pnpm --filter gameclientcli test`：通过，5 个 test files、64 个 tests 通过。
- `pnpm --filter gameclientcli typecheck`：通过。
- `pnpm --filter gameclientcli lint`：通过。
- `pnpm --filter gameclientcli build`：通过。
- 复查 1000-spin smoke 会话：已在用户改口后中止，工具回收结果为 `Command failed with signal "SIGTERM"`，符合预期，没有继续后台运行。
- 搜索生产代码中的硬编码组件/玩法名：未发现。`SpinPay`、`ComponentA`、`scatter` 等仅存在于测试 fixture；生产代码中的固定 gamecode 是既有默认配置。
- 搜索 `createGameLogicFromGmi`、`historyComponents`、`getComponent()`、`getComponentScenes()`、`getComponentResults()`、`missingCount`、`invalidCount`、`divideOrZero`、`cloneState`、`this.state = next`：确认玩法统计仍通过 logiccore 解析和组件 API，且异常 spin 不会半提交累计状态。
