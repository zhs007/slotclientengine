# gameclientcli 接入 logiccore 玩法统计任务计划

## 1. 任务目标

在现有 `apps/gameclientcli` RTP 抽样 CLI 中接入 `packages/logiccore`，让 CLI 在完成指定次数 spin 后，除现有 RTP 统计外，还能输出通用的游戏玩法细节统计。

本计划是可直接执行版本，不依赖额外上下文。执行者只需要阅读本文件，即可完成代码修改、测试、README 更新、验收和任务报告。

核心目标：

- `apps/gameclientcli` 增加对 `@slotclientengine/logiccore` 的 workspace 依赖。
- 每次 spin 后使用 `logiccore` 解析 `spin()` 返回的 `gmi`，把协议数据转成 `GameLogic`。
- 在 CLI 最终输出中增加玩法统计，至少覆盖：
  - 组件触发概率。
  - spin 获奖概率。
  - step 获奖概率。
  - result 命中概率。
  - result 通用字段分布，例如 `type`、`symbol`、`lineIndex`、`symbolNums`。
  - step 数量分布。
  - 当前游戏模块 `curGameMod` 分布。
- 统计逻辑必须通用，不允许硬编码任何特定组件名、特定游戏名、特定 symbol 语义或特定玩法名称。
- 保留现有 RTP CLI 的 fail-fast 风格：协议结构异常、`logiccore` 解析失败、状态异常、统计数据异常都必须中断，不允许吞错继续 spin。
- 更新 `apps/gameclientcli/README.md`，说明新玩法统计能力、运行方式、统计口径和错误策略。
- 任务完成后，在 `tasks/` 下新增中文任务报告，文件名为 `17-add-logiccore-stats-to-gameclientcli-[utctime].md`，其中 `utctime` 使用年月日时分秒格式，例如 `260401-181300`。

## 2. 当前仓库事实

当前仓库可确认事实如下：

- 根仓库是 `pnpm` + `turbo` TypeScript monorepo。
- Node.js 要求为 `>=24.0.0`。
- `pnpm-workspace.yaml` 已匹配 `apps/*` 与 `packages/*`。
- 根级基础工具链包含 `typescript`、`vite`、`vitest`、`eslint`、`prettier`、`ts-node`、`turbo`。
- `apps/gameclientcli` 已存在，包名是 `gameclientcli`。
- `apps/gameclientcli` 当前通过 `@slotclientengine/netcore` 的 `SlotcraftClient` 连接服务器并执行 RTP 抽样。
- `apps/gameclientcli/src/rtp-runner.ts` 当前核心流程是：
  - `connect()`
  - `enterGame()`
  - 等待或整理到 `ConnectionState.IN_GAME`
  - 循环调用 `client.spin()`
  - 必要时 `collect()`
  - 累加 `RtpStatsAccumulator`
  - 输出最终 RTP、余额差异等统计。
- `apps/gameclientcli/src/stats.ts` 当前只负责 RTP 统计。
- `apps/gameclientcli/src/types.ts` 当前定义 `SpinOutcome`、`RtpRunSummary`、`RtpStatsSnapshot` 等类型。
- `apps/gameclientcli/README.md` 当前只说明 RTP 抽样，不包含玩法统计。
- `apps/gameclientcli/tests/rtp-runner.test.ts` 当前 fake `spinResult()` 只构造了极简 `gmi.replyPlay.results`，没有 `defaultScene`、`randomNumbers`、`clientData`、`curGameModParam` 等 `logiccore` 必需字段。接入 `logiccore` 后，这类旧测试 fixture 会失败；应改测试 fixture 为合法 `gamemoduleinfo.gmi`，不要为了兼容旧测试而放宽生产解析。
- `packages/logiccore` 已由任务 16 完成，包名是 `@slotclientengine/logiccore`。
- `@slotclientengine/logiccore` 当前导出：
  - `createGameLogic(message)`
  - `createGameLogicFromGmi(gmi, meta)`
  - `GameLogicModel`
  - `GameLogicStepModel`
  - `LogicCoreError`
  - `LogicParseError`
  - `GameLogic`、`GameLogicStep`、`LogicComponent`、`WinResult` 等类型。
