# Plan 015: Implement Player Choice State

## 1. Goal

Implement a new `WAITTING_PLAYER` state in the `SlotcraftClient`. This state will be triggered when a `spin` response indicates that the player needs to make a selection from a list of options provided by the server.

## 2. Rationale

The game protocol specifies that after a `spin`, the server can return a `gamemoduleinfo` message with `gmi.replyPlay.finished: false`. This indicates that the game is paused, waiting for the player to choose one of the provided `nextCommands`. The client needs to handle this state gracefully, cache the options, and provide a method for the user to make a selection.

## 3. Task Breakdown

1.  **Update Type Definitions (`src/types.ts`):**
    - Add `WAITTING_PLAYER` to the `ConnectionState` enum.
    - Define a new `Optional` interface for the player choices.
    - Add `optionals?: Optional[]` and `curSpinParams?: SpinParams` to the `UserInfo` interface.

2.  **Modify `SlotcraftClient` (`src/main.ts`):**
    - **Cache Spin Parameters:** In the `spin` method, cache the `ctrlparam` object into `this.userInfo.curSpinParams`.
    - **Handle Player Choice State:** In the `updateCaches` method's `gamemoduleinfo` handler, check for `gmi.replyPlay.finished: false`. If true, populate `userInfo.optionals` and change the state to `WAITTING_PLAYER`.
    - **Implement `selectOptional` Method:** Create a new `public selectOptional(index: number)` method to send the `gamectrl3` message with `ctrlname: 'selectfree'` and the correct parameters based on the user's choice.

3.  **Add Integration Test (`tests/integration.test.ts`):**
    - Create a new test case that simulates the server sending a player choice request.
    - Verify that the client enters the `WAITTING_PLAYER` state.
    - Verify that calling `selectOptional` sends the correct `gamectrl3` message to the server.

4.  **Run Checks and Verify:**
    - Run `npm run check` to ensure all linting, tests, and build checks pass.

5.  **Update Documentation:**
    - Update `jules.md` with a summary of this feature in the development log.
    - Update `agents.md` to inform future agents about the new state and API.

## 4. Success Criteria

- The client correctly identifies the player choice scenario and enters the `WAITTING_PLAYER` state.
- The `selectOptional` method sends the correct `gamectrl3` message.
- All existing and new tests pass.
- Documentation is updated.
- `npm run check` completes successfully.
