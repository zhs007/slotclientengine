import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  SlotGameConfigError,
  createGameConfig,
  createSlotGameFramework,
  findComponentSteps,
  prepareSlotGameLiveSession,
} from "../src/index.js";
import { assertSlotGameStaticConfig } from "../src/static-config/index.js";

describe("exports", () => {
  it("exports the package entry and styles path", () => {
    expect(typeof createSlotGameFramework).toBe("function");
    expect(typeof prepareSlotGameLiveSession).toBe("function");
    expect(typeof createGameConfig).toBe("function");
    expect(typeof findComponentSteps).toBe("function");
    expect(typeof assertSlotGameStaticConfig).toBe("function");
    expect(new SlotGameConfigError("bad")).toBeInstanceOf(Error);
    const packageJson = JSON.parse(
      readFileSync(resolve(__dirname, "../package.json"), "utf8"),
    ) as { exports: Record<string, unknown> };
    expect(packageJson.exports["./static-config"]).toEqual({
      types: "./dist/static-config/index.d.ts",
      import: "./dist/static-config/index.js",
    });
    expect(packageJson.exports["./styles.css"]).toBe(
      "./dist/gameframeworks.css",
    );
  });
});
