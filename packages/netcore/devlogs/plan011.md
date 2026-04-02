# Plan for State Machine Refactoring (plan011)

This plan addresses the user feedback to improve the granularity of the connection and login states.

1.  **Create Documentation Files.**
    - Create `jules/plan011.md` to document the new plan for refactoring the state machine.
    - Create `jules/plan011-report.md` to document the execution of this new plan.
    - Update `jules.md` to include a new entry in the development log for this task.

2.  **Update `ConnectionState` Enum in `src/types.ts`.**
    - Add two new states: `LOGGING_IN` and `LOGGED_IN`.
    - The existing `CONNECTED` state will now represent a state where the WebSocket connection is open, but the user is not yet authenticated.
    - The new state flow will be: `CONNECTING` -> `CONNECTED` -> `LOGGING_IN` -> `LOGGED_IN`.

3.  **Refactor the State Machine in `src/main.ts`.**
    - Modify the `connect(token)` method and the `handleOpen` handler to orchestrate the new state flow.
    - When `connect()` is called, the state will become `CONNECTING`.
    - When the WebSocket opens (`handleOpen`), the state will become `CONNECTED`, and the login process will be automatically triggered.
    - During login, the state will be `LOGGING_IN`.
    - Upon successful login, the state will become `LOGGED_IN`, and the promise returned by the public `connect()` method will resolve.
    - Update all methods that require authentication (e.g., `enterGame`, `send`) to check for the `LOGGED_IN` state.
    - Adjust the reconnection logic to automatically re-authenticate after the connection is re-established.

4.  **Update Tests.**
    - Update `tests/main.test.ts` and `tests/integration.test.ts` to validate the new, more granular state transitions and ensure the connection/login flow works correctly.

5.  **Verify All Changes.**
    - Run `npm run check` to execute all linting, testing, and build steps to ensure the refactoring is successful and no regressions were introduced.
