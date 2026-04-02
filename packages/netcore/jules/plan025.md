# Plan 025: Fix Game Resume Logic

This plan outlines the steps to fix a bug where `curSpinParams` are not correctly initialized when a game is resumed directly into a `WAITTING_PLAYER` state.

1.  **Create a Failing Test Case.**
    -   I will follow Test-Driven Development (TDD) as instructed in `agents.md`.
    -   I'll add a new integration test to `tests/integration.test.ts`.
    -   This test will simulate a game resume scenario:
        -   It will call `client.enterGame()`.
        -   The mock server will respond with a `gamemoduleinfo` message where `replyPlay.finished` is `false`, `bet` and `lines` are present, and `nextCommands` are provided. This will put the client into the `WAITTING_PLAYER` state.
        -   The test will then call `client.selectOptional(0)`.
    -   Without the fix, this test is expected to fail with the "Missing spin parameters for selection" error.

2.  **Implement the Core Logic Fix.**
    -   I will modify the `updateCaches` method in `src/main.ts`.
    -   Inside the `case 'gamemoduleinfo'`, I will add logic to handle the resume scenario.
    -   When `msg.gmi.replyPlay.finished === false`, I will initialize `this.userInfo.curSpinParams` with the `bet` and `lines` values from the `gmi` object and set `times` to `1`.

3.  **Verify the Solution.**
    -   I will run the full check suite using `npm run check`.
    -   This will execute the linter, the build process, and all tests, including the new one.
    -   I will ensure that the new test passes and that no existing functionality has been broken.

4.  **Generate Task Report.**
    -   After successful verification, I will create a report file named `jules/plan025-report.md`.
    -   This report will document the execution flow, any issues encountered, and the solutions implemented.

5.  **Update Project Documentation.**
    -   I will update the development log in `jules.md` to include a summary of this task (Plan 025), explaining the bug and the fix.

6.  **Final Review.**
    -   I will review `agents.md` to determine if any instructions need to be updated based on this change. I anticipate no changes will be necessary.
