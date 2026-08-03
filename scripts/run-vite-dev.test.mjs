import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { normalizeViteArgs, resolveViteCliPath } from "./run-vite-dev.mjs";

test("removes pnpm's optional argument separator", () => {
  const args = ["--", "--host", "127.0.0.1", "--port", "5206"];
  assert.deepEqual(normalizeViteArgs(args), [
    "--host",
    "127.0.0.1",
    "--port",
    "5206",
  ]);
  assert.deepEqual(args, ["--", "--host", "127.0.0.1", "--port", "5206"]);
});

test("preserves direct Vite arguments", () => {
  assert.deepEqual(normalizeViteArgs(["--host", "0.0.0.0"]), [
    "--host",
    "0.0.0.0",
  ]);
});

test("resolves the Vite CLI without a platform-specific executable", () => {
  assert.equal(existsSync(resolveViteCliPath()), true);
});
