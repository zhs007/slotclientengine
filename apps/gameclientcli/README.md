# gameclientcli

`gameclientcli` 是一个用于真实游戏服务器 RTP 抽样的 Node CLI。它通过 `@slotclientengine/netcore` 暴露的 `SlotcraftClient` 完成登录、进入游戏、spin、collect 和状态读取，不手写底层 WebSocket 协议。

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
--verbose
```

覆盖值会打印在启动摘要中。本 CLI 不从环境变量隐式覆盖默认宏配置。
`--url` 必须是合法的 `ws://` 或 `wss://` 地址。

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
- 状态机进入本 CLI 未处理的状态。

`WAITTING_PLAYER` 当前没有自动选择策略，遇到会打印 `optionals` 并中断。真实远端 smoke test 可能受本地网络、证书、DNS、服务器状态或账号状态影响。
