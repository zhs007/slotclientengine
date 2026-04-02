# 任务 005：断线重连与请求缓存

## 目标

提升网络库的鲁棒性。当网络意外断开时，库应能自动尝试重新连接，并在重连期间缓存用户的关键操作请求，待重连成功后，自动重新发送这些请求，对上层应用做到尽可能的透明。

## 主要步骤

1.  **实现重连触发机制**:

- 在 `SlotcraftClient` 的 `handleClose(event)` 方法中，增加逻辑判断。
  - 检查 `event.wasClean` 标志。如果为 `false`，则表示是意外断开，需要启动重连流程。
  - 设置一个新的状态 `RECONNECTING`，并立即转换到此状态 `this.state = ConnectionState.RECONNECTING`。
  - 对外触发 `reconnecting` 事件，通知上层应用。

2.  **实现重连策略 (Exponential Backoff)**:
    - 为了避免在服务器故障时造成 "惊群效应"，应采用带随机抖动的指数退避策略。
    - **逻辑**:
      - 维护一个重连尝试次数的计数器 `reconnectAttempts`。
      - 计算延迟时间，例如 `delay = Math.min(30000, (2 ** reconnectAttempts) * 1000) + Math.random() * 1000`。
      - 使用 `setTimeout` 在延迟后调用 `connect()` 方法。
      - `connect()` 方法的开头需要检查当前状态。如果状态是 `RECONNECTING`，则正常执行；如果是 `IDLE`，则走首次连接流程。
    - 重连成功（进入 `IN_GAME` 状态）后，必须重置 `reconnectAttempts` 计数器。
    - 设置一个最大重连次数，超过后应停止重连，并对外触发一个永久性失败的事件 `reconnect_failed`。

3.  **实现请求缓存/队列**:

- 在 `SlotcraftClient` 中创建一个私有队列 `private requestQueue: any[] = []`。
  - 修改 `send()` 方法的逻辑：
    - 当调用 `send()` 时，如果当前状态是 `IN_GAME`，则直接发送。
    - 如果当前状态是 `RECONNECTING` 或 `DISCONNECTED`，则不应立即拒绝 `Promise`，而是将该请求（包括其 `resolve`, `reject` 函数和请求参数）存入 `requestQueue`。
    - `send()` 方法此时应返回一个不会被 `resolve`/`reject` 的 `Promise`，直到重连成功或失败。

4.  **处理队列中的请求**:
    - 当重连并成功进入游戏（状态再次变为 `IN_GAME`）后，立即处理 `requestQueue`。
    - 遍历队列，依次重新发送所有被缓存的请求。
    - 清空队列 `this.requestQueue = []`。
    - 如果重连最终失败（达到最大尝试次数），则必须遍历队列，将所有等待的 `Promise` 全部 `reject`，并附上失败原因。

5.  **编写单元测试**:
    - 在 `tests/main.test.ts` 中增加专门的重连场景测试。
    - **测试用例**:
      - 模拟一次非正常的连接关闭。验证状态是否切换到 `RECONNECTING`，并触发了 `reconnecting` 事件。
      - 验证重连逻辑是否在延迟后尝试调用 `connect`。
      - 在 `RECONNECTING` 状态下调用 `send()`，验证请求是否被加入队列而不是被发送。
      - 模拟重连成功。验证队列中的请求是否被自动发送，并且对应的 `Promise` 是否在收到响应后被 `resolve`。
      - 模拟重连最终失败。验证队列中所有请求的 `Promise` 是否都被 `reject`。
      - 测试主动调用 `disconnect()` 时，不应触发重连逻辑。

## 验收标准

- 当 WebSocket 意外断开时，`SlotcraftClient` 会自动进入 `RECONNECTING` 状态。
- 重连尝试遵循指数退避策略。
- 在断线和重连期间，`send()` 请求会被缓存。
- 重连成功后，缓存的请求会被自动发送。
- 重连彻底失败后，缓存的请求会以失败状态结束。
- 所有重连相关的逻辑都有对应的单元测试覆盖。
