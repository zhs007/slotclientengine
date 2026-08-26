# WebSocket 加密二进制修复说明

## 目的

本文用于把 `gitee/dev` 上 WebSocket 加密二进制功能的修改原因、协议假设、修复范围和验收方法交接给后续测试人员。当前结论是先在 `dev` 上完成真实服务器测试，再决定是否合并到主分支。

相关提交：

- 原功能提交：`839a87dd`（余额修复与 WebSocket 加密二进制功能）
- 超时恢复提交：`7200de44`
- 本次修复提交：`08be0476`

## 为什么需要修改

原功能方向保留，但实现不能直接合并，主要存在以下问题：

1. `ReplayBootstrapInfo` 删除了 `maxBetBootsBuy` 和 `maxTotalBetLimit`，但 Replay schema 仍使用这两个字段，导致 TypeScript typecheck 和 build 失败。
2. Live `gamecfg` 不再缓存上述两个下注限制，造成已有公开 `UserInfo` 行为回归和现有测试失败。
3. binary URL 在构造函数中使用 `options.token` 拼接。现有 API 允许稍后通过 `connect(token)` 提供 token，此时 URL 会提前变成 `token=undefined`。
4. URL 直接追加 `?token=...`，不能正确处理已有查询参数，也没有执行查询参数编码。
5. `send()` 在异步加密完成后才登记 pending cmdid。两个立即发出的相同 cmdid 都可能通过检查并被发送，随后覆盖 pending request。
6. 解密异常发生在旧错误边界之外，坏密文可能形成未处理的 Promise rejection，相关请求只能等待超时。
7. `collectinfo.gold` 未校验类型，缺失或非法值可能覆盖已有余额。

## 关于消息顺序

WebSocket 自身保证 message 按发送顺序投递，并保留每条 WebSocket message 的边界；本问题与 TCP 粘包无关。

风险来自应用层的 async handler：旧实现收到消息 A 后执行 `await decrypt(A)`，在等待期间消息 B 可以进入另一次 `handleMessage(B)`。WebSocket 的事件触发顺序仍是 A、B，但 Web Crypto 不承诺两个独立异步操作的完成顺序，因此 B 可能先执行 JSON 解析和状态更新。

本次修复增加实例级入站 Promise 队列。下一条消息只有在上一条消息完成解密、解析和状态处理后才开始处理，从而让应用层处理顺序与 WebSocket 投递顺序一致。单条消息解密失败会派发 `error`，队列随后继续处理下一条消息。

## binary 协议假设

只有服务端实现以下协议时才启用 `isWsBinary: true`：

- token 从构造参数或 `connect(token)` 取得，按 UTF-8 编码后必须恰好为 32 字节。
- token 同时作为 WebSocket URL 的 `token` 查询参数和当前 socket 的 AES-256 key。
- 加密算法为 AES-GCM，认证标签长度为 128 bit。
- 每条二进制消息格式为：`16-byte IV + 16-byte auth tag + ciphertext`。
- 浏览器 WebSocket `binaryType` 设置为 `arraybuffer`。
- 当前 socket 生命周期内固定使用建连时的 key；重连前根据当前 token 重新准备 URL 和 key。
- `raw_message` 事件继续提供加密前或解密后的 JSON 文本，不直接暴露二进制密文。

生产环境应使用 `wss://`。由于协议要求 token 出现在查询参数中，还应确认反向代理和访问日志不会记录或外泄完整 URL。

## 修复后的行为

- 在实际 `connect(token)` 时准备 binary URL 和 CryptoKey。
- 使用 `URL`/`URLSearchParams` 保留已有查询参数并编码 token。
- 在打开 socket 前校验 32-byte AES key，失败时保持未连接状态并显式拒绝。
- 在任何异步加密开始前同步登记 pending cmdid。
- 请求在加密期间超时或被取消后，不再发送迟到的密文。
- 入站消息串行解密和处理；坏密文派发 `error` 后不阻塞后续消息。
- 重连前使用当前 token 重新准备 URL 和 key。
- 恢复 Replay 下注限制字段以及 Live `gamecfg` 缓存。
- 仅在 `collectinfo.gold` 为 number 时更新余额。
- Web Crypto 从 `globalThis.crypto` 取得，兼容浏览器和具备 Web Crypto 的 Node 测试环境。

## 自动验收

在 `08be0476` 上执行：

```bash
pnpm --filter @slotclientengine/netcore run check
pnpm --filter @slotclientengine/netcore format:check
git diff --check
```

结果：

- lint 通过。
- typecheck 通过。
- build 通过。
- 7 个测试文件通过。
- 95 个测试通过，1 个已有测试保持跳过。
- Prettier 和 `git diff --check` 通过。

新增测试覆盖：

- 在构造函数不传 token、改由 `connect(token)` 传入时，binary 登录成功。
- 已有 URL query 被保留，token 使用正确的 query 参数追加。
- 客户端和 mock server 完成真实 AES-GCM 加密/解密往返。
- 相同 cmdid 在异步加密前完成去重，只发送第一条请求。
- 坏密文产生 `error`，后续合法消息仍能继续处理。
- `collectinfo.gold` 非数字时不污染已有余额。
- 应用层消息 handler 严格串行执行。

## 提交者真实服务器测试清单

自动测试不能替代真实协议联调。提交者应在测试环境确认：

1. 使用构造参数 token 和 `connect(token)` 两种方式分别完成连接与登录。
2. 服务端接受客户端发送的 `IV + tag + ciphertext` 格式，并以相同格式返回消息。
3. 登录、进入游戏、spin、collect、余额查询和 keepalive 均能正常往返。
4. `gamemoduleinfo` 与随后 `cmdret` 的状态、结果和余额符合服务端发送顺序。
5. `collectinfo.gold` 在一轮结束后更新为正确余额。
6. 主动断网或服务端断开后，可以使用当前 token 正常重连和重新登录。
7. URL 原本已有 query 时，服务端仍能读取原参数和 token。
8. 错误 token、非 32-byte token、错误密文和认证标签失败时，客户端能显式报错且不产生半完成请求。
9. 确认服务端、网关和日志系统对 URL query 中的 token 有适当脱敏策略。

## 后续合并条件

在决定合并前，至少需要提交者确认：

- 真实服务端协议与本文的 key、IV、tag 和 payload 排列完全一致。
- 完整游戏流程和重连流程通过测试。
- 余额及下注限制值正确。
- token 在 URL query 中的安全处理符合部署要求。

如果服务端协议与上述格式不同，应修改唯一的协议实现和本文档，不增加静默 fallback 或多种格式猜测。
