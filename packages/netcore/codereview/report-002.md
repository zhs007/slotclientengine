# Code Review 报告（report-002）

- 仓库：slotcraft-client-net
- 提交版本（git commit）：c2f79692b09a19facc1e079b658767773952e545
- 日期：2025-09-01

## 概览

本次再次对库进行全面评审，并在本地实际运行了 Lint/Typecheck/Build/Tests，结合覆盖率输出进行结论校验。整体代码质量较高：模块职责清晰、状态机明确、错误与重连路径覆盖较完善，测试与集成测试健全。与上次报告相比，明显的改进包括：

- 定时器类型已统一为 `ReturnType<typeof setTimeout/setInterval>`，浏览器/Node 双栈更友好。
- `connect()` 的防重入逻辑更严格，仅在 IDLE/DISCONNECTED 才允许，避免中途破坏连接流程。
- 新增 `index.ts` 作为公共出口，已统一导出 `SlotcraftClient` 与类型。
- `EventEmitter` 补充了 `onceMap`，`off()` 可正确移除 `once()` 包装器，弥补了上次指出的痛点。
- 引入 Vitest + v8 覆盖率与 ESLint v9 Flat Config，并在仓库中保留完整报告。

## 项目结构与配置

- 语言与构建：TypeScript（CommonJS 输出），`dist/` 为产物目录。
- Lint：ESLint v9 Flat Config，规则简洁，测试目录做了合理豁免。
- 测试：Vitest，含单测与基于 `ws` 的集成测试（模拟服务端）。
- 发布：`package.json` 暴露 `main/types` 指向 `dist/`，`files` 仅包含 `dist` 与 `docs`。

## 本地验证（质量门禁）

- Build：PASS（`npm run build`）
- Lint：PASS（`npm run lint`）
- Typecheck：PASS（`npm run typecheck`）
- Unit/Integration Tests：PASS（`npm test`）
  - 统计：Tests 38 passed (4 files)
  - 覆盖率（v8）：Statements 91.34%、Branches 82.38%、Functions 89.13%、Lines 91.34%
  - 覆盖盲点：`src/index.ts` 仅为 barrel 导出，覆盖为 0 可接受；`src/main.ts` 在少量分支尚有未覆盖行。

## 代码评审要点

### 1) `src/connection.ts`

- 优点
  - 对原生 WebSocket 封装薄、语义清晰；`connect()` 避免重复连接；`send()` 在非 OPEN 状态返回 `false`，避免抛错。
- 建议
  - 提供一个轻量 `getReadyState()` 只读查询（可选），便于调试与指标采集；不改变对外 API 简洁性。

### 2) `src/event-emitter.ts`

- 优点
  - `onceMap` 解决了 `once()` 包装器无法通过原回调 `off()` 的问题，已达实用级别。
- 建议（低优先）
  - `off()` 仅 `onceMap.delete(callback)`，若调用方传入的是包装函数本身（罕见），映射未同步清理；虽不影响功能，考虑同步保护以减少潜在泄漏。

### 3) `src/main.ts`（SlotcraftClient）

- 优点
  - 状态机清晰：CONNECTING → CONNECTED → LOGGING_IN → LOGGED_IN → ENTERING_GAME → IN_GAME → SPINEND/COLLECTING；并包含 RECONNECTING/DISCONNECTED。
  - 自动重连采用指数退避并封顶 30s，登录流程在重连后自动恢复；心跳采用 `keepalive`，失败有日志告警。
  - 事件维度较完善：`state`、`connect`、`disconnect`、`reconnecting`、`error`、`raw_message`、`message`，满足观测性；Logger 可注入或关闭（`null`）。
  - 缓存策略合理：`userbaseinfo/gamecfg/gameuserinfo/gamemoduleinfo` 更新到 `userInfo`，`spin/collect` 在 `cmdret` 与缓存配合进行状态驱动，降低对“被动消息时序”的耦合。

