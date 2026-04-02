# Plan 020: Implement Resume State Handling

## 1. Goal

The primary goal is to correctly handle the "resume" state that can occur when a player enters a game (`comeingame`). This state signifies that a previous game round was not fully completed, and the client needs to restore its state to match the server's.

This involves:
- Detecting the resume state after entering a game.
- Transitioning the client to the correct state (`WAITTING_PLAYER` or `SPINEND`) based on the server's `gamemoduleinfo` message.
- Implementing auto-collect logic for resume scenarios, similar to the existing post-spin logic.
- Adding comprehensive code comments and updating project documentation to explain the resume flow.

## 2. Task Breakdown

### Step 1: Add Comments to Existing `enterGame` and `updateCaches`
- I will first add comments to the `enterGame` method in `src/main.ts` explaining that the core resume logic will be handled in the `cmdret` handler, not in the method's main promise chain.
- I will also add comments to the `gamemoduleinfo` case in `updateCaches` to clarify which fields are crucial for the resume logic.

### Step 2: Implement Resume Logic in `comeingame3` `cmdret` Handler
- In `src/main.ts`, inside the `handleMessage` method, I will modify the `cmdret` case for `comeingame3`.
- I will add logic to check if the game is in a resume state by inspecting `this.userInfo.lastGMI`.
- I will replicate the state transition logic from the `gamectrl3` handler:
    - If `lastGMI.replyPlay.finished === false`, transition to `ConnectionState.WAITTING_PLAYER`.
    - Otherwise, check if a `collect` is needed using the condition `(totalwin > 0 && resultsCount >= 1) || (totalwin === 0 && resultsCount > 1)`. If so, transition to `ConnectionState.SPINEND`.
    - If neither of the above, transition to `ConnectionState.IN_GAME`.
- The `setState` call that currently exists in the `enterGame` promise chain will be removed, as the state will now be set here.
- I will add detailed comments explaining this entire flow.

### Step 3: Implement Auto-Collect for Resume State
- Inside the new `comeingame3` `cmdret` handler, after determining the state, I will add the auto-collect logic.
- This logic will be identical to the one in the `gamectrl3` handler: if `this.userInfo.lastResultsCount > 1`, it will call `this.collect(this.userInfo.lastResultsCount - 2)`.
- The call will be wrapped in a `.catch()` block to log errors without disrupting the main flow.

### Step 4: Add a New State for Resume
- To make the "resume" state more explicit, I will add a new state `RESUMING` to the `ConnectionState` enum in `src/types.ts`.
- The `enterGame` method will transition to `RESUMING` instead of `ENTERING_GAME`. The `cmdret` handler for `comeingame3` will then transition from `RESUMING` to the final correct state (`IN_GAME`, `WAITTING_PLAYER`, or `SPINEND`). This will improve state clarity.

### Step 5: Update Tests
- I will need to update existing tests or add new ones in `tests/integration.test.ts` to cover the resume functionality.
- I will create a new test case that simulates a `comeingame` response with a pending result (`replyPlay` is populated).
- This test will assert that:
    - The client transitions to the correct state (`SPINEND` or `WAITTING_PLAYER`).
    - The auto-collect logic is triggered if applicable.

### Step 6: Verify Changes
- I will run `npm run check` as specified in `agents.md` to ensure that my changes pass all linting, testing, and build checks.

### Step 7: Update Documentation
- I will create the report file `jules/plan020-report.md`.
- I will update `jules.md` to document the new resume state handling logic, including the new `RESUMING` state and the decision-making process in the `comeingame3` `cmdret` handler.
- I will review `agents.md` and update it if necessary to reflect any changes in the game flow that an agent would need to be aware of.

## 3. Plan

Here is the formal plan I will follow:
1.  **Add a new `RESUMING` state to `ConnectionState` in `src/types.ts` and update `enterGame` to use it.**
2.  **Implement the core resume state detection, state transition, and auto-collect logic in the `cmdret` handler for `comeingame3` in `src/main.ts`.**
3.  **Add comprehensive comments to the new logic and related methods.**
4.  **Create a new integration test in `tests/integration.test.ts` to validate the resume flow.**
5.  **Run `npm run check` to verify all changes.**
6.  **Create `jules/plan020-report.md` and update `jules.md` and `agents.md`.**
