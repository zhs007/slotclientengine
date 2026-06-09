# gameclientcli RTP CLI 初始化任务计划

## 1. 任务目标

新增一个可运行 CLI 应用 `apps/gameclientcli`，使用 `packages/netcore` 暴露的 `SlotcraftClient` 连接真实游戏服务器，完成登录、进入游戏、按指定次数 spin，并统计 RTP。

本计划是可直接执行版本，不依赖额外上下文。

核心要求：

- CLI 必须调用 `@slotclientengine/netcore` 已封装接口，不手写底层 WebSocket 协议流程。
- 任意连接错误、协议错误、命令失败、状态异常、参数异常或统计数据异常，都必须中断流程并以非 0 退出码报错。
- 不做不必要的兜底，不自动改下注、不自动改线数、不吞掉错误继续 spin。
- 新增中文 `README.md`，说明用途、运行方式、默认宏配置、RTP 公式和错误中断行为。
- 任务完成后，必须在 `tasks/` 下写中文任务报告，文件名为 `15-gameclientcli-rtp-cli-[utctime].md`。

## 2. 当前仓库事实

当前仓库可确认事实如下：

- 根仓库是 `pnpm` + `turbo` TypeScript monorepo。
- Node.js 要求为 `>=24.0.0`。
- `pnpm-workspace.yaml` 已匹配 `apps/*` 与 `packages/*`。
- 根级基础工具链包含 `typescript`、`vite`、`vitest`、`eslint`、`prettier`、`ts-node`。
- `packages/netcore` 的正式包名是 `@slotclientengine/netcore`。
- `@slotclientengine/netcore` 当前导出：
  - `SlotcraftClient`
  - `ConnectionState`
  - `SpinParams`
  - 其他类型与工具函数
- `SlotcraftClient` 的主要接口包括：
  - `connect(token?)`
  - `enterGame(gamecode?)`
  - `spin(params)`
  - `collect(playIndex?)`
  - `selectOptional(index)`
  - `disconnect()`
  - `getState()`
  - `getUserInfo()`
  - `on/off/once`
- `packages/netcore/src/connection.ts` 在运行时依赖全局 `WebSocket`，因此 Node CLI 必须注入 `ws`：

```ts
import WebSocket from 'ws';

globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
```

- `netcore` 文档和示例路径：
  - `packages/netcore/docs/usage_zh.md`
  - `packages/netcore/README.zh.md`
  - `packages/netcore/examples/example001.ts`

## 3. 默认宏配置

CLI 默认使用以下宏配置。实现时应集中放在 `apps/gameclientcli/src/config.ts` 或同等单一配置文件中。

```ts
export const DEFAULT_SERVER_URL = 'wss://gameserv.rgstest.slammerstudios.com/';
export const DEFAULT_GAME_CODE = 'CqbQ0Y7gtBpO5419j8h02';
export const DEFAULT_TOKEN = '3a820433c341f7932d6654c4f16147a2';
export const DEFAULT_BUSINESS_ID = 'guest';
export const DEFAULT_JURISDICTION = 'MT';
export const DEFAULT_CLIENT_TYPE = 'web';
export const DEFAULT_LANGUAGE = 'en';
export const DEFAULT_BET = 10;
export const DEFAULT_LINES = 10;
export const DEFAULT_TIMES = 1;
export const DEFAULT_AUTONUMS = -1;
export const DEFAULT_REQUEST_TIMEOUT_MS = 30000;
```

说明：

- `DEFAULT_BET = 10` 直接映射到 `SlotcraftClient.spin({ bet })` 的 `bet` 字段，也就是发送给服务器的 `ctrlparam.bet`。
- 协议样例里的 `bet: 5` 只作为消息结构参考；本任务要求的宏配置为下注 `10`，因此默认发送 `bet: 10`。
- `DEFAULT_LINES = 10` 来自协议样例 `ctrlparam.lines: 10`。
- 如果服务器返回下注不合法，必须报错中断，不允许自动改为服务器允许的其他下注。

## 4. 协议流程要求

实现必须通过 `SlotcraftClient` 完成以下流程。

### 4.1 登录

构造 `SlotcraftClient` 时传入：

```ts
const client = new SlotcraftClient({
  url: DEFAULT_SERVER_URL,
  token: DEFAULT_TOKEN,
  gamecode: DEFAULT_GAME_CODE,
  businessid: DEFAULT_BUSINESS_ID,
  jurisdiction: DEFAULT_JURISDICTION,
  clienttype: DEFAULT_CLIENT_TYPE,
  language: DEFAULT_LANGUAGE,
  requestTimeout: DEFAULT_REQUEST_TIMEOUT_MS,
  maxReconnectAttempts: 0,
  logger: failFastLogger,
});
```

