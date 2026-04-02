# Plan 009: Improve Test Coverage with a Mock WebSocket Server

## 1. Goal

The primary goal is to increase the test coverage of the `slotcraft-client-net` library to over 90% by implementing a mock WebSocket server and writing comprehensive integration tests. This will ensure the long-term robustness of the project and make future modifications safer.

## 2. Background

The core client logic resides in `src/main.ts`, which manages connection state, message processing, and the game protocol. The existing tests in `tests/main.test.ts` use a manual mocking strategy for the `Connection` class, which is brittle and doesn't fully test the integration between the client's business logic and the underlying WebSocket transport.

A real-time communication log is available in `docs/msg001.txt`, which provides a blueprint for realistic client-server interactions.

## 3. Task Decomposition

### Step 1: Create Mock WebSocket Server (`tests/mock-server.ts`)

- Create a new file `tests/mock-server.ts`.
- Implement a `MockServer` class using the `ws` library.
- The server will support:
  - Starting and stopping on a dynamic port.
  - Handling incoming client connections.
  - A request-handler mechanism to define responses for specific `cmdid`s.
  - Methods to programmatically send server-initiated (passive) messages.
  - Methods to forcefully disconnect clients to test reconnection.

### Step 2: Create New Integration Test Suite (`tests/integration.test.ts`)

- Create a new test file `tests/integration.test.ts`.
- This suite will instantiate the `MockServer` and the `SlotcraftClient`.
- The client will be configured to connect to the mock server's URL.

### Step 3: Implement Integration Tests

- **Connection & Login:**
  - Test successful connection and login flow.
  - Test login failure due to bad tokens (`isok: false`).
  - Test connection timeout/failure.
- **Game Lifecycle:**
  - Test the `enterGame` flow.
  - Test that `gamecfg`, `gameuserinfo`, etc., are correctly received and cached by the client.
- **Spin & Collect:**
  - Test a successful spin-win-collect cycle, verifying state transitions (`SPINNING` -> `SPINEND` -> `COLLECTING` -> `IN_GAME`).
  - Test a spin with no win (`SPINNING` -> `IN_GAME`).
  - Test the `collect` logic when `lastResultsCount` indicates multiple collections are needed.
- **Error & Edge Cases:**
  - Test request timeouts for commands sent by the client.
  - Test how the client handles malformed JSON from the server.
  - Test the full reconnection flow:
    - Server disconnects unexpectedly.
    - Client enters `RECONNECTING` state.
    - Client successfully reconnects after a few attempts.
    - Client gives up after `maxReconnectAttempts`.
- **Data Caching:**
  - Write specific tests to ensure all parts of the `updateCaches` method in `src/main.ts` are covered by sending various passive messages from the mock server.

### Step 4: Measure Coverage and Iterate

- Run `npm test` to get a coverage report.
- Analyze the report for uncovered lines/branches in `src/main.ts` and `src/connection.ts`.
- Add targeted tests to cover any gaps until the >90% goal is reached.

### Step 5: Final Verification and Documentation

- Run `npm run check` to ensure all project quality gates pass (linting, tests, build).
- Create `jules/plan009-report.md` to document the process, challenges, and outcomes.
- Update `jules.md` to reflect the work completed.
- Review and update `agents.md` if necessary to document the new integration testing pattern.
