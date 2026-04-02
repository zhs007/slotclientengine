# 任务 004：公共 API 与事件分发

## 目标

构建与游戏模块交互的桥梁。这包括实现一个轻量级的事件分发器，并将其集成到 `SlotcraftClient` 中，同时设计一套简洁、易用的公共 API，供游戏层调用。

## 主要步骤

1.  **实现事件分发器 (`src/event-emitter.ts`)**:
    - 由于要减少依赖，我们将手写一个简单的事件分发器。
    - **创建文件**: `src/event-emitter.ts`。
    - **实现 `EventEmitter` 类**:
      - `private listeners: { [key: string]: Function[] } = {}`: 用于存储事件和对应的监听器数组。
      - `on(event: string, callback: Function): void`: 订阅事件。检查事件名，如果不存在，则创建新数组，然后将回调函数加入。
      - `off(event: string, callback: Function): void`: 取消订阅。找到对应的回调并从数组中移除。
      - `emit(event: string, ...args: any[]): void`: 触发事件。遍历对应事件的所有回调函数并执行。
      - `once(event: string, callback: Function): void`: 实现只监听一次的订阅。
    - **编写单元测试**: 创建 `tests/event-emitter.test.ts`，测试 `on`, `off`, `emit`, `once` 的功能是否正确。

2.  **集成事件分发到 `SlotcraftClient`**:

- 在 `SlotcraftClient` 类中，创建一个 `EventEmitter` 的实例。

  ```typescript
  import { EventEmitter } from './event-emitter';
  ```

class SlotcraftClient {
private emitter = new EventEmitter();

        // 公开的 on, off, once 方法
        public on(event: string, callback: Function) {
          this.emitter.on(event, callback);
        }

        public off(event: string, callback: Function) {
          this.emitter.off(event, callback);
        }
        // ...
      }
      ```

- 在 `SlotcraftClient` 的关键逻辑点触发事件。例如：
  - 连接成功 (`handleOpen`) -> `this.emitter.emit('connect')`
  - 登录成功 -> `this.emitter.emit('login', userInfo)`
  - 进入游戏成功 -> `this.emitter.emit('ready', gameInfo)`
  - 收到游戏数据 -> `this.emitter.emit('data', gameData)`
  - 发生错误 -> `this.emitter.emit('error', errorDetails)`
  - 连接断开 -> `this.emitter.emit('disconnect', { code, reason })`

3.  **设计和实现公共 API**:
    - **API 目标**: 简洁、易用、符合用户直觉。
    - **`connect()`**: 这个方法已经在任务3中创建，现在需要确保它返回一个 `Promise`，该 `Promise` 在“进入游戏”成功后 `resolve`，在任何一步失败后 `reject`。这样，调用者可以方便地 `await client.connect()`。
    - **`send(command: string, params: object): Promise<any>`**: 这是核心的发送接口。
      - **职责**:
        1.  检查当前状态是否为 `IN_GAME`。如果不是，应返回一个 `Promise.reject` 并附带错误信息（后续任务会改为加入队列）。
        2.  根据协议，自动填充 `ctrlid`。`ctrlid` 应该在内部自增或根据服务器规则管理。
        3.  构造完整的消息对象 `{ cmd: command, ...params, ctrlid: this.getCtrlId() }`。
        4.  调用 `this.connection.send()` 发送消息。
        5.  **处理响应**: 这是关键。`send` 方法需要返回一个 `Promise`，该 `Promise` 在收到对应 `ctrlid` 的服务器响应后 `resolve` (成功) 或 `reject` (失败)。这需要一个 `Map` 来存储 `ctrlid` 和对应的 `Promise` 的 `resolve`/`reject` 函数。
            - 发送时: `this.pendingRequests.set(ctrlid, { resolve, reject })`。
            - `handleMessage` 中: 收到响应后，从 `pendingRequests` 中找到对应的 `ctrlid`，并调用 `resolve` 或 `reject`，然后从 Map 中删除。
    - **`disconnect()`**: 主动断开连接。

4.  **编写 API 相关的单元测试**:
    - 在 `tests/main.test.ts` 中增加测试用例。
    - 测试 `connect()` 返回的 Promise 是否在正确的时间点 `resolve` 或 `reject`。
    - 测试 `send()` 方法：
      - 在非 `IN_GAME` 状态下调用，应立即 `reject`。
      - 在 `IN_GAME` 状态下调用，应正确发送消息。
      - 模拟收到对应 `ctrlid` 的成功响应，验证 `send` 返回的 Promise 是否 `resolve` 并带有正确的数据。
      - 模拟收到对应 `ctrlid` 的失败响应，验证 `send` 返回的 Promise 是否 `reject` 并带有错误信息。
    - 测试 `on`, `off` 等事件方法是否能正常工作。

## 验收标准

- `src/event-emitter.ts` 和对应的测试已完成。
- `SlotcraftClient` 成功集成了事件分发器，并在关键节点触发事件。
- 公共 API (`connect`, `send`, `disconnect`, `on`, `off`) 已实现。
- `send` 方法是异步的，通过 `Promise` 返回结果，并能正确处理 `ctrlid` 的匹配。
- 单元测试覆盖了 API 的各种成功和失败场景。
