# gameclientcli RTP CLI 初始化任务报告

## 任务背景

本任务新增 `apps/gameclientcli`，用于通过 `@slotclientengine/netcore` 的 `SlotcraftClient` 连接真实游戏服务器，按指定 spin 次数统计 RTP。实现要求 fail-fast，不手写底层 WebSocket 协议，不自动修改下注、线数或玩家选择策略。

## 实际完成项

- 新增 workspace app：`apps/gameclientcli`。
- 新增 CLI 入口、Node WebSocket 适配、默认配置、参数解析、RTP 统计、netcore 流程编排和中文 README。
- CLI 入口支持计划命令：
  - `pnpm --filter gameclientcli build`
  - `pnpm --filter gameclientcli start -- --spins 100`
- `--spins` 为必填正整数，缺失、0、负数、小数或非数字都会报错。
- 支持覆盖参数：
  - `--url`
  - `--gamecode`
  - `--token`
  - `--bet`
  - `--lines`
  - `--times`
  - `--request-timeout-ms`
  - `--verbose`
- 新增自动测试 49 个，覆盖参数解析、默认宏、URL 覆盖校验、RTP 公式、spin 结果校验、fail-fast 事件、logger.warn/error、WAITTING_PLAYER、最终 collect 边界和完成 spin 数统计。
- 修复 `spine2victoryani-demo` 既有导出数据/脚本漂移：默认 `public/exported/project.json` 应引用 `./assets/...`，动画项目才引用 `../assets/...`。该问题会导致根级 `pnpm test` 失败，已修复并重新验证。

## 默认宏配置

已按计划落地到 `apps/gameclientcli/src/config.ts`：

```text
DEFAULT_SERVER_URL = wss://gameserv.rgstest.slammerstudios.com/
DEFAULT_GAME_CODE = CqbQ0Y7gtBpO5419j8h02
DEFAULT_TOKEN = 3a820433c341f7932d6654c4f16147a2
DEFAULT_BUSINESS_ID = guest
DEFAULT_JURISDICTION = MT
DEFAULT_CLIENT_TYPE = web
DEFAULT_LANGUAGE = en
DEFAULT_BET = 10
DEFAULT_LINES = 10
DEFAULT_TIMES = 1
DEFAULT_AUTONUMS = -1
DEFAULT_REQUEST_TIMEOUT_MS = 30000
```

## RTP 公式和统计来源

RTP 统计只使用每次 `client.spin()` 返回的 `totalwin` 和配置下注额，不用 `balanceDelta` 反推。

```text
stakePerSpin = bet * lines * times
totalStake = stakePerSpin * completedSpins
totalWin = sum(result.totalwin)
rtp = totalWin / totalStake
rtpPercent = rtp * 100
```

`balance` 来自 `client.getUserInfo().balance`，仅用于输出和辅助核对。
真实服务器的余额消息可能有结算时序差异，`finalBalance` 表示 CLI 退出前收到的最新缓存余额，不参与 RTP 计算。

## 错误中断策略

已实现统一 fail-fast 通道：

- `connect()`、`enterGame()`、`spin()`、`collect()` reject 会中断。
- `client.on("error")` 会中断。
- 非主动退出阶段 `disconnect` 会中断。
- `reconnecting` 会中断。
- `message.msgid === "noticemsg2"` 会中断。
- `SlotcraftClient` 的 `logger.warn` / `logger.error` 会中断。
- `balance`、`totalwin`、`results` 非法会中断。
- 缺少 `gmi.replyPlay` 会中断。
- `results` 与 `gmi.replyPlay.results.length` 不一致会中断。
- `gmi.bet` / `gmi.lines` 与请求不一致会中断。
- `WAITTING_PLAYER` 不自动选择，打印 optionals 后中断。
- 需要最终收集的结果会调用一次 `collect()`，包括 netcore 已因多段结果回到 `IN_GAME` 的情况。
- 当本次 spin 结果按规则不需要 collect 时，如果状态异常停留在 `SPINEND`，CLI 会报错中断，不会兜底调用 `collect()`，避免沿用旧结果。

## 验证命令与结果

以下命令均已执行并通过：

```bash
pnpm install
pnpm --filter @slotclientengine/netcore build
pnpm --filter gameclientcli lint
pnpm --filter gameclientcli test
pnpm --filter gameclientcli typecheck
pnpm --filter gameclientcli build
pnpm lint
pnpm test
pnpm typecheck
pnpm build
git diff --check
```

补充验证：

```bash
pnpm --filter spine2victoryani-demo test
```

结果：14 个测试通过，用于确认根级 test 中暴露的既有导出路径问题已修复。

## 真实服务器 smoke test

执行命令：

```bash
pnpm --filter gameclientcli start -- --spins 1
```

首次在沙箱网络下失败：

```text
gameclientcli 执行失败：netcore logger.error: WebSocket error observed: {}
```

按流程申请外部网络放行后重试成功。关键输出：

```text
登录用户摘要
pid: guest
nickname: trial-660762
currency: EUR
initialBalance: 199950
spin 1/1: totalwin=0, totalStake=100, totalWin=0, rtp=0.0000%
最终统计
completedSpins: 1
totalStake: 100
totalWin: 0
rtp: 0
rtpPercent: 0
initialBalance: 199950
finalBalance: 199850
balanceDelta: -100
```

二次审计后再次执行真实 smoke test，并加跑 `--verbose`。观察到一次中奖 spin 后，下一次登录的 `initialBalance` 体现了上一局赢分，但当局退出前的 `finalBalance` 仍是最新缓存余额，可能未立即体现中奖结算。该现象已在 README 中说明；RTP 仍严格使用 `totalwin` 与下注额计算。

## 遇到的问题和处理方式

- `pnpm --filter gameclientcli start -- --spins 1` 会把分隔符 `--` 传入脚本参数。已修复解析器，允许开头的 `--`，并增加单测。
- `pnpm test` 首次失败在既有 `spine2victoryani-demo`：默认导出项目把资产引用写成 `../assets/...`，导致测试访问 `public/assets/ui8.png`。已修复导出脚本和已落盘默认项目数据，最终根级 test 通过。
- 真实 smoke 在沙箱网络下失败，外部网络放行后同一命令成功。
- 二次审计时发现 `needsFinalCollect === false` 但状态异常为 `SPINEND` 的路径不应兜底 collect。已改为显式报错，并新增回归测试。
- 二次审计时发现 `--url` 覆盖只校验非空。已改为参数解析阶段校验合法 `ws://` / `wss://` URL，并新增回归测试。

## AGENTS.md 更新情况

未更新根级 `AGENTS.md`。本任务只新增一个 workspace app、README、测试和报告；没有改变仓库级协作规则、目录规范或基础脚本约定。
