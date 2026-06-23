# anieditorv5viewer

`apps/anieditorv5viewer` is a Vite + TypeScript + Pixi.js viewer for V5G/VNI exports from `docs/anieditor5/export` and `docs/anieditor5/export2`.

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

It also bundles the VNI export2 bundle:

- `docs/anieditor5/export2/manifest.json`
- `docs/anieditor5/export2/edit_full/project.json`
- `docs/anieditor5/export2/runtime_50/project.json`

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
- `src/assets/assets/*`
- `src/assets/export2/manifest.json`
- `src/assets/export2/edit_full/project.json`
- `src/assets/export2/edit_full/assets/*`
- `src/assets/export2/runtime_50/project.json`
- `src/assets/export2/runtime_50/assets/*`

The UI project selector can switch between all bundled projects. JSON `asset.path` values are resolved through a Vite URL manifest and must match copied files exactly.

`edit_full` is the 100% original-image profile. `runtime_50` stores 50% file pixels, but the player restores each image layer to its original logical design size with sprite-level compensation. Legacy exports and VNI single-project 100% exports may omit `fileWidth`, `fileHeight`, `fileScale`, and `exportProfile`; those are treated as full-size original-image profiles.

## Supported Runtime

Supported now:

- `schemaVersion` in the `V5G_0.x` or `VNI_0.x` families
- `editor.name` of `victory_editor_v5_g` or `VNI`
- asset file metadata: `fileWidth`, `fileHeight`, and `fileScale` must be all absent or all present
- VNI bundle manifest entries whose project `exportProfile` matches `id`, `purpose`, and `assetScale`
- center-coordinate stage rendering
- image layers and basic text layers
- `normal`, `add`, `screen`, `multiply`, `lighten` blend modes
- `move`, `fade`, `scale_up`, `scale_down`, `scale_in`, `scale_out`, `pop`, `shake`, `blink`, `rotate`, `slide_in`, `slide_out`, `bounce_in`, `pulse`, `float`, `swing`
- `squash_stretch` elastic displacement and squash/stretch sampling
- layer animation particles: `particles`, `particle_twinkle`, `particle_wall`, `particle_combo`
- `particle_combo.sourceOpacity` controls only the source image layer opacity; combo particles continue to render from the layer base opacity when `sourceOpacity` is `0`
- deterministic `seek()` sampling for play, restart, loop, timeline drag, project switching, and particle redraws

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

## Commands

```bash
pnpm --dir apps/anieditorv5viewer dev --host 0.0.0.0 --port 5175
pnpm --filter anieditorv5viewer typecheck
pnpm --filter anieditorv5viewer lint
pnpm --filter anieditorv5viewer test
pnpm --filter anieditorv5viewer build
pnpm --filter anieditorv5viewer format:check
```
