# 任务报告: plan002 - 基础 WebSocket 连接管理

## 任务目标

创建一个独立的、可重用的 `Connection` 类，用于封装原生的 WebSocket API，处理最基础的连接、断开、发送和接收数据的功能。

## 执行总结

此任务成功完成。

1.  **实现 `Connection` 类**: 在 `src/connection.ts` 中创建了 `Connection` 类。该类封装了原生 WebSocket 的实例化、`connect`、`disconnect` 和 `send` 方法。
2.  **事件回调**: 通过 `onOpen`, `onClose`, `onMessage`, `onError` 等公共可分配属性，将原生 WebSocket 事件暴露给上层调用者，实现了逻辑与视图的分离。
3.  **单元测试**: 在 `tests/connection.test.ts` 中编写了单元测试。

## 最终状态

**完成**

## 备注

此任务的挑战主要集中在单元测试的编写上。由于测试环境 (Node.js) 缺乏原生的 `WebSocket` 对象，我实现了一套复杂的 mock 机制。在调试过程中，我遇到了以下几个关键问题并最终解决：

- **TypeScript 类型推断问题**: `mock.readyState` 的类型被错误推断为字面量类型，通过显式类型声明解决。
- **Mock 实例不一致**: 最初的 mock 策略导致测试代码无法正确引用 `Connection` 内部的 WebSocket 实例。通过重构测试，为每次实例化创建一个独立的 mock 对象，并手动追踪实例，解决了此问题。
- **全局 `WebSocket` 常量丢失**: 在 mock `WebSocket` 全局对象时，丢失了其静态常量（如 `OPEN`, `CLOSED`），导致逻辑判断出错。最终通过在 mock 对象上重新附加这些常量解决了问题。

经过多次迭代，最终的测试代码变得非常健壮，确保了 `Connection` 类的可靠性。