- `logiccore` 采用严格解析策略：关键字段缺失、scene 结构非法、索引越界、组件映射异常会抛错，不会把异常协议静默转换成空数组或 0。
- 根级协作文件实际路径是 `agents.md`。只有当本任务改变仓库级协作规则、目录规范或基础脚本时，才需要同步更新 `agents.md`。

## 3. 统计口径定义

本任务必须先固定统计口径，避免实现时把“概率”的分母混用。

### 3.1 spin 级统计

分母：`completedSpins`。

每次成功完成并计入 RTP 的 spin，必须同时计入玩法统计。

必须输出：

- `completedSpins`：样本 spin 数。
- `winningSpins`：`logic.getTotalWin() > 0` 的 spin 数。
- `winningSpinProbability`：`winningSpins / completedSpins`。
- `zeroWinSpins`：`logic.getTotalWin() === 0` 的 spin 数。
- `zeroWinSpinProbability`：`zeroWinSpins / completedSpins`。
- `multiStepSpins`：`logic.getStepCount() > 1` 的 spin 数。
- `multiStepSpinProbability`：`multiStepSpins / completedSpins`。
- `spinWithAnyResult`：任意 step 的 `step.getResultCount() > 0` 的 spin 数。
- `spinWithAnyResultProbability`：`spinWithAnyResult / completedSpins`。
- `spinWithAnyComponent`：任意 step 中存在触发 component 的 spin 数。
- `spinWithAnyComponentProbability`：`spinWithAnyComponent / completedSpins`。
- `winMultiplierDistribution`：按 `logic.getTotalWin() / stakePerSpin` 统计中奖倍数区间分布。默认区间必须通用，例如 `0`、`(0,1)`、`[1,5)`、`[5,10)`、`[10,50)`、`[50,+∞)`；不要按具体游戏或具体组件定制。

`stakePerSpin` 必须沿用 RTP 公式中的 `bet * lines * times`，不得另起一套口径。

### 3.2 step 级统计

分母：`totalSteps`，即所有 spin 的 `logic.getStepCount()` 总和。

必须输出：

- `totalSteps`：总 step 数。
- `avgStepsPerSpin`：`totalSteps / completedSpins`。
- `stepWinCount`：`step.getCashWin() > 0 || step.getCoinWin() > 0` 的 step 数。
- `stepWinProbability`：`stepWinCount / totalSteps`。
- `stepWithResultCount`：`step.getResultCount() > 0` 的 step 数。
- `stepWithResultProbability`：`stepWithResultCount / totalSteps`。
- `stepWithComponentCount`：当前 step 的 `historyComponents` 非空的 step 数。
- `stepWithComponentProbability`：`stepWithComponentCount / totalSteps`。
- `stepCountDistribution`：每个 spin 的 step 数分布，例如 `1 step: 930`、`2 steps: 60`、`3 steps: 10`。

如果 `totalSteps` 为 0，所有 step 级概率输出 0，并在输出中明确分母为 0；不要抛出数学除零错误，也不要把分母偷偷改成 1。

### 3.3 组件触发统计

组件名来自每个 step 的 `curGameModParam.historyComponents`，只能动态读取，不能硬编码任何组件名。

分母至少包含两个维度：

- spin 级分母：`completedSpins`。
- step 级分母：`totalSteps`。

每个组件名必须输出：

