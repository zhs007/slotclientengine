# @slotclientengine/vnicore

`@slotclientengine/vnicore` is the Pixi.js v8 runtime core for VNI animation exports. It owns export JSON typing, validation, deterministic sampling, asset URL resolving, Pixi texture-size checks, rendering, diagnostics, and playback controls.

VNI_0.087 adds strict six-track `basicAnimation` sampling (`opacity`, position, scale, and rotation), `bounce_jump`, and a current rotate contract with acceleration/deceleration plus pressure rotation. Basic tracks are sampled before the preset/particle stack; a segment uses the arriving (right-hand) point's easing and holds its first/last endpoint. Pressure rotate keeps the outer layer ellipse upright while rotating only the stable inner content root. Legacy `fromRotation/toRotation` rotate remains supported, while non-empty legacy layer `keyframes` remain rejected rather than migrated at runtime.

VNI_0.095 adds strict `card_carousel_3d` playback. The core owns the five-phase timeline, reveal order, target alignment, perspective/card/slice geometry, tint and stable depth order. Image layers use one texture; sequence layers use the complete explicit `frameAssetIds` library with `cardIndex % frameCount`. Pixi card containers, slice sprites, and slice texture views are pooled for the player lifetime and released by `destroy()` without destroying shared source textures.

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
- VNI `sequence` layers, resolved from explicit `sequence.frameAssetIds` and rendered as texture-backed Pixi sprites
- center-coordinate Pixi rendering
- bundle manifests with profile/project consistency checks
- all-or-none `fileWidth` / `fileHeight` / `fileScale` asset metadata
- runtime profile exports such as `runtime_50` and `runtime_100`, including logical-size display compensation for scaled file pixels
- animation, `multi_move`, particle, sequence-frame, and deterministic effect sampling used by `apps/anieditorv5viewer`
- layer masks with explicit source validation and cached `precompose_light_alpha` Pixi light-mask precomposition
- text-layer placeholder binding for host Pixi nodes, dynamic text, and project/external image replacements
- `particle_stream` continuous layer particles, `chaser_light` fixed-position runtime lights, VNI_0.070 deterministic sequence effects with bounded sprite counts, and VNI_0.074 `multi_move` transform sampling
- `play()`, `play({ mode: "segmented", ... })`, `pause()`, `restart()`, `seek()`, `setLoop()`, `playRange(...)`, playback markers, particle-draining, and complete listeners
- `project.layerGroups + layer.groupId` layer group schema, with render order derived from `project.layers`
- adjacent layer-group slot APIs for mounting host Pixi nodes, project asset images, or explicit external image URLs between two neighboring groups
- direct Pixi host embedding through `VNIPlayerOptions.parent`; the host owns `PIXI.Application`, canvas, renderer resize, and browser DOM
- host-driven playback embedding through `VNIPlayerOptions.autoTick: false`
- explicit fit padding override through `VNIPlayerOptions.fitPadding`
- transparent runtime display tree; `VNIPlayer` never renders exported stage backgrounds
- additive matte derivation for black-backed JPG or RGB PNG light textures referenced by `add` / `screen` / `lighten` image layers

Invalid data fails fast. Missing assets, bad numeric params, invalid `multi_move` `pointsJson`, unknown animation/easing/blend modes, texture size mismatches, unsupported group/parent/keyframe structures, and manifest/profile mismatches throw instead of rendering placeholders.

Runtime profile metadata comes from JSON `exportProfile` values and manifest entries, not from directory names. Hosts can store a `runtime_100` project in a normal JSON + `assets/` resource pool as long as the project data and assets are self-consistent.

Layer group slots are exposed through `VNIPlayer.getLayerGroupSlots()`. The slot order follows the actual `project.layers` render order, not `layerGroups.order`. `attachNodeBetweenLayerGroups(...)`, `attachImageBetweenLayerGroups(...)`, and `attachExternalImageBetweenLayerGroups(...)` require the two group ids to be an adjacent slot; reversed, unknown, or non-adjacent ids throw. Project images keep the project texture-size validation path; external image URLs are for host-owned assets that are not listed in `project.assets`.

