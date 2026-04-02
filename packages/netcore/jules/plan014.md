# Plan 014: Refactor, Fix, and Test

## 1. Goal

This plan addresses a set of user requests focusing on refactoring the `SlotcraftClient` for better usability, fixing a memory leak in the `EventEmitter`, updating dependencies in an example file, and implementing comprehensive tests for recently added features as outlined in `codereview/report-002.md`.

## 2. Task Breakdown

### Step 1: Refactor `SlotcraftClient` for Improved Ergonomics

- **Modify `src/types.ts`**: Update the `SlotcraftClientOptions` interface to include optional `token` and `gamecode` fields.
- **Modify `src/main.ts`**:
  - Update the `SlotcraftClient` constructor to accept and cache `token` and `gamecode` from the options.
  - Modify the `connect(token?: string)` and `enterGame(gamecode?: string)` methods to use the cached values as a fallback, making the arguments optional.
- **Modify `examples/example001.ts`**: Update the example to demonstrate the new, more convenient client instantiation.

### Step 2: Fix `EventEmitter` Memory Leak

- **Modify `src/event-emitter.ts`**: Correct the `off()` method to ensure that when a wrapped `once` listener is removed, the corresponding entry in `onceMap` is also cleared. This addresses the potential for a memory leak when the wrapped function itself is passed to `off()`.

### Step 3: Standardize Example Dependencies

- **Modify `examples/example001.ts`**: Replace the `isomorphic-ws` dependency with `ws`, which is already part of the project's `devDependencies`, to reduce the project's dependency footprint.

### Step 4: Enhance Test Coverage

- **Create `tests/main-adv.test.ts`**: Add a new test file dedicated to advanced scenarios.
- **Add Test Cases**:
  1.  **Concurrent Requests**: Verify that the client correctly rejects a second request with the same `cmdid` while the first is still pending.
  2.  **State-based Command Rejection**: Confirm that any command other than `flblogin` is rejected when the client is in the `LOGGING_IN` state.
  3.  **Efficient JSON Parsing**: Ensure that the `handleMessage` method parses incoming WebSocket data exactly once.
  4.  **Complex `collect()` Scenario**: Test the `collect()` method with a multi-stage result (e.g., `resultsCount=3`) to ensure it correctly executes the collection sequence.

### Step 5: Validate and Document

- **Run Checks**: Execute `npm run check` to run all quality gates (linting, tests, build).
- **Update Documentation**:
  - Create `jules/plan014-report.md` to log the execution details.
  - Update `jules.md` with a new entry for this development cycle.
  - Review and update `agents.md` to align with the latest standards.

### Step 6: Submit

- **Code Review**: Request a final review of the changes.
- **Submit**: Commit and submit the work with a clear and descriptive message.
