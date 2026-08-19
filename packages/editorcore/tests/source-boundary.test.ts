import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("EditorCore source boundaries", () => {
  it("keeps headless core independent from default format adapters and renderer owners", () => {
    const source = readFileSync(
      resolve("src/assets/core/controller.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/\.\.\/adapters/u);
    expect(source).not.toMatch(/rendercore|vnicore|audiocore/u);
  });

  it("does not reach into any formal editor application", () => {
    const files = [
      "src/assets/adapters/default-adapters.ts",
      "src/assets/core/catalog.ts",
      "src/assets/core/controller.ts",
      "src/assets/ui/assets-view.ts",
    ];
    for (const file of files) {
      const source = readFileSync(resolve(file), "utf8");
      expect(source).not.toMatch(
        /apps\/(?:imgnumbereditor|popupeditor|symbolseditor|gamelayouteditor)/u,
      );
    }
  });
});
