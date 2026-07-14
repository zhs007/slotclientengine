# logiccore Usage Guide

`@slotclientengine/logiccore` is the game-logic parsing and query library for
GDK-compatible slot game data inside the `slotclientengine` workspace.

Use this package when a project uses our GDK, or when part of the project's data
format is compatible with our GDK data contract. If the project uses our no-code
server, the component-related APIs in this package are required to read
component scenes, other scenes, and win results from server spin responses.

`logiccore` converts one `gamemoduleinfo` spin message into an immutable
`GameLogic` object that rendering, framework, tooling, and game-specific code can
query with a stable TypeScript API.

## Scope

`logiccore` is intentionally narrow:

- It parses and validates GDK-compatible game logic data.
- It exposes immutable query models for spin steps, scenes, other scenes, win
  results, triggered components, game config, and reel strips.
- It keeps the browser entrypoint free of Node-only APIs.
- It does not connect to a server.
- It does not depend on `@slotclientengine/netcore`.
- It does not decode protobuf `Any` payloads.
- It does not own rendering, animation, slot reel presentation, UI state, or game
  framework lifecycle.

Game applications that use the standard frontend stack usually consume this
package through `@slotclientengine/gameframeworks`. Direct use is appropriate for
shared framework code, test fixtures, data validation tools, and game-specific
logic that needs to inspect GDK-compatible spin data.

## Workspace Dependency

Add the package as an internal workspace dependency:

```json
{
  "dependencies": {
    "@slotclientengine/logiccore": "workspace:*"
  }
}
```

The package has no runtime dependencies. It is built as CommonJS and publishes
types from `dist/`.

## Entrypoints

Use the top-level entrypoint in browser code, Vite apps, framework packages, and
Node code that already has parsed JSON objects:

```ts
import {
  createGameConfig,
  createGameLogic,
  createGameLogicFromGmi,
  getComponentWinResultGroups,
  parseWinResultPositions,
  LogicParseError,
} from "@slotclientengine/logiccore";
```

Use the Node-only subpath only when loading a game config JSON file from disk:

```ts
import { loadGameConfigFromJsonFile } from "@slotclientengine/logiccore/node";
```

`@slotclientengine/logiccore` must remain browser-safe. Node file-system access
belongs only to `@slotclientengine/logiccore/node`.

## Parsing Spin Data

Use `createGameLogic(message)` when the caller has the complete
`gamemoduleinfo` message:

```ts
import { createGameLogic } from "@slotclientengine/logiccore";

const logic = createGameLogic(gameModuleInfoMessage);

const defaultScene = logic.getDefaultScene();
const randomNumbers = logic.getRandomNumbers();
const stepCount = logic.getStepCount();

const firstStep = logic.getStep(0);
const firstScene = firstStep.getScene(0);
const firstOtherScene = firstStep.getOtherScene(0);
const firstResult = firstStep.getResult(0);
```

The message must have `msgid: "gamemoduleinfo"` and a valid `gmi` payload.
`logiccore` reads `bet`, `lines`, and `totalwin` from the message metadata.

Use `createGameLogicFromGmi(gmi, meta)` only when the caller already split the
`gmi` payload from the surrounding message:

```ts
import { createGameLogicFromGmi } from "@slotclientengine/logiccore";

const logic = createGameLogicFromGmi(gmi, {
  bet,
  lines,
  totalwin,
  gameid,
  gamemodulename,
});
```

`bet`, `lines`, and `totalwin` are required. `gamemodulename`, `gameid`,
`playIndex`, `playwin`, and `maxWinLimit` are optional metadata fields.

## GameLogic Model

A `GameLogic` instance exposes immutable spin-level data:

```ts
const gameModuleName = logic.getGameModuleName();
const gameId = logic.getGameId();
const bet = logic.getBet();
const lines = logic.getLines();
const totalWin = logic.getTotalWin();
const playWin = logic.getPlayWin();

const rawMessage = logic.getRawMessage();
const rawGmi = logic.getRawGmi();
```

The step-level API reads one result step from `gmi.replyPlay.results`:

```ts
const step = logic.getStep(0);

const stepIndex = step.getIndex();
const coinWin = step.getCoinWin();
const cashWin = step.getCashWin();
const curGameMod = step.getCurGameMod();
const curGameModParam = step.getCurGameModParam();

const scenes = step.getScenes();
const otherScenes = step.getOtherScenes();
const results = step.getResults();
```

The convenience methods on `GameLogic` delegate to the selected step:

```ts
const scene = logic.getScene(0, 0);
const otherScene = logic.getOtherScene(0, 0);
const result = logic.getResult(0, 0);
```

