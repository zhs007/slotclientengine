# 任务报告: plan003 - 核心状态机与协议逻辑

## 任务目标

实现 `SlotcraftClient` 主类，管理从连接到游戏的完整状态机，处理所有服务器协议（登录、进入游戏），并维护心跳机制。

## 执行总结

此任务是项目的核心，已成功完成。

1.  **`SlotcraftClient` 类实现**: 在 `src/main.ts` 中创建了 `SlotcraftClient` 类，作为所有核心逻辑的容器。
2.  **状态机管理**: 实现了基于 `ConnectionState` 枚举的状态机。客户端在执行操作（如 `connect`）或接收消息时，会正确地在 `IDLE`, `CONNECTING`, `LOGGING_IN`, `IN_GAME` 等状态之间转换。
3.  **协议流程**: 实现了“连接 -> 登录 -> 进入游戏”的自动化流程。当用户调用 `connect()` 时，客户端会自动按顺序发送 `login` 和 `enter_game` 消息。
4.  **心跳机制**: 实现了 `startHeartbeat` 和 `stopHeartbeat` 方法。在成功进入游戏后，客户端会启动一个 `setInterval` 定时器，定期向服务器发送 `keepalive` 消息以维持长连接。在断开连接时，该定时器会被正确清除。
5.  **单元测试**: 在 `tests/main.test.ts` 中编写了针对状态机和心跳的单元测试。通过 mock `Connection` 类并模拟服务器消息，验证了状态转换和心跳发送的正确性。

## 最终状态

**完成**

## 备注

在测试心跳机制时，遇到了 `setInterval` 和 `clearInterval` 无法被 Jest 正确断言的问题。通过使用 `jest.spyOn` 显式地监视 `global` 对象上的这些计时器函数，成功解决了此问题，确保了测试的准确性。
