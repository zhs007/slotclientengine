# Plan 022: Simplify Example Script's Resume Logic for Clarity

## 1. Goal

Based on user feedback, the goal is to refactor the `examples/example001.ts` script to make its handling of game resume logic simpler and more direct. The previous `gameLoop` function, while robust, was too complex for an example. The new implementation should prioritize clarity and readability.

## 2. Task Decomposition

### Step 1: Refactor `examples/example001.ts`
- I will remove the `gameLoop` function from the script.
- In its place, immediately after the `client.enterGame()` call, I will insert a simple `while` loop.
- This loop will be clearly commented as the "Resume Handling" block.
- The loop will run as long as the client state is not `IN_GAME`. Inside the loop, it will handle `SPINEND` and `WAITTING_PLAYER` states by calling `collect()` and `selectOptional()` respectively.
- Once the loop completes (i.e., the state is `IN_GAME`), the script will proceed directly to the `spinAcrossLines()` function.
- I will also add a comment to the `spinAcrossLines` function to clarify its purpose as a simple loop for demonstrating spin calls.

### Step 2: Validate the Changes
- I will run `npm run check` to ensure the simplified logic does not introduce any regressions.
- I will execute `npx ts-node examples/example001.ts` to confirm the script is still valid and executable.

### Step 3: Create a New Task Report
- I will create a new report file, `jules/plan022-report.md`, to document the process of this revision, explaining why the changes were made based on user feedback.

### Step 4: Update Project Documentation
- I will add a new entry to the "Development Log" in `jules.md` for Plan 022, describing the simplification of the example script.

## 3. Success Criteria

- The `examples/example001.ts` script is refactored to use a simpler, inline resume-handling logic.
- All checks in `npm run check` pass.
- A new plan and report (`plan022.md`, `plan022-report.md`) are created.
- The main documentation (`jules.md`) is updated to reflect this new work.