然后调用：

```ts
await client.connect();
```

该调用应由 `netcore` 发送 `flblogin`，等价协议内容如下：

```json
{
  "cmdid": "flblogin",
  "gamecode": "CqbQ0Y7gtBpO5419j8h02",
  "businessid": "guest",
  "jurisdiction": "MT",
  "token": "3a820433c341f7932d6654c4f16147a2",
  "clienttype": "web",
  "language": "en"
}
```

### 4.2 进入游戏

登录成功后调用：

```ts
await client.enterGame();
```

该调用应由 `netcore` 发送 `comeingame3`，等价协议内容如下：

```json
{
  "cmdid": "comeingame3",
  "gamecode": "CqbQ0Y7gtBpO5419j8h02",
  "tableid": "",
  "isreconnect": false
}
```

### 4.3 spin

进入游戏并确认状态为 `ConnectionState.IN_GAME` 后，每次 spin 调用：

```ts
await client.spin({
  bet: DEFAULT_BET,
  lines: DEFAULT_LINES,
  times: DEFAULT_TIMES,
  autonums: DEFAULT_AUTONUMS,
});
```

该调用应由 `netcore` 自动使用缓存的 `gameid` 与 `ctrlid` 发送 `gamectrl3`，等价协议结构如下：

```json
{
  "cmdid": "gamectrl3",
  "gameid": 69002,
  "ctrlid": 202122812207681,
  "ctrlname": "spin",
  "ctrlparam": {
    "autonums": -1,
    "bet": 10,
    "lines": 10,
    "times": 1
  }
}
```

`gameid` 与 `ctrlid` 不允许硬编码，必须来自 `netcore` 缓存。

### 4.4 被动消息与错误消息

CLI 必须订阅 `client.on('message')`，并显式处理这些消息：

- `userbaseinfo`：由 `netcore` 缓存到 `client.getUserInfo().balance`，CLI 用于读取 `initialBalance`、`finalBalance` 和用户摘要。
- `gamemoduleinfo`：由 `netcore` 缓存到 `client.getUserInfo().lastGMI`，CLI 用于校验每次 spin 的游戏逻辑结果存在。
- `noticemsg2`：服务端错误/提示通道。RTP CLI 中任何 `noticemsg2` 都按异常处理并立即中断，除非后续任务明确列出可忽略白名单。

要求：

- `spin()` 返回的 `gmi` 必须存在，且应包含 `replyPlay`；否则报错中断。
- `spin()` 返回的 `totalwin` 必须来自 `gamemoduleinfo` 缓存结果并且是有限数字。
- `spin()` 返回的 `results` 必须是非负整数，并与 `gmi.replyPlay.results.length` 一致；不一致即报错中断。
- 如果 `gmi.bet`、`gmi.lines` 存在且是数字，必须与本次请求的 `bet`、`lines` 一致；不一致即报错中断。
- CLI 不需要解析 scene 参与 RTP 计算，但 `--verbose` 模式应输出每次 spin 的 `gameid`、`bet`、`lines`、`totalwin`、`replyPlay.results.length`，方便核对游戏逻辑数据。

## 5. CLI 功能规格

新增应用建议包名为 `gameclientcli`，路径为 `apps/gameclientcli`。

### 5.1 命令入口

建议支持以下命令：

```bash
pnpm --filter gameclientcli build
pnpm --filter gameclientcli start -- --spins 100
```

`--spins` 是必填参数，必须是正整数。输入缺失、为 0、负数、小数或非数字时，CLI 必须报错并退出。

允许增加以下覆盖参数，但默认值必须来自第 3 节宏配置：

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

如果实现覆盖参数，必须做到：

- 覆盖值显式打印在启动摘要中。
- 覆盖值校验失败立即报错。
- 不从环境变量隐式覆盖宏配置，除非 README 明确写出优先级。

### 5.2 输出内容

CLI 至少输出：

- 启动配置摘要：服务器、gamecode、spins、bet、lines、times。
- 登录成功后的用户摘要：`pid`、`nickname`、`currency`、初始 `balance`。
- spin 进度：当前第几次、当次 `totalwin`、累计下注、累计赢分、当前 RTP。
- 最终统计：
  - `completedSpins`
  - `totalStake`
  - `totalWin`
  - `rtp`
  - `rtpPercent`
  - `initialBalance`
  - `finalBalance`
  - `balanceDelta`

