# Code Review 报告（report-001）

- 仓库：slotcraft-client-net
- 提交版本（git commit）：6688b14b69d8c9bb9d0d93a442efd52ea2b9b075
- 日期：2025-08-28

## 概览

该项目是一个前端 WebSocket 网络库（TypeScript），对连接管理、登录/入局流程、心跳、自动重连和请求应答（基于 ctrlid）进行了封装，并提供了基础的事件系统和单元测试。整体结构清晰、职责划分合理，具备良好的可读性与较完善的测试覆盖思路。

## 项目结构与配置

- 语言与构建
  - TypeScript，`tsconfig.json` 目标 ES2020，模块 CommonJS，包含 DOM lib。
  - 输出路径为 `dist/`，入口为 `src/main.ts`，`package.json` 指向 `dist/main.js` 与 `dist/main.d.ts`。
- 测试
  - 使用 Jest + ts-jest，测试文件位于 `tests/`，覆盖核心模块：`connection`、`event-emitter`、`main`。
  - `jest.config.js` 已启用覆盖率统计，并排除了 `src/types.ts`。

## 构建与测试现状（本地尝试）

- 运行测试时报错：`jest: command not found`。原因：尚未安装依赖（未执行 `npm install`）。
- 由于评审需保持最小外部影响，本次未执行依赖安装。建议在本地或 CI 中先安装依赖后再验证：
  - 可选命令：
    - `npm ci`
    - `npm test`

## 代码评审

### 1) `src/connection.ts`

- 优点
  - 对原生 WebSocket 进行薄封装，暴露 `onOpen/onClose/onMessage/onError` 回调，简洁易用。
  - `connect()` 中若已有连接，会先断开以避免重复连接，逻辑防御合理。
  - `send()` 在非 OPEN 状态下返回 `false`，避免异常。
- 建议
  - `send()` 的入参类型目前为 `string | ArrayBuffer`，浏览器实际还支持 `Blob`、`ArrayBufferView`。可考虑放宽为 `string | ArrayBufferLike | Blob | ArrayBufferView` 提升兼容性。
  - 可补充只读属性暴露当前 `readyState`（或简单 getter），便于调用方判断状态。
- 最终方案
  - connection 只用于这个协议，所以send只需要支持 string 即可，不需要做更多的冗余设计。
  - readyState 可以暴露接口，但SlotcraftClient应该使用，当前的state应该需要考虑到readyState，外部不需要知道connection，接口应该尽可能简洁。

### 2) `src/event-emitter.ts`

- 优点
  - API 简洁（on/off/once/emit），实现清晰，足以覆盖当前需求。
- 局限与建议
  - `once()` 通过包装回调实现，一旦注册后无法通过原回调引用直接 `off` 移除该包装。可选改进：
    - `once()` 返回用于取消订阅的函数或标识；
    - 在内部保存包装映射，`off` 时可识别并移除对应包装器。
- 局限与建议里的属于一个潜在的bug，需要修正。

### 3) `src/main.ts`（SlotcraftClient）

- 优点
  - 状态机拆分较清楚：CONNECTING → CONNECTED → LOGGING_IN → ENTERING_GAME → IN_GAME；
  - 登录、入局消息自动发送；进入 IN_GAME 后启动心跳，处理排队请求；
  - 支持指数回退的自动重连并保留未发出的请求，连接恢复后自动冲刷队列；
  - 对服务端 `errno` 做集中处理，能及时触发错误并断开。
