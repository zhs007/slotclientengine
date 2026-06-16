# anieditorv5viewer

`apps/anieditorv5viewer` is a Vite + TypeScript + Pixi.js viewer for the V5G export in `docs/anieditor5/export/project.json`.

## Assets

The app bundles an exact copy of:

- `docs/anieditor5/export/project.json`
- `docs/anieditor5/export/assets/*`

The copied runtime files live under `src/assets`. JSON `asset.path` values are resolved through a Vite URL manifest and must match copied files exactly.

## Supported Runtime

Supported now:

- V5G `schemaVersion` in the `V5G_0.x` family with `editor.name === "victory_editor_v5_g"`
- center-coordinate stage rendering
- image layers and basic text layers
- `normal`, `add`, `screen`, `multiply`, `lighten` blend modes
- `move`, `fade`, `scale_up`, `scale_down`, `rotate`, `slide_in`, `slide_out`, `bounce_in`, `pulse`, `float`, `swing`
- deterministic `seek()` sampling for play, restart, loop, and timeline drag

Explicitly unsupported:

- particles
- non-empty layer keyframes
- group layers
- nested `parentId`
- unknown resources, layer types, animation types, blend modes, or easing names

Unsupported or invalid data fails fast instead of rendering placeholders.

## Commands

```bash
pnpm --filter anieditorv5viewer dev -- --host 0.0.0.0 --port 5175
pnpm --filter anieditorv5viewer typecheck
pnpm --filter anieditorv5viewer lint
pnpm --filter anieditorv5viewer test
pnpm --filter anieditorv5viewer build
```