### 5.3 RTP 公式

默认每次 spin 的下注额：

```text
stakePerSpin = bet * lines * times
```

累计下注：

```text
totalStake = stakePerSpin * completedSpins
```

累计赢分：

```text
totalWin = sum(result.totalwin)
```

RTP：

```text
rtp = totalWin / totalStake
rtpPercent = rtp * 100
```

要求：

- `result.totalwin` 必须是有限数字。
- `result.results` 必须是非负整数。
- `totalStake` 必须大于 0。
- 不允许用 `balanceDelta` 反推 RTP。
- `balance` 来自 `client.getUserInfo().balance`，即协议 `userbaseinfo.userbaseinfo.gold`。
- `balance` 用于输出和辅助核对；RTP 的唯一统计来源是每次 spin 的 `totalwin` 与配置下注额。

## 6. 状态处理要求

### 6.1 进入游戏后的状态整理

`enterGame()` 后必须确认客户端进入 `IN_GAME`，否则按以下规则处理：

- `ConnectionState.SPINEND`：调用 `client.collect()`，然后继续检查状态。
- `ConnectionState.RESUMING`：等待下一次 `state` 事件，然后继续检查状态。
- `ConnectionState.WAITTING_PLAYER`：本任务没有定义玩家选择策略，必须报错中断，并打印 `client.getUserInfo().optionals`。
- 其他状态：报错中断。

### 6.2 每次 spin 后的状态整理

每次 `spin()` 后必须先根据本次返回结果判断是否需要最终 `collect()`，再把状态整理回 `IN_GAME`，才能进入下一次 spin。

最终 `collect()` 判断规则：

```text
needsFinalCollect =
  (totalwin > 0 && results >= 1) ||
  (totalwin === 0 && results > 1)
```

说明：

- 这里的 `totalwin` 与 `results` 必须来自本次 `client.spin()` 返回值。
- `netcore` 对多段结果可能会后台 auto-collect 中间段，然后把状态恢复到 `IN_GAME`。
- 即使当前状态已经是 `IN_GAME`，只要 `needsFinalCollect === true`，CLI 仍必须调用一次 `client.collect()`，用于确认最终结果。
- 不允许因为状态已经是 `IN_GAME` 就跳过本次最终 `collect()`。
- 不允许在 `needsFinalCollect === false` 时调用 `collect()`，避免沿用上一次 spin 的 `lastResultsCount` 误收集。

最终 `collect()` 完成后，或本次不需要 `collect()` 时，再按以下规则整理状态：

- `ConnectionState.IN_GAME`：可以继续。
- `ConnectionState.SPINEND`：如果本次还没有执行最终 `collect()`，必须调用 `client.collect()`；如果已经执行过最终 `collect()` 后仍停留在 `SPINEND`，报错中断。
- `ConnectionState.RESUMING`：等待下一次 `state` 事件，然后继续检查状态。
- `ConnectionState.WAITTING_PLAYER`：报错中断，并打印可选项。
- 其他状态：报错中断。

说明：

- 不做随机选择。
- 不自动调用 `selectOptional(0)`，除非后续任务明确给出选择策略。
- 如果实际游戏确实需要选择策略，本任务应在报告中记录阻塞原因，而不是悄悄选一个继续跑。

## 7. 错误中断要求

实现时必须建立统一的 fail-fast 错误通道。

以下情况必须立即中断：

- `client.connect()`、`client.enterGame()`、`client.spin()`、`client.collect()` 任意 Promise reject。
- `client.on('error')` 收到事件。
- `client.on('disconnect')` 在非主动退出阶段触发。
- `client.on('reconnecting')` 被触发。
- `client.on('message')` 收到 `msgid === 'noticemsg2'`。
- `SlotcraftClient` 的 `logger.warn` 或 `logger.error` 被调用。
- `client.getUserInfo().balance` 在需要读取时不是有限数字。
- `spin` 返回值缺少 `totalwin` 或 `totalwin` 不是有限数字。
- `spin` 返回值缺少 `results`、`results` 不是非负整数，或与 `gmi.replyPlay.results.length` 不一致。
- `spin` 返回值缺少 `gmi` 或 `gmi.replyPlay`。
- `spin` 返回的 `gmi.bet` / `gmi.lines` 与本次请求不一致。
- 状态机进入本计划未处理状态。
- CLI 参数校验失败。
- 写 README、构建、测试或 lint 任一验证失败。

