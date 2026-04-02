# Plan 017: Refactor Collect Logic and Implement Auto-Collect

## 1. Goal

The primary goal is to refactor the `collect` method in `SlotcraftClient` to simplify its logic and implement an "auto-collect" feature to improve efficiency by reducing client-server communication. This involves updating the core logic, adding extensive comments, and ensuring all related documentation is updated.

## 2. Understanding the Requirements

Based on the user's request, the current `collect` implementation is unnecessarily complex and doesn't align with the desired protocol flow.

- **`collect` Simplification**: The current `collect` method has a complex `deriveSequence` helper that attempts to determine which `playIndex` to use. The user has clarified that if a `playIndex` is not explicitly provided, the client should simply use the index of the last available result, which is `replyPlay.results.length - 1`.
- **Auto-Collect Feature**: When a `spin` or `selectOptional` action results in multiple outcomes (`replyPlay.results.length > 1`), the client should automatically send a `collect` call for the second-to-last result (`replyPlay.results.length - 2`). This confirms to the server that the user has "seen" all but the final outcome, reducing the need for explicit `collect` calls later. This should be triggered from the `cmdret` handler for `gamectrl3`.
- **Documentation and Commenting**: The new logic must be thoroughly commented. The project's development documentation (`jules.md`) needs to be updated to reflect these changes.

## 3. Task Breakdown

1.  **Create Plan File**: Create `jules/plan017.md` to document the plan. (This step)
2.  **Refactor `collect` Method (`src/main.ts`)**:
    -   Remove the internal `deriveSequence` function.
    -   Modify the logic to determine `playIndex`:
        -   If `playIndex` is passed as an argument, use it.
        -   If `playIndex` is `undefined`, use `this.userInfo.lastResultsCount - 1`.
        -   As a fallback, if `lastResultsCount` is not available, use `this.userInfo.lastPlayIndex`.
    -   Remove the sequential collect loop, as the method should only send a single `collect` command per call.
    -   Add detailed comments explaining the new, simplified logic and the purpose of the `collect` flow.

3.  **Implement Auto-Collect (`src/main.ts`)**:
    -   Locate the `cmdret` handler for the `gamectrl3` command within the `handleMessage` method.
    -   After the existing state transitions (`SPINEND`, `WAITTING_PLAYER`, etc.), add a new block of code.
    -   Inside this block, check if `this.userInfo.lastResultsCount` is greater than 1.
    -   If it is, call `this.collect(this.userInfo.lastResultsCount - 2)`.
    -   This call should be non-blocking. Use a `.catch()` block to log any potential errors without affecting the main application flow.
    -   Add comments to explain the auto-collect mechanism, why it's there, and how it works.

4.  **Verify Changes**:
    -   Run `npm install` to ensure all dependencies are correctly installed.
    -   Run `npm run check` to execute linting, tests, and build to ensure the changes are correct and have not introduced any regressions.
    -   If tests fail due to the changed `collect` behavior, update the relevant test cases in `tests/integration.test.ts` or `tests/main.test.ts` to reflect the new, correct logic.

5.  **Update Documentation**:
    -   Create a final report `jules/plan017-report.md` summarizing the work done.
    -   Update `jules.md` to document the new `collect` and auto-collect logic in the development log section.
    -   Review `agents.md` to determine if any instructions need to be updated for future agent interactions. Given the nature of the change, it's likely no update will be needed, but it's important to check.
