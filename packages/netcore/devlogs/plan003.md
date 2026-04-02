# 任务 003：核心状态机与协议逻辑

## 目标

实现 `SlotcraftClient` 主类，该类是整个库的核心。它将使用 `Connection` 类进行网络通信，并管理从连接到游戏的完整状态机、处理所有服务器协议、维护用户信息和心跳。

## 主要步骤

1.  **创建文件**:
    - 在 `src/` 目录下创建 `main.ts` 文件。

2.  **实现 `SlotcraftClient` 类骨架**:
    - 引入 `Connection` 和 `src/types.ts` 中定义的类型。
    - **状态管理**:
      - 私有属性 `private state: ConnectionState`，并初始化为 `IDLE`。
      - 私有属性 `private userInfo: UserInfo`，用于存储用户数据。
      - 私有属性 `private connection: Connection`。

- **构造函数**: `constructor(options: SlotcraftClientOptions)`，保存配置。
  - **核心方法(桩)**: 创建 `connect()`, `disconnect()`, `sendGameCtrl(params: any)` 等公共方法的空实现。

3.  **实现连接与登录流程**:
    - 在 `connect()` 方法中，实现完整的“连接 -> 登录 -> 进入游戏”流程。
    - 实例化 `Connection` 并调用其 `connect()` 方法。

- 设置 `connection` 实例的 `onOpen`, `onMessage`, `onClose`, `onError` 回调，将它们链接到 `SlotcraftClient` 内部的私有处理方法，例如 `private handleOpen()`, `private handleMessage(data)`, `private handleClose()`。
  - **状态转换**:
    - 调用 `connect()` 时，设置状态为 `CONNECTING`。
    - `handleOpen()`: 连接成功，发送 `login` 消息，设置状态为 `LOGGING_IN`。
    - `handleMessage()`: 这是最复杂的部分。
      - 解析消息 `JSON.parse(data)`。
      - 使用 `switch (message.cmd)` 来处理不同类型的服务器消息。
      - **登录响应**: 收到 `login` 响应后，如果成功，保存 `token`、`ctrlid` 等信息到 `userInfo`，然后发送 `enter_game` 消息，设置状态为 `ENTERING_GAME`。如果失败，处理错误，关闭连接。
      - **进入游戏响应**: 收到 `enter_game` 响应后，如果成功，更新 `userInfo`，设置状态为 `IN_GAME`，此时整个连接流程才算完成。对外触发 `ready` 或 `gameReady` 事件。
      - **其他消息**: 处理如 `balance_update`, `game_result` 等服务器主动推送的消息。

4.  **实现心跳 (Keep-Alive)**:
    - 在 `login` 成功后，使用 `setInterval` 启动一个定时器，定期向服务器发送 `keepalive` (或 `heartbeat`) 消息。
    - 在 `disconnect()` 或 `handleClose()` 中，必须使用 `clearInterval` 清除该定时器，防止内存泄漏。
    - 保存定时器的 ID，以便清除。

5.  **错误处理**:
    - 在 `handleMessage()` 中，检查服务器返回的每个响应是否包含 `error` 或 `errno` 字段。
    - 根据服务器文档，处理不同类型的错误。有些错误可能需要断开连接，有些可能只是操作失败，需要通知上层。
    - 实现 `handleClose()` 和 `handleError()`，记录日志，并根据当前状态决定是否进入重连逻辑（重连逻辑在后续任务中实现）。

6.  **编写单元测试 (`tests/main.test.ts`)**:
    - 这是最重要的测试文件。
    - **Mock `Connection`**: 模拟 `Connection` 类，以便可以手动触发 `onOpen`, `onMessage` 等回调。
    - **测试状态机**:
      - 测试调用 `connect()`后，状态是否正确变为 `CONNECTING`。
      - 模拟 `onOpen`，测试是否发送了 `login` 消息，并且状态变为 `LOGGING_IN`。
      - 模拟收到 `login` 成功响应，测试是否发送了 `enter_game` 消息，并且状态变为 `ENTERING_GAME`。
      - 模拟收到 `enter_game` 成功响应，测试状态是否变为 `IN_GAME`。
      - 测试心跳定时器是否在正确的时间启动和停止。
    - **测试消息处理**:
      - 模拟收到各种服务器推送消息，验证 `userInfo` 是否被正确更新。
      - 模拟收到错误响应，验证是否执行了正确的错误处理逻辑。

## 验收标准

- `src/main.ts` 文件实现了 `SlotcraftClient` 类。
- `connect()` 方法能完整地执行连接、登录、进游戏流程，并正确维护状态。
- 心跳机制能正常工作。
- 能够正确解析和处理服务器的主要消息类型和错误码。
- `tests/main.test.ts` 提供了覆盖核心流程和状态转换的单元测试。
