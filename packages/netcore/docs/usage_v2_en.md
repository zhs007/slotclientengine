# @slotclientengine/netcore Developer Guide v2

`@slotclientengine/netcore` is the internal WebSocket client package for the
`slotclientengine` pnpm workspace. It provides the stateful `SlotcraftClient`
facade used by internal framework packages, tools, CLIs, tests, and any task
that explicitly needs low-level network access.

This guide describes the current package contract in this repository. It is not
an external npm package guide.

## Package Contract

- Package name: `@slotclientengine/netcore`
- Package visibility: private workspace package
- Root package manager: `pnpm@10.0.0`
- Root Node.js requirement: `>=24.0.0`
- Build output: CommonJS files in `packages/netcore/dist`
- Public import path: `@slotclientengine/netcore`
- Public exports: `SlotcraftClient`, public types, and `transformSceneData`

Game apps should normally consume `@slotclientengine/gameframeworks`. Use
`@slotclientengine/netcore` directly only when a shared package, CLI, test, or
task needs the low-level client.

## Workspace Usage

Add `netcore` as a workspace dependency from another internal package:

```json
{
  "dependencies": {
    "@slotclientengine/netcore": "workspace:*"
  }
}
```

Import from the package entry point:

```ts
import {
  ConnectionState,
  SlotcraftClient,
  type SlotcraftClientOptions,
  type SpinParams,
} from '@slotclientengine/netcore';
```

Do not import from `packages/netcore/src/*` outside package-local tests and
examples.

When a consumer runs compiled CommonJS output, build `netcore` before the
consumer package:

```json
{
  "scripts": {
    "prepare:deps": "pnpm --filter @slotclientengine/netcore build",
    "build": "pnpm run prepare:deps && tsc -p tsconfig.json",
    "typecheck": "pnpm run prepare:deps && tsc -p tsconfig.json --noEmit",
    "test": "pnpm run prepare:deps && vitest run --coverage"
  }
}
```

Package-level validation commands from the repository root:

```sh
pnpm --filter @slotclientengine/netcore build
pnpm --filter @slotclientengine/netcore typecheck
pnpm --filter @slotclientengine/netcore lint
pnpm --filter @slotclientengine/netcore test
pnpm --filter @slotclientengine/netcore run check
```

## Runtime Modes

`SlotcraftClient` selects the implementation from `options.url`.

| URL protocol            | Mode        | Transport  |
| ----------------------- | ----------- | ---------- |
| `ws://` or `wss://`     | Live mode   | WebSocket  |
| `http://` or `https://` | Replay mode | JSON fetch |

Any other protocol throws during construction.

Browser live mode uses the browser's global `WebSocket`. Node.js live mode must
install a compatible global before creating the client:

```ts
import WebSocket from 'ws';

globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
```

Replay mode loads one JSON replay file. In non-browser environments, pass
`options.fetch`; the current replay implementation reads `options.fetch` or
`window.fetch`.

```ts
import fetch from 'node-fetch';

const client = new SlotcraftClient({
  url: 'https://example.internal/replays/round.json',
  token: 'token',
  gamecode: 'game-code',
  fetch: fetch as any,
});
```

## Constructor Options

```ts
const options: SlotcraftClientOptions = {
  url: 'wss://example.internal/',
  token: 'player-token',
  gamecode: 'game-code',
  businessid: '',
  clienttype: 'web',
  jurisdiction: 'MT',
  language: 'en',
  requestTimeout: 10000,
  maxReconnectAttempts: 10,
  reconnectDelay: 1000,
  autoCollectIntermediateResults: true,
  logger: console,
};
```

