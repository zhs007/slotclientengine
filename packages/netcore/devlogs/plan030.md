# Plan 030: Increase Test Coverage to >90%

## 1. Objective

The test coverage dropped to 87.58% after implementing the Replay Mode feature. The project standard, as defined in `agents.md`, is a coverage rate of over 90%. This plan outlines the steps to analyze the coverage gaps and write the necessary tests to meet this target.

## 2. Analysis of Coverage Gaps

The primary sources of the coverage drop are:
- **`src/replay-client.ts` (73.12%):** This new file has the lowest coverage. The existing tests only cover the "happy path". Error handling, edge cases, and alternative paths are untested.
- **`src/main.ts` (88%):** The factory logic in the constructor has an untested branch for invalid URL protocols.
- **`src/live-client.ts` (89.33%):** Some error handling and cleanup paths are not covered, but the impact is minor. The main focus will be on the other two files.

## 3. Implementation Strategy

### Step 1: Enhance Tests for `replay-client.ts`
- I will add new test cases to `tests/replay.test.ts`.
- These tests will cover the following scenarios:
  - `connect()`:
    - When `fetch` fails due to a network error or a non-200 status code.
    - When the fetched response is not valid JSON.
    - When `token` is not provided.
  - `enterGame()`:
    - When called before `connect()`.
    - When `gamecode` is not provided.
  - `collect()`:
    - When called in a state other than `SPINEND`.
  - `selectOptional()`:
    - When called in a state other than `WAITTING_PLAYER`.
  - Constructor:
    - Test the `logger: null` option to ensure the no-op logger is created.

### Step 2: Enhance Tests for `main.ts`
- I will add a new test case to `tests/main-adv.test.ts`.
- This test will verify that the `SlotcraftClient` constructor throws an error when an invalid URL protocol (e.g., `ftp://`) is provided.

### Step 3: Verify and Submit
- After adding the new tests, I will run `npm run check`.
- I will inspect the coverage report to ensure the total line coverage is now above 90%.
- Once the target is met and all checks pass, I will commit the changes.
