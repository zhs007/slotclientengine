import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("game002v2 source boundary", () => {
  it("has no plan, mutation contract, hash, or size gate", () => {
    const root = resolve(__dirname, "../src");
    const source = ["crave.ts", "round-adapter.ts"]
      .map((file) => readFileSync(resolve(root, file), "utf8"))
      .join("\n");
    expect(source).not.toMatch(/SlotOperation|mutation|sha256|byteLength/u);
    expect(source).not.toMatch(/compile[A-Z].*Plan|rollback/u);
    expect(source).not.toMatch(/hasMainReelSymbolStateCapability/u);
    expect(source).not.toMatch(/getScenes\(\)\.at/u);
  });
});
