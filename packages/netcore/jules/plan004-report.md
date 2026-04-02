# 任务报告: plan004 - 公共 API 与事件分发

## 任务目标

构建与上层游戏模块交互的桥梁，包括实现一个轻量级的事件分发器，并设计一套简洁、易用的 Promise-based 公共 API。

## 执行总结

此任务成功完成，极大地提升了库的易用性。

1.  **`EventEmitter` 实现**: 在 `src/event-emitter.ts` 中，从零开始实现了一个简单的 `EventEmitter` 类，包含了 `on`, `off`, `emit`, `once` 等核心功能，并为其编写了完整的单元测试。
2.  **客户端集成**: 将 `EventEmitter` 实例集成到 `SlotcraftClient` 中，并暴露了 `on`, `off`, `once` 方法，允许用户监听客户端的生命周期事件。
3.  **事件触发**: 在 `SlotcraftClient` 的关键逻辑点（如连接成功、收到消息、断开连接等）添加了 `emit` 调用，以向外广播 `connect`, `ready`, `disconnect`, `data` 等事件。
4.  **Promise-based API**:
    - 重构了 `connect()` 方法，使其返回一个 `Promise`，该 Promise 在客户端成功进入游戏后 `resolve`，在连接失败时 `reject`。
    - 实现了新的公共 `send()` 方法，该方法同样返回 `Promise`。通过内部维护一个 `pendingRequests` Map，`send` 方法能够将请求的 `ctrlid` 与服务器的响应进行匹配，并在收到响应后 `resolve` 或 `reject` 对应的 Promise。

## 最终状态

**完成**

## 备注

在为新的异步 API 编写测试时，遇到了由未处理的 Promise 拒绝（unhandled promise rejection）导致的 Jest worker 崩溃问题。通过仔细分析测试用例，发现是一些测试在触发了会导致 `connect` Promise 被 `reject` 的事件后，没有添加相应的 `.catch()` 处理。通过为这些预期的拒绝添加空的 `.catch()` 处理器，成功解决了测试运行器崩溃的问题。
