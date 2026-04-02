# 使用指南

`@slotclientengine/netcore` 是当前 monorepo 的内部 workspace 包，供仓库内其他包直接依赖，不再按独立 npm 包安装方式说明。

## 导入方式

```ts
import { ConnectionState, SlotcraftClient } from '@slotclientengine/netcore';
```

## 快速开始

```ts
const client = new SlotcraftClient({
  url: 'ws://your-server.example/ws',
  token: 'user-auth-token',
  gamecode: 'game-101',
});

await client.connect();
await client.enterGame();

while (client.getState() !== ConnectionState.IN_GAME) {
  const state = client.getState();

  if (state === ConnectionState.SPINEND) {
    await client.collect();
    continue;
  }

  if (state === ConnectionState.WAITTING_PLAYER) {
    await client.selectOptional(0);
    continue;
  }

  if (state === ConnectionState.RESUMING) {
    await new Promise((resolve) => client.once('state', resolve));
    continue;
  }

  throw new Error(`遇到未处理状态: ${state}`);
}

const result = await client.spin({ bet: 100, lines: 10 });
console.log(result);
```

## 主要运行时方法

- `connect(token?)`
- `enterGame(gamecode?)`
- `spin(params)`
- `collect(playIndex?)`
- `selectOptional(index)`
- `selectSomething(clientParameter)`
- `send(cmdid, params)`
- `disconnect()`

## 常用事件

- `state`：返回 `{ previous, current, data? }`
- `connect`：底层连接建立后触发
- `disconnect`：返回 `{ code, reason, wasClean }`
- `reconnecting`：返回 `{ attempt }`
- `message`：服务端被动消息
- `raw_message`：每一帧原始收发消息
- `error`：运行时异常

## 回放模式

当构造参数中的 URL 为 `http://` 或 `https://` 时，客户端会切换到回放模式，而不是实时 WebSocket 模式。在 Node.js 环境下需要显式提供 `options.fetch`。

## 开发命令

从仓库根目录执行：

- `pnpm --filter @slotclientengine/netcore test`
- `pnpm --filter @slotclientengine/netcore lint`
- `pnpm --filter @slotclientengine/netcore typecheck`
- `pnpm --filter @slotclientengine/netcore build`
