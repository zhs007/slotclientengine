import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("game003v2 source boundary", () => {
  it("does not import old game assets/apps or implement asset integrity gates", () => {
    const root = resolve(import.meta.dirname, "../src");
    const files = [
      "config.ts",
      "launch.ts",
      "loading-resources.ts",
      "main.ts",
      "money.ts",
      "resource.ts",
      "round-adapter.ts",
      "round-compiler.ts",
    ];
    const source = files
      .map((file) => readFileSync(resolve(root, file), "utf8"))
      .join("\n");
    expect(source).not.toMatch(/assets\/game003|apps\/game003|game003-s1/u);
    expect(source).not.toMatch(/sha256|byteLength|orphan|content-addressed/u);
    expect(source).not.toMatch(/createReelSpinPlan/u);
  });
});
