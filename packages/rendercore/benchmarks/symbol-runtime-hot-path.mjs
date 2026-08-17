import { performance } from "node:perf_hooks";
import { Texture } from "pixi.js";
import {
  createDefaultSymbolStatePreset,
  createStandaloneSymbolCatalog,
} from "../dist/symbol/core/index.js";

const catalog = createStandaloneSymbolCatalog({
  assets: { A: Texture.EMPTY },
  displaySymbols: ["A"],
  statePreset: createDefaultSymbolStatePreset(),
});
const player = catalog.createSymbolPlayer("A");
player.init();

for (let index = 0; index < 10_000; index += 1) player.update(1 / 60);
if (typeof globalThis.gc === "function") globalThis.gc();
const heapBefore = process.memoryUsage().heapUsed;
const iterations = 100_000;
const started = performance.now();
for (let index = 0; index < iterations; index += 1) player.update(1 / 60);
const elapsedMs = performance.now() - started;
if (typeof globalThis.gc === "function") globalThis.gc();
const heapAfter = process.memoryUsage().heapUsed;
player.destroy();

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
