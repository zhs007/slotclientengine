# Slotcraft 客户端网络库

[![CI](https://github.com/zhs007/slotcraft-client-net/actions/workflows/ci.yml/badge.svg)](https://github.com/zhs007/slotcraft-client-net/actions/workflows/ci.yml)
[![Tested with Vitest](https://img.shields.io/badge/tested%20with-vitest-6E9F18.svg?logo=vitest)](https://vitest.dev/)

一个健壮、高效且轻量级的 TypeScript 前端网络库。它作为游戏应用层与游戏服务器之间的通信桥梁，处理 WebSocket 连接、协议交互、状态同步和错误恢复。

## 核心功能

- **连接管理**: 提供简洁的 `connect()` 方法来处理完整的 WebSocket 连接、版本检查和登录流程。
- **状态机**: 内部管理从“未连接”到“游戏中”的完整生命周期状态 (`IDLE`, `CONNECTING`, `CONNECTED`, `IN_GAME`, `RECONNECTING` 等)。
- **协议封装**: 提供简洁的 API (`spin`, `collect` 等)，使开发者无需关心 `cmdid` 等底层协议细节。
- **事件驱动**: 通过 `on(event, callback)` 系统与游戏模块解耦。支持 `connect`, `disconnect`, `reconnecting`, `message` 和 `raw_message` 等事件。
- **自动重连**: 在网络意外断开时，自动尝试重新连接。
- **操作队列**: 序列化所有用户操作（`spin`, `collect` 等），以防止竞态条件并确保指令顺序。
- **游戏状态恢复**: 智能处理用户重进游戏时存在未完成回合（如待领取的奖励或待做的选择）的场景。
- **回放模式**: 支持从静态 JSON 文件回放游戏会话，从而无需连接实时服务器即可进行调试和测试。

## 项目目录结构

```
.
├── dist/                # 编译后的产物（JavaScript 和类型定义）
├── docs/                # 文档
├── examples/            # 示例代码
├── src/                 # TypeScript 源代码
│   ├── connection.ts    # 底层 WebSocket 连接封装
│   ├── event-emitter.ts # 简单的事件发射器实现
│   ├── index.ts         # 库的主导出入口
│   ├── live-client.ts   # 用于实时服务器通信的实现
│   ├── main.ts          # SlotcraftClient 主外观类
│   ├── replay-client.ts # 用于从文件回放会话的实现
│   └── types.ts         # 核心类型定义和接口
├── tests/               # 单元和集成测试 (Vitest)
├── package.json         # 项目配置和脚本
└── tsconfig.json        # TypeScript 编译器选项
```

## 项目代码结构

该库的核心架构围绕 `SlotcraftClient` 类，它充当一个外观（Facade）。根据其构造函数中提供的 URL 协议（`ws[s]://` 或 `http[s]://`），它会实例化两种实现之一：

-   **`SlotcraftClientLive`**: 用于连接实时 WebSocket 服务器的主要实现。它具有全面的状态机、用于序列化用户操作的操作队列、自动重连和心跳管理功能。
-   **`SlotcraftClientReplay`**: 用于调试和测试的次要实现。它不连接到服务器，而是获取一个代表游戏会话的 JSON 文件，并基于该数据模拟客户端的行为。

这种设计将核心游戏逻辑与传输层分离，实现了强大的测试和开发工作流。

## 基础使用说明

### 安装

```bash
npm install slotcraft-client-net
```

### 开发脚本

-   `npm run build`: 将 TypeScript 代码编译到 `dist/` 目录。
-   `npm test`: 运行 Vitest 测试套件并生成覆盖率报告。
-   `npm run lint`: 对代码库进行风格和潜在错误检查。
-   `npm run typecheck`: 在不编译的情况下检查项目的 TypeScript 类型错误。

## 项目的极简集成说明 (浏览器)

此示例展示了连接到服务器、进入游戏并执行单次旋转的最小化设置。

**重要提示**: 这是一个基于浏览器的示例。请勿在生产代码中直接使用环境变量或硬编码敏感的令牌。令牌应从您的认证服务中安全地获取。

```typescript
import { SlotcraftClient, ConnectionState } from 'slotcraft-client-net';

async function runMinimalExample() {
  // 配置信息应被安全地传递。
  const client = new SlotcraftClient({
    url: 'ws://your-game-server.com/ws', // 您的 WebSocket 服务器 URL
    token: 'user-secret-token',          // 用户的身份验证令牌
    gamecode: 'game-code-001',           // 要进入的特定游戏
    // 可选的上下文参数
    businessid: 'your-business-id',
    clienttype: 'web',
    language: 'zh',
  });

  client.on('state', ({ current }) => {
    console.log(`客户端状态现在是: ${current}`);
  });

  client.on('error', (err) => {
    console.error('客户端发生错误:', err);
  });

  try {
    console.log('正在连接...');
    await client.connect(); // 连接到服务器并登录

    console.log('正在进入游戏...');
    await client.enterGame(); // 进入指定的游戏

    // 检查游戏是否在需要处理的状态下启动（例如，有待领取的奖励）
    if (client.getState() !== ConnectionState.IN_GAME) {
      console.log('游戏需要恢复。请参阅高级指南进行处理。');
      // 在这个最小示例中，我们到此为止。
      client.disconnect();
      return;
    }

    console.log('执行一次 spin...');
    const result = await client.spin({ lines: 10, bet: 100 });
    console.log('spin 成功:', result);

    // 如果 spin 产生了赢奖，状态将变为 'SPINEND'。
    if (client.getState() === ConnectionState.SPINEND) {
      console.log('正在收集奖励...');
      await client.collect();
      console.log('奖励已收集。当前状态:', client.getState());
    }

  } catch (error) {
    console.error('会话期间发生错误:', error);
  } finally {
    if (client.getState() !== ConnectionState.DISCONNECTED) {
        console.log('正在断开连接。');
        client.disconnect();
    }
  }
}

runMinimalExample();
```

## 项目的集成说明

### 状态管理

客户端在一个严格的状态机上运行。您可以随时使用 `client.getState()` 获取当前状态。可能的状态在 `ConnectionState` 枚举中定义：

-   `IDLE`: 初始状态。
-   `CONNECTING`: 已调用 `connect()`，WebSocket 正在连接。
-   `CONNECTED`: WebSocket 连接已打开。
-   `LOGGING_IN`: 已发送登录请求。
-   `LOGGED_IN`: 登录成功。
-   `ENTERING_GAME`: 已调用 `enterGame()`。
-   `IN_GAME`: 准备好接受 `spin()` 或其他操作。
-   `SPINNING`: 已调用 `spin()`，等待结果。
-   `PLAYER_CHOICING`: 已调用 `selectOptional()`，等待结果。
-   `WAITTING_PLAYER`: spin 产生了一个需要用户做出的选择。
-   `SPINEND`: spin 已结束并产生了赢奖，必须使用 `collect()` 进行收集。
-   `COLLECTING`: 已调用 `collect()`。
-   `RECONNECTING`: 连接丢失，正在尝试重连。
-   `DISCONNECTED`: 连接已关闭（有意或重连失败后）。
-   `RESUMING`: 一个瞬时状态，表示正在恢复一个未完成的游戏状态。

### 事件处理

监听事件以响应变化和消息：

```typescript
// 任何状态变更时触发
client.on('state', (payload: { previous: ConnectionState, current: ConnectionState, data?: any }) => {
  console.log(`状态从 ${payload.previous} 变为 ${payload.current}`);
});

// 连接成功时触发
client.on('connect', () => { console.log('已连接!'); });

// 断开连接时触发
client.on('disconnect', (payload: { code: number, reason: string, wasClean: boolean }) => {
  console.log(`已断开: ${payload.reason}`);
});

// 客户端尝试重连时触发
client.on('reconnecting', (payload: { attempt: number }) => {
  console.log(`正在重连，第 #${payload.attempt} 次尝试...`);
});

// 服务器发送任何异步（被动）消息时触发
client.on('message', (message: any) => {
  console.log('收到异步消息:', message);
});

// 每次发送或接收消息时触发（用于调试）
client.on('raw_message', (payload: { direction: 'SEND' | 'RECV', message: string }) => {
  // 可将此记录到文件中以进行详细调试
});

// WebSocket 发生错误时触发
client.on('error', (error: Error) => {
  console.error('客户端错误:', error);
});
```

### 错误处理与游戏恢复

所有操作（`connect`, `spin` 等）都是 `async` 并返回一个 `Promise`。您应该将它们包装在 `try...catch` 块中。

一个关键特性是处理游戏恢复。当 `enterGame()` 完成后，游戏可能不处于 `IN_GAME` 状态。它可能处于 `SPINEND`（有待收集的奖励）或 `WAITTING_PLAYER`（需要做出选择）。您的应用程序必须处理此问题，以使游戏进入就绪状态。

```typescript
await client.enterGame();

// 循环直到游戏处于标准的可玩状态。
while (client.getState() !== ConnectionState.IN_GAME) {
  const state = client.getState();
  console.log(`正在处理恢复状态: ${state}`);

  if (state === ConnectionState.SPINEND) {
    await client.collect();
  } else if (state === ConnectionState.WAITTING_PLAYER) {
    // 决定选择哪个选项的逻辑
    const userInfo = client.getUserInfo();
    if (userInfo.optionals && userInfo.optionals.length > 0) {
      await client.selectOptional(0); // 选择第一个选项
    } else {
      throw new Error('在恢复时处于 WAITTING_PLAYER 状态，但未找到可选选项。');
    }
  } else if (state === ConnectionState.RESUMING) {
    // 这是一个瞬时状态。等待下一次状态变更。
    await new Promise(resolve => client.once('state', resolve));
  } else {
    throw new Error(`未处理的恢复状态: ${state}。无法继续。`);
  }
}

console.log('游戏已准备好，可以开始！');
// 现在您可以调用 client.spin()
```

## 细节功能说明

### 回放模式

回放模式是用于调试和 UI 开发的强大工具。客户端不连接到实时服务器，而是获取一个包含 `gamemoduleinfo` 消息快照的 JSON 文件。

-   **激活**: 将一个 `http://` 或 `https://` URL 传递给构造函数。在 Node.js 中，您还必须提供一个 `fetch` 实现。
-   **`connect()`**: 获取 JSON 文件。模拟 `connect` 和 `login`。
-   **`enterGame()`**: 从文件中缓存游戏配置（例如 `defaultScene`, `linesOptions`）。
-   **`spin()`**: 处理文件中的结果并转换到最终状态（`SPINEND`, `WAITTING_PLAYER` 等）。

### 恢复逻辑

当玩家进入游戏时，他们可能有一个来自先前会话的未完成回合。服务器将在对 `enterGame` 的响应中报告此情况。客户端通过以下方式处理：
1.  将状态设置为 `RESUMING` 以表明正在进行恢复。
2.  解析服务器响应以确定正确的状态：
    -   `SPINEND`: 如果有待收集的奖励。
    -   `WAITTING_PLAYER`: 如果玩家需要做出选择。
3.  使用恢复数据更新其内部缓存（`lastTotalWin`, `optionals` 等）。
库的使用者有责任调用 `collect()` 或 `selectOptional()` 来解决此状态，然后才能执行新操作（如“错误处理与游戏恢复”部分所示）。

### `selectSomething(clientParameter: string)`

此方法提供了一种向服务器发送通用 `selectany` 命令的方式，可用于需要客户端简单字符串输入的自定义游戏功能。它会发送所提供的 `clientParameter` 以及最后已知的下注上下文。

### `transformSceneData(data)` 工具函数

-   **来源**: `import { transformSceneData } from 'slotcraft-client-net'`
-   **描述**: 一个工具函数，旨在将从服务器收到的复杂 `defaultScene` 对象简化为更易于使用的格式。
-   **输入**: 接受一个原始场景数据对象，其结构通常类似于 `{ values: [{ values: [1, 2] }, ...] }`。
-   **输出**: 返回一个简单的二维数字数组（例如 `[[1, 2], ...]`）。

### `collect` 流程与自动收集

`collect` 操作是游戏循环中的一个关键部分，用于正式确认来自服务器的结果，通常是赢奖。

-   **何时需要 `collect`？**: 在 `spin` 或 `selectOptional` 操作后，如果结果是赢奖或多阶段的特色玩法，客户端的状态将转换为 `SPINEND`。这表明需要调用 `collect()` 来确认结果，然后才能进行下一次 spin。
-   **自动收集 (Auto-Collect)**: 为了简化开发者体验并减少网络往返，该库实现了一个“自动收集”机制。如果单个操作（如 spin）产生了多个结果（例如，基础游戏赢奖触发了带有其自身结果的特色玩法），该库将在后台自动对所有中间结果调用 `collect()`。这样，只留下最后一个结果供用户手动 `collect()`，从而极大地简化了游戏流程。

### `selectOptional` 与 `selectSomething` 的对比

虽然这两种方法都用于玩家选择，但它们的目的根本不同：

-   **`selectOptional(index)`**: 此方法专门用于 `WAITTING_PLAYER` 状态。此状态是 **由服务器驱动的**；服务器上的游戏逻辑已暂停，并等待客户端从其提供的特定选项列表中进行选择。调用 `selectOptional` 会将玩家的选择发送回服务器，从而使被阻塞的游戏逻辑得以继续。

-   **`selectSomething(clientParameter)`**: 这是一个更通用的、**由客户端驱动的** 操作。它用于通过 `selectany` 命令向服务器发送自定义字符串参数。它不对应于一个被阻塞的服务器状态。相反，它是客户端发送信息或触发不符合标准 `spin` 或 `selectOptional` 流程的自定义功能的一种方式。
