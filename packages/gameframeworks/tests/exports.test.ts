import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  SlotGameConfigError,
  createGameConfig,
  createSlotGameFramework,
  findComponentSteps,
  prepareSlotGameLiveSession,
} from "../src/index.js";
import type {
  SceneLayoutJsonData,
  SceneLayoutPackageResource,
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

  it("exposes the Scene Layout JSON data API through the facade types", () => {
    const load = (
      resource: Pick<SceneLayoutPackageResource, "loadJsonData">,
    ): Promise<SceneLayoutJsonData> => resource.loadJsonData("spin-config");
    expect(typeof load).toBe("function");
    expect(
      parseSpinConfig({
        localReels: [["A", "B"]],
        numberWeights: [{ value: 10, weight: 2 }],
      }),
    ).toEqual({
      localReels: [["A", "B"]],
      numberWeights: [{ value: 10, weight: 2 }],
    });
    expect(() => parseSpinConfig({ localReels: [["A", 2]] })).toThrow(
      /localReels/,
    );
  });
});

function parseSpinConfig(value: SceneLayoutJsonData) {
  if (Array.isArray(value)) throw new Error("spin config 必须是 object。");
  const record = value as Record<string, unknown>;
  if (
    !Array.isArray(record.localReels) ||
    record.localReels.some(
      (reel) =>
        !Array.isArray(reel) ||
        reel.some((symbol) => typeof symbol !== "string"),
    )
  )
    throw new Error("spin config localReels 非法。");
  if (
    record.numberWeights !== undefined &&
    (!Array.isArray(record.numberWeights) ||
      record.numberWeights.some((item) => {
        if (typeof item !== "object" || item === null) return true;
        const weight = item as Record<string, unknown>;
        return (
          typeof weight.value !== "number" ||
          !Number.isFinite(weight.value) ||
          typeof weight.weight !== "number" ||
          !Number.isFinite(weight.weight)
        );
      }))
  )
    throw new Error("spin config numberWeights 非法。");
  return value;
}
