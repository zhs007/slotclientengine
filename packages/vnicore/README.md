# @slotclientengine/vnicore

`@slotclientengine/vnicore` is the Pixi.js v8 runtime core for VNI animation exports. It owns export JSON typing, validation, deterministic sampling, asset URL resolving, Pixi texture-size checks, rendering, diagnostics, and playback controls.

This package is separate from `@slotclientengine/anieditorv5runtime-cc`: `vnicore` targets Pixi.js/browser runtimes, while `anieditorv5runtime-cc` targets Cocos Creator 3.8.6 projects. Do not share Cocos `cc` shims, standalone files, or component examples with this package.

## Public Imports

```ts
import {
  assertVNIProject,
  validateVNIProject,
} from "@slotclientengine/vnicore/core";
import { VNIPlayer } from "@slotclientengine/vnicore/pixi";
```

The root import re-exports both `./core` and `./pixi`. The `V5G*` names are legacy schema aliases; new code should prefer `VNI*`.

## Supported Runtime Contract

- schema families: `V5G_0.x` and `VNI_0.x`
- editor names: `victory_editor_v5_g` and `VNI`
- current export metadata target: `engineTarget.name === "cocos_creator"`
- image and basic text layers
- center-coordinate Pixi rendering
- bundle manifests with profile/project consistency checks
- all-or-none `fileWidth` / `fileHeight` / `fileScale` asset metadata
- `runtime_50` file pixels with logical-size display compensation
- animation and particle sampling used by `apps/anieditorv5viewer`
- `play()`, `play({ mode: "segmented", ... })`, `pause()`, `restart()`, `seek()`, `setLoop()`, `playRange(...)`, playback markers, particle-draining, and complete listeners
- `project.layerGroups + layer.groupId` layer group schema, with render order derived from `project.layers`
- adjacent layer-group slot APIs for mounting host Pixi nodes, project asset images, or explicit external image URLs between two neighboring groups

Invalid data fails fast. Missing assets, bad numeric params, unknown animation/easing/blend modes, texture size mismatches, unsupported group/parent/keyframe structures, and manifest/profile mismatches throw instead of rendering placeholders.

Layer group slots are exposed through `VNIPlayer.getLayerGroupSlots()`. The slot order follows the actual `project.layers` render order, not `layerGroups.order`. `attachNodeBetweenLayerGroups(...)`, `attachImageBetweenLayerGroups(...)`, and `attachExternalImageBetweenLayerGroups(...)` require the two group ids to be an adjacent slot; reversed, unknown, or non-adjacent ids throw. Project images keep the project texture-size validation path; external image URLs are for host-owned assets that are not listed in `project.assets`.

Supported animation types include transform/opacity animations, live particles, segmented particle draining, and deterministic render effects such as `idle`, `shatter`, and `glow`. `idle` is a coverage-only no-op; `shatter` and `glow` are sampled separately from live particles.

## Docs And Examples

- [Usage](./docs/usage-zh.md)
- [API](./docs/api-zh.md)
- [Viewer migration](./docs/migration-from-viewer-zh.md)
- [Examples](./examples/README.md)

## Commands

```bash
pnpm --filter @slotclientengine/vnicore typecheck
pnpm --filter @slotclientengine/vnicore lint
pnpm --filter @slotclientengine/vnicore examples:typecheck
pnpm --filter @slotclientengine/vnicore test
pnpm --filter @slotclientengine/vnicore build
pnpm --filter @slotclientengine/vnicore format:check
```

`test` enforces coverage thresholds: lines, functions, branches, and statements must each be at least 80%.