- `triggeredSpins`：有至少一个 step 触发该组件的 spin 数。
- `spinTriggerProbability`：`triggeredSpins / completedSpins`。
- `triggeredSteps`：触发该组件的 step 数。
- `stepTriggerProbability`：`triggeredSteps / totalSteps`。
- `totalTriggers`：组件触发总次数。若同一 step 的 `historyComponents` 中同一名称重复出现，重复项必须计入 `totalTriggers`，同时在报告中标出重复触发行为。
- `winsWhenTriggered`：触发该组件的 step 中，`cashWin > 0 || coinWin > 0` 的 step 数。
- `winProbabilityWhenTriggered`：`winsWhenTriggered / triggeredSteps`。
- `cashWinWhenTriggered`：触发该组件的 step 的 `cashWin` 累计值。
- `coinWinWhenTriggered`：触发该组件的 step 的 `coinWin` 累计值。
- `avgCashWinWhenTriggered`：`cashWinWhenTriggered / triggeredSteps`。
- `avgCoinWinWhenTriggered`：`coinWinWhenTriggered / triggeredSteps`。
- `withBasicComponentData`：触发时组件数据包含明文 `basicComponentData` 的次数。
- `withoutBasicComponentData`：触发时组件数据没有明文 `basicComponentData` 的次数。
- `usedSceneCount`：通过 `logiccore` 映射到的 scene 数累计。
- `usedResultCount`：通过 `logiccore` 映射到的 result 数累计。

要求：

- 组件触发判断必须以 `historyComponents` 为准。
- 必须通过 `step.getComponent(name)`、`step.getComponentScenes(name)`、`step.getComponentResults(name)` 使用 `logiccore` 读取组件和映射数据。
- 如果 `logiccore` 因组件缺失、索引越界或结构异常抛错，CLI 必须中断，不允许跳过该组件。
- 如果组件没有明文 `basicComponentData`，按 `logiccore` 当前语义记录 `withoutBasicComponentData`，不伪造 used scene/result。
- `triggeredSteps` 和 `winsWhenTriggered` 按 step 去重计数。同一 step 内同名组件重复出现时，该组件的 `triggeredSteps` 只加 1，`winsWhenTriggered` 最多加 1，`totalTriggers` 按重复出现次数累加。

### 3.4 result 获奖统计

分母包含两个维度：

- spin 级分母：`completedSpins`。
- result 级分母：`totalResults`，即所有 step 的 `step.getResultCount()` 总和。

必须输出：

- `totalResults`：所有 step 的 win result 总数。
- `avgResultsPerSpin`：`totalResults / completedSpins`。
- `avgResultsPerStep`：`totalResults / totalSteps`。
- `cashWinResultCount`：`result.cashWin` 是有限数字且大于 0 的 result 数。
- `cashWinResultProbability`：`cashWinResultCount / totalResults`。当 `totalResults` 为 0 时输出 0，并明确分母为 0。
- `coinWinResultCount`：`result.coinWin` 是有限数字且大于 0 的 result 数。
- `coinWinResultProbability`：`coinWinResultCount / totalResults`。当 `totalResults` 为 0 时输出 0，并明确分母为 0。

必须按以下通用字段做分布统计：

- `result.type`
- `result.symbol`
- `result.lineIndex`
- `result.symbolNums`

每个字段的分布统计都必须包含：

- `resultCount`：该字段取值出现于 result 的次数。
- `resultProbability`：`resultCount / totalResults`。
- `spinCount`：至少出现一次该字段取值的 spin 数。
- `spinProbability`：`spinCount / completedSpins`。

字段处理要求：

- 不允许给缺失字段补 0、空字符串或默认枚举。
- 如果字段缺失，计入该字段的 `missingCount`。
- 如果字段存在但不是可稳定展示的 primitive 值，例如对象或数组，计入该字段的 `invalidCount`，并在输出中展示。
- `missingCount`、`invalidCount` 也必须输出对应概率，分母为 `totalResults`；并输出对应的 spin 级计数，表示有多少个 spin 至少出现过该字段缺失或非法。
- 可稳定展示的字段值包括 string、number、boolean、null。
- number 必须是有限数字；`NaN`、`Infinity`、`-Infinity` 计入 `invalidCount`。

如果 `totalResults` 为 0，所有 result 级概率输出 0，并在输出中明确分母为 0；不要抛出数学除零错误，也不要把分母偷偷改成 1。

### 3.5 curGameMod 分布

分母：`totalSteps`。

必须输出：

- 每个 `step.getCurGameMod()` 值出现的 step 数。
- 每个值的 `stepProbability`。
- 缺失 `curGameMod` 的 step 数。

