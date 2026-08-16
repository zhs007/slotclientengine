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
    expect(source).toMatch(/removeMainReelSymbols/u);
    expect(source).not.toMatch(/releaseMainReelSymbols/u);
    expect(source).not.toMatch(/(?:state|id)\s*[!=]==?\s*["']remove["']/u);
  });

  it("passes the complete ticker delta to the runtime once", () => {
    const source = readFileSync(
      resolve(__dirname, "../src/round-adapter.ts"),
      "utf8",
    );

    expect(source).toContain(
      "runtime.update(Math.max(0, this.#app.ticker.deltaMS / 1000));",
    );
    expect(source).not.toMatch(/remainingSeconds|sliceSeconds/u);
    expect(source).not.toMatch(/Math\.min\([^\n]*deltaMS/u);
  });
});
