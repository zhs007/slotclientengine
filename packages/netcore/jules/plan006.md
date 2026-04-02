# 任务 006：单元测试与集成测试

## 目标

确保代码的质量、稳定性和可靠性。通过编写全面的单元测试和集成测试，验证所有功能模块符合预期，并使整体测试覆盖率达到 90% 以上。

## 主要步骤

1.  **完善现有单元测试**:
    - **审查**: 回顾 `connection.test.ts`, `event-emitter.test.ts`, `main.test.ts` 文件。
    - **补充**: 针对每个 `public` 和 `private` 方法，检查是否有遗漏的测试场景，特别是边缘情况和异常路径。
      - **`Connection`**: 测试传入无效 URL 的情况。
      - **`EventEmitter`**: 测试重复添加/删除监听器、对不存在的事件操作等情况。

- **`SlotcraftClient`**: 这是重点。补充对各种服务器错误码 (`errno`) 的响应测试；测试 `ctrlid` 循环或溢出的处理；测试并发调用 `send` (虽然设计上不允许，但应有保护)。

2.  **配置测试覆盖率报告**:
    - 在 `jest.config.js` 中，添加或修改 `collectCoverage` 为 `true`。
    - 配置 `coverageDirectory` 来指定报告输出目录。
    - 配置 `collectCoverageFrom` 来指定需要统计覆盖率的源文件范围，通常是 `["src/**/*.ts"]`，同时排除 `types.ts` 和入口文件等。
    - 在 `package.json` 的 `scripts` 中添加一个命令 `"test:coverage": "jest --coverage"`。

3.  **编写集成测试**:
    - 虽然大部分逻辑可以通过模拟 `WebSocket` 来进行单元测试，但创建一个或多个集成测试文件来模拟完整的用户生命周期是很有价值的。
    - **创建文件**: `tests/integration.test.ts`。
    - **测试场景**:
      - **完整 happy path**:
4.  `new SlotcraftClient()` 2. `await client.connect()` 3. `await client.send('game_spin', ...)` 4. `client.disconnect()`
    - 在此过程中，监听并验证 `connect`, `login`, `ready`, `data`, `disconnect` 事件是否按预期顺序触发。
    - **重连场景**:
      1.  完成 `connect` 和 `send`。
      2.  手动触发 `Connection` 的 `onclose` 事件 (模拟断网)。
      3.  在断线期间调用 `send`，将请求加入队列。
      4.  手动触发 `onopen` 和后续消息，模拟重连成功。
      5.  验证队列中的请求是否被发送，并且其 `Promise` 得到正确 `resolve`。
    - **失败场景**:
      1.  模拟 `login` 失败。
      2.  验证 `connect()` 返回的 `Promise` 是否 `reject`。
      3.  验证连接是否被关闭。

5.  **分析并提升覆盖率**:
    - 运行 `npm run test:coverage`。
    - 在生成的覆盖率报告（通常在 `coverage/lcov-report/index.html`）中，找到未被覆盖的代码行、分支或函数。
    - 针对这些未覆盖的部分，编写新的单元测试用例来执行它们。
    - 重复此过程，直到所有核心逻辑文件的覆盖率都达到 90% 以上。特别关注 `src/main.ts` 中的条件分支和错误处理逻辑。

## 验收标准

- 所有模块（`Connection`, `EventEmitter`, `SlotcraftClient`）都有对应的健壮的单元测试。
- `tests/integration.test.ts` 至少覆盖了“一次性成功”和“断线重连”两个核心场景。
- Jest 覆盖率报告显示，`src/` 目录下核心逻辑文件的测试覆盖率均达到或超过 90%。
- 运行 `npm test`，所有测试用例都能成功通过。
