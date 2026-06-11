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
    expect(Object.keys(assets)).not.toContain("SC-0");
    expect(Object.keys(assets)).not.toContain("SC-1-0");
    expect(assets.SC).toMatchObject({
      normal: {
        kind: "layered",
        layers: [
          { index: 0, texture: "/assets/SC-0.png" },
          {
            index: 1,
            texture: "/assets/SC-1-0.png",
            keyframes: [
              "/assets/SC-1-0.png",
              "/assets/SC-1-1.png",
              "/assets/SC-1-2.png",
              "/assets/SC-1-3.png",
              "/assets/SC-1-4.png"
            ]
          },
          { index: 2, texture: "/assets/SC-2.png" }
        ]
      }
    });
    expect(assets.SC).toMatchObject({
      states: {
        spinBlur: "/assets/SC.spinBlur.png"
      }
    });
    expect(assets.RS).toMatchObject({
      normal: {
        kind: "layered",
        layers: [
          { index: 0, texture: "/assets/RS-0.png" },
          { index: 1, texture: "/assets/RS-1.png" },
          { index: 2, texture: "/assets/RS-2.png" }
        ]
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

  it("fails when a manifest keyframe file is missing", () => {
    const modules = createModules(["S00", "S0", "S1", "S5", "S10", "SC", "RS", "X2", "X5", "X10"], []);
    delete modules["../../../assets/symbols/SC-1-3.png"];

    expect(() =>
      createStatefulReelAssetMapFromModules({
        modules,
        manifest: stateTextureManifest,
        requiredStates: REELS_VIEWER_REQUIRED_STATE_TEXTURES
      })
    ).toThrow(/SC-1-3/);
  });
});

function createModules(symbols: readonly string[], orphanSymbols: readonly string[]) {
  const compositeLayerCounts: Record<string, number> = {
    SC: 3,
    RS: 3,
    X2: 2,
    X5: 2,
    X10: 2
  };

  return Object.fromEntries(
    [...symbols, ...orphanSymbols].flatMap((symbol) => {
      const normal = [`../../../assets/symbols/${symbol}.png`, `/assets/${symbol}.png`] as const;
      const layers =
        symbol === "SC"
          ? createScLayerModules()
          : Array.from({ length: compositeLayerCounts[symbol] ?? 0 }, (_unused, index) => [
              `../../../assets/symbols/${symbol}-${index}.png`,
              `/assets/${symbol}-${index}.png`
            ] as const);
      if (orphanSymbols.includes(symbol)) {
        return [normal];
      }
      return [
        normal,
        ...layers,
        [
          `../../../assets/symbols/${symbol}.spinBlur.png`,
          `/assets/${symbol}.spinBlur.png`
        ] as const
      ];
    })
  );
}

function createScLayerModules() {
  return [
    ["../../../assets/symbols/SC-0.png", "/assets/SC-0.png"] as const,
    ["../../../assets/symbols/SC-1-0.png", "/assets/SC-1-0.png"] as const,
    ["../../../assets/symbols/SC-1-1.png", "/assets/SC-1-1.png"] as const,
    ["../../../assets/symbols/SC-1-2.png", "/assets/SC-1-2.png"] as const,
    ["../../../assets/symbols/SC-1-3.png", "/assets/SC-1-3.png"] as const,
    ["../../../assets/symbols/SC-1-4.png", "/assets/SC-1-4.png"] as const,
    ["../../../assets/symbols/SC-2.png", "/assets/SC-2.png"] as const
  ];
}
