# vnicore Usage Guide

`@slotclientengine/vnicore` is the Pixi.js v8 runtime core for VNI animation
exports. It owns VNI export validation, deterministic sampling, asset URL
resolution, Pixi texture-size checks, runtime rendering, playback controls,
mounted-node APIs, diagnostics, and effect/particle playback.

This document is written for developers who integrate or maintain `vnicore`
inside the `slotclientengine` workspace.

## VNI Editor

VNI Editor is an animation editor built by our art team with Djor, our in-house
Agent. It is intentionally simpler than Spine, and it adds built-in particle
systems plus a set of runtime effects for slot-game animation work.

The editor does not support complex skeletal rigs or mesh deformation features.
VNI exports are designed around timeline layers, image/text layers, particles,
render effects, masks, layer groups, and playback ranges that can be reproduced
by a runtime package.

`vnicore` is the Pixi.js v8 runtime for those exports. It is optimized for VNI
animation playback rather than being a generic animation engine. In particular,
the runtime keeps validation, sampling, playback state, live particles,
effect rendering, texture checks, and mounted-node lifecycles inside one package
so hosts do not duplicate this logic. This also gives the runtime room to apply
more precise performance optimizations for VNI assets, including cases where a
host drives multiple animations on the same object through state-machine-style
playback state.

## Package Contract

- Package name: `@slotclientengine/vnicore`
- Package visibility: private workspace package
- Runtime target: Pixi.js v8
- Module format: ESM
- Public import paths:
  - `@slotclientengine/vnicore`
  - `@slotclientengine/vnicore/core`
  - `@slotclientengine/vnicore/pixi`
- Build output:
  - `dist/index.js`
  - `dist/core/index.js`
  - `dist/pixi/index.js`

The root import re-exports both `./core` and `./pixi`.

```ts
import {
  assertVNIProject,
  resolveProjectAssetUrls,
  validateVNIProject,
} from "@slotclientengine/vnicore/core";
import { VNIPlayer } from "@slotclientengine/vnicore/pixi";
```

`V5G*` names are legacy schema aliases. New code should use `VNI*` names.

## Workspace Dependency

Add the package from another workspace package:

```json
{
  "dependencies": {
    "@slotclientengine/vnicore": "workspace:*"
  }
}
```

If the consumer runs compiled output, build `vnicore` before the consumer:

```json
{
  "scripts": {
    "prepare:deps": "pnpm --filter @slotclientengine/vnicore build",
    "build": "pnpm run prepare:deps && tsc -p tsconfig.json",
    "typecheck": "pnpm run prepare:deps && tsc -p tsconfig.json --noEmit"
  }
}
```

## Supported Runtime Contract

`vnicore` currently supports the runtime contract documented by the package
README and tests:

- VNI/V5G export JSON schema validation.
- `VNI` and legacy `victory_editor_v5_g` editor exports.
- Pixi.js v8 rendering.
- Image layers and text-layer placeholders.
- Runtime profile metadata from JSON `exportProfile` values and manifest
  entries.
- All-or-none asset file metadata: `fileWidth`, `fileHeight`, and `fileScale`.
- Runtime profiles such as `runtime_50` and `runtime_100`.
- Timeline playback, ranges, markers, complete listeners, and segmented
  playback.
- Layer animation particles and live particle draining.
- VNI_0.074 `multi_move`, including strict `pointsJson`, ended transform handoff,
  and empty-frame hiding.
- VNI_0.087 six-track `basicAnimation`, `bounce_jump`, current/legacy rotate,
  and pressure-separated outer scale plus inner visual rotation. Basic tracks
  run before the preset stack; segments use the arriving point's easing and
  hold both endpoints.
- `shatter`, `glow`, `safe_glow`, `particle_stream`, and `chaser_light`.
- Layer masks, including Pixi-preview-compatible `precompose_light_alpha` for
  light-mask use cases.
- Layer groups and adjacent group-slot mounting.
- Text-layer replacement with host Pixi nodes, dynamic text, project images, or
  explicit external image URLs.
- Transparent runtime output. `project.stage.backgroundColor` is schema
  metadata and is not drawn by `VNIPlayer`.

Invalid data fails fast. Missing assets, malformed numeric fields, invalid
`multi_move` `pointsJson`, unknown animation/easing/blend modes, unsupported
group/parent/keyframe structures, texture size mismatches, and manifest/profile
mismatches throw instead of rendering placeholders.

The runtime does not migrate non-empty legacy layer `keyframes`. It also does
not expose the inner pressure-rotation container: hosts use `VNIPlayer` and the
public samplers, never private Pixi layer nodes. Historical
`engineTarget.name: "cocos_creator"` metadata does not select a Cocos or
`legacy_alpha` path in this Pixi runtime.