## Scene Matrix Contract

Scenes and other scenes use the same x-first matrix shape.

Protocol data:

```json
{
  "values": [{ "values": [0, 4, 0, 4, 0] }, { "values": [0, 5, 0, 3, 0] }]
}
```

Parsed data:

```ts
[
  [0, 4, 0, 4, 0],
  [0, 5, 0, 3, 0],
];
```

The first index is `x`. The second index is `y`.

```ts
scene[x][y];
otherScene[x][y];
```

`logiccore` does not transpose scenes into y-first data, and it does not replace
invalid scenes with empty arrays.

## Component Queries

Component APIs are used when a no-code server response includes component usage
metadata in `clientData.curGameModParam`.

`historyComponents` determines whether a component was triggered in the step:

```ts
if (step.hasComponent("line-win")) {
  const component = step.getComponent("line-win");
}
```

When the component has `basicComponentData`, the used indexes select data from
the current step:

```ts
const scenes = step.getComponentScenes("bg-spin");
const otherScenes = step.getComponentOtherScenes("bg-gencoins");
const results = step.getComponentResults("line-win");
```

The same methods are available from `GameLogic` with an explicit step index:

```ts
const results = logic.getComponentResults(0, "line-win");
```

Component index fields are validated strictly:

- `basicComponentData.usedScenes` must point to existing step scenes.
- `basicComponentData.usedOtherScenes` must point to existing step other
  scenes.
- `basicComponentData.usedResults` must point to existing step win results.

If a component is listed in `historyComponents` but missing from
`mapComponents`, querying that component throws `LogicParseError`.

## Protobuf Any Boundary

Some component payloads may be encoded as protobuf `Any` data. `logiccore` keeps
the raw component payload but does not decode it.

When a triggered component exists in `mapComponents` but has no
`basicComponentData`:

```ts
const component = step.getComponent("money-trigger");

component?.hasBasicComponentData; // false
step.getComponentScenes("money-trigger"); // []
step.getComponentOtherScenes("money-trigger"); // []
step.getComponentResults("money-trigger"); // []
```

Use the `raw` field if a caller needs to pass the original payload to another
decoder:

```ts
const rawComponentPayload = component?.raw;
```

## Win Result Helpers

`WinResult.pos` stores coordinates as a flat x/y array:

```ts
import { parseWinResultPositions } from "@slotclientengine/logiccore";

const positions = parseWinResultPositions(result);
```

`parseWinResultPositions()` validates that:

- `pos` is an array.
- The array contains x/y pairs.
- Each coordinate is a non-negative integer.
- Duplicate coordinates are rejected.

Use `getComponentWinResultGroups()` to read and validate all win results used by
a component:

```ts
import { getComponentWinResultGroups } from "@slotclientengine/logiccore";

const groups = getComponentWinResultGroups(step, "line-win", {
  scene: step.getScene(0),
});
```

When `scene` is provided, each result coordinate must be inside the scene. A
caller can also provide `validatePosition` for game-specific symbol validation:

```ts
const groups = getComponentWinResultGroups(step, "line-win", {
  scene,
  validatePosition(context) {
    if (context.sceneSymbol !== expectedSymbolCode) {
      throw new Error("Unexpected result symbol.");
    }
  },
});
```

`logiccore` provides the generic position and bounds contract. Game-specific
symbol rules belong to the caller.

## Game Config

Use `createGameConfig(rawJson)` when the game config JSON is already loaded:

```ts
import { createGameConfig } from "@slotclientengine/logiccore";

const gameConfig = createGameConfig(rawJson);

const symbolCode = gameConfig.getSymbolCode("WL");
const paytableEntry = gameConfig.getPaytableEntry(1);
const reelNames = gameConfig.getReelNames();
```

Use the Node subpath when loading from a JSON file:

```ts
import { loadGameConfigFromJsonFile } from "@slotclientengine/logiccore/node";

const gameConfig = await loadGameConfigFromJsonFile(
  "assets/gamecfg003/gameconfig.json",
);
```

The config parser validates:

- `paytable`
- `symbolCodes`
- `reels`
- paytable code and key consistency
- paytable symbol and `symbolCodes` consistency
- non-empty pay values
- non-empty reel sets and reel strips
- reel symbol codes that must exist in the paytable

Unknown symbol codes, empty reel sets, empty reel strips, inconsistent
paytable mappings, and malformed JSON all fail explicitly.

## Reel Queries

`gameConfig.getReels(name)` returns a `LogicReels` model:

```ts
const reels = gameConfig.getReels("reels01");

const reelCount = reels.getReelCount();
const firstReelLength = reels.getLength(0);
const symbol = reels.get(0, -1);
const normalizedY = reels.normalizeY(0, 10.5);
```

`reels.get(x, y)` requires `x` to be an existing reel index and `y` to be an
integer. `y` wraps around the selected reel strip.

`reels.normalizeY(x, y)` accepts a finite number and returns the wrapped reel
coordinate without rounding.

## Stop Coordinates

Use `getStopYCoordinates()` to find the reel-strip y coordinate for each visible
scene column:

```ts
const scene = logic.getStep(0).getScene(0);

const stopYs = gameConfig.getStopYCoordinates({
  reelsName: "reels01",
  sceneName: "step0.scene0",
  scene,
});
```

The contract is:

```ts
scene[x][visibleY] === reels.get(x, stopYs[x] + visibleY);
```

The scene width must match the reel count. Each scene column must contain at
least one visible symbol. If a column cannot be matched in the selected reel
strip, `LogicParseError` is thrown. If multiple candidates exist, the first
candidate is used.

For live slot rendering, the frontend must not receive or cache the server's
real reel strips. Use local public reel strips for spin presentation. When the
server result arrives, overlay the server target visible window into temporary
render data for that spin. Do not fail a live spin only because the returned
scene cannot be reverse-matched against local public reels.

## Spin Start Coordinates

Use `calculateSpinStartY()` for one reel, or `getSpinStartYCoordinates()` for a
full reel set:

```ts
const startY = reels.calculateSpinStartY({
  x: 0,
  finalY: 3,
  durationMs: 250,
  speedSymbolsPerSecond: 8,
});

const startYs = gameConfig.getSpinStartYCoordinates({
  reelsName: "reels01",
  finalYs: stopYs,
  durationMs: 250,
  speedSymbolsPerSecond: 8,
  direction: "forward",
});
```

`direction` defaults to `"forward"`. `durationMs` and
`speedSymbolsPerSecond` must be non-negative finite numbers.

## Raw Data Access

Parsed models preserve raw data for diagnostics and downstream callers:

```ts
logic.getRawMessage();
logic.getRawGmi();
step.getRawStep();
step.getRawClientData();
step.getCurGameModParam();
step.getComponent("line-win")?.raw;
gameConfig.getRawConfig();
```

Returned objects and arrays are immutable snapshots. Mutating a value returned
from the API does not modify the internal model state.

## Error Handling

`logiccore` fails fast. Invalid protocol shape, missing required fields,
malformed scenes, invalid RNG arrays, invalid component indexes, invalid game
config, and invalid reel data throw `LogicParseError`.

Index accessors throw `RangeError` when the requested index is outside the
available data:

```ts
logic.getStep(999); // RangeError
step.getScene(999); // RangeError
step.getOtherScene(999); // RangeError
step.getResult(999); // RangeError
gameConfig.getReels("missing"); // RangeError
```

Recommended handling:

```ts
import { LogicParseError } from "@slotclientengine/logiccore";

try {
  const logic = createGameLogic(message);
  const step = logic.getStep(0);
  const groups = getComponentWinResultGroups(step, "line-win", {
    scene: step.getScene(0),
  });
} catch (error) {
  if (error instanceof LogicParseError) {
    // Treat this as invalid or incompatible GDK data.
  }

  throw error;
}
```

Do not hide parse errors by substituting empty scenes, empty components, or
default symbols. The caller should decide whether to reject the response, report
the data issue, or route the raw payload to a game-specific decoder.

## Browser Safety

The package has an export smoke test that verifies:

- The top-level package can be required and imported.
- `loadGameConfigFromJsonFile` does not leak from the top-level entrypoint.
- The Node subpath exports `loadGameConfigFromJsonFile`.
- The top-level bundle does not contain Node-only import tokens such as
  `node:fs`, `node:path`, `node:crypto`, or `node:fs/promises`.
- A Vite browser build can named-import `createGameConfig` from the top-level
  package.

Run the export smoke test after building:

```bash
pnpm --filter @slotclientengine/logiccore build
pnpm --filter @slotclientengine/logiccore test:exports
```

## Commands

Common package commands:

```bash
pnpm --filter @slotclientengine/logiccore lint
pnpm --filter @slotclientengine/logiccore test
pnpm --filter @slotclientengine/logiccore typecheck
pnpm --filter @slotclientengine/logiccore build
pnpm --filter @slotclientengine/logiccore test:exports
```

Use `pnpm install` from the repository root before running package commands.