| Option                           | Required    | Default   | Used by                                                          |
| -------------------------------- | ----------- | --------- | ---------------------------------------------------------------- |
| `url`                            | yes         | none      | mode selection and transport                                     |
| `token`                          | no          | none      | login token; may also be passed to `connect(token)`              |
| `gamecode`                       | no          | none      | game entry target; may also be passed to `enterGame(gamecode)`   |
| `businessid`                     | no          | `""`      | login payload                                                    |
| `clienttype`                     | no          | `"web"`   | login payload                                                    |
| `jurisdiction`                   | no          | `"MT"`    | login payload and cached user info                               |
| `language`                       | no          | `"en"`    | login payload                                                    |
| `requestTimeout`                 | no          | `10000`   | per-command timeout in milliseconds                              |
| `maxReconnectAttempts`           | no          | `10`      | live reconnect attempts after unclean close                      |
| `reconnectDelay`                 | no          | `1000`    | initial reconnect delay in milliseconds, exponential up to 30000 |
| `autoCollectIntermediateResults` | no          | `true`    | live auto-collect for intermediate result stages                 |
| `fetch`                          | replay only | none      | replay JSON loader in non-browser environments                   |
| `logger`                         | no          | `console` | set to `null` to disable internal logging                        |

## Minimal Live Session

```ts
import { ConnectionState, SlotcraftClient } from '@slotclientengine/netcore';

export async function runOneSpin() {
  const client = new SlotcraftClient({
    url: 'wss://example.internal/',
    token: 'player-token',
    gamecode: 'game-code',
    requestTimeout: 10000,
    maxReconnectAttempts: 0,
  });

  await client.connect();
  await client.enterGame();
  await settleToInGame(client);

  const result = await client.spin({ bet: 1, lines: 25, times: 1 });
  await settleToInGame(client);

  client.disconnect();
  return result;
}

async function settleToInGame(client: SlotcraftClient): Promise<void> {
  for (let guard = 0; guard < 20; guard += 1) {
    const state = client.getState();

    if (state === ConnectionState.IN_GAME) {
      return;
    }

    if (state === ConnectionState.SPINEND) {
      await client.collect();
      continue;
    }

    if (state === ConnectionState.WAITING_PLAYER) {
      await client.selectOptional(0);
      continue;
    }

    if (state === ConnectionState.RESUMING) {
      await new Promise((resolve) => client.once('state', resolve));
      continue;
    }

    throw new Error(`Unhandled netcore state: ${state}`);
  }

  throw new Error('Timed out while settling netcore state.');
}
```

## Public API

| Method                             | Description                                                    |
| ---------------------------------- | -------------------------------------------------------------- |
| `getState()`                       | Returns the current `ConnectionState`.                         |
| `getUserInfo()`                    | Returns the cached `UserInfo` snapshot. Treat it as read-only. |
| `connect(token?)`                  | Opens the transport and performs login.                        |
| `enterGame(gamecode?)`             | Sends `comeingame3` and caches game context.                   |
| `spin(params)`                     | Sends `gamectrl3` with `ctrlname: "spin"` by default.          |
| `collect(playIndex?)`              | Sends `collect` for an explicit or derived play index.         |
| `selectOptional(index)`            | Resolves a server-driven choice in `WAITING_PLAYER`.           |
| `selectSomething(clientParameter)` | Sends a client-driven `selectany` payload.                     |
| `send(cmdid, params?)`             | Sends a low-level command and waits for matching `cmdret`.     |
| `disconnect()`                     | Stops heartbeat/reconnect timers and closes the transport.     |
| `on(event, cb)`                    | Registers an event listener.                                   |
| `off(event, cb)`                   | Removes an event listener.                                     |
| `once(event, cb)`                  | Registers a one-shot event listener.                           |

Application code should call `connect()` for login instead of sending login
commands manually.

## Spin Parameters

`spin(params)` accepts `SpinParams`.

| Field        | Default                                                    | Behavior                                                                      |
| ------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `bet`        | `UserInfo.defaultLinebet` when available                   | Validated against `UserInfo.linebets` when the server has provided line bets. |
| `lines`      | smallest value from `UserInfo.linesOptions` when available | Sent in `ctrlparam.lines`.                                                    |
| `times`      | `1`                                                        | Sent in `ctrlparam.times`.                                                    |
| `autonums`   | `-1`                                                       | Sent in `ctrlparam.autonums`.                                                 |
| `ctrlname`   | `"spin"`                                                   | Sent as the `gamectrl3.ctrlname`.                                             |
| extra fields | none                                                       | Copied into `ctrlparam`.                                                      |

