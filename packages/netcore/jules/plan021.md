# Plan 021: Enhance Example Script to Handle Game Resume States

## 1. Goal

The primary goal is to modify the `examples/example001.ts` script to correctly handle game "resume" scenarios after calling `client.enterGame()`. The script should be able to detect if the game has resumed into a state that requires player action (like `SPINEND` or `WAITTING_PLAYER`) and perform the appropriate action (`collect` or `selectOptional`) before proceeding with its main spinning logic.

## 2. Task Decomposition

### Step 1: Install Dependencies
- Run `npm install` to ensure all project dependencies, including those needed to run the example script (`ts-node`, `dotenv`), are present.

### Step 2: Modify `examples/example001.ts`
- I will refactor the main logic flow in `examples/example001.ts`.
- After `client.enterGame()` resolves, I will introduce a new "game loop" or state-handling function.
- This function will check the client's state using `client.getState()`:
    - If the state is `SPINEND`, it will call `client.collect()` to acknowledge the pending result.
    - If the state is `WAITTING_PLAYER`, it will randomly select an option using `client.selectOptional()`.
    - After performing the resume action, the loop will re-evaluate the state.
    - Once the state becomes `IN_GAME` (either initially or after handling resume states), the script will proceed with the existing `spinAcrossLines()` logic.
- This ensures the example script is robust and correctly demonstrates the client library's resume capabilities.

### Step 3: Validate the Changes
- As per `agents.md`, I will run the project's complete check suite using `npm run check` to ensure my changes haven't introduced any regressions in the library itself.
- I will also manually execute the modified example script using `npx ts-node examples/example001.ts` to confirm the new logic works as expected. Since I cannot control the server state, I will rely on the code's logical correctness and the successful execution of the script.

### Step 4: Create Task Report
- I will create a new report file, `jules/plan021-report.md`, to document the entire process, including the problem analysis, the steps taken, and the validation results.

### Step 5: Update Project Documentation
- I will update `jules.md` to include a new entry in the "Development Log" for this task (Plan 021), summarizing the enhancement made to the example script.
- I will review `agents.md` to determine if any changes are necessary. It is unlikely for this task, as it only affects an example file.

## 3. Success Criteria

- The `examples/example001.ts` script is successfully modified.
- The `npm run check` command passes without errors.
- The project documentation (`jules.md`) is updated.
- The final report (`jules/plan021-report.md`) is created.