- 可能的问题与改进点
  1.  `connect()` 的防重入范围不足：
      - 仅阻止 `CONNECTING` 与 `IN_GAME` 状态再次 `connect()`；但在 `CONNECTED/LOGGING_IN/LOGGED_IN/ENTERING_GAME` 阶段仍可调用 `connect()`，这会触发 `Connection.connect()` 内部先 `disconnect()` 再重连，可能打断正在进行的首连流程。
      - 建议：仅在 `IDLE`/`DISCONNECTED` 状态允许 `connect()`，其它状态一律拒绝并返回错误。
  2.  计时器类型：
      - 代码使用 `NodeJS.Timeout`（如 `heartbeatInterval: NodeJS.Timeout | null`、`reconnectTimeout: NodeJS.Timeout | null`）。该库面向浏览器，TypeScript 在 DOM 环境下 `setInterval` 返回 `number`，使用 `NodeJS.Timeout` 需要 `@types/node` 支持，且在纯浏览器项目中概念不匹配，易引入类型问题。
      - 建议：改为 `ReturnType<typeof setInterval>` / `ReturnType<typeof setTimeout>`，可同时兼容 Node 与浏览器类型系统。
  3.  错误处理策略：
      - 收到 `errno` 后立即 `disconnect()`，通常会触发一次“干净关闭”。若业务上应区分“可重试错误”和“不可重试错误”，可考虑：
        - 提供钩子或策略配置，决定遇错时是否尝试重连；
        - 或在 `error` 事件回调中允许上层决定是否 `disconnect()`。
  4.  事件与可观测性：
      - 当前事件包含 `connect`、`ready`、`disconnect`、`reconnecting`、`error`，已基本可用；
      - 事件已经足够，但state欠缺粒度，可增加更细粒度state（如 `logged_in`、`entered_game`），方便上层对流程阶段做区分；
      - `console.log`/`console.error` 可改为可注入的 logger 或通过开关控制，以便生产环境降噪。
  5.  API 体验：
      - `send(cmd, data)` 仅在 `IN_GAME` 允许发送。若存在登录前需要交互的场景，可提供队列或 Hook 让调用方自定义策略（当前在 `RECONNECTING` 已做排队，首连阶段或许也可考虑）。

### 4) `src/types.ts`

- 类型定义齐全清晰，`ConnectionState` 划分合理。
- 可考虑导出更多公共类型供库使用方引用（见“库导出”建议）。

### 5) 测试（`tests/*.test.ts`）

- `connection.test.ts`
  - 通过 mock `global.WebSocket` 验证连接、断开与事件回调，思路正确且覆盖关键路径。
- `event-emitter.test.ts`
  - 覆盖 on/off/once，验证 once 行为与 off 的交互，符合预期。
- `main.test.ts`
  - 通过 `jest.mock('../src/connection')` 驱动状态机流转，覆盖首次连接、重连、请求队列与错误分支。
- 改进建议
  - 在 CI 中实际安装依赖并运行测试，补充覆盖率度量；
  - 增加更多边界用例：如 JSON 解析失败、服务端返回未知 `cmd`、超过最大重连后资源释放检查等。

## 库导出与发布建议

- 目前 `package.json` 指向 `dist/main.js` 和 `dist/main.d.ts`，而 `src/main.ts` 仅导出 `SlotcraftClient`。如果使用方需要 `ConnectionState`、事件 payload 等类型，建议：
  - 在 `src/main.ts` 中 `export * from './types'` 以集中导出；
  - 或新增 `src/index.ts` 作为 barrel 文件，统一导出对外 API（并将 `package.json#main/types` 指向 `dist/index.*`）。

## 潜在问题清单（按优先级）

- P0
  - 修正计时器类型为 `ReturnType<typeof setTimeout/setInterval>`，避免浏览器环境类型不匹配（可能导致 TS 编译失败）。
  - 扩大 `connect()` 的防重入范围：除 `IDLE/DISCONNECTED` 外均拒绝，防止中途误触发二次连接。
- P1
  - `send()` 只需要支持 string 即可。
  - 事件细分和可配置 logger，提升可观测性与生产可用性。
  - 在 `main.ts` 导出公共类型，提升库可用性。
- P2
  - 针对 `errno` 的错误恢复策略抽象与配置化。
  - 为 `once()` 提供可取消的 handler 或内部映射，增强可控性。

## 质量门禁（当前状态）

- Build：未验证（建议先安装依赖再执行 `npm run build`）。
- Lint/Typecheck：未配置 ESLint；TypeScript 可能因 `NodeJS.Timeout` 在浏览器环境下类型不匹配而出错（需调整类型或增加 `@types/node`，更推荐前者）。
- Unit Tests：存在测试用例，但未安装依赖导致未执行。预计可覆盖关键路径，建议在 CI 中开启覆盖率阈值。

## 结论

项目结构清晰、职责分明，具备健壮的连接与重连流程设计，测试思路完善。为更好地面向浏览器与实际生产环境，建议优先修正计时器类型与 `connect()` 防重入范围，并完善导出与观测性。完成上述改进并在 CI 中持续验证后，可作为稳定的前端 WebSocket 客户端库对外发布与复用。

## 附录：后续改动记录（审阅后执行）

- 测试框架从 Jest 迁移至 Vitest，测试覆盖率由 v8 提供（lcov + html）。
- CI 工作流已更新为使用 Vitest，并在 Job Summary 与 PR 评论中汇总覆盖率（基于 lcov.info 计算）。
- 引入 ESLint v9 Flat Config，统一 lint 与 typecheck 流程；编辑器报错噪音已清理。
