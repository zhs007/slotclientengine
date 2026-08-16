import { performance } from "node:perf_hooks";
import { Texture } from "pixi.js";
import { createRenderImageString } from "../dist/image-string/core/index.js";

const glyphs = Object.fromEntries(
  [..."0123456789"].map((character) => [
    character,
    {
      path: `${character}.png`,
      size: { width: 32, height: 48 },
      offset: { x: 0, y: 0 },
    },
  ]),
);
const manifest = Object.freeze({
  version: 1,
  kind: "image-string",
  id: "benchmark-digits",
  metrics: { lineHeight: 48, letterSpacing: 1 },
  glyphs,
  fixedAdvanceGroups: [
    {
      id: "digits",
      characters: [..."0123456789"],
      advanceWidth: 32,
      align: "center",
    },
  ],
});
const textures = Object.freeze(
  Object.fromEntries(Object.values(glyphs).map(({ path }) => [path, Texture.EMPTY])),
);
const resource = Object.freeze({
  manifest,
  textures,
  destroyed: false,
  assertUsable() {},
  async destroy() {},
});
const renderer = createRenderImageString({ resource, text: "123456789012" });
const values = ["1", "123456", "123456789012", "9876543210"];

for (let index = 0; index < 10_000; index += 1)
  renderer.setText(values[index % values.length]);
if (typeof globalThis.gc === "function") globalThis.gc();
const heapBefore = process.memoryUsage().heapUsed;
const started = performance.now();
for (let index = 0; index < 100_000; index += 1)
  renderer.setText(values[index % values.length]);
const elapsedMs = performance.now() - started;
if (typeof globalThis.gc === "function") globalThis.gc();
const heapAfter = process.memoryUsage().heapUsed;
renderer.destroy();

console.log(
  JSON.stringify(
    {
      iterations: 100_000,
      elapsedMs: Number(elapsedMs.toFixed(3)),
      updatesPerSecond: Math.round(100_000 / (elapsedMs / 1_000)),
      heapDeltaBytes: heapAfter - heapBefore,
      gcExposed: typeof globalThis.gc === "function",
    },
    null,
    2,
  ),
);
