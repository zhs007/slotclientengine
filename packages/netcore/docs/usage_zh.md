# 使用指南

这是一个轻量级、可靠的前端网络库，用于与游戏服务器进行 WebSocket 通信。它提供了自动重连、请求缓存和简单的 Promise-based API。

## 特性

- **自动重连**: 在网络意外断开时，会自动尝试重新连接。
- **请求缓存**: 在重连期间，发送的请求会被缓存并在成功重连后自动发送。
- **Promise API**: 所有异步操作（如 `connect`, `send`）都返回 Promise，方便使用 `async/await`。
- **事件驱动**: 通过 `on`, `off` 方法监听客户端生命周期事件。
- **轻量级**: 无生产环境依赖。

## 安装

```bash
npm install <package-name>
```

_(注意: `<package-name>` 需要在发布到 npm 时确定)_

## 快速上手

```typescript
import { SlotcraftClient } from '<package-name>';

const options = {
  url: 'ws://your-server.com/ws',
  token: 'user-auth-token',
  gamecode: 'game-101',
};

const client = new SlotcraftClient(options);

// 监听事件
client.on('connect', () => {
  console.log('WebSocket 连接成功!');
});

client.on('ready', () => {
  console.log('客户端已就绪，可以开始游戏!');

  // 发送游戏指令
  client
    .send('spin', { bet: 100 })
    .then((response) => {
      console.log('Spin 结果:', response);
    })
    .catch((error) => {
      console.error('Spin 失败:', error);
    });
});

client.on('disconnect', (payload) => {
  console.log(`连接已断开: ${payload.reason} (Code: ${payload.code})`);
});

client.on('reconnecting', (payload) => {
  console.log(`正在尝试重连... (第 ${payload.attempt} 次)`);
});

client.on('error', (error) => {
  console.error('发生错误:', error);
});

// 开始连接
async function main() {
  try {
    await client.connect();
    console.log('连接、登录、进入游戏全部完成!');
  } catch (error) {
    console.error('连接失败:', error);
  }
}

main();
```

## API 参考

### `new SlotcraftClient(options)`

创建客户端实例。

- `options`: `SlotcraftClientOptions` 对象
  - `url: string`: **必需**, WebSocket 服务器地址。
  - `token: string`: **必需**, 用户认证 token。
  - `gamecode: string`: **必需**, 要进入的游戏代码。
  - `maxReconnectAttempts?: number`: _可选_, 最大重连次数 (默认: 10)。
  - `reconnectDelay?: number`: _可选_, 初始重连延迟（毫秒, 默认: 1000），后续延迟会以指数形式增加。

### `client.connect(): Promise<void>`

发起连接、登录和进入游戏的完整流程。返回一个在客户端进入 `IN_GAME` 状态后 `resolve` 的 Promise。

### `client.send(cmd: string, data?: object): Promise<any>`

在 `IN_GAME` 状态下向服务器发送消息。`cmd` 是指令名，`data` 是附加数据。返回一个在收到服务器对应响应后 `resolve` 的 Promise。

### `client.disconnect(): void`

主动断开连接。

### `client.on(event: string, callback: Function)`

监听事件。

### `client.off(event: string, callback: Function)`

取消监听事件。

### `client.once(event: string, callback: Function)`

监听一次性事件。

## 事件

- `connect`: WebSocket 物理连接建立时触发。
- `disconnect`: 连接关闭时触发。 `payload: { code, reason, wasClean }`
- `ready`: 客户端成功进入游戏，可以发送消息时触发。
- `reconnecting`: 意外断开后，正在尝试重连时触发。 `payload: { attempt }`
- `error`: 发生错误时触发。 `payload: Error | Event`
- `data`: 收到服务器主动推送的、未被内部处理的消息时触发。 `payload: object`
