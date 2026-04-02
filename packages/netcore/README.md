# @slotclientengine/netcore

Internal network library for the `slotclientengine` monorepo. It wraps WebSocket game communication behind a stateful `SlotcraftClient` facade and supports both live connections and replay-based debugging.

For Chinese documentation, see [README.zh.md](./README.zh.md).

## Positioning

- Workspace package name: `@slotclientengine/netcore`
- Current usage: internal package for apps and other workspace libraries
- Package manager: `pnpm`
- Build orchestration: `turbo`
- Output format: CommonJS in `dist/`

This package is not documented as a standalone published npm package. Consume it from the monorepo workspace.

## Features

- Handles connect, login, enter-game, spin, collect, and selection flows through one client API.
- Maintains client state with resume handling for unfinished rounds.
- Emits lifecycle, raw network, and passive message events.
- Retries live connections after unexpected disconnects.
- Supports replay mode when the URL points to an HTTP(S) JSON snapshot.

## Workspace Usage

From another workspace package, depend on `@slotclientengine/netcore` and import from the package entry:

```ts
import { ConnectionState, SlotcraftClient } from '@slotclientengine/netcore';
```

## Minimal Example

```ts
import { ConnectionState, SlotcraftClient } from '@slotclientengine/netcore';

async function run() {
  const client = new SlotcraftClient({
    url: 'ws://your-game-server.example/ws',
    token: 'user-token',
    gamecode: 'game-code-001',
    businessid: 'demo',
    clienttype: 'web',
    language: 'en',
  });

  client.on('state', ({ current }) => {
    console.log('state:', current);
  });

  await client.connect();
  await client.enterGame();

  while (client.getState() !== ConnectionState.IN_GAME) {
    const state = client.getState();

    if (state === ConnectionState.SPINEND) {
      await client.collect();
      continue;
    }

    if (state === ConnectionState.WAITTING_PLAYER) {
      await client.selectOptional(0);
      continue;
    }

    if (state === ConnectionState.RESUMING) {
      await new Promise((resolve) => client.once('state', resolve));
      continue;
    }

    throw new Error(`Unhandled state during resume: ${state}`);
  }

  const result = await client.spin({ bet: 100, lines: 10 });
  console.log(result);
  client.disconnect();
}

run().catch(console.error);
```

## Public API

- `connect(token?)`: establish connection and login.
- `enterGame(gamecode?)`: enter the target game.
- `spin(params)`: execute one in-game action.
- `collect(playIndex?)`: collect the current or derived play result.
- `selectOptional(index)`: resolve a pending player-choice state.
- `selectSomething(clientParameter)`: send a generic string parameter to the server-side `selectany` flow.
- `send(cmdid, params)`: send a lower-level command directly.
- `getState()` and `getUserInfo()`: inspect runtime state and caches.

## Development Commands

Run from the repository root:

- `pnpm --filter @slotclientengine/netcore build`
- `pnpm --filter @slotclientengine/netcore test`
- `pnpm --filter @slotclientengine/netcore typecheck`
- `pnpm --filter @slotclientengine/netcore lint`
- `pnpm --filter @slotclientengine/netcore run check`

Workspace-wide validation is available through root scripts:

- `pnpm lint`
- `pnpm test`
- `pnpm typecheck`
- `pnpm build`

## Additional Docs

- `docs/usage_en.md`: concise integration notes
- `docs/usage_zh.md`: 中文集成说明
- `docs/frontend-ws-doc-en.md`: protocol-oriented WebSocket notes
- `examples/example001.ts`: development example for local debugging

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
