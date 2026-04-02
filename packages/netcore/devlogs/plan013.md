# Plan for Addressing Code Review Feedback (report-002)

## 1. Understand the Goal

My main goal is to implement the fixes requested in `codereview/report-002.md`, with specific guidance from the user. This involves preventing concurrent requests, restricting commands during login, fixing a JSON parsing issue, and adding comments. I will also create documentation as requested.

## 2. Task Breakdown & Execution

- **Create Plan File**: I will create a new plan file `jules/plan013.md` to document the plan.
- **Implement Code Changes**:
  - **P0 - Concurrent Request Handling**: In `src/main.ts`, I will modify the `send` method to reject a new request if another request with the same `cmdid` is already pending. This will prevent race conditions and align with the user's direction for `comeingame` and `login`.
  - **P1 - Login State Command Restriction**: In `src/main.ts`, I will add logic to the `send` method to ensure that when the client is in the `LOGGING_IN` state, it only accepts the `flblogin` command.
  - **P2 - JSON Parsing Optimization**: In `src/main.ts`, I will refactor the `handleMessage` method to parse the incoming WebSocket message data only once.
  - **P2 - `collect` Method Clarification**: In `src/main.ts`, I will add comments to the `collect` method's `deriveSequence` helper function to explain the protocol-driven logic for determining the collection sequence.
- **Verify Changes**:
  - I will run `npm install` to ensure all dependencies are present.
  - I will run `npm run check` as specified in `agents.md` to run linting, tests, and build to ensure my changes are correct and have not introduced any regressions. I will fix any issues that arise.
- **Documentation**:
  - **Create Report**: I will create `jules/plan013-report.md` to document the work I've done.
  - **Update `jules.md`**: I will update `jules.md` with the design decisions and solutions from this task.
  - **Update `agents.md`**: I will review and update `agents.md` according to the `https://agents.md/` specification.

## 3. Final Review

I will do a final check of all the changes and documentation before considering the task complete.
