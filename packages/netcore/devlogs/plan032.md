# Plan 032: Implement `selectSomething` Interface

## 1. Goal

The primary goal of this task is to add a new user operation `selectSomething(string)` to the `ISlotcraftClient` interface and implement it in both the `Live` and `Replay` clients. This operation is designed to send a specific `gamectrl3` command to the server with a custom string parameter.

## 2. Rationale

This feature is necessary to allow the client to send generic "selection" or "action" data to the server that doesn't fit into the existing `spin` or `selectOptional` flows. It provides a flexible communication channel for custom game mechanics.

## 3. Task Breakdown

1.  **Update Type Definitions (`src/types.ts`)**:
    *   Add `selectSomething(clientParameter: string): Promise<any>;` to the `ISlotcraftClientImpl` interface.
    *   Add `clientParameter?: string;` to the `UserInfo` interface to cache the parameter. The default value will be an empty string.

2.  **Update `SlotcraftClient` Wrapper (`src/main.ts`)**:
    *   Add the `selectSomething` method to the `SlotcraftClient` class, which will delegate the call to its internal `implementation`.

3.  **Implement `selectSomething` in `SlotcraftClientLive` (`src/live-client.ts`)**:
    *   Implement `selectSomething` as a queued operation to ensure it executes serially with other user actions.
    *   The method will validate that the client is in the `IN_GAME` state.
    *   It will construct and send a `gamectrl3` message with:
        *   `ctrlname`: "selectany"
        *   `ctrlparam`: An object containing the current `bet`, `lines`, `times`, and the `clientParameter` string provided to the method.
    *   The provided `clientParameter` will be cached in `this.userInfo.clientParameter`.
    *   The method's promise will resolve upon receiving the corresponding `cmdret` from the server.
    *   Modify the `updateCaches` method to handle the `gamemoduleinfo` message. If `gmi.clientParameter` is present (during a game resume), it will be used to initialize `userInfo.clientParameter`.

4.  **Implement `selectSomething` in `SlotcraftClientReplay` (`src/replay-client.ts`)**:
    *   Implement the `selectSomething` method. It will simply return a resolved promise, as no action is required in replay mode.
    *   Modify the replay data loading logic (`connect` or `enterGame`) to initialize `userInfo.clientParameter` from the `playCtrlParam.clientParameter` field if it exists in the replay JSON file.

5.  **Write Tests**:
    *   **Integration Test (`tests/integration.test.ts`)**:
        *   Add a test case to verify that `selectSomething` sends the correct `gamectrl3` message.
        *   Add a test case to verify that the `clientParameter` is cached correctly in `userInfo`.
        *   Add a test case to simulate a game resume (`enterGame` with a `gamemoduleinfo` containing `gmi.clientParameter`) and verify that the cache is initialized correctly.
    *   **Replay Test (`tests/replay.test.ts`)**:
        *   Add a test case using a replay file that includes `playCtrlParam.clientParameter` to verify that it's correctly loaded into `userInfo`.

6.  **Run Checks and Ensure Coverage**:
    *   Execute `npm test` to confirm all tests pass and coverage remains above 90%.
    *   Execute `npm run check` to ensure no linting or build errors are introduced.

7.  **Update Documentation**:
    *   Update `jules.md` to include a section for the `selectSomething` method. The documentation should detail its purpose, the structure of the sent message, and the resume behavior.

## 4. Success Criteria

*   The `selectSomething` method is available on the `SlotcraftClient`.
*   The method functions correctly in the `Live` client, sending the specified message and handling the response.
*   The `clientParameter` is correctly cached and restored on resume in the `Live` client.
*   The `clientParameter` is correctly initialized from replay data in the `Replay` client.
*   The implementation is fully tested, with coverage maintained above 90%.
*   The project documentation (`jules.md`) is updated to reflect the new feature.
*   All project checks (`npm run check`) pass successfully.