该统计只能按实际字符串动态分组，不允许写死具体模块名。

## 4. 输出格式要求

现有 RTP 输出必须保留。新增玩法统计应在 `最终统计` 后追加一个清晰区块，例如：

```text
玩法统计
completedSpins: 1000
winningSpins: 342
winningSpinProbability: 0.342
winningSpinPercent: 34.2%
zeroWinSpins: 658
zeroWinSpinProbability: 0.658
multiStepSpins: 71
multiStepSpinProbability: 0.071
totalSteps: 1085
avgStepsPerSpin: 1.085
totalResults: 418
avgResultsPerSpin: 0.418
winMultiplier[0]: 658
winMultiplier[(0,1)]: 210
winMultiplier[1,5): 104

组件触发统计
name triggeredSpins spinTriggerPercent triggeredSteps stepTriggerPercent winsWhenTriggered winPercentWhenTriggered avgCashWinWhenTriggered withBasicComponentData withoutBasicComponentData usedSceneCount usedResultCount
...

result.type 分布
value resultCount resultPercent spinCount spinPercent
...
missingCount invalidCount missingSpinCount invalidSpinCount

result.symbol 分布
value resultCount resultPercent spinCount spinPercent
...

result.lineIndex 分布
value resultCount resultPercent spinCount spinPercent
...

result.symbolNums 分布
value resultCount resultPercent spinCount spinPercent
...

curGameMod 分布
value stepCount stepPercent
...

step 数量分布
steps spinCount spinPercent
...
```

格式要求：

- 文本输出可以用空格表、冒号行或 Markdown 风格表，但测试必须能稳定断言关键行。
- 百分比保留 4 位小数，沿用现有 RTP 进度输出的习惯。
- 概率小数可以保留原始 number 或最多 6 位小数，但 README 需要说明。
- 动态分组表默认按计数降序排列；计数相同按展示值字典序升序排列，保证测试稳定。
- 当某个统计表没有数据时，必须输出明确的空状态，例如 `无组件触发` 或 `无 result`，不能静默省略整段。

## 5. CLI 行为要求

### 5.1 命令入口

原有命令继续可用：

```bash
pnpm --filter gameclientcli build
pnpm --filter gameclientcli start -- --spins 1000
```

本任务不要求新增必填参数。`--spins 1000` 应能在最终输出中看到 RTP 统计和玩法统计。

如果为了控制长时间运行的输出噪音，可以新增可选参数：

```text
--progress-interval <positive-integer>
```

若新增该参数：

- 默认值必须保持现有行为，即每次 spin 都输出进度。
- `--progress-interval 100` 表示每 100 次输出一次进度，最后一次必须输出。
- 参数非法必须报错中断。
- `README.md` 和 `tests/cli.test.ts` 必须同步更新。

除非实现者确认现有 1000 行 spin 进度不会影响使用体验，否则建议增加该参数。

### 5.2 fail-fast 策略

以下情况必须中断并以非 0 退出码结束：

- `@slotclientengine/logiccore` 解析 `gmi` 失败。
- `logic.getStepCount()` 与 `validateSpinOutcome()` 校验过的 `replyPlay.results.length` 不一致。
- `logic.getTotalWin()` 与 `validateSpinOutcome()` 校验过的 `totalwin` 不一致。
- `logic.getBet()` 或 `logic.getLines()` 与本次请求不一致。
- 统计 accumulator 接收到非有限数字、负计数、非法概率分母等异常。
- 读取组件、组件 scene 或组件 result 时 `logiccore` 抛错。

不要为了让抽样继续跑而 catch 后跳过异常 spin。遇到数据异常时，错误越早暴露越好。

### 5.3 与现有 RTP 逻辑的关系

