# Plan 026: Fix Double Login and State Machine Logic

## 1. 需求理解 (Understanding the Requirement)

用户在运行 `example001` 时发现日志 (`msg001`) 中存在两个问题：
1.  **重复登录**: 客户端连续执行了两次 `flblogin`（登录）操作。
2.  **不当的状态转换**: 客户端在登录成功后，调用 `enterGame` 时立即进入 `RESUMING` 状态，而此时尚未确定是否需要恢复游戏。

用户的期望是：
- 登录操作只应执行一次。
- 只有在明确需要恢复游戏时，才进入 `RESUMING` 状态。用户建议为此引入一个新的 `ENTERING_GAME` 状态。

## 2. 目标 (Goals)

- 修复客户端重复登录的 bug。
- 重构游戏进入流程的状态机，用一个更准确的状态（`ENTERING_GAME`）来替代当前不恰当的 `RESUMING` 状态，以提高状态机的清晰度和准确性。
- 确保所有相关的测试和示例代码都得到更新，以反映这些更改。

## 3. 任务分解 (Task Breakdown)

我将按照以下步骤执行此任务：

### 步骤 1: 创建复现问题的测试 (Create Failing Tests)

根据 `agents.md` 的指导，我将首先在 `tests/integration.test.ts` 中添加一个新的集成测试用例。这个测试将：
- 模拟 `connect` -> `enterGame` 的流程。
- **验证重复登录**: 监听 `send` 事件或 mock `_login` 方法，断言 `flblogin` 只被调用一次。
- **验证状态转换**: 断言在调用 `enterGame` 后，客户端立即进入一个新的、准确的状态（`ENTERING_GAME`），而不是 `RESUMING`。

### 步骤 2: 修复重复登录问题 (Fix Double Login)

在 `src/main.ts` 的 `connect` 方法中，移除对 `await this._login()` 的显式调用。`handleOpen` 事件处理器已经可靠地将登录操作加入了队列，因此 `connect` 方法中的调用是多余的，也是导致重复登录的根本原因。

### 步骤 3: 重构状态机 (Refactor State Machine)

为了解决不当的 `RESUMING` 状态问题，我将重命名该状态，使其能更准确地反映其用途。

1.  **更新类型定义 (`src/types.ts`)**: 在 `ConnectionState` 枚举中，将 `RESUMING` 重命名为 `ENTERING_GAME`。
2.  **更新主逻辑 (`src/main.ts`)**:
    - 在 `enterGame` 方法中，将 `setState(ConnectionState.RESUMING)` 修改为 `setState(ConnectionState.ENTERING_GAME)`。
    - 在 `send` 方法的允许状态列表中，将 `RESUMING` 替换为 `ENTERING_GAME`。
    - 在 `handleMessage` 的 `comeingame3` `cmdret` 处理器中，将 `if (this.state !== ConnectionState.RESUMING)` 的检查修改为 `if (this.state !== ConnectionState.ENTERING_GAME)`。

### 步骤 4: 更新示例代码 (Update Example Script)

检查 `examples/example001.ts`，确保其中没有对 `ConnectionState.RESUMING` 的直接引用。根据初步分析，该脚本的逻辑是正确的，因为它检查的是最终状态（如 `SPINEND`），而非中间状态，所以可能无需修改。但我会再次确认。

### 步骤 5: 验证修复 (Verify the Fix)

运行 `npm run check` 命令。这将执行包括新测试在内的所有测试、lint 检查和构建。我将确保所有检查都通过，并且我新加的测试现在能够成功通过，证明 bug 已被修复。

### 步骤 6: 任务总结与文档更新 (Documentation)

1.  **创建任务报告**: 任务完成后，我将创建 `jules/plan026-report.md`，详细记录执行过程、遇到的问题和解决方案。
2.  **更新开发文档**: 我将在 `jules.md` 中添加一个新的条目，总结本次修复工作，解释状态机变更背后的原因，以便未来的开发者能够理解。
3.  **更新 `agents.md`**: 检查 `agents.md`，如果本次状态机的修改对 agent 的未来工作有重要影响，将按规范更新此文件。初步判断，本次修改属于 bug 修复和内部重构，可能无需更新。
