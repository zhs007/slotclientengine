import { performance } from "node:perf_hooks";
import { Texture } from "pixi.js";
import {
  createSceneLayoutResource,
  createSceneLayoutRuntime,
} from "../dist/scene-layout/core/index.js";

const manifest = {
  version: 1,
  kind: "scene-layout",
  id: "scene-layout-hot-path",
  nodes: [
    {
      id: "background",
      order: 0,
      resource: {
        kind: "image",
        path: "background.png",
        size: { width: 1, height: 1 },
      },
      placements: { default: { x: 0, y: 0, scale: 1 } },
    },
  ],
  reels: {
    main: {
      order: 1,
      columns: 1,
      rows: 1,
      cellSize: { width: 10, height: 10 },
      gap: { x: 0, y: 0 },
      placements: { default: { x: 0, y: 0 } },
    },
  },
  adaptation: {
    mode: "maximized-focus",
    artSize: { width: 100, height: 100 },
    focusRect: { x: 0, y: 0, width: 100, height: 100 },
    backgroundNode: "background",
  },
};

const resource = await createSceneLayoutResource({
  manifest,
  imageModules: { "background.png": "background.png" },
});
const runtime = createSceneLayoutRuntime({
  resource,
  loadTexture: async () => Texture.EMPTY,
  unloadTexture: async () => undefined,
});
await runtime.init();
runtime.applyViewport({ width: 1920, height: 1080 });

for (let index = 0; index < 10_000; index += 1) runtime.update(1 / 60);
if (typeof globalThis.gc === "function") globalThis.gc();
const heapBefore = process.memoryUsage().heapUsed;
const iterations = 100_000;
const started = performance.now();
for (let index = 0; index < iterations; index += 1) runtime.update(1 / 60);
const elapsedMs = performance.now() - started;
if (typeof globalThis.gc === "function") globalThis.gc();
const heapAfter = process.memoryUsage().heapUsed;
runtime.destroy();

console.log(
  JSON.stringify(
    {
      iterations,
      elapsedMs: Number(elapsedMs.toFixed(3)),
      updatesPerSecond: Math.round(iterations / (elapsedMs / 1_000)),
      heapDeltaBytes: heapAfter - heapBefore,
      gcExposed: typeof globalThis.gc === "function",
    },
    null,
    2,
  ),
);
