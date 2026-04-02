# 任务报告: plan005 - 断线重连与请求缓存

## 任务目标

提升网络库的鲁棒性，在网络意外断开时，实现自动重连机制，并在重连期间缓存用户的关键操作请求，待重连成功后自动发送。

## 执行总结

此任务是库高级功能的关键，已成功完成。

1.  **自动重连逻辑**:
    - 在 `handleClose` 方法中增加了判断，当检测到非正常关闭 (`wasClean: false`) 时，客户端状态会切换到 `RECONNECTING`。
    - 实现了 `tryReconnect` 方法，该方法采用带上限的指数退避算法（exponential backoff）来计算重连延迟，避免了在服务器故障时频繁重连。
    - 重连成功后，会重置重连尝试次数；达到最大尝试次数后，则会彻底放弃并进入 `DISCONNECTED` 状态。
2.  **请求缓存**:
    - 在 `SlotcraftClient` 中添加了 `requestQueue` 数组。
    - 修改了 `send()` 方法的逻辑：当客户端处于 `RECONNECTING` 状态时，`send` 请求不会被立即拒绝，而是连同其 `Promise` 的 `resolve`/`reject` 函数一起被存入队列。
3.  **队列处理**:
    - 实现了 `processRequestQueue` 方法。当客户端重连成功并再次进入 `IN_GAME` 状态后，该方法会被调用，遍历队列并重新发送所有被缓存的请求，同时将结果传递给调用者最初获得的 `Promise`。
4.  **单元测试**: 在 `tests/main.test.ts` 中添加了新的 `describe` 块，专门用于测试各种重连和缓存场景，包括重连触发、成功处理队列、以及重连最终失败后拒绝队列中的请求等。

## 最终状态

**完成**

## 备注

在实现和测试此功能时，遇到了两个主要的挑战：

1.  **`ReferenceError`**: 在实现请求队列时，由于在 `new Promise` 的构造函数内部引用了该 Promise 自身，导致了“Cannot access before initialization”的错误。通过调整队列的数据结构，不再存储 Promise 自身，只存储其 `resolve` 和 `reject` 函数，解决了此问题。
2.  **Unhandled Promise Rejection**: 在测试“重连最终失败”的场景时，由于内部重连逻辑调用的 `connect` 方法返回了一个未被测试代码捕获的 Promise，导致了测试运行器崩溃。通过修改重连逻辑，使其直接调用底层的 `connection.connect()` 而非会创建 Promise 的公共 `connect()` 方法，从架构上解决了此问题。