`spin()` requires `ConnectionState.IN_GAME`, a cached `gameid`, and a cached
`ctrlid`.

## Collect Behavior

`collect(playIndex?)` is valid from `SPINEND` and `IN_GAME`.

The play index is selected in this order:

1. Use the explicit `playIndex` argument.
2. If `lastResultsCount > 0`, use `lastResultsCount - 1`.
3. If `lastPlayIndex` is available, use `lastPlayIndex + 1`.

If no index can be derived, the call rejects. If the server rejects `collect`,
the client returns to `SPINEND` so the caller can retry.

When `autoCollectIntermediateResults` is not `false`, live mode auto-collects
the second-to-last result index for multi-result outcomes. The final result is
left for the caller's explicit `collect()` unless the caller's higher-level
framework chooses another policy.

## Player Choices

`selectOptional(index)` is for server-driven choices only. The server marks
`WAITING_PLAYER` with `gmi.replyPlay.finished === false` and provides parallel
`nextCommands` and `nextCommandParams` arrays. Netcore caches those entries as
`UserInfo.optionals`.

`selectSomething(clientParameter)` is client-driven. It sends `gamectrl3` with
`ctrlname: "selectany"` and includes the latest cached spin params when they are
available.

## State Model

| State             | Meaning                                                            |
| ----------------- | ------------------------------------------------------------------ |
| `IDLE`            | Client has not connected yet.                                      |
| `CONNECTING`      | Transport connection is being opened.                              |
| `CONNECTED`       | Transport is open before login completes.                          |
| `LOGGING_IN`      | Login is in flight.                                                |
| `LOGGED_IN`       | Login succeeded; game entry has not completed.                     |
| `ENTERING_GAME`   | `comeingame3` is in flight.                                        |
| `RESUMING`        | Transient resume state after entering a game with unfinished work. |
| `IN_GAME`         | Ready for spin or other in-game commands.                          |
| `WAITING_PLAYER`  | Waiting for the player to choose one cached optional command.      |
| `SPINNING`        | `gamectrl3` spin is in flight.                                     |
| `PLAYER_CHOOSING` | `selectOptional()` follow-up is in flight.                         |
| `SPINEND`         | A result needs collect handling.                                   |
| `COLLECTING`      | `collect` is in flight.                                            |
| `RECONNECTING`    | Live transport closed unexpectedly and reconnect is scheduled.     |
| `DISCONNECTED`    | Transport is closed and no reconnect is active.                    |

## Events

| Event          | Payload                                    |
| -------------- | ------------------------------------------ |
| `state`        | `{ previous, current, data? }`             |
| `connect`      | no payload                                 |
| `disconnect`   | `{ code, reason, wasClean }`               |
| `reconnecting` | `{ attempt }`                              |
| `message`      | parsed passive server message              |
| `raw_message`  | `{ direction: "SEND" \| "RECV", message }` |
| `error`        | runtime or transport error                 |

`message` is emitted for passive server messages. `cmdret` messages are used to
resolve or reject pending command promises and are not emitted as passive
messages.

## Cached UserInfo

`getUserInfo()` returns the current cache. The cache is updated from server
messages; it is not a complete server session object.

| Source message   | Cached fields                                                                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `userbaseinfo`   | `pid`, `uid`, `nickname`, `balance`, `token`, `currency`, `jurisdiction`                                                                |
| `gameuserinfo`   | `ctrlid`, `lastctrlid`, `playerState`                                                                                                   |
| `gamecfg`        | `defaultLinebet`, `linebets`, `gamecfgVer`, `gamecfgCoreVer`, `gamecfgData`, `linesOptions`                                             |
| `gamemoduleinfo` | `gameid`, `lastGMI`, `lastPlayIndex`, `lastPlayWin`, `lastTotalWin`, `lastResultsCount`, `optionals`, `defaultScene`, `clientParameter` |

`defaultScene` is simplified with `transformSceneData(data)` into `number[][]`.

## Error Handling And Codes

Netcore exposes three error channels:

1. Promise rejection from the method that failed.
2. Runtime events such as `error`, `disconnect`, and `reconnecting`.
3. Passive server messages such as `noticemsg2`.

