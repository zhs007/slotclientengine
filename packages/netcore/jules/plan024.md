# Plan 024: Enhance SlotcraftClient Constructor

## 1. Goal

To extend the `SlotcraftClient` constructor with additional, optional parameters (`businessid`, `clienttype`, `jurisdiction`, `language`) and ensure these parameters are included in the `login` payload. This will improve the client's flexibility and provide more context to the server during authentication.

## 2. Rationale

The current client initialization is missing key contextual parameters required by the server's login endpoint. Adding these directly to the constructor simplifies the API for developers, as they can configure these values once at initialization instead of passing them in every relevant method call. Providing sensible defaults ensures backward compatibility and ease of use for common cases.

## 3. Task Decomposition

### Step 1: Update Core Type Definitions

- **File**: `src/types.ts`
- **Action**:
  - Add `businessid?: string` to the `SlotcraftClientOptions` interface.
  - Add `clienttype?: string` to the `SlotcraftClientOptions` interface.
  - Add `jurisdiction?: string` to the `SlotcraftClientOptions` interface.
  - Add `language?: string` to the `SlotcraftClientOptions` interface.
  - Add the same four optional fields to the `UserInfo` interface to allow them to be cached on the client instance.

### Step 2: Modify `SlotcraftClient` Constructor and Login Logic

- **File**: `src/main.ts`
- **Action**:
  - **Constructor**:
    - Update the constructor to accept the new options.
    - Set the default values as specified:
      - `businessid`: `''` (empty string)
      - `clienttype`: `'web'`
      - `jurisdiction`: `'MT'`
      - `language`: `'en'`
    - Store these values in the `this.userInfo` object.
    - Add comprehensive JSDoc comments for the new parameters to explain their purpose and default values.
  - **`_login()` Method**:
    - Modify the payload of the `send('flblogin', ...)` call.
    - Include `businessid`, `clienttype`, `jurisdiction`, and `language` in the payload, sourcing them from `this.userInfo`.

### Step 3: Update Tests

- **Files**: `tests/integration.test.ts`, `tests/main-adv.test.ts`, and any other relevant test files.
- **Action**:
  - Search for all instantiations of `new SlotcraftClient(...)`.
  - Update the constructor calls to reflect the new API. Since the new parameters are optional, existing tests might not need changes unless they rely on specific login payloads.
  - Add a new test case to specifically verify that the new constructor parameters are correctly passed in the `flblogin` message.

### Step 4: Validate Changes

- **Action**:
  - Run the full check script using `npm run check`.
  - Ensure all linting checks pass and all tests, including the new ones, succeed.
  - Debug and fix any issues that arise.

### Step 5: Update Documentation

- **File**: `jules.md`
- **Action**:
  - Add a new entry under the "Development Log" section for "Plan 024".
  - Describe the changes made: the extension of the constructor, the new parameters, their defaults, and the impact on the login request.

### Step 6: Create Final Report

- **File**: `jules/plan024-report.md`
- **Action**:
  - Create the report file, documenting the entire process:
    - A summary of the task.
    - A log of the steps taken.
    - Any challenges encountered and how they were resolved.
    - Confirmation of successful validation.

## 4. Deliverables

- Modified `src/types.ts` and `src/main.ts`.
- Updated test files.
- Updated `jules.md`.
- New `jules/plan024.md` and `jules/plan024-report.md`.
