# anieditorv5viewer

`apps/anieditorv5viewer` is a Vite + TypeScript + Pixi.js viewer for V5G exports from `docs/anieditor5/export`.

## Bundled Projects

The app bundles four exported projects:

- `docs/anieditor5/export/project.json`
- `docs/anieditor5/export/bigwin.json`
- `docs/anieditor5/export/megawin.json`
- `docs/anieditor5/export/superwin.json`

The copied runtime files live under `src/assets`:

- `src/assets/project.json`
- `src/assets/projects/bigwin.json`
- `src/assets/projects/megawin.json`
- `src/assets/projects/superwin.json`
- `src/assets/assets/*`

The UI project selector can switch between all bundled projects. JSON `asset.path` values are resolved through a Vite URL manifest and must match copied files exactly.

## Supported Runtime

Supported now:

- V5G `schemaVersion` in the `V5G_0.x` family with `editor.name === "victory_editor_v5_g"`
- center-coordinate stage rendering
- image layers and basic text layers
- `normal`, `add`, `screen`, `multiply`, `lighten` blend modes
- `move`, `fade`, `scale_up`, `scale_down`, `scale_in`, `scale_out`, `pop`, `shake`, `blink`, `rotate`, `slide_in`, `slide_out`, `bounce_in`, `pulse`, `float`, `swing`
- layer animation particles: `particles`, `particle_twinkle`
- deterministic `seek()` sampling for play, restart, loop, timeline drag, project switching, and particle redraws

Explicitly unsupported:

- top-level `project.particles`
- non-empty layer keyframes
- group layers
- nested `parentId`
- unknown resources, layer types, animation types, blend modes, or easing names

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
