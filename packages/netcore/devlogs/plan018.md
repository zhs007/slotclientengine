# Plan 018: Implement User Operation Queue

## 1. Goal

The primary goal is to refactor the `SlotcraftClient` to serialize all major user operations using a FIFO (First-In, First-Out) queue. This will eliminate network race conditions, simplify state management, and make the client's behavior more predictable and robust.

## 2. Task Decomposition

### Step 1: Implement the Core Queue Mechanism

- **File:** `src/main.ts`
- **Actions:**
    - Add a `private operationQueue: Array<() => Promise<any>> = [];` to store thunks of operations.
    - Add a `private isProcessing: boolean = false;` flag to prevent concurrent processing of the queue.
    - Create a `private _processQueue(): void` method. This method will be the heart of the queue runner. It will loop through the `operationQueue`, executing one operation at a time and waiting for its promise to complete before starting the next.

### Step 2: Create a Generic Operation Enqueuing Method

- **File:** `src/main.ts`
- **Actions:**
    - Create a new private helper method: `private _enqueueOperation<T>(executor: () => Promise<T>): Promise<T>`.
    - This method will be responsible for:
        1.  Wrapping the `executor` function in a promise.
        2.  Pushing a new function that calls the `executor` and resolves/rejects the wrapper promise onto the `operationQueue`.
        3.  Returning the wrapper promise to the original caller.
        4.  Triggering `_processQueue()` to start processing if it's not already running.

### Step 3: Refactor All User Operations to Use the Queue

- **File:** `src/main.ts`
- **Actions:**
    - Systematically refactor the following public and private methods to use `_enqueueOperation`:
        - `_login()` (and by extension, `connect()`)
        - `enterGame()`
        - `spin()`
        - `selectOptional()`
        - `collect()`
    - The core logic of each method (state checks, setting new state, calling `this.send()`) will be moved *inside* the executor function passed to `_enqueueOperation`.

### Step 4: Verify and Test the New Behavior

- **File:** `tests/integration.test.ts`, `tests/main.test.ts`
- **Actions:**
    - The new queued approach will fundamentally change the timing of operations. Existing tests will likely fail.
    - Review and update all relevant tests to correctly `await` the queued operations and validate the serialized, sequential behavior.
    - Pay special attention to the `auto-collect` feature. Write a specific test to ensure that a manual `collect` call correctly waits for a preceding `auto-collect` operation to finish.

### Step 5: Add Documentation and Comments

- **File:** `src/main.ts`
- **Actions:**
    - Add comprehensive JSDoc comments to the new queue properties (`operationQueue`, `isProcessing`) and methods (`_processQueue`, `_enqueueOperation`), explaining their purpose and how they work together.

### Step 6: Final Validation and Documentation Update

- **File:** `jules.md`, `agents.md`
- **Actions:**
    - Run the full validation suite: `npm run check`.
    - Update `jules.md` with a new entry in the "Development Log" detailing the implementation of the User Operation Queue, its rationale, and its impact on the client's architecture.
    - Review `agents.md` to see if any changes are needed (unlikely for this task, but good practice).

### Step 7: Create Final Report

- **File:** `jules/plan018-report.md`
- **Actions:**
    - Write a report summarizing the execution of the plan, including any challenges encountered and how they were resolved.
