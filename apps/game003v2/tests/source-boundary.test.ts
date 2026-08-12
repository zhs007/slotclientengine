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
    expect(source).not.toMatch(
      /isMainReelSpinning|resolvePhases|localPhasePolicy|MAX_DELTA_SECONDS/u,
    );
    expect(source).toMatch(/getReelArea\("main"\)/u);
    expect(source).not.toMatch(
      /createSymbolWinCarousel|getMainReelSymbolStateSnapshots|getMainReelSymbolGeometrySnapshots|getReelPresentation/u,
    );
  });

  it("serves the art-owned package directly without generated bindings", () => {
    const appRoot = resolve(import.meta.dirname, "..");
    const packageJson = readFileSync(resolve(appRoot, "package.json"), "utf8");
    const viteConfig = readFileSync(resolve(appRoot, "vite.config.ts"), "utf8");
    expect(packageJson).not.toMatch(/generate:resources|check:resources/u);
    expect(viteConfig).toContain(
      'publicDir: resolve(__dirname, "../../assets/minecart2")',
    );
  });

  it("preserves request-time continuous spin state through next-spin cleanup", () => {
    const source = readFileSync(
      resolve(import.meta.dirname, "../src/round-adapter.ts"),
      "utf8",
    );
    expect(source).toMatch(
      /cleanup: \(reason\)[\s\S]*if \(reason === "next-spin"\) return;[\s\S]*this\.#preSpinActive = false;/u,
    );
  });
});
