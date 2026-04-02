# Plan 008: Create a WebSocket Client Example and Protocol Log

## 1. Goals（目标）

- Provide a runnable TypeScript example `examples/example001.ts` that:
  - Loads `WEBSOCKET_URL`, `TOKEN`, and `GAME_CODE` from environment variables (via `.env`).
  - Uses the high-level `SlotcraftClient` to connect, authenticate, enter the game, and perform a standard spin/collect flow.
  - Emits and logs all raw WebSocket traffic to `msg001.txt` for future mock-server work.
- Produce supporting docs and updates:
  - This plan (`jules/plan008.md`) captures goals and approach; a report `jules/plan008-report.md` will record execution details.
  - Update `jules.md` with the new example and how to run it.
  - Update `agents.md` if any agent changes are required.
- Keep the example resilient and clear:
  - Robust error handling, clean disconnects, and readable logging format `[DIRECTION] [TIMESTAMP]: [MESSAGE]`.

## 2. My Understanding of the Requirements

The user wants a functional TypeScript example that demonstrates how to use the networking library to connect to a game server.

### Key Deliverables:

1.  **`examples/example001.ts`**: A new example file.
    - It must be configurable via environment variables (`WEBSOCKET_URL`, `TOKEN`, `GAME_CODE`). The user prefers using a `.env` file for this.
    - It should connect to the WebSocket server and execute a specific sequence of actions:
    1.  Perform a version check (`checkver`). [Deprecated/Removed] 2. Log in to the server (`flblogin`). 3. Enter a specific game (`comeingame3`). 4. Send a game action, like a "spin" (`gamectrl3`).
    - The script should use the existing library components, such as the `Connection` class, to ensure it serves as a valid usage example.

2.  **`msg001.txt`**: A protocol log file.
    - This file must capture all JSON messages sent by the client and received from the server.
    - The logging format should be clear enough to be used as a reference for creating a mock server in the future. A format like `[DIRECTION] [TIMESTAMP]: [MESSAGE]` would be appropriate.

3.  **Documentation**:
    - This plan file (`jules/plan008.md`) to document the initial request and my interpretation.
    - A corresponding report file (`jules/plan008-report.md`) to be created after the task is complete, detailing the implementation process.
    - An update to the main `jules.md` file to include information about the new example.
    - An update to `package.json` to include a `check` script as specified in `agents.md`.

### Technical Approach:

- **Dependencies**: I'll add `dotenv` to manage environment variables and `isomorphic-ws` to provide a `WebSocket` implementation for the Node.js environment, as the existing `Connection` class expects it to be globally available.
- **Protocol Implementation**: I will strictly follow the protocol flow and message formats defined in `docs/frontend-ws-doc-zh.md`. This includes correctly handling the `ctrlid` passed from the server in `gameuserinfo` messages for use in subsequent `gamectrl3` requests.
- **File Structure**: I will create a new `examples/` directory for the script and its associated `.env` file. The output log `msg001.txt` will also be generated in the root.
- **Verification**: I will use the `npm run check` command (which I will add to `package.json`) to ensure my changes don't break the existing project.
