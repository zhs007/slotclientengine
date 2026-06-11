import { describe, expect, it } from "vitest";
import stateTextureManifest from "../../../assets/symbols/symbol-state-textures.manifest.json";
import {
  createStatefulReelAssetMapFromModules
} from "../src/assets.js";
import { REELS_VIEWER_REQUIRED_STATE_TEXTURES } from "../src/reels-config.js";

describe("reelsviewer assets", () => {
  it("builds stateful assets for all current paytable symbols with normal images", () => {
    const modules = createModules(["S00", "S0", "S1", "S5", "S10", "SC", "RS", "X2", "X5", "X10"], [
      "CO",
      "SX"
    ]);
    const assets = createStatefulReelAssetMapFromModules({
      modules,
      manifest: stateTextureManifest,
      requiredStates: REELS_VIEWER_REQUIRED_STATE_TEXTURES
    });

    expect(Object.keys(assets)).toEqual(["S00", "S0", "S1", "S5", "S10", "SC", "RS", "X2", "X5", "X10", "CO", "SX"]);
    expect(assets.SC).toMatchObject({
      states: {
        spinBlur: "/assets/SC.spinBlur.png"
      }
    });
  });

  it("fails when a manifest symbol is missing a required state file", () => {
    const modules = createModules(["S00"], []);
    delete modules["../../../assets/symbols/S00.spinBlur.png"];

    expect(() =>
      createStatefulReelAssetMapFromModules({
        modules,
        manifest: {
          version: 1,
          states: ["spinBlur"],
          symbols: {
            S00: {
              normal: "./S00.png",
              spinBlur: "./S00.spinBlur.png"
            }
          }
        },
        requiredStates: REELS_VIEWER_REQUIRED_STATE_TEXTURES
      })
    ).toThrow(/S00.spinBlur/);
  });

  it("rejects state files that are not declared by the manifest", () => {
    expect(() =>
      createStatefulReelAssetMapFromModules({
        modules: {
          "../../../assets/symbols/S00.png": "/assets/S00.png",
          "../../../assets/symbols/S00.spinBlur.png": "/assets/S00.spinBlur.png",
          "../../../assets/symbols/S00.blurred.png": "/assets/S00.blurred.png"
        },
        manifest: {
          version: 1,
          states: ["spinBlur"],
          symbols: {
            S00: {
              normal: "./S00.png",
              spinBlur: "./S00.spinBlur.png"
            }
          }
        },
        requiredStates: REELS_VIEWER_REQUIRED_STATE_TEXTURES
      })
    ).toThrow(/unknown state "blurred"/);
  });
});

function createModules(symbols: readonly string[], orphanSymbols: readonly string[]) {
  return Object.fromEntries(
    [...symbols, ...orphanSymbols].flatMap((symbol) => {
      const normal = [`../../../assets/symbols/${symbol}.png`, `/assets/${symbol}.png`] as const;
      if (orphanSymbols.includes(symbol)) {
        return [normal];
      }
      return [
        normal,
        [
          `../../../assets/symbols/${symbol}.spinBlur.png`,
          `/assets/${symbol}.spinBlur.png`
        ] as const
      ];
    })
  );
}
