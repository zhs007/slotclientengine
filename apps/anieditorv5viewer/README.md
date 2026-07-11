# anieditorv5viewer

`apps/anieditorv5viewer` is a Vite + TypeScript viewer shell for uploaded VNI zip exports. It no longer bundles local animation JSON or copied image assets; playback starts only after the user selects a `.zip` file in the browser.

The animation runtime comes from `@slotclientengine/vnicore`. This app owns upload handling, zip parsing, profile selection, controls, styles, Blob URL lifecycle, and browser assembly. Validation, sequence frame selection, `multi_move` sampling, Pixi.js v8 rendering, texture-size checks, masks, particles, VNI_0.070 deterministic effects, playback ranges, segmented playback, particle-draining, and diagnostics live in `packages/vnicore`.

The viewer owns the browser Pixi `Application` and canvas. It passes `app.stage` to `VNIPlayer`, then uses `viewport` / `setViewportSize(...)` and `requestRender` to keep the player aligned with the viewer mount. `VNIPlayer` itself does not create a canvas.

## Uploaded Zip Formats

The upload path supports two strict zip shapes.

### Bundle manifest zip

The test fixture is built deterministically in memory from `docs/anieditor5/export/roundreel.json` and its referenced assets; the repository does not require a checked-in `roundreel.zip` binary.

```text
manifest.json
edit_full/roundreel.json
edit_full/assets/*
runtime_100/roundreel.json
runtime_100/assets/*
```

`manifest.json` must be a `vni_export_bundle`. Each export entry supplies `id`, `purpose`, `assetScale`, `path`, and optional `label`. The viewer validates the manifest with `assertVNIBundleManifest(...)` / `validateVNIBundleManifest(...)`, then validates each selected project with `assertVNIProject(...)` / `validateVNIProject(...)` and `validateManifestProjectProfile(...)`.

Profile identity comes from the manifest entry and the project JSON `exportProfile`; directory names only locate files inside the zip. If exactly one profile has `purpose: "runtime"`, upload loads it automatically. If the manifest has zero or multiple runtime profiles, the viewer waits for an explicit profile selection.

Project `asset.path` values are resolved relative to the selected profile project directory. For example, `runtime_100/roundreel.json` plus `assets/a.png` resolves to `runtime_100/assets/a.png`.

### Single-project zip

The test fixture is built deterministically in memory from `docs/anieditor5/export/megawin.json` and its referenced assets; the repository does not require a checked-in `megawin.zip` binary.

```text
project.json
assets/*
__MACOSX/*
```

Without `manifest.json`, the zip must contain exactly one root `project.json`. The profile comes only from `project.exportProfile`; uploaded single-project zips without `exportProfile` fail fast. macOS metadata entries such as `__MACOSX/**`, `.DS_Store`, and `._*` are ignored.

Project `asset.path` values are resolved from the zip root. For example, `project.json` plus `assets/effect.png` resolves to `assets/effect.png`.

## Zip Safety

Zip entry paths must be relative POSIX paths. Empty paths, absolute paths, `.` / `..` segments, backslashes, and duplicate normalized paths fail before playback. JSON files are decoded as UTF-8 with fatal decoding. Project image assets must exist exactly in the selected profile and use `.png`, `.jpg`, `.jpeg`, or `.webp`; matching is case-sensitive.

The viewer creates `URL.createObjectURL(...)` entries only for the selected profile and revokes them when the profile changes, a new zip is uploaded, loading fails, or the player is destroyed. Uploaded files are not written to the repo and are not persisted to localStorage or IndexedDB.

Unsupported or invalid data fails fast instead of rendering placeholders, guessing zip layouts, or silently falling back.

## Runtime Boundary

Supported by `@slotclientengine/vnicore`:

- `schemaVersion` in the `V5G_0.x` or `VNI_0.x` families
- `editor.name` of `victory_editor_v5_g` or `VNI`
- asset file metadata: `fileWidth`, `fileHeight`, and `fileScale` must be all absent or all present
- VNI bundle manifest entries whose project `exportProfile` matches `id`, `purpose`, and `assetScale`
- center-coordinate stage rendering
- image layers, `sequence` layers, and basic text layers
- VNI_0.074 `multi_move` path transforms, including ended transform handoff and empty-frame hiding
- text layer replacement through `VNIPlayer` public APIs for dynamic text and image binding
- Pixi `precompose_light_alpha` masks with explicit `sourceLayerId` validation and vnicore-owned light-mask precomposition
- `normal`, `add`, `screen`, `multiply`, `lighten` blend modes
- VNI_0.070 deterministic effects: `gather_particles`, `smoke_mist`, `energy_ring`, `slash_light`, `flame_flicker`, `wave_band`, `wave_distort`, `speed_lines`, `drift_fall`, and `path_particles`
- timeline playback, restart, loop, seek, playback ranges, segmented advanced playback, playback markers, particle-draining, and complete listeners

Explicitly unsupported:

- top-level `project.particles`
- non-empty layer keyframes
- group layers
- nested `parentId`
- malformed `sequence` layers or sequence frames that are missing from the uploaded zip
- malformed `multi_move` `pointsJson`
- unknown schema/editor values, resources, layer types, animation types, blend modes, or easing names
- missing required numeric animation parameters, including particle parameters
- numeric parameters encoded as strings
- partial or inconsistent asset file metadata
- image texture dimensions that do not match `fileWidth` / `fileHeight` when scaled metadata is present
- bundle profile projects whose `exportProfile` does not match the manifest entry
- Cocos-compatible `legacy_alpha` runtime projects or enabled `legacy_alpha` layer masks

The viewer is a Pixi preview shell for vnicore exports. It does not expose a Cocos-compatible switch and does not implement its own mask/precompose renderer; `precompose_light_alpha` visual parity with the editor Pixi preview is owned by `packages/vnicore`.

Sequence frame selection, VNI_0.074 `multi_move`, ended transform handoff, empty-frame hiding, and the VNI_0.070 deterministic effects are also owned by `packages/vnicore`. The viewer must not inspect private Pixi layer instances, parse `pointsJson`, duplicate effect formulas, or create placeholder assets when an uploaded project references a missing sequence frame.

## Browser Diagnostics

The stage mount receives runtime diagnostics from `VNIPlayer`:

- `data-vni-project-id`
- `data-vni-time`
- `data-vni-visible-layers`
- `data-vni-particle-sprites`
- `data-vni-render-effect-sprites`
- `data-vni-deterministic-effect-sprites`
- `data-vni-safe-glow-sprites`
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

The viewer exposes a text layer replacement panel for uploaded projects with text layers. It lists text layers from the current project, supports dynamic text and image replacement, and uses only `VNIPlayer.attachTextToTextLayer(...)` / `attachImageToTextLayer(...)` plus the returned dispose or `setText()` handles. It does not inspect or mutate private Pixi layer containers.

## Commands

```bash
pnpm --dir apps/anieditorv5viewer dev --host 0.0.0.0 --port 5175
pnpm --filter anieditorv5viewer typecheck
pnpm --filter anieditorv5viewer lint
pnpm --filter anieditorv5viewer test
pnpm --filter anieditorv5viewer build
pnpm --filter anieditorv5viewer format:check
```