推荐实现方式：

- 顶层 `main()` 只保留一个 `try/catch`。
- 创建 `FailFastMonitor` 或同等机制，统一接收 `error`、`disconnect`、`reconnecting`、`noticemsg2`、`logger.warn`、`logger.error`。
- 每个网络操作都应通过 `Promise.race([operation, failFastMonitor.wait()])` 或等价机制执行，避免异步错误只被记录但主循环继续。
- 每次 `await client.connect()`、`await client.enterGame()`、`await client.spin()`、`await client.collect()` 后都调用 `failFastMonitor.throwIfFailed()`。
- `catch` 中打印错误摘要，主动 `disconnect()`，设置 `process.exitCode = 1`。
- 非错误结束时主动 `disconnect()`，并设置正常退出。
- 不在循环内部捕获错误后继续执行。

## 8. 建议目录结构

建议新增：

```text
apps/gameclientcli/
  README.md
  eslint.config.cjs
  package.json
  tsconfig.json
  tsconfig.eslint.json
  vitest.config.ts
  src/
    cli.ts
    config.ts
    index.ts
    netcore-node.ts
    rtp-runner.ts
    stats.ts
    types.ts
  tests/
    cli.test.ts
    rtp-runner.test.ts
    stats.test.ts
```

说明：

- 如新增空目录，必须放置 `.keepme`。
- `netcore-node.ts` 只负责 Node 环境适配，例如注入 `globalThis.WebSocket`。
- `rtp-runner.ts` 负责流程编排：连接、进入游戏、spin 循环、collect、统计。
- `stats.ts` 负责 RTP 计算，便于单测。
- `cli.ts` 负责参数解析和启动配置，不引入额外 CLI 依赖，除非执行中确认手写解析会明显增加复杂度。
- `index.ts` 作为命令入口。

## 9. package.json 要求

`apps/gameclientcli/package.json` 建议内容方向：

```json
{
  "name": "gameclientcli",
  "version": "0.1.0",
  "private": true,
  "type": "commonjs",
  "packageManager": "pnpm@10.0.0",
  "scripts": {
    "prepare:netcore": "pnpm --filter @slotclientengine/netcore build",
    "build": "pnpm run prepare:netcore && tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "dev": "pnpm run prepare:netcore && ts-node src/index.ts",
    "lint": "eslint .",
    "test": "pnpm run prepare:netcore && vitest run --coverage",
    "typecheck": "pnpm run prepare:netcore && tsc -p tsconfig.json --noEmit",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  },
  "dependencies": {
    "@slotclientengine/netcore": "workspace:*",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@eslint/js": "^9.34.0",
    "@types/ws": "^8.18.1",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "@vitest/coverage-v8": "^4.0.0",
    "eslint-config-prettier": "^9.1.0",
    "globals": "^15.15.0"
  }
}
```

要求：

