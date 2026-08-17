import { performance } from "node:perf_hooks";
import { stdout } from "node:process";

const iterations = 1_000_000;
let cursor = 0;
const startedAt = performance.now();
for (let index = 0; index < iterations; index += 1)
  cursor = (cursor + 1) & 1023;
const elapsedMs = performance.now() - startedAt;
stdout.write(`${JSON.stringify({ iterations, elapsedMs, cursor })}\n`);
