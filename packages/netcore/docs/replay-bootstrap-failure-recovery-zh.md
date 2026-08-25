# Replay 启动数据与操作失败恢复

本文说明 `@slotclientengine/netcore` 的两个运行时合同：Replay 如何在首轮 spin 前提供游戏构建数据，以及 Live 操作被服务器或传输层拒绝后如何恢复状态。

## Replay 启动数据

HTTP(S) URL 使用 Replay 模式。`connect()` 获取静态 JSON 后会从 `playCtrlParam` 严格投影 `ReplayBootstrapInfo`，并通过 `getUserInfo().replayBootstrap` 暴露。

```json
{
  "msgid": "gamemoduleinfo",
  "playCtrlParam": {
    "balance": 730959,
    "bet": 1,
    "totalbet": 450,
    "lines": 450,
    "currency": "USD",
    "gameType": "slot",
    "payTables": {},
    "servTime": 123456,
    "giftfree": {}
  },
  "gmi": {}
}
```

```ts
await client.connect();

const bootstrap = client.getUserInfo().replayBootstrap;
if (!bootstrap) {
  throw new Error('Replay 缺少启动数据');
}

buildGameUI({
  bet: bootstrap.bet,
  totalbet: bootstrap.totalbet,
  lines: bootstrap.lines,
  currency: bootstrap.currency,
});

await client.enterGame();
```

`replayBootstrap` 与 `lastGMI` 的边界如下：

| 字段              | 提交时机                          | 含义                             |
| ----------------- | --------------------------------- | -------------------------------- |
| `replayBootstrap` | `connect()` 成功                  | 首轮 spin 前可用的静态构建数据   |
| `lastGMI`         | `spin()` 处理 `gamemoduleinfo` 后 | 最近一次已经提交给游戏流程的结果 |

`connect()` 不会把整个 Replay envelope 写进 `lastGMI`。这样 `lastGMI` 始终保持 GMI 数据形状，也不会让游戏误判首轮结果已经播放。

`playCtrlParam` 缺失时 `replayBootstrap` 为 `undefined`。已声明字段一旦存在就必须符合类型；例如字符串形式的 `totalbet` 会让 `connect()` 显式失败，不做数值猜测或默认币种回退。对象字段会被浅复制并冻结。

## Live 操作失败恢复

以下高层操作在等待 `cmdret` 时会进入 transient 状态：

| 操作               | transient 状态    | 默认失败恢复状态                |
| ------------------ | ----------------- | ------------------------------- |
| `enterGame()`      | `ENTERING_GAME`   | 调用前的 `LOGGED_IN`            |
| `spin()`           | `SPINNING`        | 调用前的 `IN_GAME`              |
| `collect()`        | `COLLECTING`      | 调用前的 `SPINEND` 或 `IN_GAME` |
| `selectOptional()` | `PLAYER_CHOICING` | 调用前的 `WAITTING_PLAYER`      |

默认策略是 `restore`。例如余额不足导致 spin 被拒绝时，Promise 仍以服务端错误拒绝，但客户端会先恢复为 `IN_GAME`，调用方显示错误后可以再次 spin。

```ts
try {
  await client.spin({ bet: 100, lines: 10 });
} catch (error) {
  // 此时默认已经恢复到 IN_GAME。
  showOperationError(error);
}
```

## 配置恢复策略

通过 `SlotcraftClientOptions.operationFailureRecovery` 按操作配置：

```ts
const client = new SlotcraftClient({
  url: 'wss://example.internal/ws',
  token: 'token',
  operationFailureRecovery: {
    enterGame: 'disconnect',
    spin: 'restore',
    collect: 'restore',
    selectOptional: 'restore',
  },
});
```

支持的策略只有：

- `restore`：恢复到该操作开始前捕获的稳定状态；这是默认值。
- `disconnect`：关闭连接并进入 `DISCONNECTED`，用于失败后不能信任当前会话的操作。

操作名和策略值都做运行时严格校验。未知操作、未知策略不会静默降级，而是在构造客户端时直接失败。恢复目标状态不允许由调用方任意指定，避免配置出非法状态跳转。

恢复只会在客户端仍处于该操作 transient 状态时发生。如果断线或重连流程已经把状态切换为 `RECONNECTING`/`DISCONNECTED`，操作恢复器不会用旧状态覆盖新的传输状态。

## 错误传播

`cmdret.isok === false` 会拒绝对应 Promise：

- 非空 `cmdret.errmsg` 用作 `Error.message`。
- 没有 `errmsg` 时使用 `Command '<cmdid>' failed.`。
- 状态恢复不会吞掉错误；游戏层始终可以记录或展示失败原因。

服务端通过 `noticemsg2` 推送的业务错误仍属于被动消息合同，应继续监听 `message` 事件；本配置只管理高层操作 Promise 失败后的客户端状态。

`send()` 是底层命令接口，不对应具体高层操作，因此不自动应用操作失败恢复配置。
