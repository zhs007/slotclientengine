# Plan 028: Cache defaultScene from gamemoduleinfo

## 1. Understanding the Goal

The user wants to cache the `defaultScene` data received in the `gamemoduleinfo` message. This data needs to be transformed from a complex object structure into a simple 2D array and stored in the `UserInfo` object. The transformation logic must be an exported utility function with its own tests and documentation.

## 2. Task Decomposition

### Step 1: Create a Utility Function for Data Transformation
- Create a new file: `src/utils.ts`.
- Inside this file, implement an exported function named `transformSceneData`.
- This function will accept an object argument matching the structure of `defaultScene` (i.e., `{ values: [{ values: [...] }] }`).
- It will return a 2D array of numbers (`number[][]`).
- Add comprehensive JSDoc comments explaining what the function does, its parameters, and what it returns.

### Step 2: Write Unit Tests for the Utility Function
- Create a new test file: `tests/utils.test.ts`.
- Write test cases for `transformSceneData`.
- Test the happy path with the example data provided in the task description.
- Test edge cases, such as:
  - An empty outer `values` array.
  - An inner `values` array being empty.
  - Malformed input (e.g., missing `values` properties).
  - Input being `null` or `undefined`.

### Step 3: Update Core Types
- Open `src/types.ts`.
- Add a new optional property `defaultScene?: number[][]` to the `UserInfo` interface.

### Step 4: Integrate the Transformation Logic into the Message Handler
- Open `src/main.ts`.
- Import the `transformSceneData` function from `./utils`.
- Locate the `updateCaches` method and the `case 'gamemoduleinfo':` block.
- Inside this block, check if `g.defaultScene` exists.
- If it does, call `transformSceneData(g.defaultScene)` and assign the result to `this.userInfo.defaultScene`.

### Step 5: Export the New Utility
- Open `src/index.ts`.
- Export the `transformSceneData` function from `./utils` to make it accessible to external consumers of the library.

### Step 6: Verify the Changes
- Run the full check script: `npm run check`.
- This will execute linting, all tests (including the new ones), and the build process.
- Ensure all checks pass without errors.

### Step 7: Update Documentation
- Update the main project documentation file, `jules.md`.
- Add a new section, e.g., "## Utilities", to document the `transformSceneData` function. Describe its purpose and usage.

## 3. Post-Execution
- After completing the task, create a report file `jules/plan028-report.md` detailing the execution process, challenges, and solutions.
- Review and update `agents.md` if the changes are relevant for future AI agent work (in this case, it's unlikely to be necessary, but should be checked).