- 子项目如需使用根级基础工具链依赖，应与根目录版本保持一致。
- 如果 `pnpm install` 因网络失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
pnpm install
```

- `build` 应输出到 `apps/gameclientcli/dist`。
- `start` 运行构建产物，不直接运行源码。
- `@slotclientengine/netcore` 的 `package.json` 入口指向 `dist`，因此 `gameclientcli` 的 `build`、`typecheck`、`test`、`dev` 前必须确保 `@slotclientengine/netcore` 已构建。
- 不能假设 `pnpm --filter gameclientcli build` 会自动执行 `turbo` 依赖构建；必须通过 `prepare:netcore` 或等价脚本显式前置。

## 10. TypeScript 与测试要求

### 10.1 TypeScript

`tsconfig.json` 必须继承根级 `tsconfig.base.json`。

建议：

- `module: "Node16"`
- `moduleResolution: "Node16"`
- `target: "ES2023"`
- `rootDir: "./src"`
- `outDir: "./dist"`
- `noEmit: false`
- `declaration: true`

`tsconfig.eslint.json` 应覆盖：

- `src`
- `tests`
- `vitest.config.ts`
- `eslint.config.cjs`

### 10.2 自动测试

自动测试不连接真实远端服务器，避免 CI 或本地验证依赖公网状态。应通过 fake client 或本地 mock 验证业务逻辑。

至少覆盖：

- `--spins` 缺失时报错。
- `--spins` 为非正整数时报错。
- 默认宏配置会生成 `bet: 10`、`lines: 10`、`times: 1`、`autonums: -1`。
- RTP 计算公式正确。
- `totalwin` 缺失或非数字时报错。
- `results` 缺失、非整数、负数或与 `gmi.replyPlay.results.length` 不一致时报错。
- `balance` 缺失或非数字时报错。
- `spin()` reject 时流程中断，不继续下一次 spin。
- `collect()` reject 时流程中断。
- `disconnect` 非主动触发时流程中断。
- `error` 事件触发时流程中断。
- `message` 收到 `noticemsg2` 时流程中断。
- `logger.warn` 或 `logger.error` 被调用时流程中断。
- `spin()` 返回缺少 `gmi.replyPlay` 时流程中断。
- `gmi.bet` / `gmi.lines` 与请求参数不一致时流程中断。
- `WAITTING_PLAYER` 状态会报错，不随机选择。
- 中奖后进入 `SPINEND` 时会调用最终 `collect()` 并回到 `IN_GAME`。
- 多段结果触发 `netcore` auto-collect 后，即使状态已回到 `IN_GAME`，仍会为本次 spin 调用一次最终 `collect()`。
- `totalwin === 0 && results > 1` 的多段无奖结果也会调用最终 `collect()`。
- `totalwin === 0 && results <= 1` 时不会调用 `collect()`。
- 完成 N 次 spin 后 `completedSpins === N`。

如果测试暴露的是测试假设错误或 mock 与 `netcore` 真实行为不一致，应优先修正测试或 mock，不要为了测试通过修改不该改的生产逻辑。

## 11. README 要求

新增 `apps/gameclientcli/README.md`，中文说明至少包含：

- 项目目的：连接游戏服务器并统计指定次数 spin 的 RTP。
- 默认宏配置：
  - server url
  - gamecode
  - token
  - businessid
  - jurisdiction
  - clienttype
  - language
  - bet
  - lines
  - times
- 安装和构建命令。
- 运行命令示例：

```bash
pnpm --filter gameclientcli build
pnpm --filter gameclientcli start -- --spins 100
```

- 依赖下载失败时的代理命令：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

- RTP 公式。
- 输出字段解释。
- 错误中断策略。
- `noticemsg2`、内部 `logger.warn/error` 会按异常中断。
- `WAITTING_PLAYER` 当前不自动选择，遇到会中断。
- 真实远端 smoke test 可能受本地网络、代理或服务器状态影响。

## 12. 执行步骤

### 任务 1：创建应用骨架

执行内容：

- 新增 `apps/gameclientcli`。
- 新增 `package.json`、`tsconfig.json`、`tsconfig.eslint.json`、`eslint.config.cjs`、`vitest.config.ts`。
- 配置 `@slotclientengine/netcore` workspace 依赖。
- 配置 `ws` 运行时依赖。

验收标准：

- `pnpm --filter gameclientcli typecheck` 能识别项目。
- `pnpm --filter gameclientcli build` 能输出 `dist`。

### 任务 2：实现 Node WebSocket 适配

执行内容：

- 在 `src/netcore-node.ts` 中注入 `globalThis.WebSocket`。
- 确保 CLI 入口在创建 `SlotcraftClient` 前调用该适配函数。

验收标准：

- 测试可验证适配函数被调用。
- 真实运行时不会因为 `WebSocket is not defined` 失败。

### 任务 3：实现参数解析和默认配置

执行内容：

- 实现 `src/config.ts`。
- 实现 `src/cli.ts`。
- `--spins` 必填且必须为正整数。
- 覆盖参数如实现，必须明确校验。

验收标准：

- 参数解析单测通过。
- 错误参数直接报错，不进入网络流程。

### 任务 4：实现 RTP 统计模块

执行内容：

- 实现 `src/stats.ts`。
- 提供创建统计、追加 spin 结果、生成最终报告的函数。
- 严格校验有限数字。

验收标准：

- RTP 公式单测通过。
- 异常 totalwin、异常 results、异常 stake 会抛错。

### 任务 5：实现 netcore 流程编排

执行内容：

- 实现 `src/rtp-runner.ts`。
- 使用 `SlotcraftClient` 完成：
  1. `connect()`
  2. `enterGame()`
  3. 整理状态到 `IN_GAME`
  4. 循环 spin 指定次数
  5. 每次 spin 后按本次返回的 `totalwin/results` 推导并执行必要的最终 `collect()`
  6. 输出最终统计
  7. 主动 `disconnect()`
- 建立 fail-fast 事件处理。

验收标准：

- fake client 测试覆盖成功流程和错误中断流程。
- 循环不会在非 `IN_GAME` 状态继续 spin。

### 任务 6：实现 CLI 入口

执行内容：

- `src/index.ts` 调用参数解析、Node 适配、runner。
- 顶层统一处理异常和退出码。

验收标准：

- `pnpm --filter gameclientcli start -- --spins 1` 可以运行构建产物。
- 参数错误时退出码为非 0。

### 任务 7：编写 README

执行内容：

- 新增中文 `apps/gameclientcli/README.md`。
- 写明默认宏、运行方式、RTP 公式和错误中断策略。

验收标准：

- README 不依赖本任务计划也能指导使用者运行 CLI。

### 任务 8：验证和收口

执行命令：

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

如果 `pnpm install` 下载依赖失败，执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
pnpm install
```

