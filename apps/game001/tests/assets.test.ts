import { afterEach, describe, expect, it, vi } from "vitest";
import { Assets } from "pixi.js";
import stateTextureManifest from "../../../assets/symbols/symbol-state-textures.manifest.json";
import compositeManifest from "../../../assets/symbols/symbol-composites.json";
import { createTestTexture } from "../../../packages/rendercore/tests/reel/helpers.js";
import {
  GAME001_REQUIRED_STATE_TEXTURES,
  createGame001SymbolAssetMapFromModules,
  loadGame001SymbolTextures,
} from "../src/assets.js";

describe("game001 assets", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds manifest assets and validates composite layers", () => {
    const assets = createGame001SymbolAssetMapFromModules({
      modules: createModules(
        ["S00", "S0", "S1", "S5", "S10", "SC", "RS", "X2", "X5", "X10"],
        ["CO", "SX"],
      ),
      stateTextureManifest,
      compositeManifest,
    });

    expect(Object.keys(assets)).toEqual([
      "S00",
      "S0",
      "S1",
      "S5",
      "S10",
      "SC",
      "RS",
      "X2",
      "X5",
      "X10",
      "CO",
      "SX",
    ]);
    expect(Object.keys(assets)).not.toContain("SC-0");
    expect(Object.keys(assets)).not.toContain("RS-0");
    expect(Object.keys(assets)).not.toContain("SC-1-0");
    expect(Object.keys(assets)).not.toContain("X2-0");
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
              "/assets/SC-1-4.png",
            ],
          },
          { index: 2, texture: "/assets/SC-2.png" },
        ],
      },
      states: {
        spinBlur: "/assets/SC.spinBlur.png",
      },
    });
    expect(assets.RS).toMatchObject({
      normal: {
        kind: "layered",
        layers: [
          { index: 0, texture: "/assets/RS-0.png" },
          { index: 1, texture: "/assets/RS-1.png" },
          { index: 2, texture: "/assets/RS-2.png" },
        ],
      },
    });
  });

  it("fails when required spinBlur is missing", () => {
    const modules = createModules(["S00"], []);
    delete modules["../../../assets/symbols/S00.spinBlur.png"];

    expect(() =>
      createGame001SymbolAssetMapFromModules({
        modules,
        stateTextureManifest: {
          version: 1,
          states: ["spinBlur"],
          symbols: {
            S00: {
              normal: "./S00.png",
              spinBlur: "./S00.spinBlur.png",
            },
            SC: layeredSymbol("SC", 3),
            RS: layeredSymbol("RS", 3),
            X2: layeredSymbol("X2", 2),
            X5: layeredSymbol("X5", 2),
            X10: layeredSymbol("X10", 2),
          },
        },
        compositeManifest,
        requiredStates: GAME001_REQUIRED_STATE_TEXTURES,
      }),
    ).toThrow(/S00.spinBlur/);
  });

  it("fails when an SC keyframe module is missing", () => {
    const modules = createModules(
      ["S00", "S0", "S1", "S5", "S10", "SC", "RS", "X2", "X5", "X10"],
      [],
    );
    delete modules["../../../assets/symbols/SC-1-3.png"];

    expect(() =>
      createGame001SymbolAssetMapFromModules({
        modules,
        stateTextureManifest,
        compositeManifest,
      }),
    ).toThrow(/SC-1-3/);
  });

  it("rejects state files that the manifest does not declare", () => {
    expect(() =>
      createGame001SymbolAssetMapFromModules({
        modules: {
          "../../../assets/symbols/S00.png": "/assets/S00.png",
          "../../../assets/symbols/S00.spinBlur.png":
            "/assets/S00.spinBlur.png",
          "../../../assets/symbols/S00.blurred.png": "/assets/S00.blurred.png",
          ...createCompositeModules(),
        },
        stateTextureManifest: {
          version: 1,
          states: ["spinBlur"],
          symbols: {
            S00: {
              normal: "./S00.png",
              spinBlur: "./S00.spinBlur.png",
            },
            SC: layeredSymbol("SC", 3),
            RS: layeredSymbol("RS", 3),
            X2: layeredSymbol("X2", 2),
            X5: layeredSymbol("X5", 2),
            X10: layeredSymbol("X10", 2),
          },
        },
        compositeManifest,
      }),
    ).toThrow(/unknown state "blurred"/);
  });

  it("rejects invalid composite contracts", () => {
    expect(() =>
      createGame001SymbolAssetMapFromModules({
        modules: createModules(["SC", "RS", "X2", "X5", "X10"], []),
        stateTextureManifest,
        compositeManifest: { ...compositeManifest, version: 2 },
      }),
    ).toThrow(/composite manifest version/);

    expect(() =>
      createGame001SymbolAssetMapFromModules({
        modules: createModules(["SC", "RS", "X2", "X5", "X10"], []),
        stateTextureManifest,
        compositeManifest: {
          version: 1,
          symbols: {
            ...compositeManifest.symbols,
            SC: { layers: ["./SC-0.png", "./SC-2.png"] },
          },
        },
      }),
    ).toThrow(/consecutive indexes/);

    expect(() =>
      createGame001SymbolAssetMapFromModules({
        modules: createModules(["SC", "RS", "X2", "X5", "X10"], []),
        stateTextureManifest,
        compositeManifest: {
          version: 1,
          symbols: {
            ...compositeManifest.symbols,
            SC: { layers: ["./SC-0.png", "./SC-1.png"] },
          },
        },
      }),
    ).toThrow(/must match state manifest/);

    expect(() =>
      createGame001SymbolAssetMapFromModules({
        modules: createModules(["SC", "RS", "X2", "X5", "X10"], []),
        stateTextureManifest,
        compositeManifest: {
          version: 1,
          symbols: {
            ...compositeManifest.symbols,
            SC: {
              layers: [
                "./SC-0.png",
                {
                  index: 1,
                  texture: "./SC-1-0.png",
                  keyframes: ["./SC-1-0.png", "./SC-1-2.png"],
                },
                "./SC-2.png",
              ],
            },
          },
        },
      }),
    ).toThrow(/must match state manifest/);
  });

  it("loads string, single, layered, and already-loaded texture assets", async () => {
    const loaded = createTestTexture(12, 14);
    const existing = createTestTexture(20, 22);
    vi.spyOn(Assets, "load").mockImplementation(async () => loaded as any);

    const textures = await loadGame001SymbolTextures({
      A: "/assets/A.png",
      B: {
        normal: { kind: "single", texture: "/assets/B.png" },
        states: { spinBlur: "/assets/B.spinBlur.png" },
      },
      C: {
        normal: {
          kind: "layered",
          layers: [
            {
              index: 0,
              texture: "/assets/C-0.png",
              keyframes: ["/assets/C-0.png", "/assets/C-0-1.png"],
            },
          ],
        },
        states: {},
      },
      D: existing,
    });

    expect(textures.A).toBe(loaded);
    expect(textures.B).toMatchObject({
      normal: { kind: "single", texture: loaded },
      states: { spinBlur: loaded },
    });
    expect(textures.C).toMatchObject({
      normal: {
        kind: "layered",
        layers: [{ index: 0, texture: loaded, keyframes: [loaded, loaded] }],
      },
    });
    expect(textures.D).toBe(existing);
  });

  it("rejects malformed state manifests and filenames", () => {
    expect(() =>
      createGame001SymbolAssetMapFromModules({
        modules: {},
        stateTextureManifest: { version: 2, states: [], symbols: {} },
        compositeManifest,
      }),
    ).toThrow(/manifest version/);
    expect(() =>
      createGame001SymbolAssetMapFromModules({
        modules: {},
        stateTextureManifest: { version: 1, states: {}, symbols: {} },
        compositeManifest,
      }),
    ).toThrow(/states must be an array/);
    expect(() =>
      createGame001SymbolAssetMapFromModules({
        modules: {},
        stateTextureManifest: { version: 1, states: [], symbols: {} },
        compositeManifest,
      }),
    ).toThrow(/missing required state/);
    expect(() =>
      createGame001SymbolAssetMapFromModules({
        modules: {
          "../../../assets/symbols/S00.foo.bar.png": "/assets/S00.foo.bar.png",
        },
        stateTextureManifest,
        compositeManifest,
      }),
    ).toThrow(/Cannot parse/);
  });

  it("rejects malformed manifest normal entries", () => {
    expect(() =>
      createGame001SymbolAssetMapFromModules({
        modules: createModules(["S00", "SC", "RS", "X2", "X5", "X10"], []),
        stateTextureManifest: {
          version: 1,
          states: ["spinBlur"],
          symbols: {
            S00: { normal: "./WRONG.png", spinBlur: "./S00.spinBlur.png" },
            SC: layeredSymbol("SC", 3),
            RS: layeredSymbol("RS", 3),
            X2: layeredSymbol("X2", 2),
            X5: layeredSymbol("X5", 2),
            X10: layeredSymbol("X10", 2),
          },
        },
        compositeManifest,
      }),
    ).toThrow(/normal texture/);

    expect(() =>
      createGame001SymbolAssetMapFromModules({
        modules: createModules(["SC", "RS", "X2", "X5", "X10"], []),
        stateTextureManifest: {
          version: 1,
          states: ["spinBlur"],
          symbols: {
            SC: {
              normal: { kind: "bad", layers: ["./SC-0.png"] },
              spinBlur: "./SC.spinBlur.png",
            },
            RS: layeredSymbol("RS", 3),
            X2: layeredSymbol("X2", 2),
            X5: layeredSymbol("X5", 2),
            X10: layeredSymbol("X10", 2),
          },
        },
        compositeManifest,
      }),
    ).toThrow(/kind must be "layered"/);

    const missingLayerModules = createModules(
      ["SC", "RS", "X2", "X5", "X10"],
      [],
    );
    delete missingLayerModules["../../../assets/symbols/SC-2.png"];
    expect(() =>
      createGame001SymbolAssetMapFromModules({
        modules: missingLayerModules,
        stateTextureManifest: {
          version: 1,
          states: ["spinBlur"],
          symbols: {
            SC: {
              normal: {
                kind: "layered",
                layers: ["./SC-0.png", "./SC-1.png", "./SC-2.png"],
              },
              spinBlur: "./SC.spinBlur.png",
            },
            RS: layeredSymbol("RS", 3),
            X2: layeredSymbol("X2", 2),
            X5: layeredSymbol("X5", 2),
            X10: layeredSymbol("X10", 2),
          },
        },
        compositeManifest: {
          version: 1,
          symbols: {
            ...compositeManifest.symbols,
            SC: { layers: ["./SC-0.png", "./SC-1.png", "./SC-2.png"] },
          },
        },
      }),
    ).toThrow(/missing layered texture file/);
  });
});