Client-owned promise rejections include:

| Condition                                           | Surface                                             |
| --------------------------------------------------- | --------------------------------------------------- |
| Unsupported URL protocol                            | constructor throws                                  |
| Missing token                                       | `connect()` rejects                                 |
| Missing game code                                   | `enterGame()` rejects                               |
| Method called from an invalid state                 | method rejects                                      |
| Missing `gameid`, `ctrlid`, `bet`, or collect index | method rejects                                      |
| `bet` not present in cached `linebets`              | `spin()` rejects                                    |
| Duplicate pending `send()` for the same `cmdid`     | `send()` rejects                                    |
| No matching `cmdret` before `requestTimeout`        | pending command rejects                             |
| `cmdret.isok === false`                             | pending command rejects                             |
| Replay fetch failure or invalid replay JSON         | `connect()` rejects                                 |
| Malformed live server JSON                          | emits `error` with `Failed to parse server message` |

Server business errors are delivered as passive messages. The common shape is:

```ts
type ServerNoticeMessage = {
  msgid: 'noticemsg2';
  msgcode?: number;
  msgparam?: unknown;
  ctrltype?: string;
  type?: number;
};
```

The package does not define an authoritative TypeScript enum for server numeric
error codes and does not map `msgcode` to names. Low-level consumers must log or
surface `msgcode` and `msgparam` as received. Consumers that need fail-fast
behavior should subscribe to `message` and reject their workflow when a
`noticemsg2` message arrives.

The internal `gameframeworks`, `uiframeworks`, and `gameclientcli` consumers
currently treat `noticemsg2` as fail-fast. The framework packages also fail fast
on passive messages that contain `error`, `err`, `errmsg`, or `errorMessage`.

## Protocol Commands Used By The Facade

The high-level methods hide the raw command details for normal consumers.

| Method              | Command       | Notes                                                                                  |
| ------------------- | ------------- | -------------------------------------------------------------------------------------- |
| `connect()`         | `login`       | Sends token, business id, client type, jurisdiction, language, and optional game code. |
| heartbeat           | `keepalive`   | Sent every 30000 ms after login in live mode.                                          |
| `enterGame()`       | `comeingame3` | Sends `gamecode`, `tableid: ""`, and `isreconnect: false`.                             |
| `spin()`            | `gamectrl3`   | Sends cached `gameid`, cached `ctrlid`, `ctrlname`, and `ctrlparam`.                   |
| `selectOptional()`  | `gamectrl3`   | Uses `ctrlname: "selectfree"` and cached server option data.                           |
| `selectSomething()` | `gamectrl3`   | Uses `ctrlname: "selectany"` and the provided `clientParameter`.                       |
| `collect()`         | `collect`     | Sends cached `gameid` and selected `playIndex`.                                        |

The client correlates command completion by matching `cmdret.cmdid` with the
pending command id.

## Replay Mode

Replay mode is selected by an HTTP(S) URL. It is for deterministic local
debugging with a JSON snapshot, not for live server play.

Replay mode behavior:

- `connect()` fetches the JSON file and simulates login.
- `enterGame()` pre-caches config-like fields and moves to `IN_GAME`.
- `spin()` processes the replay snapshot and returns `{ gmi, totalwin, results }`.
- `collect()` simulates a successful collect from `SPINEND`.
- `selectOptional()` is only valid in `WAITING_PLAYER`.
- `selectSomething()` caches the provided `clientParameter`.

Replay mode expects replay data shaped like a `gamemoduleinfo` message when
gameplay result fields are needed.

## Developer Notes

- Keep direct `netcore` consumers small. Prefer `gameframeworks` for game apps.
- In live Node.js tools, install `ws` as `globalThis.WebSocket` before creating
  `SlotcraftClient`.
- In replay Node.js tools, pass `options.fetch`.
- For strict automation, attach listeners to `error`, `disconnect`,
  `reconnecting`, and `message` before calling `connect()`.
- Do not hard-code server error-code names inside low-level consumers unless
  the game/server contract used by that consumer defines the mapping.
