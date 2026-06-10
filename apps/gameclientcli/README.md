# gameclientcli

`gameclientcli` 是一个用于真实游戏服务器 RTP 抽样和通用玩法统计的 Node CLI。它通过 `@slotclientengine/netcore` 暴露的 `SlotcraftClient` 完成登录、进入游戏、spin、collect 和状态读取，并通过 `@slotclientengine/logiccore` 严格解析每次 spin 返回的 `gmi`，不手写底层 WebSocket 协议，也不绕过 logiccore 重做组件 scene/result 映射。

## 默认宏配置

| 配置            | 默认值                                       |
| --------------- | -------------------------------------------- |
| server url      | `wss://gameserv.rgstest.slammerstudios.com/` |
| gamecode        | `CqbQ0Y7gtBpO5419j8h02`                      |
| token           | `3a820433c341f7932d6654c4f16147a2`           |
| businessid      | `guest`                                      |
| jurisdiction    | `MT`                                         |
| clienttype      | `web`                                        |
| language        | `en`                                         |
| bet             | `10`                                         |
| lines           | `10`                                         |
| times           | `1`                                          |
| autonums        | `-1`                                         |
| request timeout | `30000ms`                                    |

默认每次 spin 发送：

```text
bet=10 lines=10 times=1 autonums=-1
```

如果服务器认为下注或线数不合法，CLI 会直接报错中断，不会自动切换到服务器允许的其他值。

## 安装和构建

```bash
pnpm install
pnpm --filter gameclientcli build
```

构建、测试、类型检查和开发运行会先构建内部依赖：

```text
@slotclientengine/netcore
@slotclientengine/logiccore
```

如果依赖下载失败，可先设置代理：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
pnpm install
```

## 运行

`--spins` 是必填参数，必须是正整数：

```bash
pnpm --filter gameclientcli build
pnpm --filter gameclientcli start -- --spins 100
pnpm --filter gameclientcli start -- --spins 1000 --progress-interval 100
```

可选覆盖参数：

```text
--url <wss-url>
--gamecode <gamecode>
--token <token>
--bet <positive-number>
--lines <positive-integer>
--times <positive-integer>
--request-timeout-ms <positive-integer>
--progress-interval <positive-integer>
--verbose
```

覆盖值会打印在启动摘要中。本 CLI 不从环境变量隐式覆盖默认宏配置。
`--url` 必须是合法的 `ws://` 或 `wss://` 地址。
`--progress-interval` 默认为 `1`，表示每次 spin 都输出进度；设置为 `100` 时，每 100 次输出一次，最后一次 spin 总会输出。

## 输出字段

启动后会输出服务器、gamecode、spins、bet、lines、times、autonums 和 request timeout。登录并进入游戏后，会输出 `pid`、`nickname`、`currency` 和初始 `balance`。

每次 spin 会输出当前进度、当次 `totalwin`、累计下注、累计赢分和当前 RTP。`--verbose` 会额外输出每次 spin 的 `gameid`、`bet`、`lines`、`totalwin`、`replyPlay.results.length`。

最终统计字段：

```text
completedSpins
totalStake
totalWin
rtp
rtpPercent
initialBalance
finalBalance
balanceDelta
```

`最终统计` 后会追加 `玩法统计`。玩法统计是通用统计，不硬编码组件名、游戏名、symbol 语义或玩法名称。组件名来自每个 step 的 `curGameModParam.historyComponents`，`curGameMod` 和 result 字段值都按协议实际值动态分组。

## 玩法统计口径

spin 级分母是 `completedSpins`：

```text
winningSpinProbability = winningSpins / completedSpins
zeroWinSpinProbability = zeroWinSpins / completedSpins
multiStepSpinProbability = multiStepSpins / completedSpins
spinWithAnyResultProbability = spinWithAnyResult / completedSpins
spinWithAnyComponentProbability = spinWithAnyComponent / completedSpins
```

中奖倍数分布使用与 RTP 一致的下注分母：

```text
winMultiplier = totalwin / (bet * lines * times)
```

