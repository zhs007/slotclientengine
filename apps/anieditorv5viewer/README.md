# anieditorv5viewer

`apps/anieditorv5viewer` is a Vite + TypeScript viewer shell for V5G/VNI exports from `docs/anieditor5/export`.

The animation runtime comes from `@slotclientengine/vnicore`. This app owns bundled JSON/assets, the project selector, controls, styles, and browser assembly. Validation, sampling, Pixi.js v8 rendering, texture-size checks, particles, playback ranges, segmented playback, particle-draining, and diagnostics live in `packages/vnicore`.

The viewer owns the browser Pixi `Application` and canvas. It passes `app.stage` to `VNIPlayer`, then uses `viewport` / `setViewportSize(...)` and `requestRender` to keep the player aligned with the viewer mount. `VNIPlayer` itself does not create a canvas.

## Bundled Projects

The app bundles the legacy V5G full-size exports:

- `docs/anieditor5/export/project.json`
- `docs/anieditor5/export/bigwin.json`
- `docs/anieditor5/export/megawin.json`
- `docs/anieditor5/export/superwin.json`
- `docs/anieditor5/export/2x.json`
- `docs/anieditor5/export/5x.json`
- `docs/anieditor5/export/10x.json`
- `docs/anieditor5/export/respin.json`
- `docs/anieditor5/export/scatter1.json`
- `docs/anieditor5/export/scatter2.json`
- `docs/anieditor5/export/multipay.json`
- `docs/anieditor5/export/roundreel.json`
- `docs/anieditor5/export/number2.json`
- `docs/anieditor5/export/number3.json`

It also keeps the older VNI export2 bundle as a non-regression fixture:

- `docs/anieditor5/export2/manifest.json`
- `docs/anieditor5/export2/edit_full/project.json`
- `docs/anieditor5/export2/runtime_50/project.json`

For game-specific animation review, the viewer also registers the original
`game003-s1` L1-L5 win animations without copying or rewriting their assets:

- `assets/game003-s1/L1-wins.json` to `assets/game003-s1/L5-wins.json`
- `assets/game003-s1/assets/*`

The copied runtime files live under `src/assets`:

- `src/assets/project.json`
- `src/assets/projects/bigwin.json`
- `src/assets/projects/megawin.json`
- `src/assets/projects/superwin.json`
- `src/assets/projects/2x.json`
- `src/assets/projects/5x.json`
- `src/assets/projects/10x.json`
- `src/assets/projects/respin.json`
- `src/assets/projects/scatter1.json`
- `src/assets/projects/scatter2.json`
- `src/assets/projects/multipay.json`
- `src/assets/projects/roundreel.json`
- `src/assets/projects/number2.json`
- `src/assets/projects/number3.json`
- `src/assets/assets/*`
- `src/assets/export2/manifest.json`
- `src/assets/export2/edit_full/project.json`
- `src/assets/export2/edit_full/assets/*`
- `src/assets/export2/runtime_50/project.json`
- `src/assets/export2/runtime_50/assets/*`

The UI project selector can switch between all bundled projects. JSON `asset.path` values are resolved through a Vite URL manifest and must match copied files exactly.

`roundreel` is a `VNI_0.022` single-project runtime export stored in the same JSON + `assets/` resource pool as the other `docs/anieditor5/export` projects. Its profile id, purpose, and scale come from JSON `exportProfile`, not from the directory name. `number2` validates text layer replacement, and `number3` validates mask/precompose-light-alpha source handling. `runtime_50` stores 50% file pixels, but the player restores each image layer to its original logical design size with sprite-level compensation. Legacy exports and VNI single-project 100% exports may omit `fileWidth`, `fileHeight`, `fileScale`, and `exportProfile`; those are treated as full-size original-image profiles.

`game003-l1-wins` to `game003-l5-wins` are registered as direct source projects from `assets/game003-s1`; they are intended for visual comparison of the raw VNI animations in this viewer, not as copied docs fixtures.

## Runtime Boundary

Supported by `@slotclientengine/vnicore`:

- `schemaVersion` in the `V5G_0.x` or `VNI_0.x` families
- `editor.name` of `victory_editor_v5_g` or `VNI`
- asset file metadata: `fileWidth`, `fileHeight`, and `fileScale` must be all absent or all present
- VNI bundle manifest entries whose project `exportProfile` matches `id`, `purpose`, and `assetScale`
- center-coordinate stage rendering
- image layers and basic text layers
- text layer replacement through `VNIPlayer` public APIs for dynamic text and image binding
- layer masks with explicit `sourceLayerId` validation and `legacy_alpha` / `precompose_light_alpha` composite modes
- `normal`, `add`, `screen`, `multiply`, `lighten` blend modes
- `move`, `fade`, `scale_up`, `scale_down`, `scale_in`, `scale_out`, `pop`, `shake`, `blink`, `rotate`, `slide_in`, `slide_out`, `bounce_in`, `pulse`, `float`, `swing`
- `squash_stretch` elastic displacement and squash/stretch sampling
- layer animation particles: `particles`, `particle_twinkle`, `particle_wall`, `particle_combo`
- continuous layer particles: `particle_stream`
- runtime chaser lights: `chaser_light`
- `particle_combo.sourceOpacity` controls only the source image layer opacity; combo particles continue to render from the layer base opacity when `sourceOpacity` is `0`
- deterministic `seek()` sampling for play, restart, loop, timeline drag, project switching, and particle redraws
- playback ranges, segmented advanced playback, playback markers, particle-draining, and complete listeners

Explicitly unsupported:

- top-level `project.particles`
- non-empty layer keyframes
- group layers
- nested `parentId`
- unknown schema/editor values, resources, layer types, animation types, blend modes, or easing names
- missing required numeric animation parameters, including particle parameters
- numeric parameters encoded as strings
- partial or inconsistent asset file metadata
- image texture dimensions that do not match `fileWidth` / `fileHeight` when scaled metadata is present
- bundle profile projects whose `exportProfile` does not match the manifest entry

Unsupported or invalid data fails fast instead of rendering placeholders or silently falling back.

## Browser Diagnostics

The stage mount receives runtime diagnostics from `VNIPlayer`:

- `data-vni-project-id`
- `data-vni-time`
- `data-vni-visible-layers`
- `data-vni-particle-sprites`
- `data-vni-chaser-light-sprites`
- `data-vni-mask-sprites`
- `data-vni-text-layer-bindings`
- `data-vni-playback-mode`
- `data-vni-playback-phase`
- `data-vni-particle-draining`
- `data-vni-live-particles`
- `data-vni-bundle-id`
- `data-vni-profile-id`
- `data-vni-asset-scale`
- `data-vni-profile-purpose`

Legacy `data-v5g-*` aliases are still written for old browser checks and are cleared together with the VNI fields when a project switches or the player is destroyed.

## Advanced Playback UI

The viewer has a separate advanced playback section for segmented playback. It passes `loopStart`, `loopEnd`, and `维持粒子活动` directly to `VNIPlayer.play({ mode: "segmented", ... })`, and calls `requestSegmentedPlaybackEnd()` for the end button. The viewer does not own the segmented state machine; it only validates form input, displays the current phase, and mirrors runtime errors.

## Canvas Zoom

The Pixi preview uses a two-layer stage layout: the outer stage mount remains the fixed clipped viewer area, and the inner canvas layer is resized from its center point. The zoom buttons update the Pixi renderer size and the `VNIPlayer` viewport, so Pixi redraws at the zoomed canvas size instead of browser-scaling an already-rendered bitmap.

## Text Replacement UI

The viewer exposes a text layer replacement panel for projects such as `number2`. It lists text layers from the current project, supports dynamic text and image replacement, and uses only `VNIPlayer.attachTextToTextLayer(...)` / `attachImageToTextLayer(...)` plus the returned dispose or `setText()` handles. It does not inspect or mutate private Pixi layer containers.

## Commands

```bash
pnpm --dir apps/anieditorv5viewer dev --host 0.0.0.0 --port 5175
pnpm --filter anieditorv5viewer typecheck
pnpm --filter anieditorv5viewer lint
pnpm --filter anieditorv5viewer test
pnpm --filter anieditorv5viewer build
pnpm --filter anieditorv5viewer format:check
```
