# Plan 029: Implement Replay Mode

## 1. Objective

To add a "replay mode" to `SlotcraftClient`. This mode will allow the client to run against a static JSON file (served via a URL) instead of a live WebSocket server. This is useful for debugging, testing, and demonstrating specific game scenarios without requiring a live server connection.

## 2. Requirements

- The client should be initialized into replay mode if the provided URL is for a JSON file (HTTP/HTTPS).
- The replay mode should be mutually exclusive with the standard WebSocket mode.
- The implementation should be clean, separating the logic for the two modes, likely using an interface and two concrete classes.
- The public API of `SlotcraftClient` should remain unchanged, allowing `examples/example001.ts` to work with either mode by simply changing the URL.
- User actions in replay mode (like `spin` or `collect`) should resolve immediately with the data from the JSON file.
- The feature needs to be documented in `jules.md`.

## 3. Implementation Strategy

### Step 1: Create a Client Interface

- Define a new interface, `ISlotcraftClientImpl`, in `src/types.ts`.
- This interface will declare all the public methods and properties of the client (`connect`, `enterGame`, `spin`, `collect`, `selectOptional`, `disconnect`, `getState`, `getUserInfo`, `on`, `off`, `once`). This ensures that both the live and replay implementations adhere to the same contract.

### Step 2: Refactor Live Client

- Create a new file `src/live-client.ts`.
- Move the entire implementation of the current `SlotcraftClient` class from `src/main.ts` into this new file.
- Rename the class to `SlotcraftClientLive` and make it implement the `ISlotcraftClientImpl` interface.
- Export the new class.

### Step 3: Implement Replay Client

- Create a new file `src/replay-client.ts`.
- Create a new class `SlotcraftClientReplay` that implements `ISlotcraftClientImpl`.
- The constructor will accept the client options, including the JSON URL.
- The `connect` method will use `fetch` to get the JSON data from the URL and store it. It will simulate the connection and login process, setting the state to `LOGGED_IN`.
- The `enterGame` method will process the `gmi` part of the JSON and set the state to `IN_GAME` or `SPINEND` as appropriate, mimicking the resume logic.
- The `spin`, `collect`, and `selectOptional` methods will be simple stubs that immediately return a resolved promise with the relevant data from the loaded JSON, as the entire spin result is already known.
- All other methods (`getState`, `getUserInfo`, event handlers) will be implemented to manage the state of the replay session.

### Step 4: Update the Main `SlotcraftClient`

- Modify `src/main.ts` to turn `SlotcraftClient` into a factory/wrapper class.
- The constructor will inspect the `url` option. If it matches a websocket protocol (`ws://` or `wss://`), it will instantiate `SlotcraftClientLive`. If it matches an HTTP protocol (`http://` or `https://`), it will instantiate `SlotcraftClientReplay`.
- The `SlotcraftClient` will hold a private instance of `ISlotcraftClientImpl` and delegate all public method calls to it.

### Step 5: Add Tests for Replay Mode

- Create a new test file `tests/replay.test.ts`.
- Add tests to verify that `SlotcraftClientReplay` correctly loads data from a mock JSON URL, initializes its state, and that its methods (`enterGame`, `spin`, etc.) return the expected data.

### Step 6: Finalize and Document

- Run `npm run check` to ensure all tests pass and there are no linting errors.
- Update `jules.md` with a detailed section about the new Replay Mode.
- Create the final report `jules/plan029-report.md`.