- 重要风险与改进建议
  1. 并发请求关联问题（建议：P0）
     - 现使用 `pendingRequests: Map<string, PendingRequest>`，以 `cmdid` 为 key。若同一 `cmdid` 并发发送（例如业务层误用 `send('gamectrl3')` 两次），后一次会覆盖前一次的 promise 记录，导致错配或悬挂。
     - 方案选项：
       - A. 在客户端注入“关联 ID”（如 `reqid`），出站消息包含 `reqid`，服务端回 `cmdret` 回传 `reqid`；客户端以 `(cmdid, reqid)` 做 key（需协议支持）。
       - B. 若协议不支持 `reqid`，则在库内对部分 `cmdid` 做“同类串行化/去重”保护：同 `cmdid` 存在未决请求时，直接拒绝或排队，直到前一个完成。
       - C. 至少对公开 API（`spin/collect/enterGame`）进行内部串行化，防止竞态调用；对 `send()` 在文档中明确“可能覆盖同 `cmdid` 未决请求”，或在 LOGGING_IN/ENTERING_GAME/IN_GAME 的关键阶段禁止重复发送同 `cmdid`。

  2. `LOGGING_IN` 时允许任意 `send()`（建议：P1）
     - 代码注释写明仅允许登录命令，但实现未强制：`allowedStates` 包含 `LOGGING_IN`，却未校验 `cmdid === 'flblogin'`。
     - 建议：在 `LOGGING_IN` 阶段仅放行 `flblogin`，其余命令直接拒绝，减少异常状态请求。

  3. JSON 解析重复（建议：P2）
     - `handleMessage()` 中对 `event.data` 至少 `JSON.parse` 了 2~3 次：
       ```ts
       const messages = Array.isArray(JSON.parse(event.data))
         ? JSON.parse(event.data)
         : [JSON.parse(event.data)];
       ```
     - 建议：只 parse 一次并缓存结果：`const parsed = JSON.parse(event.data); const messages = Array.isArray(parsed) ? parsed : [parsed];`。可读性与性能更优，也减少“部分 parse 成功/失败”的不一致风险。

  4. `collect()` 的序列推导（建议：P2）
     - 目前根据 `resultsCount`、`lastPlayIndex` 推导 `[resultsCount - 1, resultsCount]` 或 `[1]` 等序列，具体是否吻合协议需要确认。若协议层明确“多段结果需要顺序 `1..N` 收集”，则建议在注释中写清楚推导依据，或改为更直观的 `for (i=1..N)`（若语义一致）。

  5. 可观测性与可用性（建议：P2）
     - 心跳/重连日志在单测输出中出现，CI 可考虑默认 `logger: null` 或在 logger 中打标签便于过滤。
     - 建议在 Vitest 配置中加入覆盖率阈值（lines > 90% 等）强化质量门槛，并将 `src/index.ts` 从覆盖统计中排除，避免噪音。

### 4) `src/index.ts`

- 作为 barrel 导出已达设计目标。可在覆盖率配置中显式排除，避免报表噪音（当前整体覆盖已达标，仅为建议）。

### 5) 示例与文档

- `examples/example001.ts` 使用 `isomorphic-ws`：
  - 目前 `package.json` 未声明该依赖，仅有 `ws` 与 `@types/ws`。虽然本地运行成功，但建议：
    - A. 将 `isomorphic-ws` 加入 devDependencies；或
    - B. 直接以 `ws` 作为 Node 端 polyfill，并在示例中切换 import，以减少额外依赖。
- README 与 docs 内容简洁有效；可在 README 的 “Quick start” 增加一行说明如何运行示例（`.env`、`ts-node`），与 `docs/usage_*` 呼应。

## 测试与覆盖率观察

- 单元测试覆盖核心行为：连接/断开、状态流转、重连、参数校验、异常解析；集成测试通过 MockServer 验证真实 ws 流。
- 建议补充的测试用例：
  - 并发同 `cmdid` 发送覆盖问题（见上文 P0）。
  - `LOGGING_IN` 阶段误发非登录命令应拒绝（P1）。
  - `handleMessage()` 仅 parse 一次的行为一致性（P2）。
  - `collect()` 多段结果更复杂场景（如 `resultsCount=3`）。

## 结论

项目在可靠性、清晰度与测试性上表现优秀，关键改进点主要集中在“并发请求关联保护（P0）”与“登录阶段指令约束（P1）”两个方向；同时建议做少量性能/可读性优化与示例依赖整理。完成上述优化后，库在实际接入与持续交付中的稳定性将更进一步。

## 建议清单（按优先级）

- P0（必要）
  - 解决 `pendingRequests` 以 `cmdid` 为 key 的并发覆盖问题：引入 `reqid` 或对同类命令串行化/拒绝并发。
- P1（较高）
  - 限制 `LOGGING_IN` 阶段仅允许 `flblogin` 命令；其余命令直接拒绝。
  - 示例依赖：为 `examples/example001.ts` 增加 `isomorphic-ws` 依赖，或改用 `ws` 以降低依赖面。
- P2（一般）
  - `handleMessage()` 只做一次 `JSON.parse`。
  - 在 Vitest 增加覆盖率阈值，且排除 `src/index.ts`。
  - `EventEmitter.off()` 对传入包装函数时同步清理映射（健壮性补丁）。
  - README 增补运行示例的指引片段。

## 质量门禁（本次评审结论）

- Build：PASS
- Lint/Typecheck：PASS
- Unit/Integration Tests：PASS（38/38）
- 覆盖率：Statements 91.34%、Branches 82.38%、Functions 89.13%、Lines 91.34%

## 附：变更影响与风险评估（针对建议）

- 引入 `reqid` 需要协议配合；若不可行，串行化/拒绝并发仅影响少量极端调用场景，实际风险可控。
- 登录阶段指令限制为内部校验，向下兼容（对误用场景更早失败）。
- JSON 解析与事件清理属于内部重构，不改变公共 API。
- 覆盖率阈值仅影响 CI，能在早期暴露回退问题，建议启用。