## Runtime Boundaries

`VNIPlayer` does not create or own a `PIXI.Application`, renderer, canvas, or
DOM container. The host owns the Pixi app and passes an existing
`PIXI.Container` as `parent`.

Standalone viewers can let `VNIPlayer` advance itself with RAF. Game runtimes
that already have a ticker should pass `autoTick: false` and call
`update(deltaSeconds)` from their own frame loop.

`vnicore` is a Pixi.js runtime. Do not use it as the Cocos Creator runtime and
do not copy Cocos `cc` shims or standalone runtime code into this package.

## Minimal Player

The host must provide:

- a Pixi `parent` container
- a validated `VNIProjectConfig`
- an `AssetUrlManifest` whose keys match `project.assets[].path`

```ts
import { Application } from "pixi.js";
import {
  assertVNIProject,
  resolveProjectAssetUrls,
  validateVNIProject,
} from "@slotclientengine/vnicore/core";
import { VNIPlayer } from "@slotclientengine/vnicore/pixi";

const app = new Application();
await app.init({
  backgroundAlpha: 0,
  antialias: true,
  autoStart: false,
  autoDensity: true,
  resolution: window.devicePixelRatio || 1,
});

const host = document.querySelector("#stage");
if (!host) {
  throw new Error("Missing #stage host element.");
}
host.replaceChildren(app.canvas);

const viewport = {
  width: host.clientWidth || 1,
  height: host.clientHeight || 1,
};
app.renderer.resize(viewport.width, viewport.height);

const project = assertVNIProject(projectJson);
validateVNIProject(project);

const player = new VNIPlayer({
  parent: app.stage,
  diagnosticsElement: host,
  viewport,
  requestRender: () => app.render(),
  projectId: project.name,
  bundleId: "example",
  profileId: project.exportProfile?.id ?? "full",
  profilePurpose: project.exportProfile?.purpose ?? "legacy",
  assetScale: project.exportProfile?.assetScale ?? 1,
  project,
  assetUrls: resolveProjectAssetUrls(project, assetUrlManifest),
});

await player.init();
player.play();
```

Destroy both the player and host Pixi app when the host is done:

```ts
player.pause();
player.destroy();
app.destroy({ removeView: true });
```

## Asset URL Manifest

`AssetUrlManifest` is `Readonly<Record<string, string>>`. Keys are VNI asset
paths from the export JSON. Values are URLs that Pixi can load.

In Vite apps, generate a manifest from eager URL modules:

```ts
import {
  createAssetUrlManifest,
  resolveProjectAssetUrls,
  type AssetUrlManifest,
  type VNIProjectConfig,
} from "@slotclientengine/vnicore/core";

const assetModules = import.meta.glob("./assets/*", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

export const assetUrlManifest: AssetUrlManifest =
  createAssetUrlManifest(assetModules);

export function resolveAssetUrls(project: VNIProjectConfig): AssetUrlManifest {
  return resolveProjectAssetUrls(project, assetUrlManifest);
}
```

`resolveProjectAssetUrls(project, manifest)` fails when a required
`asset.path` is missing from the manifest.

## Lifecycle

- `init()`: loads textures, validates texture sizes, builds the Pixi display
  tree, and mounts it into the host `parent`.
- `play()`: starts normal timeline playback.
- `pause()`: pauses the playback clock and live particle age.
- `restart()`: clears active range/segmented state and live particles, then
  returns to time `0`.
- `seek(time)`: previews a deterministic time sample and clears live playback
  state.
- `setLoop(loop)` / `getLoop()`: controls normal playback and range playback
  when the range does not provide an explicit loop value.
- `destroy()`: stops RAF, clears mounted nodes, diagnostics, particles, effects,
  events, and the VNI display tree. It does not destroy the host Pixi app,
  renderer, canvas, or parent container.

Timeline completion and visual completion are not the same. Non-looping
timeline, range, and segmented end playback can enter `particle-draining` after
the timeline stops. Complete listeners fire only after live particles drain.

Use `getPlaybackState().isDrainingParticles` when the host needs to know whether
visual completion is still waiting on live particles.

## Playback Ranges And Events

`playRange(...)` is available after `init()`. Time ranges use seconds. Frame
ranges must provide `fps`.

```ts
player.playRange({
  range: { unit: "frame", start: 30, end: 90, fps: 60 },
  loop: false,
});

const disposeMarker = player.addPlaybackEvent({
  id: "flash",
  at: { unit: "time", at: 1.2 },
  once: true,
  listener: (event) => console.log(event.time),
});

const disposeComplete = player.onPlaybackComplete((event) => {
  console.log(event.startTime, event.endTime);
});
```

