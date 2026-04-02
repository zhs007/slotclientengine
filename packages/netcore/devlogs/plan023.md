# Plan 023: Refactor Example Script to Use ConnectionState Enum

## 1. Goal

Following a design discussion with the user, the goal is to improve the code quality of the `examples/example001.ts` script by replacing raw string literals for states (e.g., `'IN_GAME'`) with the official `ConnectionState` enum provided by the library. This will enhance type safety, prevent typos, and serve as a better example for developers.

## 2. Task Decomposition

### Step 1: Inspect `ConnectionState` Enum
- I will first read `src/types.ts` to get the exact definition and members of the `ConnectionState` enum.

### Step 2: Refactor `examples/example001.ts`
- I will modify the import statement at the top of the file to include `ConnectionState` from `../src/types`.
- I will then perform a search-and-replace to change all occurrences of state strings (`'IN_GAME'`, `'SPINEND'`, `'WAITTING_PLAYER'`, `'DISCONNECTED'`) to their corresponding enum members (`ConnectionState.IN_GAME`, `ConnectionState.SPINEND`, etc.).

### Step 3: Validate the Changes
- I will run `npm run check` to ensure the refactored code compiles and that all tests still pass. This is a crucial step to verify that the enum was integrated correctly.

### Step 4: Update Documentation
- I will create a new task report, `jules/plan023-report.md`, to document this refactoring effort.
- I will add a new entry to the "Development Log" in `jules.md` for Plan 023, highlighting the code quality improvement in the example script.

## 3. Success Criteria

- `examples/example001.ts` is successfully refactored to use the `ConnectionState` enum.
- `npm run check` passes without errors.
- New documentation (`plan023.md`, `plan023-report.md`, and an update to `jules.md`) is created to reflect the work.
