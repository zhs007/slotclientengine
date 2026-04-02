# Plan for Code Review Follow-up (plan010)

This plan addresses the outstanding issues identified in the code review report `codereview/report-001.md`.

1.  **Update `jules/plan010.md` and `jules.md`**
    - Create `jules/plan010.md` to document the plan for this task.
    - Create a new `jules/plan010-report.md` to document the execution.
    - Update `jules.md` with the process and solutions.
2.  **Fix `once()` bug in `src/event-emitter.ts`**
    - Modify the `EventEmitter` class to correctly track and remove listeners added with `once()`. An internal map will be added to associate the original callback with the wrapper function.
3.  **Restrict `send()` parameter type in `src/connection.ts`**
    - Change the signature of the `send` method from `send(data: string | ArrayBuffer)` to `send(data: string)` as per the project's specific requirements.
4.  **Implement a configurable logger**
    - Add a `logger` option to `SlotcraftClientOptions` in `src/types.ts`.
    - In `src/main.ts`, replace `console.log`/`error`/`warn` with calls to the provided logger, defaulting to the `console` object if no logger is provided.
5.  **Improve library exports**
    - Create a new file `src/index.ts` that exports the `SlotcraftClient` class and all types from `src/types.ts`.
    - Update `package.json` to change the `main` and `types` fields to point to `dist/index.js` and `dist/index.d.ts`.
6.  **Update `agents.md`**
    - Review and update `agents.md` to conform to the standard format.
7.  **Verify all changes**
    - Run `npm install` to ensure all dependencies are present.
    - Run `npm run check` (which includes linting, testing, and building) to ensure the changes are correct and have not introduced any regressions.