An omitted `end`, `undefined`, or `-1` means play to
`project.stage.duration`. Markers fire only when playback crosses their time;
`seek()`, `init()`, and `restart()` do not trigger markers. When a marker and
the range end occur at the same time, the marker fires before the complete
listener.

Dispose event listeners when the host no longer needs them:

```ts
disposeMarker();
disposeComplete();
```

## Segmented Playback

Segmented playback splits an animation into:

1. `0 -> loopStart`
2. `loopStart -> loopEnd`
3. `loopEnd -> duration`

`loopStart` and `loopEnd` must be valid time or frame points with
`0 <= loopStart <= loopEnd <= duration`.

```ts
player.play({
  mode: "segmented",
  loopStart: { unit: "time", at: 3 },
  loopEnd: { unit: "time", at: 3 },
  keepParticlesAlive: true,
});

if (player.getPlaybackState().mode === "segmented") {
  player.requestSegmentedPlaybackEnd();
}
```

`loopStart === loopEnd` holds non-particle animation at that frame while live
particles continue to age. `loopStart < loopEnd` loops non-particle animation
and emitter configuration over the loop range. `keepParticlesAlive` defaults to
`true`; with it enabled, live particles are not reset when playback time loops.

`setLoop(false)` does not end segmented playback. Call
`requestSegmentedPlaybackEnd()` to enter the end segment.

## Text Layer Replacement

Text layers are runtime placeholders. Hosts can replace them with Pixi nodes,
dynamic text, project images, or external image URLs. Mounted nodes inherit the
text layer transform, opacity, visibility, blend mode, render order, and
lifecycle.

```ts
const binding = player.attachTextToTextLayer({
  id: "score-text",
  layerId: "layer_text_score",
  text: "$1,234.00",
});

binding.setText("$2,468.00");
binding.dispose();
```

Project image replacement:

```ts
const disposeImage = await player.attachImageToTextLayer({
  id: "score-image",
  layerId: "layer_text_score",
  assetId: "asset_number_sprite",
});

disposeImage();
```

Invalid `layerId`, duplicate mounted ids, missing project assets, or failed
external image loads throw. By default the original text is hidden; pass
`hideOriginal: false` to keep it visible.

`clearMountedNodes()` and `destroy()` clean all text-layer bindings.

## Layer Groups And Slot Mounting

VNI layer groups use `project.layerGroups` plus `layer.groupId`. The runtime
does not support `type: "group"` layers or `parentId` nesting.

Render order comes from `project.layers`. `layerGroups.order` is editor
metadata and does not reorder Pixi children.

`getLayerGroupSlots()` returns legal insertion boundaries between adjacent
group runs:

```ts
const [slot] = player.getLayerGroupSlots();
if (!slot) {
  throw new Error("The VNI project has no adjacent layer group slot.");
}

const dispose = player.attachImageBetweenLayerGroups({
  id: "slot-reel-preview",
  afterGroupId: slot.afterGroupId,
  beforeGroupId: slot.beforeGroupId,
  assetId: "asset_image_mqp31v5g_14",
  x: 1000,
  y: 1000,
  anchorX: 0.5,
  anchorY: 0.5,
});
```

For host-owned images that are not listed in the current project assets, use an
explicit URL:

```ts
const disposeExternal = await player.attachExternalImageBetweenLayerGroups({
  id: "slot-any-asset-preview",
  afterGroupId: slot.afterGroupId,
  beforeGroupId: slot.beforeGroupId,
  imageUrl: assetUrlManifest["assets/extra.png"],
  label: "assets/extra.png",
  x: 1000,
  y: 1000,
  anchorX: 0.5,
  anchorY: 0.5,
});
```

Mounted coordinates are Pixi stage content coordinates. Unknown, reversed, or
non-adjacent group ids throw. `attachImageBetweenLayerGroups(...)` uses the
already loaded project asset texture and keeps project texture-size validation.
`attachExternalImageBetweenLayerGroups(...)` loads a host-owned URL and does not
pretend that URL is a project asset.

## Diagnostics

When `diagnosticsElement` is provided, `VNIPlayer` writes runtime state into
`data-vni-*` attributes, including:

