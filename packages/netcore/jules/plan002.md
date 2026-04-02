# 任务 002：基础 WebSocket 连接管理

## 目标

创建一个独立的、可重用的 `Connection` 类，用于封装原生的 WebSocket API。这个类将只负责最基础的连接、断开、发送和接收数据，不包含任何业务逻辑。

## 主要步骤

1.  **创建文件**:
    - 在 `src/` 目录下创建 `connection.ts` 文件。

2.  **实现 `Connection` 类**:
    - **构造函数**: `constructor(url: string)`，接收 WebSocket 服务器地址。
    - **连接方法**: `connect(): void`。此方法会创建 `WebSocket` 实例并发起连接。
    - **断开方法**: `disconnect(): void`。此方法会主动关闭 WebSocket 连接。
    - **发送方法**: `send(data: string | ArrayBuffer): boolean`。此方法用于向服务器发送数据。在发送前，应检查 `readyState` 是否为 `OPEN`。如果连接未打开，则发送失败，返回 `false`。
    - **状态属性**: 提供一个 `isOpen(): boolean` 的 getter，用于检查连接是否处于 `OPEN` 状态。

3.  **处理 WebSocket 事件**:

- `Connection` 类应该允许外部注入事件回调函数，以便将 WebSocket 的原生事件（`onopen`, `onclose`, `onerror`, `onmessage`）通知给上层业务逻辑（即主客户端 `SlotcraftClient`）。
  - **设计**: 可以通过公共属性（如 `onOpen: (() => void) | null = null;`）或方法（如 `setOnOpen(callback: () => void)`）来实现。
  - 在内部，将 `WebSocket` 实例的事件处理器绑定到这些回调上。例如：
    ```typescript
    this.ws.onopen = () => {
      if (this.onOpen) {
        this.onOpen();
      }
    };
    ```

4.  **编写单元测试**:
    - 在 `tests/` 目录下创建 `connection.test.ts`。
    - 使用 Jest 的 `mock` 功能来模拟原生的 `WebSocket` 类。这是一个关键步骤，可以让我们在没有真实服务器的情况下测试 `Connection` 类的行为。
    - **测试用例**:
      - 测试 `connect()` 是否会创建 `WebSocket` 实例并使用正确的 URL。
      - 测试 `disconnect()` 是否会调用 `ws.close()`。
      - 测试 `send()` 在连接打开时调用 `ws.send()`，在连接关闭时则不调用并返回 `false`。
      - 测试当模拟的 `ws` 触发 `open`, `close`, `message`, `error` 事件时，`Connection` 类对应的回调函数是否被正确调用。

## 验收标准

- `src/connection.ts` 文件已创建并实现了 `Connection` 类。
- 该类能够处理连接、断开、发送和接收消息的基本操作。
- 该类通过回调函数将原生 WebSocket 事件暴露给调用者。
- `tests/connection.test.ts` 包含了对 `Connection` 类的完整单元测试，且所有测试通过。
- 代码注释清晰，类型定义完整。