- 现有 `RtpStatsAccumulator` 继续只负责 RTP。
- 新增玩法统计建议放在新文件 `apps/gameclientcli/src/gameplay-stats.ts`。
- `runRtp()` 中每次 `validateSpinOutcome()` 成功后，立即把该 spin 传给玩法统计 accumulator。
- 必须保证只有已经成功计入 RTP 的 spin 才计入玩法统计，避免 RTP 样本数和玩法统计样本数不一致。
- 如果后续 `collect()` 或状态整理失败，本次 spin 是否已经计入统计会影响最终输出；当前 CLI 在异常时不会输出最终统计，因此允许保持“先统计后 collect”的流程，但任务报告必须说明这一点。

## 6. 推荐代码改动

### 6.1 package 依赖和构建脚本

更新 `apps/gameclientcli/package.json`：

- 在 `dependencies` 中加入：

```json
"@slotclientengine/logiccore": "workspace:*"
```

- 将现有 `prepare:netcore` 扩展为内部依赖构建脚本，例如：

```json
"prepare:deps": "pnpm --filter @slotclientengine/netcore build && pnpm --filter @slotclientengine/logiccore build",
"build": "pnpm run prepare:deps && tsc -p tsconfig.json",
"dev": "pnpm run prepare:deps && ts-node src/index.ts",
"test": "pnpm run prepare:deps && vitest run --coverage",
"typecheck": "pnpm run prepare:deps && tsc -p tsconfig.json --noEmit"
```

也可以保留 `prepare:netcore`，另加 `prepare:logiccore`，但最终 `build`、`dev`、`test`、`typecheck` 必须确保两个内部依赖都已构建。

注意：

