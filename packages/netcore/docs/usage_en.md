# Usage Guide

`@slotclientengine/netcore` is an internal workspace package. Use it from other packages in this monorepo instead of installing it as an external npm dependency.

## Import

```ts
import { ConnectionState, SlotcraftClient } from '@slotclientengine/netcore';
```

## Quick Start

```ts
const client = new SlotcraftClient({
  url: 'ws://your-server.example/ws',
  token: 'user-auth-token',
  gamecode: 'game-101',
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

  throw new Error(`Unhandled state: ${state}`);
}

const result = await client.spin({ bet: 100, lines: 10 });
console.log(result);
```

## Main Runtime Methods

- `connect(token?)`
- `enterGame(gamecode?)`
- `spin(params)`
- `collect(playIndex?)`
- `selectOptional(index)`
- `selectSomething(clientParameter)`
- `send(cmdid, params)`
- `disconnect()`

## Useful Events

- `state`: emits `{ previous, current, data? }`
- `connect`: emitted after the transport connects
- `disconnect`: emits `{ code, reason, wasClean }`
- `reconnecting`: emits `{ attempt }`
- `message`: passive server messages
- `raw_message`: every raw send/receive frame
- `error`: unexpected runtime errors

## Replay Mode

When the constructor receives an `http://` or `https://` URL, the client uses replay mode instead of live WebSocket mode. In Node.js you must provide `options.fetch`.

## Development Commands

Run from the repository root:

- `pnpm --filter @slotclientengine/netcore test`
- `pnpm --filter @slotclientengine/netcore lint`
- `pnpm --filter @slotclientengine/netcore typecheck`
- `pnpm --filter @slotclientengine/netcore build`
