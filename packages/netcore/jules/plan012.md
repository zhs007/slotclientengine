# Plan for Increasing Test Coverage (plan012)

This plan outlines the steps to increase the project's test coverage back to over 90%, addressing user feedback.

1.  **Create Documentation Files.**
    - Create `jules/plan012.md` and `jules/plan012-report.md` to document the plan and execution for increasing test coverage.
    - Update `jules.md` with a new development log entry for this task.

2.  **Restore and Adapt Integration Tests.**
    - Restore the detailed in-game logic tests for `spin`, `collect`, parameter validation, and other edge cases to `tests/integration.test.ts`.
    - Adapt these tests to the current state machine and helpers, ensuring they run correctly.

3.  **Analyze Coverage Gaps.**
    - Run the test suite with a detailed coverage reporter to identify the specific lines and branches in `src/main.ts` that are still uncovered.

4.  **Add Targeted Tests.**
    - Based on the coverage analysis, write new unit or integration tests to cover the remaining gaps, focusing on error handling and specific logical branches.

5.  **Verify Final Coverage and All Changes.**
    - Run `npm run check` to ensure all tests pass, the code lints correctly, the project builds, and the test coverage for `src/main.ts` is above 90%.