- 如果修改 `package.json` 后 lockfile importer 需要更新，执行 `pnpm install`。
- 如果依赖下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
pnpm install
```

### 6.2 新增玩法统计模块

新增 `apps/gameclientcli/src/gameplay-stats.ts`。

建议导出：

```ts
export interface GameplayStatsSnapshot { ... }
export class GameplayStatsAccumulator {
  addSpin(outcome: SpinOutcome, request: SpinRequestConfig, gameid?: number): GameplayStatsSnapshot;
  snapshot(): GameplayStatsSnapshot;
}
export function outputGameplayStats(snapshot: GameplayStatsSnapshot, output: OutputSink): void;
```

`addSpin()` 内部流程：

1. 调用 `createGameLogicFromGmi(outcome.gmi, meta)`。
2. 校验 `logic.getStepCount()`、`logic.getTotalWin()`、`logic.getBet()`、`logic.getLines()` 与当前 spin 上下文一致。
3. 遍历 `logic.getSteps()`。
4. 动态读取每个 step 的：
   - `getCoinWin()`
   - `getCashWin()`
   - `getResultCount()`
   - `getResults()`
   - `getCurGameMod()`
   - `getCurGameModParam()`
5. 从 `step.getCurGameModParam()` 中读取 `historyComponents`：
   - 必须校验是 string 数组。
   - 对每个 name 调用 `step.getComponent(name)`、`step.getComponentScenes(name)`、`step.getComponentResults(name)`。
   - 不允许直接越过 `logiccore` 去手写 usedScenes/usedResults 映射。
6. 更新 spin 级、step 级、component 级、result 级、curGameMod、stepCount 分布。

说明：

- `meta` 必须由当前 spin 上下文显式构造，至少包含：

```ts
{
  bet: request.bet,
  lines: request.lines,
  totalwin: outcome.totalwin,
  gameid,
}
```

- 不要依赖 `outcome.gmi.bet` / `outcome.gmi.lines` 一定存在。当前 `validateSpinOutcome()` 只在 `gmi.bet` / `gmi.lines` 存在时校验它们与请求一致；`logiccore` 的 `createGameLogicFromGmi()` 需要从 `meta` 读取 `bet`、`lines`、`totalwin`。
- `stakePerSpin` 必须复用或等价调用现有 `calculateStakePerSpin(request)`，确保中奖倍数分布和 RTP 分母一致。
- 概率计算必须通过一个小的显式 helper，例如 `divideOrZero(numerator, denominator, label)`。当 denominator 为 0 时返回 0，并让输出层展示分母为 0；不要散落手写除法。
- `addSpin()` 必须先在局部变量中完整解析并计算本次 spin 的增量，全部校验通过后再提交到 accumulator 内部状态。不要在解析一半后直接修改累计 Map 或计数器，避免异常 spin 污染统计。
- `GameLogicStep` 当前没有直接暴露 `getHistoryComponents()`。为了不修改 `logiccore` API，本任务可以从 `step.getCurGameModParam()` 的原始对象中严格读取 `historyComponents`。
- 只有当执行中发现 `logiccore` 缺少必要通用 API，且直接读 raw 会造成重复协议解析或类型风险时，才允许扩展 `packages/logiccore`。如果扩展，必须同步更新 `packages/logiccore/README.md` 和测试。

### 6.3 类型更新

更新 `apps/gameclientcli/src/types.ts`：

- 增加玩法统计 snapshot 类型，或从 `gameplay-stats.ts` 导入。
- 扩展 `RtpRunSummary`，例如：

```ts
export interface RtpRunSummary extends RtpStatsSnapshot {
  initialBalance: number;
  finalBalance: number;
  balanceDelta: number;
  gameplay: GameplayStatsSnapshot;
}
```

如果担心影响现有测试，可在测试中明确断言 `summary.gameplay.completedSpins` 等关键字段，避免新增字段无人验证。

### 6.4 runner 集成

更新 `apps/gameclientcli/src/rtp-runner.ts`：

- import `GameplayStatsAccumulator` 和输出函数。
- 在创建 `RtpStatsAccumulator` 的位置同时创建 `GameplayStatsAccumulator`。
- 每次 spin 中：

```ts
const outcome = validateSpinOutcome(result, config.spin);
const rtpSnapshot = stats.addSpin(outcome.totalwin, outcome.results);
const gameplaySnapshot = gameplayStats.addSpin(outcome, config.spin, client.getUserInfo().gameid);
```

- 最终 summary 包含 `gameplay: gameplayStats.snapshot()`。
- `outputFinalSummary()` 后追加 `outputGameplayStats(summary.gameplay, output)`。
- `--verbose` 现有输出可以保留；如有必要可额外输出当次 step 数、result 数、组件数，但不要默认打印所有组件详情，避免 1000 spin 时输出过量。

### 6.5 README 更新

更新 `apps/gameclientcli/README.md`：

- 在简介中说明 CLI 现在同时输出 RTP 和 logiccore 玩法统计。
- 在安装和构建部分说明内部依赖包含：
  - `@slotclientengine/netcore`
  - `@slotclientengine/logiccore`
- 增加运行示例：

```bash
pnpm --filter gameclientcli build
pnpm --filter gameclientcli start -- --spins 1000
```

如果实现了 `--progress-interval`：

```bash
pnpm --filter gameclientcli start -- --spins 1000 --progress-interval 100
```

- 增加“玩法统计口径”章节，说明：
  - spin 级概率分母是 `completedSpins`。
  - step 级概率分母是 `totalSteps`。
  - component spin 触发概率分母是 `completedSpins`。
  - component step 触发概率分母是 `totalSteps`。
  - result 分布的 result 概率分母是 `totalResults`，spin 概率分母是 `completedSpins`。
  - 缺失字段不会补默认值，会计入 missing/invalid。
- 增加“通用性约束”章节，说明统计不依赖具体组件名，所有 component、curGameMod、result 字段取值都按实际协议动态分组。
- 增加“错误中断策略”内容，说明 `logiccore` 解析失败会直接中断。

### 6.6 agents.md 判断

本任务预计不需要更新根级 `agents.md`，因为只修改 `apps/gameclientcli` 的能力、README、测试和 package 依赖，不改变仓库协作规则、目录规范或根级基础脚本。

但执行者必须在最终任务报告中写明：

- 是否更新了 `agents.md`。
- 如果没有更新，说明原因。
- 如果实现中确实改变了仓库级规则或根级基础脚本，则必须同步更新 `agents.md`。

## 7. 测试计划

### 7.1 gameplay-stats 单元测试

新增 `apps/gameclientcli/tests/gameplay-stats.test.ts`。

至少覆盖：

- 单 spin、单 step、无 result、无 component：
  - `completedSpins = 1`
  - `winningSpins = 0`
  - `totalSteps = 1`
  - `totalResults = 0`
  - 输出空 component/result 状态。
- 单 spin、单 step、有 win result：
  - `winningSpinProbability = 1`
  - `stepWinProbability = 1`
  - `totalResults` 正确。
  - `result.type`、`result.symbol`、`result.lineIndex`、`result.symbolNums` 分布正确。
  - `winMultiplierDistribution` 使用 `bet * lines * times` 作为分母，区间归类正确。
  - fixture 必须是 `logiccore` 可解析的完整最小 GMI：包含 `defaultScene`、`replyPlay.randomNumbers`、step `coinWin` / `cashWin`、`clientData.scenes`、`clientData.results`、`clientData.curGameModParam.historyComponents`、`clientData.curGameModParam.mapComponents`。
- 多 spin、多 step：
  - `avgStepsPerSpin` 正确。
  - `multiStepSpinProbability` 正确。
  - `stepCountDistribution` 正确。
- 动态组件名：
  - fixture 使用任意名称，例如 `ComponentA`、`ComponentB`。
  - 测试不能依赖生产代码硬编码这些名称。
  - `triggeredSpins`、`triggeredSteps`、`spinTriggerProbability`、`stepTriggerProbability` 正确。
- 同一 spin 多个 step 触发同一组件：
  - `triggeredSpins` 只计 1。
  - `triggeredSteps` 按 step 计数。
  - `totalTriggers` 按出现次数计数。
- 组件无明文 `basicComponentData`：
  - `withoutBasicComponentData` 正确。
  - `usedSceneCount`、`usedResultCount` 不被伪造。
- result 字段缺失或非法：
  - 缺失字段计入 `missingCount`。
  - 对象、数组、非有限数字计入 `invalidCount`。
  - 缺失和非法字段的 result 概率、spin 级计数正确。
  - 不补 0。
  - 测试中的 result 仍必须满足 `logiccore` 对 `WinResult` 的基础要求，例如保留合法 `pos: number[]`。只把待统计字段做成缺失或非法，避免测试失败原因混成 `logiccore` 基础解析失败。
- `totalSteps = 0` 或 `totalResults = 0` 的边界：
  - 概率输出 0。
  - 输出文本明确分母为 0。
  - 不出现 `NaN`、`Infinity`、除零异常或偷偷把分母改成 1。
- `logiccore` 解析失败：
  - `addSpin()` 抛错。
  - 不更新 accumulator 内部统计，避免半次 spin 污染结果。

建议在 `apps/gameclientcli/tests/fixtures/` 下新增最小 fixture，避免依赖 `packages/logiccore/tests/fixtures` 这类测试内部路径。

### 7.2 rtp-runner 集成测试

更新 `apps/gameclientcli/tests/rtp-runner.test.ts`。

至少覆盖：

- fake client 返回带 component/result 的 `gmi` 时，`runRtp()` 返回 `summary.gameplay`。
- 更新现有 fake `spinResult()` 或新增 helper，让默认 fake 返回 `logiccore` 可解析的完整最小 GMI。旧的极简 fake GMI 只能保留在“解析失败应中断”的测试里。
- 最终 output 中包含 `玩法统计`、`组件触发统计`、`result.type 分布` 等关键标题。
- fake 运行 1000 spin 时：
  - `summary.completedSpins = 1000`
  - `summary.gameplay.completedSpins = 1000`
  - 概率和分布稳定。
- `logiccore` 解析失败时：
  - `runRtp()` reject。
  - 不继续后续 spin。
  - 错误信息包含解析失败原因。
- 如果新增 `--progress-interval`，覆盖进度输出频率。

### 7.3 CLI 参数测试

如果新增或修改 CLI 参数，更新 `apps/gameclientcli/tests/cli.test.ts`。

至少覆盖：

- `--spins 1000` 正常解析。
- 若新增 `--progress-interval`：
  - 正整数正常。
  - 缺值、0、负数、小数、非数字报错。
- 现有参数行为不回退。

### 7.4 README 与输出快照

不要求做完整快照测试，但测试必须覆盖输出函数的关键文本，确保 README 中描述的主要区块实际存在。

## 8. 验收命令

执行者必须运行以下命令，并把结果写入任务报告。

如果依赖安装或 workspace lockfile 更新需要联网，先尝试：

```bash
pnpm install
```

如果失败，再执行代理后重试：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
pnpm install
```

