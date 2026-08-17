import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("audiocore source boundaries", () => {
  it("keeps data independent from runtime and editor packages", async () => {
    const source = await readFile(
      resolve(import.meta.dirname, "../src/data/manifest.ts"),
      "utf8",
    );
    expect(source).not.toMatch(
      /@pixi\/sound|editorresource|\.\.\/core|\.\.\/editor/u,
    );
  });
});
