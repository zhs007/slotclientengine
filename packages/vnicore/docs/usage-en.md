# VniCore usage

Game runtimes use the explicit `data` and `core` entries:

```ts
import { assertVNIProject } from "@slotclientengine/vnicore/data";
import { VNIRuntime } from "@slotclientengine/vnicore/core";

const project = assertVNIProject(json);
const runtime = new VNIRuntime({ parent, project, assetUrls });
await runtime.init();
runtime.play();
hostTicker.add((deltaSeconds) => runtime.update(deltaSeconds));
```

Browser preview tools use `data` and `viewer`:

```ts
import { VNIViewer } from "@slotclientengine/vnicore/viewer";
```

`VNIRuntime` owns no RAF, DOM, viewport, renderer, canvas, or Pixi Application. `VNIViewer` composes the runtime and owns RAF, viewport/zoom, diagnostics, UI callbacks, and preview-pool driving. The package root and the former `./pixi` entry are intentionally unavailable.

Invalid schemas, assets, texture dimensions, animation values, masks, paths, and lifecycle transitions fail explicitly. The core display tree is transparent and never renders `stage.backgroundColor`.
