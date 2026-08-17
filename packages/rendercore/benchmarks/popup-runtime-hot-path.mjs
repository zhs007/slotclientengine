import { performance } from "node:perf_hooks";
import { Container } from "pixi.js";
import { loadPopupManifest } from "../dist/popup/data/index.js";
import { createAwardCelebrationRuntime } from "../dist/popup/core/index.js";

const amountLayer = (scale = 1) => ({
  id: "amount",
  kind: "image-string",
  order: 0,
  resource: "amount",
  binding: "win-amount",
  anchor: { x: 0.5, y: 0.5 },
  parent: { kind: "popup-root" },
  transform: { x: 0, y: 0, scale },
});
const tier = (id, thresholdMultiplier, scale) => ({
  id,
  thresholdMultiplier,
  countDurationSeconds: 2,
  layers: [amountLayer(scale)],
});
const { manifest } = loadPopupManifest({
  version: 1,
  kind: "popup",
  id: "popup-hot-path",
  type: "award-celebration",
  designViewport: { width: 900, height: 1600 },
  amountFormat: {
    rawScale: 100,
    fractionDigits: 2,
    useGrouping: true,
    groupSeparator: ",",
    decimalSeparator: ".",
    prefix: "$",
    suffix: "",
    rounding: "floor",
  },
  resources: {
    amount: {
      kind: "image-string",
      manifest: "dependencies/image-strings/amount/image-string.manifest.json",
    },
  },
  awardCelebration: {
    base: { countDurationSeconds: 1, layers: [amountLayer()] },
    standard: { countDurationSeconds: 1, layers: [amountLayer(1.2)] },
    celebrationTiers: [
      tier("bigwin", 15, 1.3),
      tier("superwin", 30, 1.4),
      tier("megawin", 50, 1.5),
    ],
  },
});

let formatterCalls = 0;
let amountCommits = 0;
let layerCreations = 0;
const runtime = createAwardCelebrationRuntime({
  resource: {
    manifest,
    resources: {
      amount: { kind: "image-string", resource: {} },
    },
    async destroy() {},
  },
  formatAmount(value) {
    formatterCalls += 1;
    return String(value);
  },
  layerFactory: () => {
    layerCreations += 1;
    const container = new Container();
    return {
      container,
      animated: false,
      async init() {},
      enter() {},
      updateAmount() {
        amountCommits += 1;
      },
      update() {},
      isLoopReady: () => true,
      requestEnd() {},
      isEndComplete: () => true,
      applySegment() {},
      rebindAmountLayer() {},
      destroy() {
        container.destroy();
      },
    };
  },
});

await runtime.init();
runtime.start({ betAmountRaw: 100, winAmountRaw: 10_000 });
for (let index = 0; index < 10_000; index += 1) runtime.update(0);
if (typeof globalThis.gc === "function") globalThis.gc();
const heapBefore = process.memoryUsage().heapUsed;
const formatterBefore = formatterCalls;
const commitsBefore = amountCommits;
const iterations = 100_000;
const started = performance.now();
for (let index = 0; index < iterations; index += 1) runtime.update(0);
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
      stableFrameFormatterCalls: formatterCalls - formatterBefore,
      stableFrameAmountCommits: amountCommits - commitsBefore,
      layerCreations,
      heapDeltaBytes: heapAfter - heapBefore,
      gcExposed: typeof globalThis.gc === "function",
    },
    null,
    2,
  ),
);
