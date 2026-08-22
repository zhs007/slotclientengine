import { performance } from "node:perf_hooks";
import { Texture } from "pixi.js";
import {
  createSceneLayoutResource,
  createSceneLayoutRuntime,
  createGameLayoutRuntimeAddresses,
  formatGameLayoutRuntimeAddress,
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

const eventController = createGameLayoutRuntimeAddresses(
  {
    manifest: {
      nodes: [],
      reels: { main: { columns: 5, rows: 3 } },
      symbolPackages: {
        base: { reel: "main", reelSet: "base", renderMode: "standard" },
      },
      gameModes: { modes: [], transitions: [] },
    },
    symbolPackages: {
      base: {
        symbolManifest: { symbols: { WL: {} } },
        statePreset: {
          defaultState: "normal",
          states: [{ id: "win", phase: "stable", playback: "loop" }],
        },
      },
    },
    popupPackages: {},
  },
  {},
);
const symbolEventAddress = (x, y) =>
  formatGameLayoutRuntimeAddress(
    "symbol-package",
    "base",
    "symbol",
    "WL",
    "instance",
    "reel",
    "main",
    "x",
    String(x),
    "y",
    String(y),
    "state",
    "win",
    "entered",
  );
const exactSymbolEvent = symbolEventAddress(2, 1);
let detailFactoryCalls = 0;
const zeroSubscriberStarted = performance.now();
for (let index = 0; index < iterations; index += 1)
  eventController.emit(exactSymbolEvent, () => {
    detailFactoryCalls += 1;
    return { x: 2, y: 1 };
  });
const zeroSubscriberElapsedMs = performance.now() - zeroSubscriberStarted;
let wildcardOccurrences = 0;
const disposeWildcard = eventController.addresses.bind(
  symbolEventAddress(2, "*"),
  () => {
    wildcardOccurrences += 1;
  },
);
const wildcardStarted = performance.now();
for (let index = 0; index < iterations; index += 1)
  eventController.emit(exactSymbolEvent, { x: 2, y: 1 });
const wildcardElapsedMs = performance.now() - wildcardStarted;
disposeWildcard();
eventController.destroy();

console.log(
  JSON.stringify(
    {
      iterations,
      elapsedMs: Number(elapsedMs.toFixed(3)),
      updatesPerSecond: Math.round(iterations / (elapsedMs / 1_000)),
      heapDeltaBytes: heapAfter - heapBefore,
      gcExposed: typeof globalThis.gc === "function",
      events: {
        zeroSubscriber: {
          elapsedMs: Number(zeroSubscriberElapsedMs.toFixed(3)),
          dispatchesPerSecond: Math.round(
            iterations / (zeroSubscriberElapsedMs / 1_000),
          ),
          detailFactoryCalls,
        },
        wildcardAddress: {
          elapsedMs: Number(wildcardElapsedMs.toFixed(3)),
          dispatchesPerSecond: Math.round(
            iterations / (wildcardElapsedMs / 1_000),
          ),
          occurrences: wildcardOccurrences,
        },
      },
    },
    null,
    2,
  ),
);