`VNIPlayer` does not create its own Pixi application or canvas. Hosts pass an existing Pixi `parent` container; browser tools such as `apps/anieditorv5viewer` create the canvas themselves, while in-game callers such as `rendercore` mount the VNI display tree directly into the game renderer. Hosts that need diagnostics pass `diagnosticsElement`, hosts that resize a standalone viewer pass `viewport` / `setViewportSize(...)`, display zoom uses `viewportScale` / `setViewportScale(...)` without shrinking the clipping viewport, and manually rendered hosts pass `requestRender`.

`VNIPlayer` uses RAF by default. Embedders that already have a game ticker can pass `autoTick: false` and call `update(deltaSeconds)` themselves; this is the path used by `rendercore` symbol animations to keep VNI playback synchronized with Pixi slot updates. `fitPadding` defaults to the existing responsive padding, and can be set to `0` when the host needs VNI stage coordinates to map directly to a host-controlled viewport or mask.

`VNIPlayer` is runtime-only and never draws the exported stage background. `project.stage.backgroundColor` remains validated schema metadata, but it is not read by the Pixi player; VNI rendering stays transparent and contains only layers, effects, particles, and mounted nodes.

Black-backed JPG or RGB PNG light assets whose image-layer usages are all `add` / `screen` / `lighten` are converted to transparent matte textures during load when decoded pixels have no usable alpha channel. This keeps the exported art files unchanged while preventing Pixi v8 additive blending from writing an opaque black rectangle into transparent host canvases. PNG files that already carry transparent alpha are kept as-is. The conversion uses a transient decode canvas only for texture preprocessing; it is not a `VNIPlayer` render surface and is not appended to the DOM.

Supported animation types include transform/opacity animations, VNI_0.074 `multi_move` path transforms, live particles, segmented particle draining, deterministic render effects such as `shatter` and `glow`, continuous `particle_stream`, `chaser_light`, the cross-engine-safe `safe_glow` overlay, and the VNI_0.070 sequence effects `gather_particles`, `smoke_mist`, `energy_ring`, `slash_light`, `flame_flicker`, `wave_band`, `wave_distort`, `speed_lines`, `drift_fall`, and `path_particles`. Timeline coverage is start/end inclusive: `time === startTime` samples progress `0`, `time === startTime + duration` samples progress `1`, and only later times are inactive. Ended `move`, `multi_move`, `slide_in`, `slide_out`, and `squash_stretch` transforms keep contributing at progress `1` so later animations can continue from the correct position; empty frames still hide the layer because visibility is sampled separately. `multi_move` consumes strict `pointsJson` arrays, with each segment using the target point easing and overshooting easings left unclamped. `idle` is a coverage-only no-op; `shatter` and `glow` are sampled as render effects, while `safe_glow` is a duplicate-image overlay that inherits the layer blend mode and is counted separately from render effects. `chaser_light` samples fixed light positions and advances only the lit/dim window; circle spacing is interpreted as arc length, and timing advances per light by `lightDuration + interval`.

Text layers are runtime placeholders. Hosts can bind custom Pixi nodes with `attachNodeToTextLayer(...)`, dynamic text with `attachTextToTextLayer(...)`, or images with `attachImageToTextLayer(...)`; bound nodes inherit the text layer transform, opacity, visibility, blend mode, render order, and lifecycle. `destroy()`, `clearMountedNodes()`, project switches, and each returned dispose handle clean these nodes.

Layer masks fail fast when source layers are missing, self-referential, or use unsupported modes. `vnicore` is the Pixi.js runtime target and rejects Cocos-compatible `legacy_alpha` projects or enabled layer masks instead of emulating that export path. For `precompose_light_alpha` image masks on `add` / `screen` / `lighten` targets, the player matches the editor Pixi preview by drawing the target and mask source into stage-sized canvases, deriving alpha from light luminance multiplied by mask alpha, and caching the resulting texture by stage, asset, texture, transform, opacity, and blend inputs. Non-light blend modes keep the normal Pixi alpha-mask path. Top-level `project.particles` remains unsupported; use layer animation particles instead.

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