局部验收：

```bash
pnpm --filter @slotclientengine/logiccore build
pnpm --filter gameclientcli lint
pnpm --filter gameclientcli test
pnpm --filter gameclientcli typecheck
pnpm --filter gameclientcli build
```

如果本任务扩展了 `packages/logiccore` 的 API 或实现，局部验收必须升级为：

```bash
pnpm --filter @slotclientengine/logiccore lint
pnpm --filter @slotclientengine/logiccore test
pnpm --filter @slotclientengine/logiccore typecheck
pnpm --filter @slotclientengine/logiccore build
pnpm --filter gameclientcli lint
pnpm --filter gameclientcli test
pnpm --filter gameclientcli typecheck
pnpm --filter gameclientcli build
```

根级验收：

```bash
pnpm lint
pnpm test
pnpm typecheck
pnpm build
git diff --check
```

真实服务器 smoke test：

```bash
pnpm --filter gameclientcli start -- --spins 1000
```

如果实现了 `--progress-interval`，可使用：

```bash
pnpm --filter gameclientcli start -- --spins 1000 --progress-interval 100
```

真实服务器 smoke test 依赖本地网络、DNS、证书、远端服务器状态、账号余额和 token 状态。如果失败：

- 不要为了绕过失败修改统计语义。
- 在任务报告中记录完整命令、错误原文和判断。
- 仍必须通过 fake client 的 1000 spin 自动测试来证明统计逻辑可运行。