真实服务器 smoke test：

```bash
pnpm --filter gameclientcli build
pnpm --filter gameclientcli start -- --spins 1
```

说明：

- smoke test 需要真实网络和远端服务器可用。
- 如果 smoke test 因网络、证书、DNS、服务器拒绝或账号状态失败，必须在任务报告中记录完整命令、错误文本和是否影响交付判断。
- 不能在未执行真实服务器 smoke test 的情况下声称已经完成真实联机验证。

## 13. 完成定义

当以下条件全部满足时，可认为本任务完成：

- `apps/gameclientcli` 已创建并被 pnpm workspace 识别。
- CLI 使用 `@slotclientengine/netcore` 的 `SlotcraftClient`，没有绕过封装手写底层 WebSocket 发包。
- Node 运行时已正确注入 `ws` 作为全局 `WebSocket`。
- 默认宏配置符合第 3 节。
- `--spins` 可控制 spin 次数。
- 每次 spin 后能统计 `totalwin`。
- RTP 按 `totalWin / totalStake` 输出。
- 任何错误会中断流程并返回非 0 退出码。
- `noticemsg2`、`logger.warn`、`logger.error` 均会中断流程。
- 遇到 `WAITTING_PLAYER` 不随机选择，会报错中断。
- 需要收集的结果会调用最终 `collect()` 回到 `IN_GAME`，包括多段结果中 `netcore` 已 auto-collect 中间段的场景。
- 每次 spin 会校验 `gmi.replyPlay` 存在，核对 `results` 与 `gmi.replyPlay.results.length`，并在可验证时核对返回的 `bet` / `lines` 与请求一致。
- `apps/gameclientcli/README.md` 已完成。
- 自动测试覆盖第 10 节要求的关键行为。
- 验证命令至少完成：
  - `pnpm --filter @slotclientengine/netcore build`
  - `pnpm --filter gameclientcli lint`
  - `pnpm --filter gameclientcli test`
  - `pnpm --filter gameclientcli typecheck`
  - `pnpm --filter gameclientcli build`
  - `git diff --check`
- 尽力执行真实服务器 `--spins 1` smoke test，并在报告中写明结果。
- 已新增中文任务报告：

```text
tasks/15-gameclientcli-rtp-cli-[utctime].md
```

其中 `utctime` 使用 UTC 时间短格式，例如：

```text
260609-181300
```

## 14. agents.md 更新规则

本任务默认不需要更新根级 `agents.md`，因为只是新增一个 workspace app，不改变仓库级协作规则、目录规范或基础脚本。

如果执行中出现以下任一情况，则必须同步更新根级 `agents.md`：

- 新增或修改仓库级脚本约定。
- 新增所有 CLI 应用都必须遵守的统一规则。
- 改变 `apps/`、`packages/`、`tasks/`、`docs/` 的目录规范。
- 改变依赖安装、验证命令或代理规则。

如仅新增 `apps/gameclientcli`、其 README、测试和任务报告，则无需更新根级 `agents.md`。

## 15. 任务报告要求

任务完成后必须新增中文任务报告，路径格式：

```text
tasks/15-gameclientcli-rtp-cli-[utctime].md
```

报告至少包含：

- 任务背景。
- 实际完成项。
- 默认宏配置是否按计划落地。
- RTP 公式和统计来源。
- 错误中断策略实现情况。
- 执行过的验证命令与结果。
- 真实服务器 smoke test 命令与结果。
- 遇到的问题和处理方式。
- 是否更新了根级 `agents.md`，若未更新也要说明原因。
