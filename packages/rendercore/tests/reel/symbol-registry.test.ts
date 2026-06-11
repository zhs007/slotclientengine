import { createGameConfig } from "@slotclientengine/logiccore";
import { describe, expect, it } from "vitest";
import { ReelAssetError, createReelSymbolRegistry } from "../../src/reel/index.js";
import { createBasicAssets, basicGameConfig, createTextureSet } from "./helpers.js";

describe("ReelSymbolRegistry", () => {
  it("tracks explicit empty symbols, missing-asset empty symbols and orphan assets", () => {
    const registry = createReelSymbolRegistry({
      gameConfig: createGameConfig(basicGameConfig),
      assets: createBasicAssets({
        BN: createTextureSet(20, 20)
      }),
      emptySymbols: ["BN"],
      texturePolicy: {
        requiredStateTextures: ["spinBlur"]
      }
    });

    expect(registry.getValidation()).toEqual({
      texturedSymbols: ["A", "B"],
      configuredEmptySymbols: ["BN"],
      configuredEmptySymbolsWithAssets: ["BN"],
      missingAssetEmptySymbols: ["C"],
      ignoredAssetsWithoutPaytable: ["ORPHAN"]
    });
    expect(registry.getEntryBySymbol("BN")).toMatchObject({ code: 0, kind: "empty" });
    expect(registry.getEntryBySymbol("C")).toMatchObject({ code: 3, kind: "empty" });
    expect(registry.createRenderSymbolByCode(0)).toBeNull();
    expect(registry.createRenderSymbolByCode(1)?.symbol).toBe("A");
  });

  it("calculates cell size from non-empty paytable textures only", () => {
    const registry = createReelSymbolRegistry({
      gameConfig: createGameConfig(basicGameConfig),
      assets: createBasicAssets({
        BN: createTextureSet(200, 200),
        ORPHAN: createTextureSet(120, 120)
      }),
      emptySymbols: ["BN"],
      texturePolicy: {
        requiredStateTextures: ["spinBlur"]
      }
    });

    expect(registry.getCellSize()).toEqual({ width: 15, height: 12 });
  });

  it("fails clearly for required state textures, unknown empty symbols and missing textured symbols", () => {
    expect(() =>
      createReelSymbolRegistry({
        gameConfig: createGameConfig(basicGameConfig),
        assets: createBasicAssets({
          A: {
            normal: createTextureSet(10, 10).normal,
            states: {}
          }
        }),
        emptySymbols: ["BN"],
        texturePolicy: {
          requiredStateTextures: ["spinBlur"]
        }
      })
    ).toThrow(/A.*spinBlur/);

    expect(() =>
      createReelSymbolRegistry({
        gameConfig: createGameConfig(basicGameConfig),
        assets: createBasicAssets(),
        emptySymbols: ["NOPE"]
      })
    ).toThrow(ReelAssetError);

    expect(() =>
      createReelSymbolRegistry({
        gameConfig: createGameConfig(basicGameConfig),
        assets: {},
        emptySymbols: ["BN"]
      })
    ).toThrow(/at least one textured symbol/);
  });

  it("fails for URL assets, invalid texture states and unknown lookups", () => {
    expect(() =>
      createReelSymbolRegistry({
        gameConfig: createGameConfig(basicGameConfig),
        assets: createBasicAssets({
          A: "/assets/A.png"
        }),
        emptySymbols: ["BN"]
      })
    ).toThrow(/URL string/);

    expect(() =>
      createReelSymbolRegistry({
        gameConfig: createGameConfig(basicGameConfig),
        assets: createBasicAssets({
          A: {
            normal: createTextureSet(10, 10).normal,
            states: {
              spinBlur: "/assets/A.spinBlur.png"
            }
          }
        }),
        emptySymbols: ["BN"]
      })
    ).toThrow(/URL string/);

    expect(() =>
      createReelSymbolRegistry({
        gameConfig: createGameConfig(basicGameConfig),
        assets: createBasicAssets(),
        emptySymbols: ["BN"],
        texturePolicy: {
          requiredStateTextures: ["missing"]
        }
      })
    ).toThrow(/Required texture state/);

    const registry = createReelSymbolRegistry({
      gameConfig: createGameConfig(basicGameConfig),
      assets: createBasicAssets(),
      emptySymbols: ["BN"]
    });
    expect(() => registry.getEntryByCode(999)).toThrow(/999/);
    expect(() => registry.getEntryBySymbol("NOPE")).toThrow(/NOPE/);
  });
});