## 9. 完成报告要求

任务完成后，新增：

```text
tasks/17-add-logiccore-stats-to-gameclientcli-[utctime].md
```

报告必须包含：

- 任务背景。
- 实际修改文件列表。
- 新增或修改的 CLI 参数。
- `@slotclientengine/logiccore` 接入方式。
- 玩法统计的最终输出字段和分母说明。
- 是否硬编码特定组件名的审计结论。
- README 更新说明。
- 所有验收命令和结果。
- 真实服务器 `--spins 1000` smoke test 的执行结果；如果失败，记录错误原文。
- 是否更新 `agents.md`，以及原因。
- 二次审计结论。

## 10. 二次审计清单

在提交最终报告前，必须再做一遍检查：

- `apps/gameclientcli` 已依赖 `@slotclientengine/logiccore`，并且构建脚本会先构建内部依赖。
- 每次计入 RTP 的 spin 都计入玩法统计。
- 玩法统计没有硬编码任何具体 component 名称。
- component 触发判断来自 `historyComponents`。
- 组件 used scene/result 通过 `logiccore` 读取，没有在 CLI 里重复实现索引映射。
- `logiccore` 解析失败会中断 CLI，不会跳过异常 spin。
- gameplay accumulator 对单次 spin 的统计提交是原子式的：解析和增量计算全部成功后才修改累计状态。
- result 字段缺失不会补默认值，会暴露 missing/invalid 计数。
- `totalSteps = 0`、`totalResults = 0` 时概率口径明确，不输出 `NaN` 或 `Infinity`。
- 中奖倍数分布使用 `bet * lines * times`，与 RTP 分母一致。
- 概率分母在 README、代码和测试中一致。
- 1000 spin 的 fake 自动测试存在。
- `apps/gameclientcli/README.md` 已说明新统计能力和运行示例。
- 未引入不必要的兜底或静默失败。
- 如新增空目录，已放置 `.keepme`。
- 如改变仓库协作规则、目录规范或基础脚本，已同步更新 `agents.md`；否则报告中说明无需更新。