function createModules(
  symbols: readonly string[],
  orphanSymbols: readonly string[],
) {
  const compositeLayerCounts: Record<string, number> = {
    SC: 3,
    RS: 3,
    X2: 2,
    X5: 2,
    X10: 2,
  };

  return Object.fromEntries(
    [...symbols, ...orphanSymbols].flatMap((symbol) => {
      const normal = [
        `../../../assets/symbols/${symbol}.png`,
        `/assets/${symbol}.png`,
      ] as const;
      const layers =
        symbol === "SC"
          ? createScLayerModules()
          : Array.from(
              { length: compositeLayerCounts[symbol] ?? 0 },
              (_unused, index) =>
                [
                  `../../../assets/symbols/${symbol}-${index}.png`,
                  `/assets/${symbol}-${index}.png`,
                ] as const,
            );
      if (orphanSymbols.includes(symbol)) {
        return [normal];
      }
      return [
        normal,
        ...layers,
        [
          `../../../assets/symbols/${symbol}.spinBlur.png`,
          `/assets/${symbol}.spinBlur.png`,
        ] as const,
      ];
    }),
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
    ["../../../assets/symbols/SC-2.png", "/assets/SC-2.png"] as const,
  ];
}

function createCompositeModules() {
  return createModules(["SC", "RS", "X2", "X5", "X10"], []);
}

function layeredSymbol(symbol: string, layerCount: number) {
  return {
    normal: {
      kind: "layered",
      layers:
        symbol === "SC"
          ? scManifestLayers()
          : Array.from(
              { length: layerCount },
              (_unused, index) => `./${symbol}-${index}.png`,
            ),
    },
    spinBlur: `./${symbol}.spinBlur.png`,
  };
}

function scManifestLayers() {
  return [
    "./SC-0.png",
    {
      index: 1,
      texture: "./SC-1-0.png",
      keyframes: [
        "./SC-1-0.png",
        "./SC-1-1.png",
        "./SC-1-2.png",
        "./SC-1-3.png",
        "./SC-1-4.png",
      ],
    },
    "./SC-2.png",
  ];
}