- `data-vni-project-id`
- `data-vni-time`
- `data-vni-visible-layers`
- `data-vni-particle-sprites`
- `data-vni-render-effect-sprites`
- `data-vni-safe-glow-sprites`
- `data-vni-chaser-light-sprites`
- `data-vni-mask-sprites`
- `data-vni-text-layer-bindings`
- `data-vni-playback-mode`
- `data-vni-playback-phase`
- `data-vni-particle-draining`
- `data-vni-live-particles`
- `data-vni-layer-groups`
- `data-vni-layer-group-slots`
- `data-vni-mounted-nodes`
- `data-vni-bundle-id`
- `data-vni-profile-id`
- `data-vni-asset-scale`
- `data-vni-profile-purpose`

Legacy `data-v5g-*` aliases are still written for old acceptance scripts.
`destroy()` clears both new and legacy diagnostics.

## Effects And Particles

Supported runtime animation/effect types include:

- `idle`: coverage-only no-op.
- `multi_move`: VNI_0.074 path transform. It consumes a strict `pointsJson` JSON
  string array of `{ x, y, time, easing }` points. Each segment uses the target
  point easing, and overshooting easings are not clamped.
- `shatter`: deterministic render effect.
- `glow`: deterministic render effect with `0=add`, `1=screen`, `2=lighten`
  blend-mode values.
- `safe_glow`: same-image highlight overlay that inherits the layer blend mode;
  it is not counted as a `shatter` / `glow` render effect.
- `particle_stream`: continuous layer-particle emitter with live particle
  draining.
- `chaser_light`: fixed-position light samples with animated lit/dim windows.

`chaser_light` positions stay fixed on sampled trajectory points. The animation
advances the lighting window; it does not move sprites along the path. For
circle trajectories, `spacing` is interpreted as arc length. Each light's timing
offset uses `lightDuration + interval`.

Timeline coverage is start/end inclusive. Ended `move`, `multi_move`,
`slide_in`, `slide_out`, and `squash_stretch` transforms continue contributing at
progress `1` so later animations can continue from the correct position. Empty
frames still hide the layer because visibility is sampled separately from
transform handoff.

Top-level `project.particles` remains unsupported. Use layer animation
particles.

## Masks

Layer masks fail fast when source layers are missing, self-referential, or use
unsupported modes.

`vnicore` is the Pixi runtime target. It rejects Cocos-compatible
`legacy_alpha` projects or enabled `legacy_alpha` layer masks instead of
emulating that export path. VNI exports intended for `vnicore` should use the
Pixi-compatible `precompose_light_alpha` path where that behavior is required.

For `precompose_light_alpha` image masks on `add` / `screen` / `lighten`
targets, the player matches the editor Pixi preview by drawing the target and
mask source into stage-sized canvases, deriving alpha from light luminance and
mask alpha, and caching the resulting texture from the stage, asset, texture,
transform, opacity, and blend inputs. Non-light blend modes keep the normal
Pixi alpha-mask path.

## Runtime Profiles And Texture Size

`runtime_50` uses 50% PNG file pixels while JSON `asset.width` and
`asset.height` remain logical design sizes. `vnicore` validates real texture
size through `fileWidth` and `fileHeight`, then applies display compensation for
runtime rendering.

`runtime_100` is also a valid runtime profile. `assetScale: 1` does not skip
`exportProfile` or asset validation.

Profile id, purpose, and asset scale come from JSON `exportProfile` and bundle
manifest entries. They are not inferred from directory names or file names.

## Common Fail-Fast Cases

- Missing asset URL for an exported `asset.path`.
- Real texture dimensions do not match `fileWidth` / `fileHeight`.
- Manifest entry does not match project `exportProfile`.
- Unknown animation, easing, or blend mode.
- Invalid `multi_move` `pointsJson`.
- Required numeric parameter is missing, `NaN`, `Infinity`, or a string.
- Invalid mask source, self-referential mask source, or unsupported mask mode.
- Invalid `layerGroups`, unknown `groupId`, non-contiguous group run, or
  non-adjacent group slot.
- Unsupported group layer, non-empty `parentId`, non-empty keyframes, or
  non-empty top-level `project.particles`.

## Commands

Run from the repository root:

```bash
pnpm --filter @slotclientengine/vnicore typecheck
pnpm --filter @slotclientengine/vnicore lint
pnpm --filter @slotclientengine/vnicore examples:typecheck
pnpm --filter @slotclientengine/vnicore test
pnpm --filter @slotclientengine/vnicore build
pnpm --filter @slotclientengine/vnicore format:check
```

`test` enforces coverage thresholds: lines, functions, branches, and statements
must each be at least 80%.

## Examples

The package examples are typechecked public API examples:

- `examples/basic-player.ts`
- `examples/playback-events.ts`
- `examples/segmented-playback.ts`
- `examples/group-slot-insertion.ts`
- `examples/validate-project.ts`
- `examples/vite-asset-manifest.ts`
