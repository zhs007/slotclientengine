# Plan 029 Report: Replay Mode Implementation

## 1. Task Summary

The goal of this task was to introduce a "Replay Mode" to the `SlotcraftClient`. This mode allows the client to simulate a game session from a static JSON file served over HTTP/HTTPS, instead of connecting to a live WebSocket server. This feature is intended for debugging, testing, and UI development.

## 2. Execution Flow

The implementation followed the strategy outlined in `jules/plan029.md`.

### 2.1. Code Refactoring

- **Interface Abstraction**: An `ISlotcraftClientImpl` interface was created in `src/types.ts` to define the public contract for any client implementation. This was a crucial first step to ensure both live and replay modes would be interchangeable.
- **Live Client Refactoring**: The existing `SlotcraftClient` logic was moved from `src/main.ts` to a new `src/live-client.ts` file, and the class was renamed to `SlotcraftClientLive`.
- **Factory Implementation**: The main `SlotcraftClient` class in `src/main.ts` was converted into a factory. Its constructor now inspects the protocol of the URL (`ws[s]://` vs. `http[s]://`) to decide whether to instantiate `SlotcraftClientLive` or `SlotcraftClientReplay`. All public methods of the factory simply delegate to the chosen implementation.

### 2.2. Replay Mode Implementation

- **New Replay Client**: A new class, `SlotcraftClientReplay`, was created in `src/replay-client.ts`.
- **Dependency**: The `node-fetch@2` library was added to the project to handle fetching the JSON file in a Node.js environment.
- **Logic**:
    - `connect()`: Fetches and parses the JSON from the URL.
    - `enterGame()`: Simulates entering a game by processing the loaded JSON data and setting the appropriate initial state (`SPINEND` or `IN_GAME`).
    - `spin()`, `collect()`: These methods act as stubs that manipulate the internal state and return data based on the already-loaded JSON, without any network activity.

### 2.3. Testing

- **New Replay Tests**: A new test file, `tests/replay.test.ts`, was created to specifically test the `SlotcraftClientReplay` functionality. Mocks for `node-fetch` were used to provide a consistent JSON payload for the tests.
- **Integration Test Fixes**: The major refactoring broke the existing integration tests in `tests/integration.test.ts`, which were making assumptions about the internal structure of `SlotcraftClient`. These tests were updated to access private methods/properties for testing purposes through the new `implementation` property (e.g., `(client as any).implementation.setState(...)`).
- **Validation**: Several issues were caught and fixed during the testing phase:
    - A typo (`.msg` instead of `msg`) in `src/live-client.ts` was found and corrected.
    - Multiple test failures in `tests/integration.test.ts` were debugged and fixed by updating how the tests accessed internal client properties.
    - A final linting error (`no-redeclare`) was introduced and subsequently fixed in the test file.
- **Final Check**: The `npm run check` command was run successfully, confirming that all linting, tests, and build steps passed.

## 3. Challenges and Solutions

- **Broken Integration Tests**: The biggest challenge was the widespread failure of integration tests after the refactoring. The tests were tightly coupled to the private implementation details of the original `SlotcraftClient`.
    - **Solution**: Instead of rewriting the tests, the decision was made to adapt them to the new structure. All calls to private members were updated to go through the new `implementation` property. This was an effective, surgical solution that preserved the existing test coverage.
- **Testing Asynchronous Heartbeats**: One test for a failed heartbeat was particularly tricky, as it involved a combination of state, mocks, and timers.
    - **Solution**: The test was fixed by ensuring the client was in a valid state (`LOGGED_IN`) before triggering the heartbeat, and by correctly spying on the `send` method of the `SlotcraftClientLive` implementation rather than the `SlotcraftClient` wrapper.

## 4. Final Outcome

The Replay Mode was successfully implemented and is now available for use. The codebase was refactored to be more modular and extensible for future modes. All existing functionality remains intact, as verified by the comprehensive test suite. The project documentation (`jules.md`) has been updated to reflect this new feature.