默认区间为 `0`、`(0,1)`、`[1,5)`、`[5,10)`、`[10,50)`、`[50,+∞)`。

step 级分母是 `totalSteps`：

```text
avgStepsPerSpin = totalSteps / completedSpins
stepWinProbability = stepWinCount / totalSteps
stepWithResultProbability = stepWithResultCount / totalSteps
stepWithComponentProbability = stepWithComponentCount / totalSteps
```

当 `totalSteps` 为 `0` 时，step 级概率输出 `0`，并在输出中显示 `stepProbabilityDenominator: 0`。

component 统计同时使用两个分母：

```text
spinTriggerProbability = triggeredSpins / completedSpins
stepTriggerProbability = triggeredSteps / totalSteps
winProbabilityWhenTriggered = winsWhenTriggered / triggeredSteps
```

同一 step 内同名组件重复出现时，`triggeredSteps` 和 `winsWhenTriggered` 按 step 去重，`totalTriggers` 按实际出现次数累计，并输出 `duplicateTriggerSteps` 与 `duplicateTriggers`。如果组件没有明文 `basicComponentData`，会计入 `withoutBasicComponentData`，不会伪造 used scene/result。

result 统计使用 `totalResults` 作为 result 级分母，使用 `completedSpins` 作为 spin 级分母：

```text
avgResultsPerSpin = totalResults / completedSpins
avgResultsPerStep = totalResults / totalSteps
cashWinResultProbability = cashWinResultCount / totalResults
coinWinResultProbability = coinWinResultCount / totalResults
```

result 分布覆盖 `type`、`symbol`、`lineIndex`、`symbolNums`。字段缺失会计入 `missingCount`，对象、数组、`NaN`、`Infinity`、`-Infinity` 等不可稳定展示的值会计入 `invalidCount`；不会补 `0`、空字符串或默认枚举。当 `totalResults` 为 `0` 时，result 级概率输出 `0`，并显示 `resultDenominator: 0`。

`curGameMod` 分布使用 `totalSteps` 作为分母，缺失值单独输出为 `<missing>`。

## RTP 公式

RTP 只使用每次 spin 的 `totalwin` 和配置下注额计算，不使用 `balanceDelta` 反推。

```text
stakePerSpin = bet * lines * times
totalStake = stakePerSpin * completedSpins
totalWin = sum(result.totalwin)
rtp = totalWin / totalStake
rtpPercent = rtp * 100
```

`balance` 来自 `client.getUserInfo().balance`，对应协议 `userbaseinfo.userbaseinfo.gold`，只用于展示和辅助核对。真实服务器的余额消息可能存在结算时序差异，因此 `finalBalance` 表示 CLI 退出前收到的最新缓存余额，不参与 RTP 计算。

## 错误中断策略

以下情况会立即中断并以非 0 退出码结束：

- CLI 参数缺失或格式非法。
- `connect()`、`enterGame()`、`spin()`、`collect()` 任一 Promise reject。
- `client.on('error')` 收到事件。
- 非主动退出阶段收到 `disconnect`。
- 收到 `reconnecting`。
- `message` 收到 `msgid === 'noticemsg2'`。
- `SlotcraftClient` 的 `logger.warn` 或 `logger.error` 被调用。
- `balance`、`totalwin`、`results` 等统计字段缺失或不是预期数字。
- `gmi.replyPlay` 缺失，或 `results` 与 `gmi.replyPlay.results.length` 不一致。
- `gmi.bet` / `gmi.lines` 与本次请求不一致。
- `@slotclientengine/logiccore` 解析 `gmi` 失败。
- logiccore 解析得到的 step 数、`totalwin`、`bet` 或 `lines` 与当前 spin 上下文不一致。
- 读取组件、组件 scene 或组件 result 时 logiccore 抛错。
- 玩法统计遇到非有限数字、非法概率分母或异常计数。
- 状态机进入本 CLI 未处理的状态。

`WAITTING_PLAYER` 当前没有自动选择策略，遇到会打印 `optionals` 并中断。真实远端 smoke test 可能受本地网络、证书、DNS、服务器状态或账号状态影响。
