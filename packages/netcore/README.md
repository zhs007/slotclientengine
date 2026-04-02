# Slotcraft Client-side Networking Library

[![CI](https://github.com/zhs007/slotcraft-client-net/actions/workflows/ci.yml/badge.svg)](https://github.com/zhs007/slotcraft-client-net/actions/workflows/ci.yml)
[![Tested with Vitest](https://img.shields.io/badge/tested%20with-vitest-6E9F18.svg?logo=vitest)](https://vitest.dev/)

A robust, efficient, and lightweight TypeScript frontend networking library. It serves as a communication bridge between a game application layer and a game server, handling WebSocket connections, protocol interactions, state synchronization, and error recovery.

<details>
<summary><strong>:cn: 中文版 (Chinese Version)</strong></summary>

Please [click here to view the Chinese documentation](./README.zh.md).

</details>

## Features

- **Connection Management**: Simple `connect()` method to handle the entire WebSocket connection, version checking, and login flow.
- **State Machine**: Manages the complete client lifecycle (`IDLE`, `CONNECTING`, `CONNECTED`, `IN_GAME`, `RECONNECTING`, etc.) internally.
- **Protocol Abstraction**: Provides a clean API (`spin`, `collect`, etc.) so developers don't need to manage low-level protocol details like `cmdid`.
- **Event-Driven**: Decouples from game modules via an `on(event, callback)` system. Supports `connect`, `disconnect`, `reconnecting`, `message`, and `raw_message` events.
- **Automatic Reconnection**: Automatically attempts to reconnect on unexpected network disconnections.
- **Operation Queue**: Serializes all user actions (`spin`, `collect`, etc.) to prevent race conditions and ensure command ordering.
- **Game State Resume**: Intelligently handles scenarios where a user re-enters a game with an unfinished round (e.g., pending rewards or choices).
- **Replay Mode**: Allows debugging and testing by replaying a game session from a static JSON file, eliminating the need for a live server connection.

## Project Structure

```
.
├── dist/                # Compiled output (JavaScript and type definitions)
├── docs/                # Documentation files
├── examples/            # Example usage scripts
├── src/                 # TypeScript source code
│   ├── connection.ts    # Low-level WebSocket connection wrapper
│   ├── event-emitter.ts # Simple event emitter implementation
│   ├── index.ts         # Main library export entry point
│   ├── live-client.ts   # Implementation for live server communication
│   ├── main.ts          # The main SlotcraftClient facade
│   ├── replay-client.ts # Implementation for replaying sessions from a file
│   └── types.ts         # Core type definitions and interfaces
├── tests/               # Unit and integration tests (Vitest)
├── package.json         # Project configuration and scripts
└── tsconfig.json        # TypeScript compiler options
```

## Code Architecture

The library is architected around the `SlotcraftClient` class, which acts as a facade. Based on the URL scheme provided in its constructor (`ws[s]://` or `http[s]://`), it instantiates one of two implementations:

-   **`SlotcraftClientLive`**: The primary implementation for connecting to a live WebSocket server. It features a comprehensive state machine, an operation queue to serialize user actions, automatic reconnection, and heartbeat management.
-   **`SlotcraftClientReplay`**: A secondary implementation for debugging and testing. It doesn't connect to a server; instead, it fetches a JSON file representing a game session and simulates the client's behavior based on that data.

This design separates the core game logic from the transport layer, allowing for powerful testing and development workflows.

## Basic Usage

### Installation

```bash
npm install slotcraft-client-net
```

### Development Scripts

-   `npm run build`: Compiles the TypeScript code to the `dist/` directory.
-   `npm test`: Runs the Vitest test suite and generates a coverage report.
-   `npm run lint`: Lints the codebase for style and potential errors.
-   `npm run typecheck`: Checks the project for TypeScript type errors without compiling.

## Minimal Integration (Browser)

This example shows the minimal setup for connecting to a server, entering a game, and performing a single spin.

**Important**: This is a browser-based example. Do not use environment variables or hardcode sensitive tokens directly in production code. Tokens should be fetched securely from your authentication service.

```typescript
import { SlotcraftClient, ConnectionState } from 'slotcraft-client-net';

async function runMinimalExample() {
  // Configuration should be passed securely.
  const client = new SlotcraftClient({
    url: 'ws://your-game-server.com/ws', // Your WebSocket server URL
    token: 'user-secret-token',          // User's authentication token
    gamecode: 'game-code-001',           // The specific game to enter
    // Optional context parameters
    businessid: 'your-business-id',
    clienttype: 'web',
    language: 'en',
  });

  client.on('state', ({ current }) => {
    console.log(`Client state is now: ${current}`);
  });

  client.on('error', (err) => {
    console.error('A client error occurred:', err);
  });

  try {
    console.log('Connecting...');
    await client.connect(); // Connects to the server and logs in

    console.log('Entering game...');
    await client.enterGame(); // Enters the specified game

    // Check if the game started in a state that needs handling (e.g., a pending win)
    if (client.getState() !== ConnectionState.IN_GAME) {
      console.log('Game needs to be resumed. See advanced guide for handling.');
      // For this minimal example, we'll stop here.
      client.disconnect();
      return;
    }

    console.log('Spinning once...');
    const result = await client.spin({ lines: 10, bet: 100 });
    console.log('Spin successful:', result);

    // If the spin resulted in a win, the state will be 'SPINEND'.
    if (client.getState() === ConnectionState.SPINEND) {
      console.log('Collecting win...');
      await client.collect();
      console.log('Win collected. State is now:', client.getState());
    }

  } catch (error) {
    console.error('An error occurred during the session:', error);
  } finally {
    if (client.getState() !== ConnectionState.DISCONNECTED) {
        console.log('Disconnecting.');
        client.disconnect();
    }
  }
}

runMinimalExample();
```

## Advanced Integration

### State Management

The client operates on a strict state machine. You can get the current state at any time with `client.getState()`. The possible states are defined in the `ConnectionState` enum:

-   `IDLE`: Initial state.
-   `CONNECTING`: `connect()` has been called, WebSocket is connecting.
-   `CONNECTED`: WebSocket connection is open.
-   `LOGGING_IN`: Login request has been sent.
-   `LOGGED_IN`: Login successful.
-   `ENTERING_GAME`: `enterGame()` has been called.
-   `IN_GAME`: Ready to accept `spin()` or other actions.
-   `SPINNING`: `spin()` has been called, awaiting result.
-   `PLAYER_CHOICING`: `selectOptional()` has been called, awaiting result.
-   `WAITTING_PLAYER`: Spin resulted in a choice that the user must make.
-   `SPINEND`: Spin is finished and resulted in a win that must be collected with `collect()`.
-   `COLLECTING`: `collect()` has been called.
-   `RECONNECTING`: Connection was lost, attempting to reconnect.
-   `DISCONNECTED`: Connection is closed (either intentionally or after failed reconnects).
-   `RESUMING`: A transient state indicating that an unfinished game state is being restored.

### Event Handling

Listen to events to react to changes and messages:

```typescript
// Fired on any state change
client.on('state', (payload: { previous: ConnectionState, current: ConnectionState, data?: any }) => {
  console.log(`State changed from ${payload.previous} to ${payload.current}`);
});

// Fired on successful connection
client.on('connect', () => { console.log('Connected!'); });

// Fired on disconnection
client.on('disconnect', (payload: { code: number, reason: string, wasClean: boolean }) => {
  console.log(`Disconnected: ${payload.reason}`);
});

// Fired when the client is attempting to reconnect
client.on('reconnecting', (payload: { attempt: number }) => {
  console.log(`Reconnecting, attempt #${payload.attempt}...`);
});

// Fired for any asynchronous (passive) message from the server
client.on('message', (message: any) => {
  console.log('Received async message:', message);
});

// Fired for every single message sent or received (useful for debugging)
client.on('raw_message', (payload: { direction: 'SEND' | 'RECV', message: string }) => {
  // Log this to a file for detailed debugging
});

// Fired on WebSocket errors
client.on('error', (error: Error) => {
  console.error('Client error:', error);
});
```

### Error Handling & Game Resume

All actions (`connect`, `spin`, etc.) are `async` and return a `Promise`. You should wrap them in `try...catch` blocks.

A critical feature is handling game resumption. When `enterGame()` completes, the game might not be in the `IN_GAME` state. It could be in `SPINEND` (a win is waiting to be collected) or `WAITTING_PLAYER` (a choice needs to be made). Your application must handle this to bring the game to a ready state.

```typescript
await client.enterGame();

// Loop until the game is in a standard playable state.
while (client.getState() !== ConnectionState.IN_GAME) {
  const state = client.getState();
  console.log(`Handling resume state: ${state}`);

  if (state === ConnectionState.SPINEND) {
    await client.collect();
  } else if (state === ConnectionState.WAITTING_PLAYER) {
    // Logic to determine which option to select
    const userInfo = client.getUserInfo();
    if (userInfo.optionals && userInfo.optionals.length > 0) {
      await client.selectOptional(0); // Select the first option
    } else {
      throw new Error('In WAITTING_PLAYER state on resume, but no optionals found.');
    }
  } else if (state === ConnectionState.RESUMING) {
    // This is a transient state. Wait for the next state change.
    await new Promise(resolve => client.once('state', resolve));
  } else {
    // This state should not be reachable if the client is disconnected properly
    // in case of an error during resume.
    throw new Error(`Unhandled resume state: ${state}. Cannot proceed.`);
  }
}

console.log('Game is ready to play!');
// Now you can call client.spin()
```

## Detailed Features

### Replay Mode

Replay mode is a powerful tool for debugging and UI development. Instead of connecting to a live server, the client fetches a JSON file that contains a snapshot of a `gamemoduleinfo` message.

-   **Activation**: Pass an `http://` or `https://` URL to the constructor. In Node.js, you must also provide a `fetch` implementation.
-   **`connect()`**: Fetches the JSON file. Simulates `connect` and `login`.
-   **`enterGame()`**: Caches game configuration from the file (e.g., `defaultScene`, `linesOptions`).
-   **`spin()`**: Processes the result from the file and transitions to the final state (`SPINEND`, `WAITTING_PLAYER`, etc.).

### Resume Logic

When a player enters a game, they might have an unfinished round from a previous session. The server will report this in the response to `enterGame`. The client handles this by:
1.  Setting the state to `RESUMING` to indicate a resume is in progress.
2.  Parsing the server response to determine the correct state:
    -   `SPINEND`: If there is a win to be collected.
    -   `WAITTING_PLAYER`: If the player needs to make a choice.
3.  Updating its internal caches (`lastTotalWin`, `optionals`, etc.) with the resume data.
It is the responsibility of the library user to call `collect()` or `selectOptional()` to resolve this state before new actions can be performed (as shown in the "Error Handling & Game Resume" section).

### `selectSomething(clientParameter: string)`

This method provides a generic way to send a `selectany` command to the server, which can be used for custom game features that require a simple string input from the client. It sends the provided `clientParameter` along with the last known betting context.

### `transformSceneData(data)` Utility

-   **Source**: `import { transformSceneData } from 'slotcraft-client-net'`
-   **Description**: A utility function designed to simplify the complex `defaultScene` object received from the server into a more usable format.
-   **Input**: Takes a raw scene data object, which typically has a structure like `{ values: [{ values: [1, 2] }, ...] }`.
-   **Output**: Returns a simple 2D array of numbers (e.g., `[[1, 2], ...]`)..

### The `collect` Flow and Auto-Collect

The `collect` action is a crucial part of the game loop, used to formally acknowledge a result from the server, typically a win.

-   **When is `collect` needed?**: After a `spin` or `selectOptional` action, if the outcome results in a win or a multi-stage feature, the client's state will transition to `SPINEND`. This signals that a `collect()` call is required to confirm the result before the next spin can occur.
-   **Auto-Collect**: To simplify the developer experience and reduce network round-trips, the library implements an "auto-collect" mechanism. If a single action (like a spin) produces multiple results (e.g., a base game win that triggers a feature with its own result), the library will automatically call `collect()` on all intermediate results in the background. This leaves only the very final result for the user to `collect()` manually, streamlining the game flow significantly.

### `selectOptional` vs. `selectSomething`

While both methods are used for player choices, they serve fundamentally different purposes:

-   **`selectOptional(index)`**: This method is used exclusively in the `WAITTING_PLAYER` state. This state is **server-driven**; the game logic on the server is paused and is waiting for the client to choose from a specific list of options that it provided. Calling `selectOptional` sends the player's choice back to the server, allowing the blocked game logic to proceed.

-   **`selectSomething(clientParameter)`**: This is a more generic, **client-driven** action. It is used to send a custom string parameter to the server via a `selectany` command. It does not correspond to a blocked server state. Instead, it's a way for the client to send information or trigger custom features that don't fit the standard `spin` or `selectOptional` flows.
